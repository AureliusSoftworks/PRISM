import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type {
  DebateMysteryActionRequestV2,
  DebateSessionV1,
  DebateWhodunnitCreateConfigV2,
  DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  debateMysterySpectatorEvidenceReferencesV2,
  reasoningGenerationBudgetMs,
} from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import {
  applyDebateMysteryActionV2,
  cleanupUnreferencedDebateMysteryAudioV2,
  createDebateMysterySessionV2,
  ensureDebateMysteryPlayReadyV2,
  getDebateMysteryAudioStorageSummaryV2,
  getDebateMysteryAudioClipV2,
  getDebateMysteryCaseV2,
  getDebateMysteryCompilationStatusV2,
  resolveDebateMysteryTalkExchangeV2,
  retryDebateMysteryCompilationV2,
  runDebateMysteryCompilationV2,
} from "../debate-mystery-v2.ts";
import { listDebateSessions, type DebateAiRuntime } from "../debate.ts";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";

const NOW = "2026-08-24T12:00:00.000Z";
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const dataRoot = mkdtempSync(join(tmpdir(), "prism-mystery-v2-"));
const previousDataRoot = process.env.LOCALAI_DATA_DIR;
process.env.LOCALAI_DATA_DIR = dataRoot;

after(() => {
  if (previousDataRoot === undefined) delete process.env.LOCALAI_DATA_DIR;
  else process.env.LOCALAI_DATA_DIR = previousDataRoot;
  rmSync(dataRoot, { recursive: true, force: true });
});

class V2AuthorProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "mystery-v2-test";
  public calls = 0;
  public readonly sections: string[] = [];

  public async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions): Promise<string> {
    this.calls += 1;
    const request = JSON.parse(messages.at(-1)!.content) as {
      section: "case_foundation" | "room_examinations" | "suspect_chapter" | "prosecution_choices";
      suspect?: { seatId: string };
      setup: {
        eyewitnessSeatId: string | null;
        evidenceIds: string[];
        examinationIds: string[];
        suspects: Array<{
          seatId: string;
          name: string;
          requiredStatementIds: string[];
          requiredContradictionOnSecondStatement: string;
          requiredPresentReactionRecordId: string;
        }>;
      };
    };
    this.sections.push(request.section === "suspect_chapter"
      ? `${request.section}:${request.suspect?.seatId ?? "unknown"}`
      : request.section);
    if (request.section === "room_examinations") {
      return JSON.stringify({
        examinations: request.setup.examinationIds.map((id, index) => ({
          id,
          text: `Examination ${index + 1} reveals a specific material disturbance, documents its position, and updates the Case File without guessing what it means.`,
        })),
      });
    }
    const full = {
      title: "The Turnabout at Violet Hour",
      victimName: "Avery Voss",
      victimDescription: "The exacting curator of a private optical archive whose final exhibition threatened several carefully kept lies.",
      publicOpening: "At violet hour, Avery Voss was found dead inside the sealed archive. The mansion is secure, the cast is assembled, and every conclusion must survive the admitted record.",
      motive: "The culprit killed to prevent Avery from unveiling a provenance ledger that exposed a career-defining fraud.",
      method: "The culprit staged a locked-room timeline after using the case's frozen physical method during a narrow blind spot in the archive schedule.",
      partnerConsultation: "Pin the witness to one sentence at a time. Press what sounds incomplete; present only when the Case File makes the active wording impossible.",
      eyewitnessResolution: request.setup.eyewitnessSeatId
        ? "The eyewitness saw the accused silhouette through refracted glass, while two independent timestamps prove the visible figure and the accused could not have been the same person."
        : null,
      evidence: request.setup.evidenceIds.map((id, index) => ({
        id,
        title: `Archive exhibit ${index + 1}`,
        description: `A precisely catalogued physical detail ${index + 1} whose timing and provenance can be compared against sworn testimony.`,
        emoji: index % 2 ? "🧾" : "🔎",
      })),
      examinations: request.setup.examinationIds.map((id, index) => ({
        id,
        text: `Examination ${index + 1} reveals a specific material disturbance, documents its position, and updates the Case File without guessing what it means.`,
      })),
      suspects: request.setup.suspects.map((suspect, index) => ({
        seatId: suspect.seatId,
        relationship: `${suspect.name} depended on Avery's judgment but resented how closely the curator audited their work.`,
        alibi: `${suspect.name} claims two separate mansion records place them away from the archive during the critical interval.`,
        chapterOpening: `${suspect.name}, take the stand and give the court your account of the violet-hour interval.`,
        chapterCompletion: `The court records the material revision to ${suspect.name}'s account and releases this witness subject to recall.`,
        defaultPresentReaction: `${suspect.name} frowns at the item. “That item was in the mansion, but it does not change the exact account I have given you.”`,
        talkTopics: [
          { id: "relationship", label: "Avery Voss", question: `How would you describe your relationship with Avery Voss?`, questionPerformance: { mood: "probing", pace: "measured", intensity: 1, actorNote: "Invite a complete answer without showing suspicion." }, response: `Avery could be generous, but every gift became another standard I was expected to meet.`, performance: { mood: "guarded", pace: "measured", intensity: 1, actorNote: "Hold back the deeper grievance." } },
          { id: "timeline", label: "Your movements", question: `Walk me through your movements before the archive alarm.`, questionPerformance: { mood: "precise", pace: "measured", intensity: 1, actorNote: "Ask for a sequence the witness can be held to." }, response: `I crossed the west corridor, checked the gallery clock, and returned before the archive alarm.`, performance: { mood: "precise", pace: "natural", intensity: 1, actorNote: "Sound rehearsed without becoming robotic." } },
          { id: "doubt", label: "What does not fit", question: `What part of the story does not fit what you witnessed?`, questionPerformance: { mood: "probing", pace: "natural", intensity: 1, actorNote: "Leave room for the witness to identify the flaw." }, response: `The light in the archive glass changes silhouettes. Anyone claiming a clean identification from the hall is overstating it.`, performance: { mood: "insistent", pace: "urgent", intensity: 2, actorNote: "The useful truth arrives under pressure." } },
        ],
        presentReactions: [{
          recordId: suspect.requiredPresentReactionRecordId,
          response: `That record narrows the interval more than I admitted. You should ask me again about the second part of my timeline.`,
        }],
        testimony: suspect.requiredStatementIds.map((id, statementIndex) => ({
          id,
          text: statementIndex === 1
            ? `Nothing in ${suspect.requiredContradictionOnSecondStatement} conflicts with my timeline; my account has never changed.`
            : statementIndex === 0
              ? `I entered the west corridor before the archive bell and did not approach Avery's door.`
              : `The figure by the refracted glass looked familiar, but I could not see a face.`,
          press: statementIndex === 1
            ? `By "never changed," I mean the order stayed the same. I may have compressed the minutes when I first explained it.`
            : `That is the limit of what I can swear to without turning an impression into a fact.`,
          rebuttal: `That exhibit does not contradict the sentence on the screen. The prosecution is joining two different moments.`,
          revision: statementIndex === 1
            ? `My first account compressed the interval. ${suspect.requiredContradictionOnSecondStatement} proves I changed locations later than I claimed.`
            : `I need to narrow that sentence: it describes my best recollection, not an independently verified fact.`,
          performance: { mood: statementIndex === 1 ? "cornered" : "controlled", pace: "measured", intensity: statementIndex === 1 ? 3 : 1, actorNote: "Let the revision land as a real loss of control." },
        })),
      })),
      prosecutionChoices: [{
        id: "define-the-conflict",
        witnessSeatId: request.setup.suspects[0]!.seatId,
        prompt: "Prosecution, identify what matters before this testimony continues.",
        options: [
          { id: "wording", text: "The exact wording of the timeline.", reaction: "Then keep the court on the active sentence and establish its limits." },
          { id: "demeanor", text: "The witness's confidence.", reaction: "Confidence is not proof. Tie that observation to the admitted record or leave it aside." },
        ],
      }],
    };
    if (request.section === "suspect_chapter") {
      return JSON.stringify({
        suspect: full.suspects.find((suspect) => suspect.seatId === request.suspect?.seatId),
      });
    }
    if (request.section === "prosecution_choices") {
      return JSON.stringify({ prosecutionChoices: full.prosecutionChoices });
    }
    const { suspects: _suspects, prosecutionChoices: _prosecutionChoices, ...foundation } = full;
    return JSON.stringify(foundation);
  }

  public async embedText(): Promise<number[]> {
    return [0.1, 0.2];
  }
}

class InterruptingV2AuthorProvider extends V2AuthorProvider {
  public permitSecondChapter = false;

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(messages.at(-1)!.content) as {
      section?: string;
      suspect?: { seatId?: string };
    };
    if (
      request.section === "suspect_chapter" &&
      request.suspect?.seatId === "suspect-2" &&
      !this.permitSecondChapter
    ) {
      this.calls += 1;
      this.sections.push("suspect_chapter:suspect-2");
      return "{}";
    }
    return super.generateResponse(messages, options);
  }
}

function runtime(provider: V2AuthorProvider): DebateAiRuntime {
  return {
    preferredProvider: "local",
    responseMode: "local",
    local: { provider, providerName: "local", model: "mystery-v2-test" },
  };
}

class HangingV2AuthorProvider implements LlmProvider {
  public readonly name = "local" as const;
  public calls = 0;

  public async generateResponse(
    _messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    this.calls += 1;
    const signal = options?.signal;
    assert.ok(signal, "case authoring must carry a bounded generation signal");
    return new Promise(() => undefined);
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

async function waitForProviderCalls(
  provider: HangingV2AuthorProvider,
  expected: number,
): Promise<void> {
  while (provider.calls < expected) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function playableWave(): Buffer {
  const sampleRate = 8_000;
  const sampleCount = 800;
  const dataBytes = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    wave.writeInt16LE(Math.round(Math.sin(index / 8) * 2_000), 44 + index * 2);
  }
  return wave;
}

function testDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES ('user-1', 'v2@example.com', 'Prosecutor', 'hash', 'salt',
             'cipher', 'iv', 'tag', 'local', ?, ?)`,
  ).run(NOW, NOW);
  for (let index = 1; index <= 10; index += 1) {
    db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, export_hash, powers_json,
          color, glyph, online_enabled, model, local_model, online_model,
          created_at, updated_at)
       VALUES (?, 'user-1', ?, ?, ?, '[]', ?, '◆', 1,
               'mystery-v2-test', 'mystery-v2-test', 'mystery-v2-test', ?, ?)`,
    ).run(
      `bot-${index}`,
      `Actor ${index}`,
      `Actor ${index} is observant, theatrical, and exacting under pressure.`,
      `export-${index}`,
      `#${(0x111111 * index).toString(16).padStart(6, "0").slice(0, 6)}`,
      NOW,
      NOW,
    );
  }
  return db;
}

function config(): DebateWhodunnitCreateConfigV2 {
  return {
    version: 2,
    preset: "compact",
    difficulty: "classic",
    artMode: "bundled",
    trialType: "jury",
    inspiration: "A violet-hour archive murder",
    nonce: "v2-test",
    suspectBotIds: ["bot-1", "bot-2", "bot-3", "bot-4"],
    prosecutorPartnerBotId: "bot-5",
    rivalDefenseBotId: "bot-6",
    jurorBotIds: ["bot-7", "bot-8", "bot-9", "bot-10"],
  };
}

function v2State(session: DebateSessionV1): DebateWhodunnitFormatStateV2 {
  assert.equal(session.formatState.format, "whodunnit");
  assert.equal(session.formatState.version, 2);
  return session.formatState as DebateWhodunnitFormatStateV2;
}

function act(
  db: DatabaseSync,
  session: DebateSessionV1,
  request: Omit<DebateMysteryActionRequestV2, "version" | "expectedRevision" | "idempotencyKey">,
  key: string,
): DebateSessionV1 {
  return applyDebateMysteryActionV2(db, "user-1", session.id, {
    ...request,
    version: 2,
    expectedRevision: session.revision,
    idempotencyKey: key,
  } as DebateMysteryActionRequestV2);
}

describe("Whodunnit V2 durable prosecution runtime", () => {
  it("returns a spoiler-safe durable Case Forge before authoring begins", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-forge",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const state = v2State(session);
    assert.equal(provider.calls, 0);
    assert.equal(state.playPhase, "case_forge");
    assert.equal(state.caseTitle, null);
    assert.equal(state.config.trialType, "jury");
    assert.deepEqual(state.config.jurorBotIds, ["bot-7", "bot-8", "bot-9", "bot-10"]);
    assert.deepEqual(session.jury.jurors.map((juror) => juror.id), state.config.jurorBotIds);
    assert.equal(getDebateMysteryCompilationStatusV2(db, "user-1", session.id).stage, "writing_case");
  });

  it("fails a stalled case author into spoiler-safe recovery instead of hanging at Writing the Case", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const db = testDb();
    const provider = new HangingV2AuthorProvider();
    const stalledRuntime: DebateAiRuntime = {
      preferredProvider: "local",
      responseMode: "local",
      local: { provider, providerName: "local", model: "mystery-v2-test" },
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-stalled-author",
      stalledRuntime,
      { deferBackgroundStart: true },
    );
    const pending = runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      stalledRuntime,
    );
    const authoringBudgetMs = reasoningGenerationBudgetMs(undefined, {
      provider: "local",
      modelId: "mystery-v2-test",
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await waitForProviderCalls(provider, attempt);
      const active = getDebateMysteryCompilationStatusV2(db, "user-1", created.id);
      assert.equal(
        active.spoilerSafeMessage,
        `Writing the Case · Drafting foundation · attempt ${attempt} of 3`,
      );
      t.mock.timers.tick(authoringBudgetMs);
    }
    const session = await pending;
    const state = v2State(session);
    const job = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };

    assert.equal(provider.calls, 3);
    assert.equal(session.status, "failed");
    assert.equal(state.compilation.stage, "needs_attention");
    assert.equal(state.compilation.retryable, true);
    assert.equal(state.compilation.spoilerSafeMessage, "Case preparation needs attention");
    assert.match(job.private_error ?? "", /did not finish within/iu);
    assert.doesNotMatch(
      JSON.stringify(session),
      /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|graphValidation|correctPresentations|privateCase/iu,
    );
  });

  it("resumes a stopped authored draft without regenerating completed sections", async () => {
    const db = testDb();
    const provider = new InterruptingV2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-resumable-author",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    const stopped = db.prepare(
      "SELECT checkpoint_json FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { checkpoint_json: string };
    const draft = JSON.parse(stopped.checkpoint_json) as {
      kind: string;
      foundation: unknown;
      suspectsBySeatId: Record<string, unknown>;
    };
    assert.equal(draft.kind, "authoring-v1");
    assert.ok(draft.foundation);
    assert.ok(draft.suspectsBySeatId["suspect-1"]);
    assert.equal(draft.suspectsBySeatId["suspect-2"], undefined);
    assert.equal(provider.sections.filter((section) => section === "case_foundation").length, 1);
    assert.equal(provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length, 1);

    provider.permitSecondChapter = true;
    await retryDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      deferBackgroundStart: true,
    });
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "complete");
    assert.equal(provider.sections.filter((section) => section === "case_foundation").length, 1);
    assert.equal(provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length, 1);
  });

  it("compiles every suspect chapter, prepares a complete local pack, and plays without runtime generation", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const prismVoiceProfile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-5" as const,
      pitch: 0.45,
    };
    db.prepare(
      "UPDATE users SET prism_default_bot_audio_voice_profile = ? WHERE id = 'user-1'",
    ).run(JSON.stringify(prismVoiceProfile));
    const preparedProfilesByText = new Map<string, { baseVoiceId: string }>();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-play",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async ({ text, profile }) => {
        preparedProfilesByText.set(text, profile);
        return playableWave();
      },
    });
    let state = v2State(session);
    const compileDiagnostic = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE session_id = ?",
    ).get(session.id) as { private_error: string | null };
    assert.equal(state.compilation.stage, "complete", compileDiagnostic.private_error ?? undefined);
    assert.equal(state.playPhase, "title_card");
    assert.equal(state.caseTitle, "The Turnabout at Violet Hour");
    assert.equal(state.audioReady, true);
    for (const room of state.rooms) {
      assert.equal(Number.isFinite(room.x), true);
      assert.equal(Number.isFinite(room.y), true);
      assert.equal(Number.isFinite(room.width), true);
      assert.equal(Number.isFinite(room.height), true);
      assert.ok((room.width ?? 0) > 0);
      assert.ok((room.height ?? 0) > 0);
      assert.ok(Array.isArray(room.neighborIds));
    }
    const callsAfterCompile = provider.calls;
    const { privateCase, graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    const firstAuthoredTopicNodeId = graph.talkTopicNodeIdsBySuspect["suspect-1"]![0]!;
    const currentTalkExchange = resolveDebateMysteryTalkExchangeV2(
      graph,
      firstAuthoredTopicNodeId,
      "suspect-1",
    );
    assert.equal(currentTalkExchange?.questionNodeId, firstAuthoredTopicNodeId);
    assert.match(currentTalkExchange?.responseNodeId ?? "", /^talk-response-/u);
    const legacyGraph = structuredClone(graph);
    const legacyTopicNode = legacyGraph.nodes.find((node) => node.id === firstAuthoredTopicNodeId)!;
    const authoredResponseNode = legacyGraph.nodes.find(
      (node) => node.id === currentTalkExchange?.responseNodeId,
    )!;
    legacyTopicNode.speakerSeatId = "suspect-1";
    legacyTopicNode.intendedRecipientSeatId = null;
    legacyTopicNode.lineId = authoredResponseNode.lineId;
    legacyTopicNode.nextNodeIds = authoredResponseNode.nextNodeIds;
    assert.deepEqual(
      resolveDebateMysteryTalkExchangeV2(legacyGraph, firstAuthoredTopicNodeId, "suspect-1"),
      { questionNodeId: null, responseNodeId: firstAuthoredTopicNodeId },
    );
    assert.equal(
      resolveDebateMysteryTalkExchangeV2(graph, "talk-stale-topic", "suspect-1"),
      null,
    );
    const publicStateJson = JSON.stringify(session.formatState);
    assert.doesNotMatch(publicStateJson, /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|graphValidation|correctPresentations|privateCase/iu);
    assert.equal(graph.witnessChapters.length, state.config.suspectBotIds.length);
    assert.deepEqual(
      graph.witnessChapters.map((chapter) => chapter.witnessSeatId),
      state.suspects.map((suspect) => suspect.seatId),
    );
    const stagedPresentLine = graph.lines.find(
      (line) => line.nodeId.startsWith("present-response-") && line.nodeId.endsWith("-default"),
    );
    assert.equal(stagedPresentLine?.stageActionText, "Frowns at the item");
    assert.equal(
      stagedPresentLine?.spokenText,
      "That item was in the mansion, but it does not change the exact account I have given you.",
    );
    assert.equal(stagedPresentLine?.visibleText, stagedPresentLine?.spokenText);
    assert.equal(preparedProfilesByText.has(stagedPresentLine!.spokenText), true);
    assert.equal([...preparedProfilesByText.keys()].some((text) => /frowns at the item/iu.test(text)), false);
    const manifestRow = db.prepare(
      "SELECT status, manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { status: string; manifest_json: string };
    const manifest = JSON.parse(manifestRow.manifest_json) as { entries: unknown[]; complete: boolean };
    assert.equal(manifestRow.status, "complete");
    assert.equal(manifest.complete, true);
    assert.equal(manifest.entries.length, privateCase.graphValidation.reachableSpokenLineIds.length);
    const firstManifestEntry = (manifest as { entries: Array<{ lineId: string }> }).entries[0]!;
    assert.ok(getDebateMysteryAudioClipV2(db, "user-1", session.id, firstManifestEntry.lineId).byteSize > 0);
    assert.throws(
      () => getDebateMysteryAudioClipV2(db, "another-user", session.id, firstManifestEntry.lineId),
      /not found/iu,
    );

    session = act(db, session, { action: "move", roomId: privateCase.crimeSceneRoomId }, "begin-case");
    state = v2State(session);
    for (const room of state.rooms) {
      session = act(db, session, { action: "move", roomId: room.id }, `move-${room.id}`);
      for (const hotspot of v2State(session).rooms.find((entry) => entry.id === room.id)!.hotspots) {
        session = act(db, session, { action: "examine", roomId: room.id, hotspotId: hotspot.id }, `examine-${room.id}-${hotspot.id}`);
      }
    }
    state = v2State(session);
    const firstSuspect = state.suspects[0]!;
    session = act(db, session, { action: "move", roomId: firstSuspect.roomId! }, "move-first-suspect");
    const firstTopic = v2State(session).topics.find((topic) => topic.suspectSeatId === firstSuspect.seatId)!;
    assert.throws(
      () => act(db, session, {
        action: "talk",
        suspectSeatId: firstSuspect.seatId,
        topicNodeId: `${firstTopic.nodeId}-stale`,
      }, "talk-stale-topic"),
      /Talk topic has not unlocked/iu,
    );
    const dialogueCountBeforeTalk = v2State(session).dialogueHistory.length;
    session = act(db, session, { action: "talk", suspectSeatId: firstSuspect.seatId, topicNodeId: firstTopic.nodeId }, "talk-first-suspect");
    state = v2State(session);
    const talkExchange = state.dialogueHistory.slice(dialogueCountBeforeTalk);
    assert.equal(talkExchange.length, 2);
    assert.equal(talkExchange[0]!.speakerSeatId, null);
    assert.match(talkExchange[0]!.visibleText, /relationship with Avery Voss/iu);
    assert.equal(talkExchange[1]!.speakerSeatId, firstSuspect.seatId);
    const questionLine = graph.lines.find((line) => line.id === talkExchange[0]!.lineId);
    const responseLine = graph.lines.find((line) => line.id === talkExchange[1]!.lineId);
    assert.equal(questionLine?.speakerKind, "player");
    assert.equal(responseLine?.speakerKind, "bot");
    // Player-authored prosecution speaks through the selected Prosecutor's
    // exact frozen bot profile, never the account-wide Prism fallback.
    assert.notEqual(preparedProfilesByText.get(questionLine!.spokenText)?.baseVoiceId, "voice-5");
    assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some((entry) => entry.lineId === questionLine?.id));
    assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some((entry) => entry.lineId === responseLine?.id));
    assert.equal(state.theoryAvailable, true);
    session = act(db, session, {
      action: "file_theory",
      theory: {
        culpritSeatId: privateCase.sealedCulpritSeatId,
        accompliceSeatId: privateCase.sealedAccompliceSeatId,
        method: "",
        motive: "",
        opportunity: "",
        evidenceIds: v2State(session).record.filter((item) => item.reference.kind === "evidence").map((item) => item.reference.id),
        testimonyIds: [],
      },
    }, "file-theory");

    state = v2State(session);
    const firstChapter = graph.witnessChapters.find((chapter) => chapter.id === state.court?.activeChapterId)!;
    const firstProofStatement = firstChapter.statementVersions.find((statement) => statement.correctPresentations.length > 0)!;
    session = act(db, session, { action: "focus_statement", statementId: firstProofStatement.statementId }, "focus-wrong");
    const wrongRecord = v2State(session).record.find((item) =>
      !firstProofStatement.correctPresentations.some((reference) => `${reference.kind}:${reference.id}` === `${item.reference.kind}:${item.reference.id}`),
    )!.reference;
    for (let strike = 0; strike < 4; strike += 1) {
      session = act(db, session, { action: "present_record", statementId: firstProofStatement.statementId, record: wrongRecord }, `wrong-${strike}`);
    }
    assert.equal(v2State(session).verdict?.legalResult, "not_guilty");
    session = act(db, session, { action: "retry_witness_checkpoint" }, "retry-witness");

    while (v2State(session).playPhase === "trial") {
      state = v2State(session);
      const chapter = graph.witnessChapters.find((entry) => entry.id === state.court?.activeChapterId)!;
      const proofStatement = chapter.statementVersions.find((statement) => statement.correctPresentations.length > 0)!;
      session = act(db, session, { action: "focus_statement", statementId: proofStatement.statementId }, `focus-${chapter.id}`);
      session = act(db, session, { action: "press_statement", statementId: proofStatement.statementId }, `press-${chapter.id}`);
      const pendingChoice = v2State(session).pendingProsecutionChoice;
      if (pendingChoice) {
        session = act(db, session, {
          action: "choose_prosecution_response",
          choiceId: pendingChoice.id,
          optionId: pendingChoice.options[0]!.id,
        }, `choice-${chapter.id}`);
      }
      session = act(db, session, {
        action: "present_record",
        statementId: proofStatement.statementId,
        record: proofStatement.correctPresentations[0]!,
      }, `correct-${chapter.id}`);
    }
    state = v2State(session);
    assert.equal(state.playPhase, "verdict");
    assert.equal(state.court?.completedChapterIds.length, graph.witnessChapters.length);
    assert.ok(state.calloutHistory.some((callout) => callout.callout === "hold_it"));
    assert.ok(state.calloutHistory.some((callout) => callout.callout === "testimony_revised"));
    assert.equal(provider.calls, callsAfterCompile, "gameplay must not call the LLM");
    const archiveRow = listDebateSessions(db, "user-1").find((entry) => entry.id === session.id)!;
    assert.equal(archiveRow.mysteryProgress, "verdict");
    assert.equal(archiveRow.mysteryRouteGrade, state.verdict?.classification);
    assert.equal(archiveRow.title, state.caseTitle);

    const uniqueClipCount = Number((db.prepare(
      "SELECT COUNT(DISTINCT cache_key) AS count FROM debate_mystery_audio_refs WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { count: number }).count);
    const referencedStorage = getDebateMysteryAudioStorageSummaryV2(db, "user-1");
    assert.equal(referencedStorage.referencedClipCount, uniqueClipCount);
    assert.equal(referencedStorage.cleanupCandidateCount, 0);
    const backup = exportUserSnapshot(db, "user-1", Buffer.alloc(32, 7));
    assert.equal(backup.debates?.mysteryV2?.cases.length, 1);
    assert.equal(backup.debates?.mysteryV2?.manifests[0]?.status, "complete");
    assert.equal(backup.debates?.mysteryV2?.clips.length, uniqueClipCount);
    db.prepare("DELETE FROM debate_sessions WHERE user_id = 'user-1' AND id = ?").run(session.id);
    const releasedStorage = getDebateMysteryAudioStorageSummaryV2(db, "user-1");
    assert.equal(releasedStorage.referencedClipCount, 0);
    assert.equal(releasedStorage.cleanupCandidateCount, uniqueClipCount);
    importUserSnapshot(db, "user-1", backup, Buffer.alloc(32, 7));
    const restoredCase = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(restoredCase.graph.caseId, graph.caseId);
    assert.ok(getDebateMysteryAudioClipV2(db, "user-1", session.id, firstManifestEntry.lineId).byteSize > 0);
    assert.equal(getDebateMysteryAudioStorageSummaryV2(db, "user-1").referencedClipCount, uniqueClipCount);
    db.prepare("DELETE FROM debate_sessions WHERE user_id = 'user-1' AND id = ?").run(session.id);
    const cleanup = cleanupUnreferencedDebateMysteryAudioV2(db, "user-1");
    assert.equal(cleanup.removedClipCount, uniqueClipCount);
    assert.equal(cleanup.remaining.cleanupCandidateCount, 0);
  });

  it("migrates an active legacy partner-shaped case and rebuilds only local player-role audio", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), trialType: "bench", jurorBotIds: [] },
      "create-v2-legacy-role-repair",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    const callsAfterCompile = provider.calls;
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    const legacyPrivate = structuredClone(compiled.privateCase);
    const legacyGraph = structuredClone(compiled.graph);
    const prosecutorBotId = legacyPrivate.config.prosecutorBotId;
    const privateConfig = legacyPrivate.config as unknown as Record<string, unknown>;
    privateConfig.prosecutorPartnerBotId = prosecutorBotId;
    delete privateConfig.prosecutorBotId;
    delete (legacyPrivate as unknown as Record<string, unknown>).playerRoleContractVersion;

    const firstSeatId = legacyPrivate.actorAccounts[0]!.seatId;
    const topicNodeId = legacyGraph.talkTopicNodeIdsBySuspect[firstSeatId]![0]!;
    const topicNode = legacyGraph.nodes.find((node) => node.id === topicNodeId)!;
    const responseNodeId = topicNode.nextNodeIds[0]!;
    const responseNode = legacyGraph.nodes.find((node) => node.id === responseNodeId)!;
    const responseLine = legacyGraph.lines.find((line) => line.id === responseNode.lineId)!;
    const topicLabel = topicNode.label;
    Object.assign(topicNode, structuredClone(responseNode), {
      id: topicNodeId,
      label: topicLabel,
      speakerSeatId: firstSeatId,
      intendedRecipientSeatId: null,
    });
    responseLine.nodeId = topicNode.id;
    legacyGraph.nodes = legacyGraph.nodes.filter((node) => node.id !== responseNode.id);
    for (const line of legacyGraph.lines) {
      if (line.speakerKind === "player") line.speakerBotId = null;
    }

    const privateJson = JSON.stringify(legacyPrivate);
    const graphJson = JSON.stringify(legacyGraph);
    db.prepare(
      `UPDATE debate_mystery_v2_cases
          SET private_case_json = ?, dialogue_graph_json = ?, case_hash = ?, graph_hash = ?
        WHERE session_id = ?`,
    ).run(privateJson, graphJson, digest(privateJson), digest(graphJson), session.id);
    const legacySession = structuredClone(session);
    const publicConfig = legacySession.formatState.config as unknown as Record<string, unknown>;
    publicConfig.prosecutorPartnerBotId = prosecutorBotId;
    delete publicConfig.prosecutorBotId;
    legacySession.formatState.readiness = {
      version: 1,
      status: "repair_required",
      spoilerSafeMessage: "Preparing this local case for the current player-role contract",
      contractHash: null,
      checkedAt: null,
    };
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ?")
      .run(JSON.stringify(legacySession), session.id);
    const changedVoice = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-8" as const,
      pitch: 0.62,
    };
    db.prepare("UPDATE bots SET audio_voice_profile_override = ? WHERE user_id = 'user-1' AND id = ?")
      .run(JSON.stringify(changedVoice), prosecutorBotId);

    const locallyPreparedTexts: string[] = [];
    const repaired = await ensureDebateMysteryPlayReadyV2(db, "user-1", session.id, {
      generateWave: async ({ text }) => {
        locallyPreparedTexts.push(text);
        return playableWave();
      },
    });
    assert.equal(provider.calls, callsAfterCompile, "active-case repair must not call the authoring LLM");
    assert.equal(
      v2State(repaired).readiness.status,
      "ready",
      v2State(repaired).localAudioFailure ?? undefined,
    );
    assert.equal(v2State(repaired).config.prosecutorBotId, prosecutorBotId);
    assert.equal("prosecutorPartnerBotId" in v2State(repaired).config, false);
    assert.ok(locallyPreparedTexts.length > 0, "the changed Prosecutor profile must rebuild affected local clips");

    const migrated = getDebateMysteryCaseV2(db, "user-1", session.id);
    const migratedExchange = resolveDebateMysteryTalkExchangeV2(
      migrated.graph,
      topicNodeId,
      firstSeatId,
    );
    assert.equal(migratedExchange?.questionNodeId, topicNodeId);
    const migratedQuestionNode = migrated.graph.nodes.find((node) => node.id === topicNodeId)!;
    const migratedQuestionLine = migrated.graph.lines.find((line) => line.id === migratedQuestionNode.lineId)!;
    assert.equal(migratedQuestionLine.speakerKind, "player");
    assert.equal(migratedQuestionLine.speakerBotId, prosecutorBotId);
    assert.ok(migratedQuestionLine.stageActionText);
    const manifestRow = db.prepare(
      "SELECT status, manifest_json FROM debate_mystery_audio_manifests WHERE session_id = ?",
    ).get(session.id) as { status: string; manifest_json: string };
    const repairedManifest = JSON.parse(manifestRow.manifest_json) as {
      complete: boolean;
      entries: Array<{ lineId: string; botId: string | null }>;
    };
    assert.equal(manifestRow.status, "complete");
    assert.equal(repairedManifest.complete, true);
    assert.equal(
      repairedManifest.entries.find((entry) => entry.lineId === migratedQuestionLine.id)?.botId,
      prosecutorBotId,
    );
  });

  it("resumes interrupted local preparation without rebuilding verified clips", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), trialType: "bench", jurorBotIds: [] },
      "create-v2-interrupted-audio",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    let firstPassCalls = 0;
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      {
        generateWave: async () => {
          firstPassCalls += 1;
          if (firstPassCalls === 4) throw new Error("simulated local worker interruption");
          return playableWave();
        },
      },
    );
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.match(v2State(session).localAudioFailure ?? "", /complete text case is safe/u);
    const partialRow = db.prepare(
      "SELECT manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { manifest_json: string };
    const partial = JSON.parse(partialRow.manifest_json) as { entries: Array<{ lineId: string; sha256: string }> };
    assert.equal(partial.entries.length, 3);

    await retryDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      { deferBackgroundStart: true },
    );
    let resumedCalls = 0;
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      {
        generateWave: async () => {
          resumedCalls += 1;
          return playableWave();
        },
      },
    );
    const resumedState = v2State(session);
    assert.equal(resumedState.compilation.stage, "complete");
    assert.ok(resumedCalls > 0);
    assert.ok(
      resumedCalls <= resumedState.compilation.requiredAudioCount - partial.entries.length,
      "resume may also reuse exact verified clips already present in the account cache",
    );
    const completeRow = db.prepare(
      "SELECT manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { manifest_json: string };
    const complete = JSON.parse(completeRow.manifest_json) as { entries: Array<{ lineId: string; sha256: string }> };
    for (const entry of partial.entries) {
      assert.equal(complete.entries.find((candidate) => candidate.lineId === entry.lineId)?.sha256, entry.sha256);
    }
  });

  it("lets Spectator review an editable authorized partner theory before watch-only court", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), playerRole: "spectator" },
      "create-v2-spectator",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    assert.equal(session.playerRole, "spectator");
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const callsAfterCompile = provider.calls;
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    const authorized = debateMysterySpectatorEvidenceReferencesV2(compiled.graph)
      .map((reference) => `${reference.kind}:${reference.id}`)
      .sort();

    session = act(db, session, { action: "move" }, "spectator-review-findings");
    let state = v2State(session);
    assert.equal(state.playPhase, "theory");
    assert.deepEqual(state.rooms, []);
    assert.deepEqual(state.topics, []);
    assert.equal(state.theoryAvailable, true);
    assert.equal(state.theory?.culpritSeatId, compiled.privateCase.sealedCulpritSeatId);
    assert.equal(state.theory?.accompliceSeatId, null);
    assert.equal(state.theoryFiledAt, null);
    assert.equal(state.court, null);
    assert.deepEqual(state.theory?.testimonyIds, []);
    assert.deepEqual(
      state.record.map((item) => `${item.reference.kind}:${item.reference.id}`).sort(),
      authorized,
    );
    const publicJson = JSON.stringify(state);
    assert.doesNotMatch(publicJson, /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|correctPresentations|graphValidation/iu);
    assert.throws(
      () => act(db, session, { action: "move" }, "spectator-return-mansion"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, {
        action: "press_statement",
        statementId: "not-in-court",
      }, "spectator-manual-press"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, { action: "advance_spectator_trial" }, "spectator-advance-before-filing"),
      /only allows reviewing and filing/iu,
    );

    const alternateAccused = state.suspects.find(
      (suspect) => suspect.seatId !== state.theory!.culpritSeatId,
    )!;
    session = act(db, session, {
      action: "file_theory",
      theory: {
        ...state.theory!,
        culpritSeatId: alternateAccused.seatId,
        motive: "A revised public motive hypothesis.",
        accompliceSeatId: state.suspects[1]!.seatId,
        evidenceIds: [...state.theory!.evidenceIds, "private-forged-id"],
        testimonyIds: ["not-yet-heard"],
      },
    }, "spectator-file-theory");
    state = v2State(session);
    assert.equal(state.playPhase, "trial");
    assert.equal(state.theoryAvailable, false);
    assert.equal(state.theory?.culpritSeatId, alternateAccused.seatId);
    assert.equal(state.theory?.motive, "A revised public motive hypothesis.");
    assert.equal(state.theory?.accompliceSeatId, null);
    assert.deepEqual(state.theory?.evidenceIds.sort(), authorized.map((key) => key.replace(/^evidence:/u, "")).sort());
    assert.deepEqual(state.theory?.testimonyIds, []);
    assert.ok(state.theoryFiledAt);
    assert.ok(state.court?.activeStatementId);
    assert.throws(
      () => act(db, session, {
        action: "press_statement",
        statementId: state.court!.activeStatementId!,
      }, "spectator-manual-court-after-filing"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, { action: "retry_witness_checkpoint" }, "spectator-retry-court"),
      /only allows reviewing and filing/iu,
    );

    let advances = 0;
    while (v2State(session).playPhase === "trial" && advances < 40) {
      session = act(
        db,
        session,
        { action: "advance_spectator_trial" },
        `spectator-advance-${advances}`,
      );
      advances += 1;
    }
    state = v2State(session);
    assert.equal(state.playPhase, "verdict");
    assert.equal(state.court?.completedChapterIds.length, compiled.graph.witnessChapters.length);
    const heardLineIds = new Set(state.dialogueHistory.flatMap((entry) =>
      entry.lineId ? [entry.lineId] : [],
    ));
    for (const item of state.record.filter((entry) => entry.reference.kind === "testimony")) {
      const statement = compiled.graph.witnessChapters
        .flatMap((chapter) => chapter.statementVersions)
        .find((entry) => entry.statementId === item.reference.id && entry.version === 1);
      assert.ok(statement && heardLineIds.has(statement.lineId), "public testimony must be heard before admission");
    }
    assert.equal(provider.calls, callsAfterCompile, "Spectator playback must use the compiled graph only");
    assert.throws(
      () => act(db, session, {
        action: "file_theory",
        theory: state.theory!,
      }, "spectator-refile-after-verdict"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, { action: "advance_spectator_trial" }, "spectator-after-verdict"),
      /only allows reviewing and filing/iu,
    );
  });

  it("keeps Participant Begin Case on the mansion investigation path", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-participant-non-regression",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    session = act(db, session, { action: "move" }, "participant-begin-case");
    const state = v2State(session);
    assert.equal(state.playPhase, "investigation");
    assert.ok(state.rooms.length > 0);
    assert.equal(state.theory, null);
    assert.throws(
      () => act(db, session, { action: "advance_spectator_trial" }, "participant-auto-advance"),
      /only a Spectator/iu,
    );
  });

  it("contains no ElevenLabs boundary in the V2 compiler or gameplay module", () => {
    const source = readFileSync(new URL("../debate-mystery-v2.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /elevenlabs/iu);
    assert.match(source, /allowOperatingSystemVoices: false/u);
    assert.match(source, /generateBuiltinEnglishWave/u);
  });
});
