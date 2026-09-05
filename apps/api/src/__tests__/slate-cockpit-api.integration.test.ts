import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  isSlateReviewExportV1,
  type SlateSectionDocumentV1,
} from "@localai/shared";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "slate-cockpit-api-test-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider([
  "The harbor bell rang once beneath the rain.",
  "Mara kept the northern gate closed and followed the river road.",
  JSON.stringify({
    direction: "Make the discovery feel tender but dangerous.",
    scope: "beat",
    pacing: "held breath",
  }),
  "A warm light moved under the locked observatory door.",
  "The harbor bell rang twice beneath the rain, and Mara finally answered.",
]);
const fetchRecorder = createFetchRecorder();
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_cockpit_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: fetchRecorder,
    providerFactory: () => provider,
    auxiliaryProviderFactory: () => provider,
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}) {
      init = withTestRegistrationAcceptance(path, init);
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function jsonInit(
  value: Record<string, unknown>,
  method = "POST",
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function runWritingOperation<T>(
  client: ReturnType<typeof createClient>,
  projectId: string,
  initial: {
    operation: {
      id: string;
      status: string;
      revisionFingerprint: { value: string };
    };
  },
): Promise<T> {
  if (
    initial.operation.status !== "compiling" &&
    initial.operation.status !== "generating"
  ) {
    return initial as T;
  }
  const response = await client.request(
    `/api/slate/projects/${projectId}/writing-operations/${initial.operation.id}/run`,
    jsonInit({
      revisionFingerprint: initial.operation.revisionFingerprint.value,
      idempotencyKey: `run-${initial.operation.id}`,
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  return jsonBody<T>(response);
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate writer cockpit API", () => {
  it("keeps proposals outside evidence, pauses hard conflicts, resumes once, and exports canonical review provenance", async () => {
    const client = createClient();
    assert.equal(
      (
        await client.request(
          "/api/auth/register",
          jsonInit({
            username: "cockpit-writer@example.com",
            password: "cockpit-writer-password",
          }),
        )
      ).status,
      201,
    );
    const created = await jsonBody<{ project: { id: string } }>(
      await client.request(
        "/api/slate/projects",
        jsonInit({
          title: "The Rain Observatory",
          spark: "A cartographer hears tomorrow through a harbor bell.",
        }),
      ),
    );
    const projectId = created.project.id;
    assert.equal(
      (
        await client.request(
          `/api/slate/projects/${projectId}`,
          jsonInit(
            {
              structure: [
                {
                  id: "cockpit-scene-1",
                  kind: "scene",
                  title: "The Bell",
                  summary: "Mara hears the impossible signal.",
                  direction: "Open with pressure.",
                  status: "planned",
                  locked: false,
                },
                {
                  id: "cockpit-scene-2",
                  kind: "scene",
                  title: "The Gate",
                  summary: "Canon narrows the route.",
                  direction: "Make the choice concrete.",
                  status: "planned",
                  locked: false,
                },
                {
                  id: "cockpit-scene-3",
                  kind: "scene",
                  title: "The Observatory",
                  summary: "Mara needs a new way in.",
                  direction: "Preserve wonder.",
                  status: "planned",
                  locked: false,
                },
              ],
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const sectionList = await jsonBody<{
      sections: Array<{ id: string; title: string }>;
    }>(
      await client.request(`/api/slate/projects/${projectId}/sections`),
    );
    const first = sectionList.sections.find(
      (section) => section.title === "The Bell",
    )!;
    const second = sectionList.sections.find(
      (section) => section.title === "The Gate",
    )!;
    const third = sectionList.sections.find(
      (section) => section.title === "The Observatory",
    )!;
    const writer = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("cockpit-writer@example.com") as { id: string };
    const mirrorNow = "2026-07-29T19:59:00.000Z";
    db.prepare(
      `INSERT INTO slate_mirror_profiles
        (id, user_id, name, pen_name, frozen, created_at, updated_at)
       VALUES ('cockpit-mirror', ?, 'Rain voice', 'J. Rain', 1, ?, ?)`,
    ).run(writer.id, mirrorNow, mirrorNow);
    db.prepare(
      `INSERT INTO slate_mirror_profile_versions
        (id, user_id, profile_id, version, voice_card_json,
         eligibility_summary_json, created_at)
       VALUES ('cockpit-mirror-v1', ?, 'cockpit-mirror', 1, ?, '{}', ?)`,
    ).run(
      writer.id,
      JSON.stringify({
        narrativeDistance: "close third",
        diction: ["plain", "precise"],
        rhythm: ["short pressure, then release"],
        imagery: ["weather as physical pressure"],
        dialogueHabits: [],
        exposition: [],
        humor: [],
        density: ["spare"],
        preferences: ["concrete sensory turns"],
        avoidances: ["ornate abstraction"],
        exemplars: [],
      }),
      mirrorNow,
    );
    db.prepare(
      `INSERT INTO slate_project_mirror_bindings
        (project_id, user_id, profile_version_id, project_overlay_json,
         pov_overlays_json, created_at, updated_at)
       VALUES (?, ?, 'cockpit-mirror-v1', ?, '{}', ?, ?)`,
    ).run(
      projectId,
      writer.id,
      JSON.stringify({
        id: "cockpit-project-overlay",
        direction: "Keep maritime images tactile and restrained.",
      }),
      mirrorNow,
      mirrorNow,
    );

    const draftResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations`,
      jsonInit({
        sectionId: first.id,
        operation: "draft",
        direction: "Let the bell feel intimate, not grand.",
        scope: "beat",
        idempotencyKey: "cockpit-draft-1",
      }),
    );
    assert.equal(
      draftResponse.status,
      202,
      await draftResponse.clone().text(),
    );
    const queuedDraft = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
        proposal: { prose: string };
      };
      clarification: null;
    }>(draftResponse);
    assert.equal(queuedDraft.operation.status, "generating");
    const draft = await runWritingOperation<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
        proposal: { prose: string };
      };
      clarification: null;
    }>(client, projectId, queuedDraft);
    assert.equal(draft.operation.status, "proposed");
    const composerPrompt = provider.calls[0]!
      .map((message) => message.content)
      .join("\n");
    assert.match(
      composerPrompt,
      /Composition Orchestrator · Direction Intent/iu,
    );
    assert.match(
      composerPrompt,
      /Composition Orchestrator · Continuity Brief/iu,
    );
    assert.match(
      composerPrompt,
      /Composition Orchestrator · Mirror Brief[\s\S]*maritime images tactile/iu,
    );
    assert.match(
      composerPrompt,
      /Composition Orchestrator · Momentum Target[\s\S]*Lit match/iu,
    );
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count
               FROM slate_continuity_developer_events
              WHERE operation_id = ? AND stage = 'brief'
                AND kind = 'composition_brief_compiled'`,
          )
          .get(draft.operation.id) as { count: number }
      ).count,
      1,
    );
    assert.equal(
      (
        await jsonBody<{ section: { prose: string } }>(
          await client.request(
            `/api/slate/projects/${projectId}/sections/${first.id}`,
          ),
        )
      ).section.prose,
      "",
    );
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_sources
              WHERE project_id = ? AND section_id = ?`,
          )
          .get(projectId, first.id) as { count: number }
      ).count,
      0,
    );

    const acceptedResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations/${draft.operation.id}/accept`,
      jsonInit({
        revisionFingerprint: draft.operation.revisionFingerprint.value,
        idempotencyKey: "cockpit-accept-1",
      }),
    );
    assert.equal(acceptedResponse.status, 200);
    const accepted = await jsonBody<{
      operation: { status: string };
      section: {
        revision: number;
        prose: string;
        document: SlateSectionDocumentV1;
        documentHash: string;
        proseHash: string;
      };
    }>(acceptedResponse);
    assert.equal(accepted.operation.status, "applied");
    assert.equal(
      accepted.section.prose,
      "The harbor bell rang once beneath the rain.",
    );
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_sources
              WHERE project_id = ? AND section_id = ?`,
          )
          .get(projectId, first.id) as { count: number }
      ).count,
      1,
    );
    const duplicateAccept = await client.request(
      `/api/slate/projects/${projectId}/writing-operations/${draft.operation.id}/accept`,
      jsonInit({
        revisionFingerprint: draft.operation.revisionFingerprint.value,
        idempotencyKey: "cockpit-accept-1",
      }),
    );
    assert.equal(duplicateAccept.status, 200);
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_sources
              WHERE project_id = ? AND section_id = ?`,
          )
          .get(projectId, first.id) as { count: number }
      ).count,
      1,
    );

    const formattingDocument = structuredClone(accepted.section.document);
    const firstText = formattingDocument.content[0]?.content?.[0];
    assert.ok(firstText);
    firstText.marks = [{ type: "bold" }];
    const sourceCountBeforeFormatting = (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM slate_continuity_sources
            WHERE project_id = ? AND section_id = ?`,
        )
        .get(projectId, first.id) as { count: number }
    ).count;
    const formattingResponse = await client.request(
      `/api/slate/projects/${projectId}/sections/${first.id}`,
      jsonInit(
        {
          expectedRevision: accepted.section.revision,
          mutationId: "cockpit-formatting-only",
          document: formattingDocument,
        },
        "PATCH",
      ),
    );
    assert.equal(formattingResponse.status, 200);
    const formatted = (
      await jsonBody<{
        section: {
          revision: number;
          prose: string;
          documentHash: string;
          proseHash: string;
          document: SlateSectionDocumentV1;
        };
      }>(formattingResponse)
    ).section;
    assert.equal(formatted.prose, accepted.section.prose);
    assert.equal(formatted.proseHash, accepted.section.proseHash);
    assert.notEqual(formatted.documentHash, accepted.section.documentHash);
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_sources
              WHERE project_id = ? AND section_id = ?`,
          )
          .get(projectId, first.id) as { count: number }
      ).count,
      sourceCountBeforeFormatting,
    );

    const blockId = String(formatted.document.content[0]!.attrs.blockId);
    const annotationResponse = await client.request(
      `/api/slate/projects/${projectId}/sections/${first.id}/annotations`,
      jsonInit({
        idempotencyKey: "cockpit-note-1",
        blockId,
        kind: "note",
        body: "Keep the bell intimate.",
        anchor: {
          sectionId: first.id,
          sectionRevision: formatted.revision,
          start: 0,
          end: 3,
          startPosition: {
            blockId,
            offset: 0,
            affinity: "forward",
          },
          endPosition: {
            blockId,
            offset: 3,
            affinity: "backward",
          },
          quoteHash: createHash("sha256")
            .update(formatted.prose.slice(0, 3))
            .digest("hex"),
        },
      }),
    );
    assert.equal(annotationResponse.status, 201);

    const project = db
      .prepare(
        `SELECT series_id, continuity_active_generation
           FROM slate_projects WHERE id = ? AND user_id = ?`,
      )
      .get(projectId, writer.id) as {
      series_id: string;
      continuity_active_generation: number;
    };
    db.prepare(
      `INSERT INTO slate_continuity_concerns
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         severity, status, summary, explanation, claim_ids_json, anchors_json,
         producer_versions_json, generation, created_at)
       VALUES ('cockpit-hard-conflict', ?, ?, ?, ?, 'section',
               'factual_contradiction', 'critical', 'open', ?, ?, '[]', '[]',
               '{}', ?, ?)`,
    ).run(
      writer.id,
      project.series_id,
      projectId,
      second.id,
      "The northern gate is canonically sealed.",
      "The current direction appears to send Mara through the sealed gate.",
      project.continuity_active_generation,
      "2026-07-29T20:00:00.000Z",
    );
    const callsBeforeConflict = provider.calls.length;
    const blocked = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: {
          value: string;
          continuityGeneration: number;
          mirrorProfileVersionId: string | null;
        };
      };
      clarification: {
        id: string;
        choices: Array<{ id: string }>;
        customVibe: { label: string };
      };
    }>(
      await client.request(
        `/api/slate/projects/${projectId}/writing-operations`,
        jsonInit({
          sectionId: second.id,
          operation: "draft",
          direction: "Send Mara through the northern gate.",
          scope: "scene",
          idempotencyKey: "cockpit-conflict-1",
        }),
      ),
    );
    assert.equal(blocked.operation.status, "awaiting_clarification");
    assert.equal(blocked.clarification.choices.length, 3);
    assert.equal(blocked.clarification.customVibe.label, "Describe the vibe…");
    assert.equal(provider.calls.length, callsBeforeConflict);
    const queuedResolvedConflict = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
      };
      clarification: { status: string };
    }>(
      await client.request(
        `/api/slate/projects/${projectId}/clarifications/${blocked.clarification.id}/answer`,
        jsonInit({
          revisionFingerprint:
            blocked.operation.revisionFingerprint.value,
          idempotencyKey: "cockpit-conflict-answer-1",
          continuityGeneration:
            blocked.operation.revisionFingerprint.continuityGeneration,
          mirrorProfileVersionId:
            blocked.operation.revisionFingerprint.mirrorProfileVersionId,
          answer: {
            kind: "choice",
            choiceId: blocked.clarification.choices[0]!.id,
          },
        }),
      ),
    );
    assert.equal(queuedResolvedConflict.operation.status, "generating");
    const resolvedConflict = await runWritingOperation<{
      operation: { status: string; proposal: { prose: string } };
      clarification: { status: string };
    }>(client, projectId, queuedResolvedConflict);
    assert.equal(resolvedConflict.operation.status, "proposed");
    assert.equal(resolvedConflict.clarification.status, "answered");
    assert.equal(provider.calls.length, callsBeforeConflict + 1);

    const unstick = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: {
          value: string;
          continuityGeneration: number;
          mirrorProfileVersionId: string | null;
        };
      };
      clarification: { id: string };
    }>(
      await client.request(
        `/api/slate/projects/${projectId}/writing-operations`,
        jsonInit({
          sectionId: third.id,
          operation: "unstick",
          direction: "",
          idempotencyKey: "cockpit-unstick-1",
        }),
      ),
    );
    assert.equal(unstick.operation.status, "awaiting_clarification");
    const customAnswerBody = {
      revisionFingerprint: unstick.operation.revisionFingerprint.value,
      idempotencyKey: "cockpit-unstick-answer-1",
      continuityGeneration:
        unstick.operation.revisionFingerprint.continuityGeneration,
      mirrorProfileVersionId:
        unstick.operation.revisionFingerprint.mirrorProfileVersionId,
      answer: {
        kind: "custom_vibe",
        vibe: "Tender discovery with danger breathing just outside.",
      },
    };
    const callsBeforeVibe = provider.calls.length;
    const customResolvedResponse = await client.request(
      `/api/slate/projects/${projectId}/clarifications/${unstick.clarification.id}/answer`,
      jsonInit(customAnswerBody),
    );
    assert.equal(customResolvedResponse.status, 202);
    const queuedCustomResolved = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
        intent: { scope: string; direction: string };
      };
    }>(customResolvedResponse);
    assert.equal(queuedCustomResolved.operation.status, "generating");
    const customResolved = await runWritingOperation<{
      operation: {
        status: string;
        intent: { scope: string; direction: string };
      };
    }>(client, projectId, queuedCustomResolved);
    assert.equal(customResolved.operation.status, "proposed");
    assert.equal(customResolved.operation.intent.scope, "beat");
    assert.match(customResolved.operation.intent.direction, /tender/iu);
    assert.equal(provider.calls.length, callsBeforeVibe + 2);
    const duplicateVibe = await client.request(
      `/api/slate/projects/${projectId}/clarifications/${unstick.clarification.id}/answer`,
      jsonInit(customAnswerBody),
    );
    assert.equal(duplicateVibe.status, 200);
    assert.equal(provider.calls.length, callsBeforeVibe + 2);

    const queuedRewrite = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
      };
    }>(
      await client.request(
        `/api/slate/projects/${projectId}/writing-operations`,
        jsonInit({
          sectionId: first.id,
          operation: "rewrite",
          direction: "Let the bell ring twice.",
          scope: "scene",
          idempotencyKey: "cockpit-rewrite-1",
        }),
      ),
    );
    assert.equal(queuedRewrite.operation.status, "generating");
    const rewrite = await runWritingOperation<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
      };
    }>(client, projectId, queuedRewrite);
    assert.equal(rewrite.operation.status, "proposed");
    const latestFirst = (
      await jsonBody<{
        section: { revision: number; prose: string };
      }>(
        await client.request(
          `/api/slate/projects/${projectId}/sections/${first.id}`,
        ),
      )
    ).section;
    const humanEdit = `${latestFirst.prose}\n\nMara wrote the sound down herself.`;
    assert.equal(
      (
        await client.request(
          `/api/slate/projects/${projectId}/sections/${first.id}`,
          jsonInit(
            {
              expectedRevision: latestFirst.revision,
              mutationId: "cockpit-human-wins",
              prose: humanEdit,
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const staleAccept = await client.request(
      `/api/slate/projects/${projectId}/writing-operations/${rewrite.operation.id}/accept`,
      jsonInit({
        revisionFingerprint: rewrite.operation.revisionFingerprint.value,
        idempotencyKey: "cockpit-stale-accept",
      }),
    );
    assert.equal(staleAccept.status, 409);
    const stalePayload = await jsonBody<{ code: string }>(staleAccept);
    assert.equal(stalePayload.code, "slate_writing_proposal_stale");
    const inspectedRewrite = await jsonBody<{
      operation: { status: string };
    }>(
      await client.request(
        `/api/slate/projects/${projectId}/writing-operations/${rewrite.operation.id}`,
      ),
    );
    assert.equal(inspectedRewrite.operation.status, "proposed");

    const storyBibleResponse = await client.request(
      `/api/slate/projects/${projectId}/story-bible?sectionId=${first.id}`,
    );
    assert.equal(storyBibleResponse.status, 200);
    const storyBible = await jsonBody<{
      projectId: string;
      activeGeneration: number;
      momentum: { sectionId: string };
    }>(storyBibleResponse);
    assert.equal(storyBible.projectId, projectId);
    assert.equal(storyBible.momentum.sectionId, first.id);

    const reviewResponse = await client.request(
      `/api/slate/projects/${projectId}/review-export`,
      jsonInit({ sectionId: first.id, format: "json" }),
    );
    assert.equal(reviewResponse.status, 200);
    assert.match(
      reviewResponse.headers.get("content-disposition") ?? "",
      /-review\.json/u,
    );
    const review = await reviewResponse.json();
    assert.equal(isSlateReviewExportV1(review), true);
    assert.equal(
      (review as { sections: Array<{ acceptedProse: string }> }).sections[0]
        ?.acceptedProse,
      humanEdit,
    );
    const events = (
      review as {
        sections: Array<{
          developerEvents: Array<{
            disclosure: string;
            sectionId: string;
            sectionRevision: number;
          }>;
        }>;
      }
    ).sections[0]!.developerEvents;
    assert.ok(events.length > 0);
    assert.ok(events.every((event) => event.sectionId === first.id));
    assert.ok(
      events.every(
        (event) =>
          event.disclosure === "operational_provenance_only" &&
          Number.isInteger(event.sectionRevision),
      ),
    );
    assert.ok(
      (
        review as {
          sections: Array<{
            developerEvents: Array<{ stage: string; kind: string }>;
          }>;
        }
      ).sections[0]!.developerEvents.some(
        (event) =>
          event.stage === "mirror" && event.kind === "pinned_mirror_bound",
      ),
    );
    const markdownResponse = await client.request(
      `/api/slate/projects/${projectId}/review-export`,
      jsonInit({ sectionId: first.id, format: "markdown" }),
    );
    assert.equal(markdownResponse.status, 200);
    assert.match(
      markdownResponse.headers.get("content-type") ?? "",
      /^text\/markdown/u,
    );
    assert.match(await markdownResponse.text(), /Machine-readable envelope/u);

    assert.equal(
      (
        await client.request(
          `/api/slate/projects/${projectId}`,
          jsonInit(
            {
              proseMode: "offline",
              proseProvider: "local",
              proseModel: "qwen3:8b",
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const cover = await client.request(
      `/api/slate/projects/${projectId}/cover`,
      jsonInit({ preferredProvider: "openai" }),
    );
    assert.equal(cover.status, 400);
    assert.equal(
      fetchRecorder.calls.some((call) => /api\.openai\.com/iu.test(call.input)),
      false,
    );
  });
});
