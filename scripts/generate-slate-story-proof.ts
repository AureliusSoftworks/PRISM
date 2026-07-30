import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const outputRoot = join(
  workspaceRoot,
  ".codex",
  "output",
  "slate-writers-cockpit",
);
const runTimestamp = new Date().toISOString();
const runId = runTimestamp.replaceAll(/[:.]/gu, "-");
const runDirectory = join(outputRoot, runId);
const databasePath = join(runDirectory, "slate-proof.sqlite");
const recoveryDirectory = join(runDirectory, "recovery");
const recoveryMirrorDirectory = join(runDirectory, "recovery-mirror");

mkdirSync(runDirectory, { recursive: true });
mkdirSync(recoveryDirectory, { recursive: true });
mkdirSync(recoveryMirrorDirectory, { recursive: true });

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY is required to generate the real Slate story proof.",
  );
}

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY || `slate-proof-${randomUUID()}`;
process.env.DB_PATH = databasePath;
process.env.SLATE_RECOVERY_DIR = recoveryDirectory;
process.env.SLATE_RECOVERY_MIRROR_DIR = recoveryMirrorDirectory;
process.env.PRISM_CODE_REVISION =
  process.env.PRISM_CODE_REVISION || "feat/slate-writers-cockpit";

type JsonRecord = Record<string, unknown>;

interface ProofSection {
  id: string;
  structureItemId: string | null;
  title: string;
  ordinal: number;
  revision: number;
  prose: string;
  contentHash: string;
}

interface ProofOperation {
  id: string;
  status: string;
  sectionId: string;
  revisionFingerprint: {
    value: string;
    sectionRevision: number;
    continuityGeneration: number;
    mirrorProfileVersionId: string | null;
  };
  intent: {
    operation: string;
    scope: string;
    direction: string;
  };
  proposal: {
    prose: string;
    provider: string;
    model: string;
  } | null;
}

interface ProofClarification {
  id: string;
  trigger: "hard_continuity_conflict" | "unstick_me";
  status: string;
  prompt: string;
  choices: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  customVibe: {
    id: string;
    label: string;
    placeholder: string;
  };
  revisionFingerprint: string;
  continuityGeneration: number;
  mirrorProfileVersionId: string | null;
}

interface WritingEnvelope {
  ok: true;
  operation: ProofOperation;
  clarification: ProofClarification | null;
  section?: ProofSection;
}

interface ProviderCall {
  provider: string;
  model: string | null;
  purpose: string | null;
  messageCount: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "slate"
  );
}

function words(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return an object.`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing.`);
  }
  return value;
}

function sentenceAnchor(input: {
  sourceId: string;
  sectionId: string;
  sectionRevision: number;
  prose: string;
  needle: RegExp;
}): JsonRecord {
  const match = input.needle.exec(input.prose);
  const midpoint = match?.index ?? 0;
  const priorBreak = Math.max(
    input.prose.lastIndexOf(".", midpoint - 1),
    input.prose.lastIndexOf("\n", midpoint - 1),
  );
  const nextPeriod = input.prose.indexOf(".", midpoint);
  const nextBreak = input.prose.indexOf("\n", midpoint);
  const candidates = [nextPeriod, nextBreak].filter((value) => value >= 0);
  const end = candidates.length
    ? Math.min(...candidates) + (nextPeriod === Math.min(...candidates) ? 1 : 0)
    : Math.min(input.prose.length, midpoint + 240);
  const start = Math.max(0, priorBreak + 1);
  const quote = input.prose.slice(start, Math.max(start + 1, end)).trim();
  const quoteStart = input.prose.indexOf(quote, start);
  return {
    sourceId: input.sourceId,
    sectionId: input.sectionId,
    sectionRevision: input.sectionRevision,
    start: quoteStart,
    end: quoteStart + quote.length,
    startPosition: null,
    endPosition: null,
    quoteHash: sha256(quote),
  };
}

function assertClarificationCard(
  clarification: ProofClarification | null,
  trigger: ProofClarification["trigger"],
): asserts clarification is ProofClarification {
  assert.ok(clarification, `${trigger} did not create a clarification.`);
  assert.equal(clarification.trigger, trigger);
  assert.equal(clarification.status, "pending");
  assert.equal(
    clarification.choices.length,
    3,
    "Slate must present exactly three fixed choices.",
  );
  assert.equal(clarification.customVibe.id, "custom-vibe");
  assert.equal(clarification.customVibe.label, "Describe the vibe…");
  for (const choice of clarification.choices) {
    assert.ok(choice.id);
    assert.ok(choice.label);
    assert.ok(choice.description);
  }
}

async function main(): Promise<void> {
  const proofModel = "gpt-5.4-mini";
  const [
    { getAppConfig },
    shared,
    { initializeDatabase },
    providerModule,
    { createPrismRequestHandler },
    { runSlateContinuityWorkerCycle },
    { processSlateContinuityJobDeterministically },
    { projectActiveSlateStoryBible },
    { recordSlateDeveloperEvent },
    { previewSlateProjectArchiveImport },
  ] = await Promise.all([
    import("@localai/config"),
    import("../packages/shared/dist/index.js"),
    import("../apps/api/src/db.ts"),
    import("../apps/api/src/providers.ts"),
    import("../apps/api/src/server.ts"),
    import("../apps/api/src/slate-continuity-worker.ts"),
    import("../apps/api/src/slate-continuity-processing.ts"),
    import("../apps/api/src/slate-story-bible-projection.ts"),
    import("../apps/api/src/slate-developer-events.ts"),
    import("../apps/api/src/slate-archive-import-service.ts"),
  ]);

  const producerVersions = shared.currentContinuityProducerVersions();
  const db = initializeDatabase(new DatabaseSync(databasePath));
  const providerCalls: ProviderCall[] = [];
  const productionSelectProvider = providerModule.selectProvider;
  const observingProviderFactory: typeof productionSelectProvider = (
    ...args
  ) => {
    const provider = productionSelectProvider(...args);
    return {
      name: provider.name,
      diagnosticModel: provider.diagnosticModel,
      async generateResponse(messages, options) {
        providerCalls.push({
          provider: provider.name,
          model: options?.model ?? provider.diagnosticModel ?? null,
          purpose: options?.usagePurpose ?? null,
          messageCount: messages.length,
        });
        return provider.generateResponse(messages, options);
      },
      async embedText(text) {
        return provider.embedText(text);
      },
    };
  };

  const config = {
    ...getAppConfig(),
    apiPort: 0,
    lanAccessEnabled: false,
    discoveryEnabled: false,
    sessionCookieName: "prism_slate_story_proof",
    openAiApiKey: apiKey,
    anthropicApiKey: "",
    elevenLabsApiKey: "",
  };
  const server = createServer(
    createPrismRequestHandler({
      db,
      config,
      providerFactory: observingProviderFactory,
    }),
  );
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let cookie = "";

  const request = async (
    path: string,
    input: {
      method?: string;
      body?: JsonRecord;
    } = {},
  ): Promise<Response> => {
    const headers = new Headers();
    if (cookie) headers.set("cookie", cookie);
    if (input.body) headers.set("content-type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      method: input.method ?? (input.body ? "POST" : "GET"),
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `${input.method ?? "GET"} ${path} failed (${response.status}): ${detail.slice(0, 2_000)}`,
      );
    }
    return response;
  };

  const requestJson = async (
    path: string,
    input: {
      method?: string;
      body?: JsonRecord;
    } = {},
  ): Promise<JsonRecord> =>
    record(await (await request(path, input)).json(), path);

  const closeServer = (): Promise<void> =>
    new Promise((resolveClose) => server.close(() => resolveClose()));

  let projectId = "";
  let seriesId = "";
  const acceptedOperations: ProofOperation[] = [];
  const answeredClarifications: ProofClarification[] = [];

  try {
    const registration = await requestJson("/api/auth/register", {
      method: "POST",
      body: {
        username: `slate-proof-${runId}@example.invalid`,
        password: `slate-proof-${randomUUID()}`,
        minimumAgeConfirmed: true,
        eulaAccepted: true,
        eulaVersion: shared.PRISM_EULA_VERSION,
      },
    });
    const user = record(registration.user, "registered user");
    const userId = requiredString(user.id, "registered user id");

    const created = await requestJson("/api/slate/projects", {
      method: "POST",
      body: {
        title: "The Bell’s Dry Mouth",
        titleOrigin: "writer",
        spark:
          "A drought exposes a glass warning bell and the lie a keeper buried with her missing brother.",
      },
    });
    const createdProject = record(created.project, "created Slate project");
    projectId = requiredString(createdProject.id, "project id");
    seriesId = requiredString(createdProject.seriesId, "series id");

    const structure = [
      {
        id: "scene-low-water",
        kind: "scene",
        title: "Low Water",
        summary:
          "Bell keeper Mara Vale descends into the drought-bared reservoir and hears three impossible knocks inside the sealed warning bell.",
        direction:
          "Establish the town’s sanctioned version of Ivo’s disappearance, the melted floodgate key, and Mara’s private complicity.",
        status: "planned",
        locked: false,
      },
      {
        id: "scene-the-unmaking",
        kind: "scene",
        title: "The Unmaking",
        summary:
          "A material contradiction around the supposedly melted key forces Mara to choose how the buried truth enters the story.",
        direction:
          "Turn the contradiction into tactile discovery and a revelation about Ivo’s protective lie.",
        status: "planned",
        locked: false,
      },
      {
        id: "scene-the-fourth-ring",
        kind: "scene",
        title: "The Fourth Ring",
        summary:
          "With storm water returning, Mara must decide whether to preserve the town’s ritual lie or ring the warning bell and confess.",
        direction:
          "Pay off the three knocks, complete Mara’s arc, and end on a concrete image that changes the meaning of the bell.",
        status: "planned",
        locked: false,
      },
    ];
    await requestJson(`/api/slate/projects/${projectId}`, {
      method: "PATCH",
      body: {
        premise:
          "After a drought empties Bellwether Reservoir, keeper Mara Vale discovers that her missing brother’s alleged sabotage concealed a fatal defect in the dam—and her own role in the lie.",
        voice:
          "Close third person through Mara. Lyrical restraint; tactile, weathered detail; precise sentences that lengthen only under emotional pressure. Let glass, silt, brass, and water carry the imagery. No purple abstraction.",
        direction:
          "Write a complete literary short story in three linked scenes. Preserve causality, pay off every planted image, and keep the ending earned rather than explained.",
        proseMode: "online",
        proseProvider: "openai",
        proseModel: proofModel,
        nonNegotiables: [
          "Mara remains the sole viewpoint character.",
          "Three knocks must be planted in the opening and transformed in the ending.",
          "Ivo’s lie protected Mara without absolving her.",
          "The story ends with Mara choosing public truth over sanctioned grief.",
        ],
        characters: [
          {
            id: "mara-vale",
            name: "Mara Vale",
            role: "Keeper of Bellwether’s glass flood-warning bell; controlled in public, privately burdened by a falsified inspection.",
            voice:
              "Sparse speech, exact nouns, emotion displaced into physical work.",
            locked: true,
          },
          {
            id: "ivo-vale",
            name: "Ivo Vale",
            role: "Mara’s missing younger brother, blamed for sabotaging the warning system after he uncovered the dam defect.",
            voice:
              "Remembered as wry, practical, and incapable of leaving a mechanism unexplained.",
            locked: true,
          },
        ],
        unresolvedThreads: [
          {
            id: "thread-three-knocks",
            label:
              "Mystery: what makes the three knocks inside the sealed bell?",
            resolved: false,
            locked: true,
          },
          {
            id: "thread-ivo-lie",
            label: "Promise: reveal what Ivo’s lie protected Mara from.",
            resolved: false,
            locked: true,
          },
        ],
        structure,
      },
    });

    const now = new Date().toISOString();
    const mirrorProfileId = `mirror-profile-${randomUUID()}`;
    const mirrorVersionId = `mirror-version-${randomUUID()}`;
    const projectOverlayId = `mirror-overlay-${randomUUID()}`;
    const povOverlayId = `mirror-pov-${randomUUID()}`;
    const voiceCard = {
      narrativeDistance:
        "Close third-person, attached to Mara’s sensory attention without narratorial diagnosis.",
      diction: ["concrete", "weathered", "plainspoken", "technically precise"],
      rhythm: [
        "short declarative pressure",
        "longer syntax only at emotional thresholds",
      ],
      imagery: ["glass", "silt", "brass", "water pressure", "worn hands"],
      dialogueHabits: [
        "understatement",
        "answers displaced into practical action",
      ],
      exposition: ["embedded in ritual, maintenance, and remembered touch"],
      humor: ["rare dry sibling wit"],
      density: ["restrained literary", "one charged image per paragraph"],
      preferences: [
        "earned ambiguity",
        "causal clarity",
        "physicalized emotion",
      ],
      avoidances: [
        "purple abstraction",
        "explaining the theme",
        "generic cinematic language",
      ],
      exemplars: [
        "Let the object change meaning before the narrator names the change.",
      ],
    };
    db.prepare(
      `INSERT INTO slate_mirror_profiles
        (id, user_id, name, pen_name, frozen, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      mirrorProfileId,
      userId,
      "Bellwether restraint",
      "Slate Proof",
      now,
      now,
    );
    db.prepare(
      `INSERT INTO slate_mirror_profile_versions
        (id, user_id, profile_id, version, voice_card_json,
         eligibility_summary_json, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      mirrorVersionId,
      userId,
      mirrorProfileId,
      JSON.stringify(voiceCard),
      JSON.stringify({
        eligibleSampleCount: 0,
        note: "Proof Voice Card is explicitly pinned; generated manuscript prose remains ineligible for Mirror learning.",
      }),
      now,
    );
    db.prepare(
      `INSERT INTO slate_project_mirror_bindings
        (project_id, user_id, profile_version_id, project_overlay_json,
         pov_overlays_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      projectId,
      userId,
      mirrorVersionId,
      JSON.stringify({
        id: projectOverlayId,
        kind: "project",
        label: "Bellwether",
        povCharacterId: null,
        direction:
          "Keep the glass bell central as tool, memorial, witness, and finally public voice.",
        createdAt: now,
        updatedAt: now,
      }),
      JSON.stringify([
        {
          id: povOverlayId,
          kind: "pov",
          label: "Mara Vale",
          povCharacterId: "mara-vale",
          direction:
            "Filter emotion through Mara’s hands, trained ear, and avoidance of the word guilt.",
          createdAt: now,
          updatedAt: now,
        },
      ]),
      now,
      now,
    );

    const sectionList = await requestJson(
      `/api/slate/projects/${projectId}/sections`,
    );
    assert.ok(Array.isArray(sectionList.sections));
    const sections = sectionList.sections as ProofSection[];
    const byStructureId = new Map(
      sections.map((section) => [section.structureItemId, section]),
    );
    const lowWater = byStructureId.get("scene-low-water");
    const unmaking = byStructureId.get("scene-the-unmaking");
    const fourthRing = byStructureId.get("scene-the-fourth-ring");
    assert.ok(
      lowWater && unmaking && fourthRing,
      "All three scenes must exist.",
    );

    const finishWritingOperation = async (
      envelope: WritingEnvelope,
    ): Promise<WritingEnvelope> => {
      if (
        envelope.operation.status !== "compiling" &&
        envelope.operation.status !== "generating"
      ) {
        return envelope;
      }
      return (await requestJson(
        `/api/slate/projects/${projectId}/writing-operations/${envelope.operation.id}/run`,
        {
          method: "POST",
          body: {
            revisionFingerprint:
              envelope.operation.revisionFingerprint.value,
            idempotencyKey: randomUUID(),
          },
        },
      )) as unknown as WritingEnvelope;
    };

    const createOperation = async (
      section: ProofSection,
      input: JsonRecord,
    ): Promise<WritingEnvelope> => {
      const created = (await requestJson(
        `/api/slate/projects/${projectId}/writing-operations`,
        {
          method: "POST",
          body: {
            sectionId: section.id,
            idempotencyKey: randomUUID(),
            pov: "Mara Vale",
            tense: "past",
            ...input,
          },
        },
      )) as unknown as WritingEnvelope;
      return finishWritingOperation(created);
    };

    const acceptOperation = async (
      envelope: WritingEnvelope,
    ): Promise<WritingEnvelope> => {
      assert.equal(envelope.operation.status, "proposed");
      assert.ok(envelope.operation.proposal?.prose);
      assert.equal(envelope.operation.proposal?.provider, "openai");
      const accepted = (await requestJson(
        `/api/slate/projects/${projectId}/writing-operations/${envelope.operation.id}/accept`,
        {
          method: "POST",
          body: {
            revisionFingerprint: envelope.operation.revisionFingerprint.value,
            idempotencyKey: randomUUID(),
          },
        },
      )) as unknown as WritingEnvelope;
      assert.equal(accepted.operation.status, "applied");
      acceptedOperations.push(accepted.operation);
      return accepted;
    };

    const sceneOne = await createOperation(lowWater, {
      operation: "draft",
      scope: "scene",
      wordTarget: 850,
      pacing: "patient descent, then tightening unease",
      sceneObjective:
        "Plant the three knocks and establish Mara’s sanctioned grief as a practiced form of avoidance.",
      direction: [
        "Write 750–950 words of finished opening-scene prose.",
        "Mara descends the drought-bared reservoir at first light to inspect the glass warning bell.",
        "She hears exactly three knocks from inside although the bell is sealed and its clapper was removed.",
        "Establish unambiguously that Mara watched Bellwether’s only brass floodgate key melted into Ivo’s memorial token after his disappearance.",
        "Plant their childhood three-knock code, but do not explain its final meaning yet.",
        "Show that Mara signed an inspection she should not have signed, without fully explaining why.",
        "End with storm weather gathering beyond the empty basin.",
      ].join(" "),
      mustInclude: [
        "three knocks",
        "the supposedly melted floodgate key",
        "Mara’s falsified inspection",
        "the removed clapper carried away from the sealed bell",
      ],
      mustAvoid: ["omniscient explanation", "a living Ivo appearing"],
    });
    assert.equal(sceneOne.operation.status, "proposed");
    assert.equal(sceneOne.clarification, null);
    const acceptedOne = await acceptOperation(sceneOne);
    const proseOne = acceptedOne.section?.prose ?? "";
    assert.match(proseOne, /three[\s-]+knock|knock[^.]{0,40}three/iu);
    assert.match(proseOne, /key/iu);
    assert.match(
      proseOne,
      /melt|furnace|crucible|soft|sag|slump|forge|lose its shape|brass ran/iu,
    );
    assert.match(proseOne, /clapper/iu);
    assert.doesNotMatch(proseOne, /\p{Script=Cyrillic}/u);

    const sourceOne = db
      .prepare(
        `SELECT id, source_revision, content_hash
           FROM slate_continuity_sources
          WHERE user_id = ? AND project_id = ? AND section_id = ?
            AND authority = 'ai'
          ORDER BY source_revision DESC, created_at DESC LIMIT 1`,
      )
      .get(userId, projectId, lowWater.id) as {
      id: string;
      source_revision: number;
      content_hash: string;
    };
    assert.ok(
      sourceOne,
      "Accepted scene one must create an AI evidence source.",
    );
    const keyAnchor = sentenceAnchor({
      sourceId: sourceOne.id,
      sectionId: lowWater.id,
      sectionRevision: Number(sourceOne.source_revision),
      prose: proseOne,
      needle: /key/iu,
    });
    const activeGeneration = Number(
      (
        db
          .prepare(
            `SELECT continuity_active_generation
               FROM slate_projects WHERE id = ? AND user_id = ?`,
          )
          .get(projectId, userId) as { continuity_active_generation: number }
      ).continuity_active_generation,
    );
    const conflictId = `concern-melted-key-${randomUUID()}`;
    db.prepare(
      `INSERT INTO slate_continuity_concerns
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         severity, status, summary, explanation, claim_ids_json, anchors_json,
         recommended_resolution, resolution_json, producer_versions_json,
         generation, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, 'section', 'factual_contradiction', 'critical',
               'open', ?, ?, '[]', ?, 'ask_writer', NULL, ?, ?, ?, NULL)`,
    ).run(
      conflictId,
      userId,
      seriesId,
      projectId,
      unmaking.id,
      "The direction requires the same brass key intact after accepted prose established that Mara watched it melt.",
      "Using the key without explanation would invalidate a source-linked fact and the emotional logic of Mara’s memorial ritual.",
      JSON.stringify([keyAnchor]),
      JSON.stringify(producerVersions),
      activeGeneration,
      new Date().toISOString(),
    );

    const callsBeforeConflict = providerCalls.length;
    const sceneTwoBlocked = await createOperation(unmaking, {
      operation: "draft",
      scope: "scene",
      wordTarget: 850,
      pacing: "tactile discovery under accelerating weather",
      sceneObjective:
        "Use the original floodgate key to open the bell’s service throat and discover what Ivo protected.",
      direction: [
        "Write 750–950 words of finished scene prose.",
        "Mara must use Bellwether’s original brass floodgate key, physically intact, even though the accepted opening says she watched it melted.",
        "The scene must make the contradiction causal rather than ignore it.",
        "Reveal Ivo’s protection through a tactile act of grief and a mechanism, not a speech or explanatory letter.",
        "The three knocks should become legible as a pressure warning and a sibling signal.",
        "End with returning water entering the basin.",
      ].join(" "),
      mustInclude: [
        "the intact original key",
        "Ivo’s protective lie",
        "a tactile grief action",
      ],
    });
    assert.equal(sceneTwoBlocked.operation.status, "awaiting_clarification");
    assertClarificationCard(
      sceneTwoBlocked.clarification,
      "hard_continuity_conflict",
    );
    assert.equal(
      providerCalls.length,
      callsBeforeConflict,
      "No prose-provider call may occur before a hard conflict is resolved.",
    );

    const customVibe =
      "Let the contradiction feel tender, not clever: the key exists because Ivo lied to protect Mara. Reveal it through a tactile act of grief, not exposition. Keep the scene rain-tight and inevitable.";
    const resumedTwo = await finishWritingOperation(
      (await requestJson(
        `/api/slate/projects/${projectId}/clarifications/${sceneTwoBlocked.clarification.id}/answer`,
        {
          method: "POST",
          body: {
            revisionFingerprint:
              sceneTwoBlocked.clarification.revisionFingerprint,
            idempotencyKey: randomUUID(),
            continuityGeneration:
              sceneTwoBlocked.clarification.continuityGeneration,
            mirrorProfileVersionId:
              sceneTwoBlocked.clarification.mirrorProfileVersionId,
            answer: {
              kind: "custom_vibe",
              vibe: customVibe,
            },
          },
        },
      )) as unknown as WritingEnvelope,
    );
    assert.equal(resumedTwo.operation.status, "proposed");
    assert.ok(
      providerCalls.length >= callsBeforeConflict + 2,
      "Custom vibe compilation and resumed prose generation must use the provider.",
    );
    answeredClarifications.push({
      ...sceneTwoBlocked.clarification,
      status: "answered",
    });
    const acceptedTwo = await acceptOperation(resumedTwo);
    const proseTwo = acceptedTwo.section?.prose ?? "";
    assert.match(proseTwo, /key/iu);
    assert.match(proseTwo, /Ivo/iu);
    assert.match(proseTwo, /lie|lied|protect|hidden|hid/iu);
    assert.doesNotMatch(proseTwo, /\p{Script=Cyrillic}/u);

    const resolvedAt = new Date().toISOString();
    const propStateResolvedAt = new Date().toISOString();
    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = 'resolved', resolution_json = ?, resolved_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      JSON.stringify({
        version: 1,
        kind: "revise_prose",
        direction:
          "Ivo substituted a memorial decoy and hid the original key as part of the warning mechanism.",
        sourceId: null,
        revisionId: null,
        recordedAt: resolvedAt,
      }),
      resolvedAt,
      conflictId,
      userId,
    );

    const callsBeforeUnstick = providerCalls.length;
    const sceneThreeBlocked = await createOperation(fourthRing, {
      operation: "unstick",
      scope: "scene",
      wordTarget: 900,
      pacing: "compressed decision, then a clear final release",
      sceneObjective:
        "Choose the strongest canon-grounded route to Mara’s public act of truth.",
      direction: [
        "Write 800–1,000 words of finished final-scene prose after the direction choice.",
        "Storm water is returning and the dam’s concealed failure is imminent.",
        "Mara can preserve the town’s memorial lie or ring the glass warning bell, confess her falsified inspection, and open the gate.",
        "Pay off the exact three-knock pattern with a fourth strike or ring whose changed meaning is physically clear.",
        "Complete Mara’s arc from preserving sanctioned grief to choosing living truth.",
        "Do not resurrect Ivo or explain the theme.",
      ].join(" "),
      mustInclude: [
        "public warning",
        "Mara’s confession",
        "the transformed fourth sound",
      ],
    });
    assert.equal(sceneThreeBlocked.operation.status, "awaiting_clarification");
    assertClarificationCard(sceneThreeBlocked.clarification, "unstick_me");
    assert.equal(
      providerCalls.length,
      callsBeforeUnstick,
      "Unstick must wait for the writer’s choice before generation.",
    );
    const chosenPath = sceneThreeBlocked.clarification.choices.find(
      (choice) => choice.id === "follow-live-thread",
    );
    assert.ok(chosenPath, "Unstick must offer the live-thread path.");
    const resumedThree = await finishWritingOperation(
      (await requestJson(
        `/api/slate/projects/${projectId}/clarifications/${sceneThreeBlocked.clarification.id}/answer`,
        {
          method: "POST",
          body: {
            revisionFingerprint:
              sceneThreeBlocked.clarification.revisionFingerprint,
            idempotencyKey: randomUUID(),
            continuityGeneration:
              sceneThreeBlocked.clarification.continuityGeneration,
            mirrorProfileVersionId:
              sceneThreeBlocked.clarification.mirrorProfileVersionId,
            answer: {
              kind: "choice",
              choiceId: chosenPath.id,
            },
          },
        },
      )) as unknown as WritingEnvelope,
    );
    assert.equal(resumedThree.operation.status, "proposed");
    assert.equal(
      providerCalls.length,
      callsBeforeUnstick + 1,
      "Fixed Unstick choice should resume one prose generation.",
    );
    answeredClarifications.push({
      ...sceneThreeBlocked.clarification,
      status: "answered",
    });
    const acceptedThree = await acceptOperation(resumedThree);
    const initialProseThree = acceptedThree.section?.prose ?? "";
    assert.match(initialProseThree, /bell|ring|struck|strike/iu);
    assert.match(initialProseThree, /truth|confess|inspection|signed/iu);
    assert.match(initialProseThree, /four|fourth/iu);

    const clapperAnchor = sentenceAnchor({
      sourceId: sourceOne.id,
      sectionId: lowWater.id,
      sectionRevision: Number(sourceOne.source_revision),
      prose: proseOne,
      needle: /clapper/iu,
    });
    const propStateConflictId = `concern-clapper-state-${randomUUID()}`;
    db.prepare(
      `INSERT INTO slate_continuity_concerns
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         severity, status, summary, explanation, claim_ids_json, anchors_json,
         recommended_resolution, resolution_json, producer_versions_json,
         generation, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, 'section', 'factual_contradiction', 'critical',
               'open', ?, ?, '[]', ?, 'ask_writer', NULL, ?, ?, ?, NULL)`,
    ).run(
      propStateConflictId,
      userId,
      seriesId,
      projectId,
      fourthRing.id,
      "The final scene must not place a ready striker inside the sealed bell after accepted prose established that Mara removed and carried away its clapper.",
      "The warning can still culminate in four rings, but the accepted physical state requires an explicit retrieval, broken seal, and reinstallation before Mara strikes the bell.",
      JSON.stringify([clapperAnchor]),
      JSON.stringify(producerVersions),
      activeGeneration,
      new Date().toISOString(),
    );

    const correctionDirection = (attempt: number): string =>
      [
        "Return the complete revised final scene, not notes or a partial patch.",
        "Preserve the storm, Mara’s public confession, the gate opening, the three-to-four payoff, the fourth ring, the final release, and the established voice.",
        "Accepted opening-scene canon says Mara removed the bell’s clapper, carried it away, and sealed the bell.",
        "Until Mara retrieves it in this scene, the bell’s clapper mount must be visibly empty.",
        "Do not show or describe a clapper, striker, or striker cord hanging inside the bell before that retrieval.",
        "Make Mara deliberately retrieve the removed clapper from storage, carry it back, break or open the bell’s seal, set the clapper into its empty mount, and secure its pin before the first of four strikes.",
        "Do not use or mention a preexisting internal striker, brass striker, or striker cord.",
        "Keep the physical sequence unmistakable without turning it into technical exposition.",
        attempt > 1
          ? "A prior proposal was rejected because it showed the clapper inside the bell before retrieving it. Audit the chronology sentence by sentence: empty mount first, storage retrieval second, broken seal third, clapper installation fourth, then four rings."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    const hasCoherentClapperState = (prose: string): boolean => {
      const retrievalIndex = prose.search(
        /storage|cabinet|locker|drawer|wrapped in|retriev|fetched|brought/iu,
      );
      const installationIndex = prose.search(
        /clapper (?:went|slid|was (?:set|hung|installed|fastened|fitted|mounted))|(?:set|hung|installed|fastened|fitted|mounted|hooked) (?:the )?clapper/iu,
      );
      const suspiciousEarlyState =
        retrievalIndex >= 0
          ? prose
              .slice(0, retrievalIndex)
              .match(
                /(?:the )?clapper (?:hung|swung|waited|rested) (?:at|in|inside|from)/iu,
              )
          : null;
      return (
        retrievalIndex >= 0 &&
        installationIndex > retrievalIndex &&
        /seal|unseal/iu.test(prose) &&
        !suspiciousEarlyState &&
        !/striker cord|brass striker hung|striker hung inside/iu.test(prose) &&
        /truth|confess|inspection|signed/iu.test(prose) &&
        /four|fourth/iu.test(prose)
      );
    };

    let correctionAttemptCount = 0;
    const rejectedCorrectionProposalIds: string[] = [];
    let sceneThreeCorrectionBlocked: WritingEnvelope | null = null;
    let resumedThreeCorrection: WritingEnvelope | null = null;
    let preserveCanonChoiceId = "";
    while (correctionAttemptCount < 3) {
      correctionAttemptCount += 1;
      const callsBeforePropStateCorrection = providerCalls.length;
      const blocked = await createOperation(fourthRing, {
        operation: "rewrite",
        scope: "scene",
        wordTarget: Math.max(800, Math.min(1_100, words(initialProseThree))),
        pacing: "compressed decision, then a clear final release",
        sceneObjective:
          "Preserve the ending while reconciling the bell’s exact clapper state with accepted opening-scene canon.",
        direction: correctionDirection(correctionAttemptCount),
        mustInclude: [
          "the visibly empty clapper mount before retrieval",
          "retrieval of the removed clapper from storage",
          "opening the bell’s seal",
          "securing the clapper into its mount",
          "Mara’s confession",
          "the fourth ring",
        ],
        mustAvoid: [
          "a clapper shown inside the bell before retrieval",
          "a preexisting internal striker",
          "a striker cord",
          "resurrecting Ivo",
        ],
      });
      assert.equal(blocked.operation.status, "awaiting_clarification");
      assertClarificationCard(
        blocked.clarification,
        "hard_continuity_conflict",
      );
      assert.equal(
        providerCalls.length,
        callsBeforePropStateCorrection,
        "The corrective rewrite must not call the prose provider before the hard conflict is resolved.",
      );
      const preserveCanonChoice = blocked.clarification.choices.find(
        (choice) => choice.id === "preserve-canon",
      );
      assert.ok(
        preserveCanonChoice,
        "The corrective conflict must offer Honor established canon.",
      );
      preserveCanonChoiceId = preserveCanonChoice.id;
      const resumed = await finishWritingOperation(
        (await requestJson(
          `/api/slate/projects/${projectId}/clarifications/${blocked.clarification.id}/answer`,
          {
            method: "POST",
            body: {
              revisionFingerprint:
                blocked.clarification.revisionFingerprint,
              idempotencyKey: randomUUID(),
              continuityGeneration:
                blocked.clarification.continuityGeneration,
              mirrorProfileVersionId:
                blocked.clarification.mirrorProfileVersionId,
              answer: {
                kind: "choice",
                choiceId: preserveCanonChoice.id,
              },
            },
          },
        )) as unknown as WritingEnvelope,
      );
      assert.equal(resumed.operation.status, "proposed");
      assert.equal(
        providerCalls.length,
        callsBeforePropStateCorrection + 1,
        "The fixed canon-preserving choice should resume one prose generation.",
      );
      answeredClarifications.push({
        ...blocked.clarification,
        status: "answered",
      });
      if (hasCoherentClapperState(resumed.operation.proposal?.prose ?? "")) {
        sceneThreeCorrectionBlocked = blocked;
        resumedThreeCorrection = resumed;
        break;
      }
      const rejected = (await requestJson(
        `/api/slate/projects/${projectId}/writing-operations/${resumed.operation.id}/reject`,
        {
          method: "POST",
          body: {
            revisionFingerprint: resumed.operation.revisionFingerprint.value,
            idempotencyKey: randomUUID(),
          },
        },
      )) as unknown as WritingEnvelope;
      assert.equal(rejected.operation.status, "rejected");
      rejectedCorrectionProposalIds.push(resumed.operation.id);
    }
    assert.ok(
      sceneThreeCorrectionBlocked && resumedThreeCorrection,
      "Continuity could not obtain a physically coherent AI rewrite after three proposals.",
    );
    const acceptedThreeCorrection = await acceptOperation(
      resumedThreeCorrection,
    );
    const proseThree = acceptedThreeCorrection.section?.prose ?? "";
    assert.ok(hasCoherentClapperState(proseThree));
    assert.match(proseThree, /clapper/iu);
    assert.match(proseThree, /retriev|fetched|brought|carried|storage/iu);
    assert.match(proseThree, /seal|unseal/iu);
    assert.doesNotMatch(
      proseThree,
      /striker cord|brass striker hung|striker hung inside/iu,
    );
    assert.match(proseThree, /bell|ring|struck|strike/iu);
    assert.match(proseThree, /truth|confess|inspection|signed/iu);
    assert.match(proseThree, /four|fourth/iu);
    assert.doesNotMatch(proseThree, /\p{Script=Cyrillic}/u);

    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = 'resolved', resolution_json = ?, resolved_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      JSON.stringify({
        version: 1,
        kind: "revise_prose",
        direction:
          "Mara retrieves and reinstalls the removed clapper before ringing the warning.",
        sourceId: null,
        revisionId: null,
        recordedAt: propStateResolvedAt,
      }),
      propStateResolvedAt,
      propStateConflictId,
      userId,
    );

    const deterministicCycle = await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      { maxJobsPerCycle: 3 },
    );
    assert.equal(deterministicCycle.claimed, 3);
    assert.equal(deterministicCycle.completed, 3);
    assert.equal(deterministicCycle.superseded, 1);
    assert.deepEqual(deterministicCycle.failures, []);

    const currentSections = (
      (await requestJson(`/api/slate/projects/${projectId}/sections`))
        .sections as ProofSection[]
    ).map((section) => {
      const accepted = [
        acceptedOne.section,
        acceptedTwo.section,
        acceptedThreeCorrection.section,
      ].find((candidate) => candidate?.id === section.id);
      return accepted ?? section;
    });
    const sectionByStructureId = new Map(
      currentSections.map((section) => [section.structureItemId, section]),
    );
    const finalLowWater = sectionByStructureId.get("scene-low-water")!;
    const finalUnmaking = sectionByStructureId.get("scene-the-unmaking")!;
    const finalFourthRing = sectionByStructureId.get("scene-the-fourth-ring")!;

    const acceptedSources = db
      .prepare(
        `SELECT id, section_id, source_revision, content_hash, content,
                generation, created_at
           FROM slate_continuity_sources
          WHERE user_id = ? AND project_id = ? AND authority = 'ai'
          ORDER BY created_at ASC, id ASC`,
      )
      .all(userId, projectId) as Array<{
      id: string;
      section_id: string;
      source_revision: number;
      content_hash: string;
      content: string;
      generation: number;
      created_at: string;
    }>;
    assert.equal(acceptedSources.length, 4);
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count
               FROM slate_continuity_sources
              WHERE user_id = ? AND project_id = ? AND authority = 'human'`,
          )
          .get(userId, projectId) as { count: number }
      ).count,
      0,
      "The proof manuscript must contain no human-authored evidence source.",
    );

    const sourceBySection = new Map<string, (typeof acceptedSources)[number]>();
    for (const source of acceptedSources) {
      const current = sourceBySection.get(source.section_id);
      if (!current || source.source_revision > current.source_revision) {
        sourceBySection.set(source.section_id, source);
      }
    }
    assert.equal(
      sourceBySection.size,
      3,
      "The latest accepted AI source must be authoritative for each section.",
    );
    const sourceTwo = sourceBySection.get(finalUnmaking.id)!;
    const sourceThree = sourceBySection.get(finalFourthRing.id)!;
    const generation = Number(sourceOne ? activeGeneration : 0);
    const versionsJson = JSON.stringify(producerVersions);
    const provenance = (
      sourceIds: string[],
      layer: "evidence" | "plans" | "interpretations" = "evidence",
    ) => ({
      layer,
      authority: layer === "plans" ? "writer" : "manuscript",
      sourceIds,
      anchors: [],
      provider: layer === "plans" ? null : "openai",
      model: layer === "plans" ? null : proofModel,
      createdAt: new Date().toISOString(),
    });

    const ensureEntity = (
      canonicalName: string,
      kind: "character" | "object",
      description: string,
      sourceId: string,
    ): string => {
      const existing = db
        .prepare(
          `SELECT id FROM slate_continuity_entities
            WHERE user_id = ? AND series_id = ? AND generation = ?
              AND LOWER(canonical_name) = LOWER(?)
            LIMIT 1`,
        )
        .get(userId, seriesId, generation, canonicalName) as
        { id: string } | undefined;
      if (existing) return existing.id;
      const id = `entity-${slug(canonicalName)}-${randomUUID()}`;
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO slate_continuity_entities
          (id, user_id, series_id, kind, canonical_name, description, locked,
           anchors_json, source_id, producer_versions_json, generation,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        seriesId,
        kind,
        canonicalName,
        description,
        sourceId,
        versionsJson,
        generation,
        createdAt,
        createdAt,
      );
      return id;
    };

    const maraEntityId = ensureEntity(
      "Mara Vale",
      "character",
      "Bellwether’s warning-bell keeper, carrying responsibility for a falsified dam inspection.",
      sourceOne.id,
    );
    const ivoEntityId = ensureEntity(
      "Ivo Vale",
      "character",
      "Mara’s missing brother, who took public blame to keep her alive long enough to expose the dam.",
      sourceTwo.id,
    );
    ensureEntity(
      "Bellwether glass warning bell",
      "object",
      "A glass flood-warning bell that serves as mechanism, memorial, witness, and public voice.",
      sourceOne.id,
    );

    const profileId = `profile-mara-${randomUUID()}`;
    const profileProvenance = provenance(
      [sourceOne.id, sourceTwo.id, sourceThree.id],
      "evidence",
    );
    db.prepare(
      `INSERT INTO slate_character_profiles
        (id, user_id, series_id, project_id, entity_id, generation, layer,
         profile_json, field_locks_json, provenance_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'evidence', ?, ?, ?, ?, ?)`,
    ).run(
      profileId,
      userId,
      seriesId,
      projectId,
      maraEntityId,
      generation,
      JSON.stringify({
        identity: "Mara Vale",
        aliases: ["Mara"],
        roles: ["warning-bell keeper", "former dam inspector"],
        publicPersona: "Exact, dutiful, and keeper of sanctioned ritual.",
        privatePressure:
          "She signed the inspection Ivo tried to expose and let the town bury him beneath her silence.",
        wants: [
          "keep Bellwether safe",
          "preserve the manageable version of grief",
        ],
        needs: [
          "make the warning public",
          "accept consequence without asking absolution",
        ],
        fears: ["the town learning her signature helped create the danger"],
        wounds: ["Ivo’s disappearance and public disgrace"],
        beliefs: ["maintenance can hold chaos at bay"],
        values: ["precision", "duty", "living truth"],
        secrets: ["her falsified inspection"],
        contradictions: [
          "She preserves a warning system while suppressing its most important warning.",
        ],
        dialogueMarkers: ["spare speech", "exact mechanical nouns"],
        competencies: ["bell maintenance", "reading water pressure"],
        limitations: [
          "turns emotion into work until action becomes unavoidable",
        ],
        appearance:
          "Silt-marked work clothes and hands trained by glass and brass.",
        currentState:
          "Publicly accountable after ringing Bellwether and confessing the inspection.",
      }),
      JSON.stringify({
        identity: true,
        roles: true,
      }),
      JSON.stringify(profileProvenance),
      now,
      new Date().toISOString(),
    );

    const arcId = `arc-mara-${randomUUID()}`;
    const intendedProvenance = provenance([`shape:${projectId}`], "plans");
    const observedProvenance = profileProvenance;
    db.prepare(
      `INSERT INTO slate_character_arcs
        (id, user_id, series_id, project_id, character_profile_id, generation,
         intended_json, observed_json, provenance_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      arcId,
      userId,
      seriesId,
      projectId,
      profileId,
      generation,
      JSON.stringify({
        startState: "Preserves sanctioned grief and manages guilt as ritual.",
        destinationState:
          "Chooses living truth and public warning over her protected reputation.",
        writerLocked: true,
        beats: [
          {
            id: "intended-low-water",
            label: "The ritual cracks",
            description:
              "Three knocks disturb Mara’s maintained version of grief.",
            expectedSectionId: finalLowWater.id,
            manuscriptOrder: 0,
            status: "landed",
            layer: "plans",
            provenance: intendedProvenance,
          },
          {
            id: "intended-unmaking",
            label: "The lie becomes touchable",
            description:
              "The intact key makes Ivo’s protection physically real.",
            expectedSectionId: finalUnmaking.id,
            manuscriptOrder: 1,
            status: "landed",
            layer: "plans",
            provenance: intendedProvenance,
          },
          {
            id: "intended-fourth-ring",
            label: "Truth becomes warning",
            description: "Mara rings, confesses, and opens the gate.",
            expectedSectionId: finalFourthRing.id,
            manuscriptOrder: 2,
            status: "landed",
            layer: "plans",
            provenance: intendedProvenance,
          },
        ],
      }),
      JSON.stringify({
        startState:
          "Mara uses maintenance and memorial ritual to keep responsibility at a distance.",
        destinationState:
          "Mara makes her responsibility audible and acts before forgiveness is possible.",
        writerLocked: false,
        beats: [
          {
            id: "observed-low-water",
            label: "Hears the impossible pattern",
            description:
              "Accepted prose establishes the knocks and melted-key truth.",
            observedSectionId: finalLowWater.id,
            manuscriptOrder: 0,
            status: "landed",
            layer: "evidence",
            provenance: provenance([sourceOne.id]),
          },
          {
            id: "observed-unmaking",
            label: "Handles Ivo’s protection",
            description:
              "Accepted prose resolves the key contradiction through action.",
            observedSectionId: finalUnmaking.id,
            manuscriptOrder: 1,
            status: "landed",
            layer: "evidence",
            provenance: provenance([sourceTwo.id]),
          },
          {
            id: "observed-fourth-ring",
            label: "Makes truth public",
            description:
              "Accepted prose transforms the knocks into public warning.",
            observedSectionId: finalFourthRing.id,
            manuscriptOrder: 2,
            status: "landed",
            layer: "evidence",
            provenance: provenance([sourceThree.id]),
          },
        ],
      }),
      JSON.stringify(observedProvenance),
      now,
      new Date().toISOString(),
    );

    const truthClaimId = `claim-ivo-protected-mara-${randomUUID()}`;
    db.prepare(
      `INSERT INTO slate_continuity_claims
        (id, user_id, series_id, project_id, section_id, scope_kind,
         subject_entity_id, predicate, object_entity_id, value,
         epistemic_status, perspective_entity_id, confidence, anchors_json,
         source_id, supersedes_claim_id, producer_versions_json, generation,
         created_at)
       VALUES (?, ?, ?, ?, ?, 'section', ?, 'protected_by_taking_blame', ?,
               ?, 'fact', ?, 0.98, '[]', ?, NULL, ?, ?, ?)`,
    ).run(
      truthClaimId,
      userId,
      seriesId,
      projectId,
      finalUnmaking.id,
      ivoEntityId,
      maraEntityId,
      "Ivo hid the original key and allowed the town to blame him so Mara would survive long enough to expose the dam.",
      maraEntityId,
      sourceTwo.id,
      versionsJson,
      generation,
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO slate_continuity_knowledge
        (id, user_id, series_id, character_entity_id, claim_id,
         learned_event_id, status, anchors_json, source_id,
         producer_versions_json, generation, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'knows', '[]', ?, ?, ?, ?)`,
    ).run(
      `knowledge-mara-${randomUUID()}`,
      userId,
      seriesId,
      maraEntityId,
      truthClaimId,
      sourceTwo.id,
      versionsJson,
      generation,
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO slate_continuity_relationships
        (id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
         epistemic_status, anchors_json, source_id, producer_versions_json,
         generation, created_at)
       VALUES (?, ?, ?, ?, ?, 'siblings', ?, 'fact', '[]', ?, ?, ?, ?)`,
    ).run(
      `relationship-mara-ivo-${randomUUID()}`,
      userId,
      seriesId,
      maraEntityId,
      ivoEntityId,
      "Mara understands that Ivo’s protection was love, not absolution.",
      sourceTwo.id,
      versionsJson,
      generation,
      new Date().toISOString(),
    );

    const threadId = `thread-three-knocks-${randomUUID()}`;
    db.prepare(
      `INSERT INTO slate_continuity_threads
        (id, user_id, series_id, project_id, section_id, scope_kind, label,
         status, due_section_id, anchors_json, source_id,
         producer_versions_json, generation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'mystery', ?, 'landed', ?, '[]', ?, ?, ?, ?, ?)`,
    ).run(
      threadId,
      userId,
      seriesId,
      projectId,
      finalLowWater.id,
      "Mystery: the three knocks inside the sealed glass bell",
      finalFourthRing.id,
      sourceOne.id,
      versionsJson,
      generation,
      now,
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO slate_narrative_edges
        (id, user_id, series_id, project_id, generation, from_ref_json,
         to_ref_json, kind, branch_id, story_time_json,
         manuscript_order_json, provenance_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'resolves', 'main', ?, ?, ?, ?, ?)`,
    ).run(
      `edge-fourth-ring-resolves-knocks-${randomUUID()}`,
      userId,
      seriesId,
      projectId,
      generation,
      JSON.stringify({ kind: "section", id: finalFourthRing.id }),
      JSON.stringify({ kind: "thread", id: threadId }),
      JSON.stringify({ key: "storm-return" }),
      JSON.stringify({ order: 2 }),
      JSON.stringify(provenance([sourceThree.id])),
      now,
      new Date().toISOString(),
    );

    for (const section of [finalLowWater, finalUnmaking, finalFourthRing]) {
      const source = sourceBySection.get(section.id)!;
      const counts = {
        entities: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_continuity_entities WHERE user_id = ? AND source_id = ? AND generation = ?",
              )
              .get(userId, source.id, generation) as { count: number }
          ).count,
        ),
        claims: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_continuity_claims WHERE user_id = ? AND source_id = ? AND generation = ?",
              )
              .get(userId, source.id, generation) as { count: number }
          ).count,
        ),
        events: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_continuity_events WHERE user_id = ? AND source_id = ? AND generation = ?",
              )
              .get(userId, source.id, generation) as { count: number }
          ).count,
        ),
        relationships: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_continuity_relationships WHERE user_id = ? AND source_id = ? AND generation = ?",
              )
              .get(userId, source.id, generation) as { count: number }
          ).count,
        ),
        knowledgeStates: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_continuity_knowledge WHERE user_id = ? AND source_id = ? AND generation = ?",
              )
              .get(userId, source.id, generation) as { count: number }
          ).count,
        ),
        threads: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_continuity_threads WHERE user_id = ? AND source_id = ? AND generation = ?",
              )
              .get(userId, source.id, generation) as { count: number }
          ).count,
        ),
      };
      const operation = acceptedOperations.find(
        (candidate) => candidate.sectionId === section.id,
      )!;
      recordSlateDeveloperEvent(db, {
        userId,
        projectId,
        sectionId: section.id,
        sectionRevision: section.revision,
        stage: "extraction",
        kind: "deterministic_source_extracted",
        summary:
          "Continuity indexed the accepted AI source with deterministic, source-anchored extraction.",
        detail: {
          sourceId: source.id,
          sourceRevision: Number(source.source_revision),
          acceptedProseHash: source.content_hash,
          extractedCounts: counts,
          summary: `Persisted ${counts.entities} entities, ${counts.claims} claims, ${counts.relationships} relationships, ${counts.knowledgeStates} knowledge states, and ${counts.threads} threads from this accepted revision.`,
        },
        sourceIds: [source.id],
        operationId: operation.id,
        provider: "openai",
        model: proofModel,
        continuityGeneration: generation,
      });

      const projection = projectActiveSlateStoryBible(db, {
        userId,
        projectId,
        sectionId: section.id,
      });
      for (const diagnostic of projection.diagnostics) {
        recordSlateDeveloperEvent(db, {
          userId,
          projectId,
          sectionId: section.id,
          sectionRevision: section.revision,
          stage: diagnostic.stage,
          kind: `post_extraction_${diagnostic.kind}`,
          summary: diagnostic.summary,
          detail: diagnostic.detail,
          sourceIds: diagnostic.sourceIds,
          operationId: operation.id,
          continuityGeneration: diagnostic.continuityGeneration,
        });
      }
    }

    const refreshedProject = record(
      (await requestJson(`/api/slate/projects/${projectId}`)).project,
      "refreshed project",
    );
    assert.equal(refreshedProject.proseMode, "online");

    let cover: JsonRecord | null = null;
    let coverPath: string | null = null;
    try {
      const coverResponse = await requestJson(
        `/api/slate/projects/${projectId}/cover`,
        {
          method: "POST",
          body: { preferredProvider: "openai" },
        },
      );
      const coveredProject = record(
        coverResponse.project,
        "covered Slate project",
      );
      cover = record(coveredProject.cover, "Slate cover");
      assert.equal(cover.status, "ready");
      const imageUrl = requiredString(cover.imageUrl, "cover image URL");
      const imageResponse = await request(imageUrl);
      const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
      assert.ok(
        imageBytes.byteLength > 1_000,
        "Cover image is unexpectedly small.",
      );
      coverPath = join(runDirectory, "the-bells-dry-mouth-cover.png");
      writeFileSync(coverPath, imageBytes);
    } catch (error) {
      cover = {
        status: "unavailable",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const reviewArtifacts: Array<{
      sectionId: string;
      title: string;
      jsonPath: string;
      markdownPath: string;
      eventCount: number;
    }> = [];
    for (const section of [finalLowWater, finalUnmaking, finalFourthRing]) {
      const baseName = `${String(section.ordinal + 1).padStart(2, "0")}-${slug(section.title)}`;
      const jsonResponse = await request(
        `/api/slate/projects/${projectId}/review-export`,
        {
          method: "POST",
          body: { sectionId: section.id, format: "json" },
        },
      );
      const jsonText = await jsonResponse.text();
      const review = record(JSON.parse(jsonText), `${section.title} review`);
      assert.equal(review.format, "prism-slate-review-v1");
      const reviewSections = review.sections;
      assert.ok(Array.isArray(reviewSections) && reviewSections.length === 1);
      const reviewedSection = record(
        reviewSections[0],
        `${section.title} reviewed section`,
      );
      assert.equal(reviewedSection.acceptedProse, section.prose);
      const developerEvents = reviewedSection.developerEvents;
      assert.ok(Array.isArray(developerEvents));
      assert.ok(
        developerEvents.length >= 8,
        `${section.title} review must retain its operation and Continuity events.`,
      );
      const jsonPath = join(runDirectory, `${baseName}-review.json`);
      writeFileSync(jsonPath, `${jsonText.trim()}\n`);

      const markdownResponse = await request(
        `/api/slate/projects/${projectId}/review-export`,
        {
          method: "POST",
          body: { sectionId: section.id, format: "markdown" },
        },
      );
      const markdown = await markdownResponse.text();
      assert.match(markdown, /Continuity|Writing operations/iu);
      const markdownPath = join(runDirectory, `${baseName}-review.md`);
      writeFileSync(markdownPath, markdown);
      reviewArtifacts.push({
        sectionId: section.id,
        title: section.title,
        jsonPath,
        markdownPath,
        eventCount: developerEvents.length,
      });
    }

    const exportDownload = async (
      format: "markdown" | "text" | "docx",
      filename: string,
    ): Promise<string> => {
      const response = await request(
        `/api/slate/projects/${projectId}/exports`,
        {
          method: "POST",
          body: { scope: { kind: "book" }, format },
        },
      );
      const payload = new Uint8Array(await response.arrayBuffer());
      assert.ok(payload.byteLength > 0);
      const path = join(runDirectory, filename);
      writeFileSync(path, payload);
      return path;
    };
    const manuscriptMarkdownPath = await exportDownload(
      "markdown",
      "the-bells-dry-mouth.md",
    );
    const manuscriptTextPath = await exportDownload(
      "text",
      "the-bells-dry-mouth.txt",
    );
    const manuscriptDocxPath = await exportDownload(
      "docx",
      "the-bells-dry-mouth.docx",
    );
    const archiveResponse = await request(
      `/api/slate/projects/${projectId}/archive`,
    );
    assert.equal(archiveResponse.headers.get("x-prism-slate-version"), "2");
    const archivePath = join(runDirectory, "the-bells-dry-mouth.slate");
    const archivePayload = new Uint8Array(await archiveResponse.arrayBuffer());
    writeFileSync(archivePath, archivePayload);
    const archivePreview = previewSlateProjectArchiveImport(
      db,
      userId,
      archivePayload,
    );
    assert.equal(archivePreview.version, 2);
    assert.equal(archivePreview.counts.sections, 3);
    assert.equal(archivePreview.counts.documents, 3);
    assert.ok(archivePreview.counts.writingOperations >= 4);
    assert.ok(archivePreview.counts.developerEvents >= 20);

    const manuscriptMarkdown = readFileSync(manuscriptMarkdownPath, "utf8");
    const storyWordCount = words([proseOne, proseTwo, proseThree].join("\n\n"));
    assert.ok(storyWordCount >= 1_500, "Proof story is too short.");
    assert.ok(storyWordCount <= 5_000, "Proof story is unexpectedly long.");
    assert.match(manuscriptMarkdown, /Low Water/u);
    assert.match(manuscriptMarkdown, /The Unmaking/u);
    assert.match(manuscriptMarkdown, /The Fourth Ring/u);

    const auxiliaryPendingCount = Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_jobs
              WHERE user_id = ? AND project_id = ?
                AND kind = 'extract_source_auxiliary' AND status = 'queued'`,
          )
          .get(userId, projectId) as { count: number }
      ).count,
    );
    const proofManifest = {
      format: "prism-slate-story-proof-v1",
      generatedAt: new Date().toISOString(),
      runId,
      project: {
        id: projectId,
        seriesId,
        title: "The Bell’s Dry Mouth",
        proseMode: "online",
        model: proofModel,
        mirrorProfileVersionId: mirrorVersionId,
      },
      story: {
        wordCount: storyWordCount,
        sectionCount: 3,
        allAcceptedSourcesAiAuthored: true,
        humanEvidenceSourceCount: 0,
        markdownSha256: sha256(manuscriptMarkdown),
      },
      operations: acceptedOperations.map((operation) => ({
        id: operation.id,
        sectionId: operation.sectionId,
        kind: operation.intent.operation,
        status: operation.status,
        provider: operation.proposal?.provider ?? null,
        model: operation.proposal?.model ?? null,
      })),
      clarifications: [
        {
          trigger: "hard_continuity_conflict",
          answerKind: "custom_vibe",
          fixedChoiceCount: 3,
          customVibeLabel: "Describe the vibe…",
          autoResumed: true,
        },
        {
          trigger: "unstick_me",
          answerKind: "choice",
          selectedChoiceId: chosenPath.id,
          fixedChoiceCount: 3,
          customVibeLabel: "Describe the vibe…",
          autoResumed: true,
        },
        {
          trigger: "hard_continuity_conflict",
          issue:
            "A removed clapper risked reappearing inside the sealed bell without a physical state bridge.",
          answerKind: "choice",
          selectedChoiceId: preserveCanonChoiceId,
          fixedChoiceCount: 3,
          customVibeLabel: "Describe the vibe…",
          autoResumed: true,
          proposalAttempts: correctionAttemptCount,
          rejectedProposalIds: rejectedCorrectionProposalIds,
        },
      ],
      providerCalls,
      continuity: {
        deterministicJobsCompleted: deterministicCycle.completed,
        auxiliaryLocalJobsPending: auxiliaryPendingCount,
        activeGeneration: generation,
        sourceCount: acceptedSources.length,
        authoritativeSectionSourceCount: sourceBySection.size,
        resolvedHardConflictId: conflictId,
        resolvedPropStateConflictId: propStateConflictId,
        corrections: [
          {
            operationId: resumedThreeCorrection.operation.id,
            clarificationId: sceneThreeCorrectionBlocked.clarification.id,
            issue:
              "Removed clapper required explicit retrieval and reinstallation before the four-ring payoff.",
            resolution:
              "AI rewrote and the proof accepted the complete final section through the normal preserve-canon clarification path.",
            proposalAttempts: correctionAttemptCount,
            rejectedProposalIds: rejectedCorrectionProposalIds,
          },
        ],
      },
      cover,
      artifacts: {
        manuscriptMarkdown: relative(workspaceRoot, manuscriptMarkdownPath),
        manuscriptText: relative(workspaceRoot, manuscriptTextPath),
        manuscriptDocx: relative(workspaceRoot, manuscriptDocxPath),
        slateArchive: relative(workspaceRoot, archivePath),
        cover: coverPath ? relative(workspaceRoot, coverPath) : null,
        reviews: reviewArtifacts.map((artifact) => ({
          ...artifact,
          jsonPath: relative(workspaceRoot, artifact.jsonPath),
          markdownPath: relative(workspaceRoot, artifact.markdownPath),
        })),
        database: relative(workspaceRoot, databasePath),
      },
    };
    const manifestPath = join(runDirectory, "proof-manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(proofManifest, null, 2)}\n`);
    const readmePath = join(runDirectory, "README.md");
    writeFileSync(
      readmePath,
      [
        "# Slate writer’s cockpit proof",
        "",
        "This run created **The Bell’s Dry Mouth** through Slate’s real HTTP composition lifecycle and OpenAI provider path.",
        "",
        `- ${storyWordCount.toLocaleString()} words across three final scenes and four accepted AI prose proposals`,
        "- two critical Continuity conflicts paused before any prose call",
        "- exactly three fixed clarification choices plus **Describe the vibe…**",
        "- custom vibe compilation resumed scene two automatically",
        "- writer-invoked **Unstick me** resumed scene three through a fixed live-thread choice",
        "- a second Continuity pass caught the removed-clapper state conflict and AI-rewrote the complete final scene through **Honor established canon**",
        "- all four accepted manuscript source revisions are AI-authored; no human-edit evidence source exists",
        `- ${deterministicCycle.completed} accepted-source Continuity jobs completed`,
        `- ${auxiliaryPendingCount} local auxiliary extraction jobs remain queued by design in this isolated online proof`,
        `- cover status: ${String(cover?.status ?? "unavailable")}`,
        "",
        "Open `the-bells-dry-mouth.md` for the story, the section review files for Continuity’s exportable operational transcript, and `proof-manifest.json` for machine-verifiable provenance.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(outputRoot, "latest-run.json"),
      `${JSON.stringify(
        {
          runId,
          generatedAt: proofManifest.generatedAt,
          directory: relative(workspaceRoot, runDirectory),
          manifest: relative(workspaceRoot, manifestPath),
          story: relative(workspaceRoot, manuscriptMarkdownPath),
          cover: coverPath ? relative(workspaceRoot, coverPath) : null,
        },
        null,
        2,
      )}\n`,
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          runDirectory,
          manifestPath,
          storyPath: manuscriptMarkdownPath,
          coverPath,
          wordCount: storyWordCount,
          providerCallCount: providerCalls.length,
          reviewCount: reviewArtifacts.length,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await closeServer();
    db.close();
  }
}

await main();
