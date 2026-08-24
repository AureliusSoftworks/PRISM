import assert from "node:assert/strict";
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
import { initializeDatabase } from "../db.ts";
import {
  applyDebateMysteryActionV2,
  cleanupUnreferencedDebateMysteryAudioV2,
  createDebateMysterySessionV2,
  getDebateMysteryAudioStorageSummaryV2,
  getDebateMysteryCaseV2,
  getDebateMysteryCompilationStatusV2,
  runDebateMysteryCompilationV2,
} from "../debate-mystery-v2.ts";
import type { DebateAiRuntime } from "../debate.ts";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";

const NOW = "2026-08-24T12:00:00.000Z";
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

  public async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions): Promise<string> {
    this.calls += 1;
    const request = JSON.parse(messages.at(-1)!.content) as {
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
    return JSON.stringify({
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
        defaultPresentReaction: `That item was in the mansion, but it does not change the exact account I have given you.`,
        talkTopics: [
          { id: "relationship", label: "Avery Voss", response: `Avery could be generous, but every gift became another standard I was expected to meet.`, performance: { mood: "guarded", pace: "measured", intensity: 1, actorNote: "Hold back the deeper grievance." } },
          { id: "timeline", label: "Your movements", response: `I crossed the west corridor, checked the gallery clock, and returned before the archive alarm.`, performance: { mood: "precise", pace: "natural", intensity: 1, actorNote: "Sound rehearsed without becoming robotic." } },
          { id: "doubt", label: "What does not fit", response: `The light in the archive glass changes silhouettes. Anyone claiming a clean identification from the hall is overstating it.`, performance: { mood: "insistent", pace: "urgent", intensity: 2, actorNote: "The useful truth arrives under pressure." } },
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
    });
  }

  public async embedText(): Promise<number[]> {
    return [0.1, 0.2];
  }
}

function runtime(provider: V2AuthorProvider): DebateAiRuntime {
  return {
    preferredProvider: "local",
    responseMode: "local",
    local: { provider, providerName: "local", model: "mystery-v2-test" },
  };
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

  it("compiles every suspect chapter, prepares a complete local pack, and plays without runtime generation", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-play",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    let state = v2State(session);
    const compileDiagnostic = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE session_id = ?",
    ).get(session.id) as { private_error: string | null };
    assert.equal(state.compilation.stage, "complete", compileDiagnostic.private_error ?? undefined);
    assert.equal(state.playPhase, "title_card");
    assert.equal(state.caseTitle, "The Turnabout at Violet Hour");
    assert.equal(state.audioReady, true);
    const callsAfterCompile = provider.calls;
    const { privateCase, graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(graph.witnessChapters.length, state.config.suspectBotIds.length);
    assert.deepEqual(
      graph.witnessChapters.map((chapter) => chapter.witnessSeatId),
      state.suspects.map((suspect) => suspect.seatId),
    );
    const manifestRow = db.prepare(
      "SELECT status, manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { status: string; manifest_json: string };
    const manifest = JSON.parse(manifestRow.manifest_json) as { entries: unknown[]; complete: boolean };
    assert.equal(manifestRow.status, "complete");
    assert.equal(manifest.complete, true);
    assert.equal(manifest.entries.length, privateCase.graphValidation.reachableSpokenLineIds.length);

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
    session = act(db, session, { action: "talk", suspectSeatId: firstSuspect.seatId, topicNodeId: firstTopic.nodeId }, "talk-first-suspect");
    assert.equal(v2State(session).theoryAvailable, true);
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

    const uniqueClipCount = Number((db.prepare(
      "SELECT COUNT(DISTINCT cache_key) AS count FROM debate_mystery_audio_refs WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { count: number }).count);
    const referencedStorage = getDebateMysteryAudioStorageSummaryV2(db, "user-1");
    assert.equal(referencedStorage.referencedClipCount, uniqueClipCount);
    assert.equal(referencedStorage.cleanupCandidateCount, 0);
    db.prepare("DELETE FROM debate_sessions WHERE user_id = 'user-1' AND id = ?").run(session.id);
    const releasedStorage = getDebateMysteryAudioStorageSummaryV2(db, "user-1");
    assert.equal(releasedStorage.referencedClipCount, 0);
    assert.equal(releasedStorage.cleanupCandidateCount, uniqueClipCount);
    const cleanup = cleanupUnreferencedDebateMysteryAudioV2(db, "user-1");
    assert.equal(cleanup.removedClipCount, uniqueClipCount);
    assert.equal(cleanup.remaining.cleanupCandidateCount, 0);
  });

  it("contains no ElevenLabs boundary in the V2 compiler or gameplay module", () => {
    const source = readFileSync(new URL("../debate-mystery-v2.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /elevenlabs/iu);
    assert.match(source, /allowOperatingSystemVoices: false/u);
    assert.match(source, /generateBuiltinEnglishWave/u);
  });
});
