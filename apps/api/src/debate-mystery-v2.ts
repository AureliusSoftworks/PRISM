import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  DEBATE_MYSTERY_V2_SCHEMA_VERSION,
  compileDeterministicDebateMystery,
  botPowerChromaticBiasColorMatchesV1,
  botPowerChromaticBiasEffectsFromEffectsV1,
  botPowerChromaticBiasResolvedHueV1,
  debateMysteryClassifyVerdictV2,
  debateMysteryCredibilityMaximumV2,
  debateMysteryPremiumAvailableV2,
  emptyDebateMysteryMutationsV2,
  emptyDebateMysteryRequirementsV2,
  normalizeBotAudioVoiceProfileV1,
  parseStoredBotAudioVoiceProfileV1,
  resolveDebateMysteryConfigV2,
  validateDebateMysteryAudioManifestV1,
  validateDebateMysteryCaseBible,
  validateDebateMysteryDialogueGraphV2,
  type BotAudioVoiceProfileV1,
  type DebateMysteryActionRequestV2,
  type DebateMysteryAudioManifestEntryV1,
  type DebateMysteryAudioManifestV1,
  type DebateMysteryCompilationStageV2,
  type DebateMysteryCompilationStatusV2,
  type DebateMysteryDialogueGraphV2,
  type DebateMysteryDialogueNodeV2,
  type DebateMysteryPerformanceDirectionV2,
  type DebateMysteryRecordReferenceV2,
  type DebateMysteryResolvedConfigV1,
  type DebateMysteryResolvedConfigV2,
  type DebateMysterySpokenLineV2,
  type DebateMysteryStatementVersionV2,
  type DebateMysteryWitnessChapterV2,
  type DebateMysteryVerdictV2,
  type DebateSessionCreateRequest,
  type DebateSessionV1,
  type DebateWhodunnitCreateConfigV2,
  type DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import { generateBuiltinEnglishWave, isPlayablePcmWave } from "./builtin-tts.ts";
import {
  createDebateSession,
  debatePowerPlanForBots,
  getDebateSession,
  type DebateAiRuntime,
  type DebateGenerationLane,
} from "./debate.ts";
import { PRISM_INSTANT_VOICE_MODEL_ID, pcmWaveDurationMs } from "./local-voice-engine.ts";
import { resolveAbsoluteUnderDataRoot } from "./image-storage.ts";
import { HttpError } from "./utils.http.ts";

const V2_JOB_LEASE_MS = 90_000;
const V2_TOTAL_PASSES = 5;
const V2_MAX_AUTHOR_ATTEMPTS = 3;
const V2_AUDIO_SUBDIR = "debate-mystery-audio-v2";
const V2_STAGING_RECLAIM_AGE_MS = V2_JOB_LEASE_MS * 2;
const V2_SPOILER_SAFE_MESSAGES: Record<DebateMysteryCompilationStageV2, string> = {
  writing_case: "Writing the Case",
  testing_contradictions: "Testing Contradictions",
  directing_performances: "Directing Performances",
  preparing_local_voices: "Preparing Local Voices",
  verifying_case_audio: "Verifying Case Audio",
  complete: "Your case is ready",
  needs_attention: "Case preparation needs attention",
  cancelled: "Case preparation cancelled",
};

interface MysteryV2BotRow {
  id: string;
  name: string;
  system_prompt: string;
  export_hash: string | null;
  color: string | null;
  glyph: string | null;
  authored_audio_voice_profile: string | null;
  audio_voice_profile_override: string | null;
}

interface MysteryV2JobRow {
  id: string;
  user_id: string;
  session_id: string;
  status: "queued" | "running" | "needs_attention" | "complete" | "cancelled";
  stage: DebateMysteryCompilationStageV2;
  attempt: number;
  completed_passes: number;
  total_passes: number;
  prepared_audio_count: number;
  required_audio_count: number;
  public_message: string;
  private_error: string | null;
  input_json: string;
  checkpoint_json: string | null;
  lease_owner: string | null;
  leased_until: string | null;
  cancellation_requested: number;
  updated_at: string;
}

interface AuthoredTopicV2 {
  id: string;
  label: string;
  response: string;
  performance: Partial<DebateMysteryPerformanceDirectionV2>;
}

interface AuthoredStatementV2 {
  id: string;
  text: string;
  press: string;
  rebuttal: string;
  revision: string;
  performance: Partial<DebateMysteryPerformanceDirectionV2>;
}

interface AuthoredSuspectV2 {
  seatId: string;
  relationship: string;
  alibi: string;
  chapterOpening: string;
  chapterCompletion: string;
  defaultPresentReaction: string;
  presentReactions: Array<{ recordId: string; response: string }>;
  talkTopics: AuthoredTopicV2[];
  testimony: AuthoredStatementV2[];
}

interface AuthoredProsecutionChoiceV2 {
  id: string;
  witnessSeatId: string;
  prompt: string;
  options: Array<{ id: string; text: string; reaction: string }>;
}

interface AuthoredMysteryV2 {
  title: string;
  victimName: string;
  victimDescription: string;
  publicOpening: string;
  motive: string;
  method: string;
  partnerConsultation: string;
  eyewitnessResolution: string | null;
  evidence: Array<{ id: string; title: string; description: string; emoji: string }>;
  examinations: Array<{ id: string; text: string }>;
  suspects: AuthoredSuspectV2[];
  prosecutionChoices: AuthoredProsecutionChoiceV2[];
}

interface PrivateMysteryCaseV2 {
  version: 2;
  config: DebateMysteryResolvedConfigV2;
  sealedCulpritSeatId: string;
  sealedAccompliceSeatId: string | null;
  motive: string;
  method: string;
  victimDescription: string;
  publicOpening: string;
  eyewitnessSeatId: string | null;
  eyewitnessResolution: string | null;
  accusedAlibiSupportDiscoveryIds: string[];
  actorAccounts: Array<{
    seatId: string;
    relationship: string;
    alibi: string;
  }>;
  recordItems: Array<{
    reference: DebateMysteryRecordReferenceV2;
    title: string;
    description: string;
    emoji: string;
  }>;
  examineNodeIdByHotspot: Record<string, string>;
  presentNodeIdBySuspectRecord: Record<string, string>;
  defaultPresentNodeIdBySuspect: Record<string, string>;
  partnerConsultNodeId: string;
  crimeSceneRoomId: string;
  graphValidation: ReturnType<typeof validateDebateMysteryDialogueGraphV2>;
}

interface MysteryV2Checkpoint {
  privateCase: PrivateMysteryCaseV2;
  graph: DebateMysteryDialogueGraphV2;
  publicState: DebateWhodunnitFormatStateV2;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function compact(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The case author returned no JSON object.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The case author returned an invalid object.");
  }
  return parsed as Record<string, unknown>;
}

function uniqueIds(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function mysteryV2Lane(runtime: DebateAiRuntime): DebateGenerationLane {
  if (runtime.preferredProvider !== "local" && runtime.online?.available !== false) {
    return runtime.online ?? runtime.local;
  }
  return runtime.local;
}

function botRows(db: DatabaseSync, userId: string, ids: readonly string[]): MysteryV2BotRow[] {
  const ownedIds = [...new Set(ids.filter((id) => id && id !== "prism:player-judge"))];
  if (!ownedIds.length) return [];
  return db.prepare(
    `SELECT id, name, system_prompt, export_hash, color, glyph,
            authored_audio_voice_profile, audio_voice_profile_override
       FROM bots
      WHERE user_id = ? AND id IN (${ownedIds.map(() => "?").join(", ")})`,
  ).all(userId, ...ownedIds) as unknown as MysteryV2BotRow[];
}

function v1ScaffoldConfig(config: DebateMysteryResolvedConfigV2): DebateMysteryResolvedConfigV1 {
  return {
    version: 1,
    preset: config.preset,
    difficulty: config.difficulty,
    artMode: config.artMode,
    formality: "structured",
    juryEnabled: config.trialType === "jury",
    playerRole: config.playerRole === "spectator" ? "spectator" : "participant",
    participationDifficulty: config.participationDifficulty,
    inspiration: config.inspiration,
    nonce: config.nonce,
    floors: config.floors,
    totalRooms: config.totalRooms,
    suspectBotIds: config.suspectBotIds,
    judgeBotId: config.judgeBotId,
    prosecutorPartnerBotId: config.prosecutorPartnerBotId,
    rivalDefenseBotId: config.rivalDefenseBotId,
    actionBudget: 10_000,
    accompliceChance: config.preset === "grand" ? 0.35 : config.preset === "standard" ? 0.25 : 0,
  };
}

function compilationStatus(row: MysteryV2JobRow): DebateMysteryCompilationStatusV2 {
  return {
    version: 2,
    jobId: row.id,
    stage: row.stage,
    attempt: row.attempt,
    completedPasses: row.completed_passes,
    totalPasses: row.total_passes,
    preparedAudioCount: row.prepared_audio_count,
    requiredAudioCount: row.required_audio_count,
    retryable: row.status === "needs_attention",
    spoilerSafeMessage: row.public_message,
    updatedAt: row.updated_at,
  };
}

function jobRow(db: DatabaseSync, userId: string, sessionId: string): MysteryV2JobRow {
  const row = db.prepare(
    `SELECT id, user_id, session_id, status, stage, attempt,
            completed_passes, total_passes, prepared_audio_count,
            required_audio_count, public_message, private_error, input_json,
            checkpoint_json, lease_owner, leased_until,
            cancellation_requested, updated_at
       FROM debate_mystery_v2_jobs
      WHERE user_id = ? AND session_id = ?`,
  ).get(userId, sessionId) as MysteryV2JobRow | undefined;
  if (!row) throw new HttpError(404, "Whodunnit V2 compilation job not found.");
  return row;
}

function publicSessionJson(session: DebateSessionV1): string {
  return JSON.stringify({ ...session, events: [] });
}

function persistV2Session(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
  state: DebateWhodunnitFormatStateV2,
  expectedRevision = session.revision,
): DebateSessionV1 {
  const next: DebateSessionV1 = {
    ...session,
    revision: expectedRevision + 1,
    updatedAt: new Date().toISOString(),
    formatState: state,
  };
  const result = db.prepare(
    `UPDATE debate_sessions
        SET revision = ?, status = ?, phase = ?, step_key = ?,
            player_role = ?, motion = ?, winner_side_id = ?, session_json = ?,
            error = ?, updated_at = ?, completed_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?`,
  ).run(
    next.revision,
    next.status,
    next.phase,
    next.stepKey,
    next.playerRole === "spectator" ? "spectator" : "participant",
    next.motion.motion,
    next.winnerSideId,
    publicSessionJson(next),
    next.error,
    next.updatedAt,
    next.completedAt,
    next.id,
    userId,
    expectedRevision,
  );
  if (Number(result.changes) !== 1) {
    throw new HttpError(409, "This case changed in another window. Refresh and try again.");
  }
  return next;
}

function updateJob(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  values: {
    stage?: DebateMysteryCompilationStageV2;
    status?: MysteryV2JobRow["status"];
    completedPasses?: number;
    preparedAudioCount?: number;
    requiredAudioCount?: number;
    publicMessage?: string;
    privateError?: string | null;
    checkpointJson?: string | null;
    clearLease?: boolean;
  },
): MysteryV2JobRow {
  const current = jobRow(db, userId, sessionId);
  const stage = values.stage ?? current.stage;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET stage = ?, status = ?, completed_passes = ?,
            prepared_audio_count = ?, required_audio_count = ?,
            public_message = ?, private_error = ?, checkpoint_json = ?,
            lease_owner = ?, leased_until = ?, updated_at = ?
      WHERE user_id = ? AND session_id = ?`,
  ).run(
    stage,
    values.status ?? current.status,
    values.completedPasses ?? current.completed_passes,
    values.preparedAudioCount ?? current.prepared_audio_count,
    values.requiredAudioCount ?? current.required_audio_count,
    values.publicMessage ?? V2_SPOILER_SAFE_MESSAGES[stage],
    values.privateError === undefined ? current.private_error : values.privateError,
    values.checkpointJson === undefined ? current.checkpoint_json : values.checkpointJson,
    values.clearLease ? null : current.lease_owner,
    values.clearLease ? null : current.leased_until,
    now,
    userId,
    sessionId,
  );
  return jobRow(db, userId, sessionId);
}

function setPublicCompilationStatus(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  row: MysteryV2JobRow,
  extras: Partial<DebateWhodunnitFormatStateV2> = {},
): DebateSessionV1 {
  const session = getDebateSession(db, userId, sessionId);
  if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
    throw new HttpError(409, "This session is not a Whodunnit V2 case.");
  }
  return persistV2Session(db, userId, {
    ...session,
    status: row.status === "complete"
      ? "waiting_for_player"
      : row.status === "cancelled"
        ? "cancelled"
        : row.status === "needs_attention"
          ? "failed"
          : "live",
    stepKey: row.status === "complete" ? "mystery_v2_title" : `mystery_v2_${row.stage}`,
    error: row.status === "needs_attention" ? row.public_message : null,
  }, {
    ...session.formatState,
    ...extras,
    compilation: compilationStatus(row),
  });
}

function initialV2State(
  config: DebateMysteryResolvedConfigV2,
  jobId: string,
  now: string,
): DebateWhodunnitFormatStateV2 {
  return {
    version: 2,
    format: "whodunnit",
    playPhase: "case_forge",
    compilation: {
      version: 2,
      jobId,
      stage: "writing_case",
      attempt: 0,
      completedPasses: 0,
      totalPasses: V2_TOTAL_PASSES,
      preparedAudioCount: 0,
      requiredAudioCount: 0,
      retryable: false,
      spoilerSafeMessage: V2_SPOILER_SAFE_MESSAGES.writing_case,
      updatedAt: now,
    },
    caseTitle: null,
    fictionLabel: "Fictional, non-canonical case",
    config,
    victim: null,
    suspects: [],
    rooms: [],
    currentRoomId: null,
    roomView: "mansion",
    metSuspectSeatIds: [],
    discoveryIds: [],
    record: [],
    topics: [],
    dialogueHistory: [],
    activeDialogueNodeId: null,
    theoryAvailable: false,
    theory: null,
    theoryFiledAt: null,
    court: null,
    verdict: null,
    audioReady: false,
    voicesEnabled: true,
    localAudioFailure: null,
    calloutHistory: [],
    pendingCallout: null,
    pendingProsecutionChoice: null,
  };
}

function mysteryV2SessionRequest(
  config: DebateMysteryResolvedConfigV2,
  source: DebateWhodunnitCreateConfigV2,
  idempotencyKey: string,
): DebateSessionCreateRequest {
  return {
    format: "whodunnit",
    whodunnit: source as unknown as DebateSessionCreateRequest["whodunnit"],
    formality: "structured",
    presetId: "custom",
    jury: {
      enabled: config.trialType === "jury",
      jurorBotIds: config.trialType === "jury" ? [...config.jurorBotIds] : [],
    },
    motion: {
      version: 1,
      id: randomUUID(),
      title: "Whodunnit?",
      motion: "Determine who murdered the victim and prove the filed accusation in court.",
      forSide: { label: "Prosecution", brief: "Investigate, file charges, and prove the accusation from the admitted record." },
      againstSide: { label: "Defense", brief: "Test the accusation against every fair alternative in the admitted record." },
    },
    evidence: { version: 1, notes: "", sources: [], exhibits: [], frozenAt: null },
    moderatorTitle: "Judge",
    moderatorBotId: config.judgeBotId,
    playerJudgeUsesPrism: config.judgeBotId === "prism:player-judge",
    forAdvocateBotId: config.prosecutorPartnerBotId,
    againstAdvocateBotId: config.rivalDefenseBotId,
    playerRole: config.playerRole === "spectator" ? "spectator" : "participant",
    playerSideId: config.playerRole === "spectator" ? null : "for",
    participationDifficulty: config.participationDifficulty,
    advocacyConsent: [],
    theme: "dark",
    deferStart: false,
    idempotencyKey,
  };
}

export function getDebateMysteryCompilationStatusV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysteryCompilationStatusV2 {
  return compilationStatus(jobRow(db, userId, sessionId));
}

export async function createDebateMysterySessionV2(
  db: DatabaseSync,
  userId: string,
  configInput: DebateWhodunnitCreateConfigV2,
  idempotencyKeyInput: unknown,
  runtime: DebateAiRuntime,
  options: {
    deferBackgroundStart?: boolean;
    generateWave?: typeof generateBuiltinEnglishWave;
  } = {},
): Promise<DebateSessionV1> {
  const idempotencyKey = compact(idempotencyKeyInput, 200);
  if (!idempotencyKey) throw new HttpError(400, "A stable idempotency key is required.");
  let config: DebateMysteryResolvedConfigV2;
  try {
    config = resolveDebateMysteryConfigV2(configInput);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid Whodunnit V2 setup.");
  }
  if (debateMysteryPremiumAvailableV2()) {
    throw new Error("Whodunnit V2 Premium must remain disabled during the core release.");
  }
  const allBotIds = [
    ...config.suspectBotIds,
    config.judgeBotId,
    config.prosecutorPartnerBotId,
    config.rivalDefenseBotId,
    ...config.jurorBotIds,
  ];
  const expectedOwnedIds = [...new Set(allBotIds.filter((id) => id !== "prism:player-judge"))];
  if (botRows(db, userId, expectedOwnedIds).length !== expectedOwnedIds.length) {
    throw new HttpError(404, "One or more selected Whodunnit cast bots were not found.");
  }
  let session = createDebateSession(
    db,
    userId,
    mysteryV2SessionRequest(config, configInput, idempotencyKey),
    runtime,
  );
  if (session.formatState.format === "whodunnit" && session.formatState.version === 2) {
    return session;
  }
  const existingJob = db.prepare(
    "SELECT id FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
  ).get(userId, session.id) as { id?: string } | undefined;
  if (existingJob?.id) return getDebateSession(db, userId, session.id);
  const now = new Date().toISOString();
  const jobId = randomUUID();
  session = persistV2Session(db, userId, {
    ...session,
    status: "live",
    phase: "opening",
    stepKey: "mystery_v2_writing_case",
    error: null,
    powerPlan: debatePowerPlanForBots(db, userId, allBotIds, "dark"),
  }, initialV2State(config, jobId, now));
  db.prepare(
    `INSERT INTO debate_mystery_v2_jobs
       (id, user_id, session_id, status, stage, attempt, completed_passes,
        total_passes, prepared_audio_count, required_audio_count,
        public_message, private_error, input_json, checkpoint_json,
        lease_owner, leased_until, cancellation_requested, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 'writing_case', 0, 0, ?, 0, 0, ?, NULL, ?, NULL, NULL, NULL, 0, ?, ?)`,
  ).run(
    jobId,
    userId,
    session.id,
    V2_TOTAL_PASSES,
    V2_SPOILER_SAFE_MESSAGES.writing_case,
    JSON.stringify(configInput),
    now,
    now,
  );
  if (!options.deferBackgroundStart) {
    queueMicrotask(() => {
      void runDebateMysteryCompilationV2(db, userId, session.id, runtime, {
        generateWave: options.generateWave,
      }).catch(() => {
        // The durable job records a spoiler-safe Needs Attention state.
      });
    });
  }
  return session;
}

function performanceDirection(
  value: Partial<DebateMysteryPerformanceDirectionV2> | undefined,
  fallbackMood: string,
): DebateMysteryPerformanceDirectionV2 {
  return {
    mood: compact(value?.mood, 80) || fallbackMood,
    pace: value?.pace === "measured" || value?.pace === "urgent" ? value.pace : "natural",
    intensity: value?.intensity === 0 || value?.intensity === 2 || value?.intensity === 3
      ? value.intensity
      : 1,
    actorNote: compact(value?.actorNote, 300) || "Keep the delivery specific to the immediate pressure of the scene.",
  };
}

function authoredMysteryFromJson(args: {
  value: Record<string, unknown>;
  suspectSeatIds: readonly string[];
  evidenceIds: readonly string[];
  examinationIds: readonly string[];
  requiredPresentRecordBySeat: ReadonlyMap<string, DebateMysteryRecordReferenceV2>;
}): AuthoredMysteryV2 {
  const title = compact(args.value.title, 120);
  const victimName = compact(args.value.victimName, 100);
  const victimDescription = compact(args.value.victimDescription, 700);
  const publicOpening = compact(args.value.publicOpening, 1_400);
  const motive = compact(args.value.motive, 800);
  const method = compact(args.value.method, 800);
  const partnerConsultation = compact(args.value.partnerConsultation, 800);
  if (!title || !victimName || !victimDescription || !publicOpening || !motive || !method || !partnerConsultation) {
    throw new Error("The authored case omitted required case prose.");
  }
  const evidenceRows = Array.isArray(args.value.evidence) ? args.value.evidence : [];
  const evidence = evidenceRows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = compact(row.id, 120);
    const title = compact(row.title, 160);
    const description = compact(row.description, 1_200);
    if (!id || !title || !description) return [];
    return [{ id, title, description, emoji: compact(row.emoji, 16) || "🔎" }];
  });
  if (
    evidence.length !== args.evidenceIds.length ||
    !args.evidenceIds.every((id) => evidence.some((entry) => entry.id === id))
  ) {
    throw new Error("The authored case did not describe every frozen evidence item exactly once.");
  }
  const examinationRows = Array.isArray(args.value.examinations) ? args.value.examinations : [];
  const examinations = examinationRows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = compact(row.id, 240);
    const text = compact(row.text, 1_200);
    return id && text ? [{ id, text }] : [];
  });
  if (
    examinations.length !== args.examinationIds.length ||
    !args.examinationIds.every((id) => examinations.some((entry) => entry.id === id))
  ) {
    throw new Error("The authored case did not write every room examination result.");
  }
  const suspectRows = Array.isArray(args.value.suspects) ? args.value.suspects : [];
  const suspects: AuthoredSuspectV2[] = suspectRows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const seatId = compact(row.seatId, 120);
    const topics = (Array.isArray(row.talkTopics) ? row.talkTopics : []).flatMap((topicValue) => {
      if (!topicValue || typeof topicValue !== "object") return [];
      const topic = topicValue as Record<string, unknown>;
      const id = compact(topic.id, 100);
      const label = compact(topic.label, 100);
      const response = compact(topic.response, 1_200);
      return id && label && response ? [{
        id,
        label,
        response,
        performance: topic.performance && typeof topic.performance === "object"
          ? topic.performance as Partial<DebateMysteryPerformanceDirectionV2>
          : {},
      }] : [];
    });
    const statements = (Array.isArray(row.testimony) ? row.testimony : []).flatMap((statementValue) => {
      if (!statementValue || typeof statementValue !== "object") return [];
      const statement = statementValue as Record<string, unknown>;
      const id = compact(statement.id, 120);
      const text = compact(statement.text, 1_000);
      const press = compact(statement.press, 1_000);
      const rebuttal = compact(statement.rebuttal, 1_000);
      const revision = compact(statement.revision, 1_000);
      return id && text && press && rebuttal && revision ? [{
        id,
        text,
        press,
        rebuttal,
        revision,
        performance: statement.performance && typeof statement.performance === "object"
          ? statement.performance as Partial<DebateMysteryPerformanceDirectionV2>
          : {},
      }] : [];
    });
    const presentReactions = (Array.isArray(row.presentReactions) ? row.presentReactions : []).flatMap((reactionValue) => {
      if (!reactionValue || typeof reactionValue !== "object") return [];
      const reaction = reactionValue as Record<string, unknown>;
      const recordId = compact(reaction.recordId, 180);
      const response = compact(reaction.response, 1_000);
      return recordId && response ? [{ recordId, response }] : [];
    });
    if (!seatId || topics.length < 3 || statements.length < 3) return [];
    return [{
      seatId,
      relationship: compact(row.relationship, 700),
      alibi: compact(row.alibi, 800),
      chapterOpening: compact(row.chapterOpening, 700),
      chapterCompletion: compact(row.chapterCompletion, 700),
      defaultPresentReaction: compact(row.defaultPresentReaction, 700),
      presentReactions,
      talkTopics: topics.slice(0, 5),
      testimony: statements.slice(0, 6),
    }];
  });
  if (
    suspects.length !== args.suspectSeatIds.length ||
    !args.suspectSeatIds.every((seatId) => suspects.some((entry) => entry.seatId === seatId))
  ) {
    throw new Error("The authored case did not provide complete investigation and testimony for every suspect.");
  }
  for (const suspect of suspects) {
    if (
      !suspect.relationship ||
      !suspect.alibi ||
      !suspect.chapterOpening ||
      !suspect.chapterCompletion ||
      !suspect.defaultPresentReaction
    ) {
      throw new Error(`The authored chapter for ${suspect.seatId} omitted required dialogue.`);
    }
    const required = args.requiredPresentRecordBySeat.get(suspect.seatId);
    const requiredStatementIds = [1, 2, 3].map((ordinal) => `statement-${suspect.seatId}-${ordinal}`);
    if (!requiredStatementIds.every((id) => suspect.testimony.some((statement) => statement.id === id))) {
      throw new Error(`The authored chapter for ${suspect.seatId} changed its frozen statement IDs.`);
    }
    if (!uniqueIds(suspect.testimony.map((statement) => statement.id))) {
      throw new Error(`The authored chapter for ${suspect.seatId} repeated a statement ID.`);
    }
    if (required && !suspect.presentReactions.some((reaction) => reaction.recordId === `${required.kind}:${required.id}`)) {
      throw new Error(`The authored investigation omitted ${suspect.seatId}'s proof-bearing evidence reaction.`);
    }
  }
  const choiceRows = Array.isArray(args.value.prosecutionChoices) ? args.value.prosecutionChoices : [];
  const prosecutionChoices: AuthoredProsecutionChoiceV2[] = choiceRows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = compact(row.id, 100);
    const witnessSeatId = compact(row.witnessSeatId, 120);
    const prompt = compact(row.prompt, 700);
    const options = (Array.isArray(row.options) ? row.options : []).flatMap((optionValue) => {
      if (!optionValue || typeof optionValue !== "object") return [];
      const option = optionValue as Record<string, unknown>;
      const optionId = compact(option.id, 100);
      const text = compact(option.text, 300);
      const reaction = compact(option.reaction, 800);
      return optionId && text && reaction ? [{ id: optionId, text, reaction }] : [];
    });
    return id && witnessSeatId && prompt && options.length >= 2
      ? [{ id, witnessSeatId, prompt, options: options.slice(0, 4) }]
      : [];
  });
  if (!prosecutionChoices.length) {
    throw new Error("The authored trial omitted its prosecution response choice.");
  }
  return {
    title,
    victimName,
    victimDescription,
    publicOpening,
    motive,
    method,
    partnerConsultation,
    eyewitnessResolution: compact(args.value.eyewitnessResolution, 900) || null,
    evidence,
    examinations,
    suspects,
    prosecutionChoices,
  };
}

async function authorMysteryV2(args: {
  runtime: DebateAiRuntime;
  config: DebateMysteryResolvedConfigV2;
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
  bots: MysteryV2BotRow[];
  eyewitnessSeatId: string | null;
  examinationIds: string[];
  requiredContradictionBySeat: ReadonlyMap<string, DebateMysteryRecordReferenceV2>;
  priorErrors: readonly string[];
}): Promise<AuthoredMysteryV2> {
  const lane = mysteryV2Lane(args.runtime);
  const botById = new Map(args.bots.map((bot) => [bot.id, bot]));
  const suspectRequirements = args.scaffold.suspects.map((suspect, index) => {
    const bot = botById.get(suspect.botId)!;
    const contradiction = args.requiredContradictionBySeat.get(suspect.seatId)!;
    return {
      seatId: suspect.seatId,
      name: suspect.name,
      persona: bot.system_prompt.slice(0, 1_800),
      privateRole: suspect.seatId === args.scaffold.culpritSeatId
        ? "culprit"
        : suspect.seatId === args.scaffold.accompliceSeatId
          ? "accomplice"
          : "innocent",
      requiredStatementIds: [1, 2, 3].map((ordinal) => `statement-${suspect.seatId}-${ordinal}`),
      requiredContradictionOnSecondStatement: `${contradiction.kind}:${contradiction.id}`,
      requiredPresentReactionRecordId: `${contradiction.kind}:${contradiction.id}`,
      ordinal: index + 1,
    };
  });
  const prompt = {
    setup: {
      inspiration: args.config.inspiration,
      difficulty: args.config.difficulty,
      preset: args.config.preset,
      trialType: args.config.trialType,
      culpritSeatId: args.scaffold.culpritSeatId,
      accompliceSeatId: args.scaffold.accompliceSeatId,
      eyewitnessSeatId: args.eyewitnessSeatId,
      timeline: args.scaffold.timeline,
      roomNames: args.scaffold.rooms.map((room) => ({
        roomId: room.id,
        name: DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === room.templateId)?.name ?? room.templateId,
      })),
      evidenceIds: args.scaffold.evidence.map((item) => item.id),
      examinationIds: args.examinationIds,
      suspects: suspectRequirements,
    },
    outputContract: {
      title: "original spoiler-safe case title",
      victimName: "fictional name",
      victimDescription: "specific original identity and stakes",
      publicOpening: "crime-scene briefing without naming the culprit",
      motive: "sealed motive",
      method: "sealed method",
      partnerConsultation: "spoiler-free authored partner guidance for statement-level Press and Present play",
      eyewitnessResolution: args.eyewitnessSeatId
        ? "exact fair weakness or reconciliation of eyewitness and two-source alibi"
        : null,
      evidence: "array with every evidence id exactly once; each has id, title, description, emoji",
      examinations: "array with every examination id exactly once; each has id and sensory, clue-fair text",
      suspects: "array for every suspect; each has seatId, relationship, alibi, chapterOpening, chapterCompletion, defaultPresentReaction, three or more talkTopics, presentReactions, and three or more testimony statements",
      talkTopicShape: { id: "short stable suffix", label: "player-facing topic", response: "complete answer", performance: { mood: "", pace: "natural", intensity: 1, actorNote: "" } },
      presentReactionShape: { recordId: "the exact kind:id required above", response: "specific finite response" },
      testimonyShape: { id: "use the exact required statement IDs", text: "sworn statement", press: "answer when pressed", rebuttal: "authored response to an incorrect presentation", revision: "revised statement after the correct presentation", performance: { mood: "", pace: "natural", intensity: 1, actorNote: "" } },
      prosecutionChoices: "at least one choice; each has id, witnessSeatId, prompt, and 2-4 authored options with id, text, reaction",
    },
    qualityRules: [
      "Write a complete finite prosecution game, not a summary or outline.",
      "Every suspect must sound like their persona while remaining coherent and fair.",
      "The second statement in every chapter must be exactly contradicted by its assigned record.",
      "Later assigned testimony references must genuinely contradict that earlier sworn wording.",
      "Press answers may expose uncertainty or context but must not erase the proof route.",
      "Revision text must materially change the sworn account.",
      "Keep public investigation lines free of hidden culprit labels or proof-route metadata.",
      "No generic placeholders, TODOs, bracketed alternatives, or copied franchise characters.",
    ],
    repairErrors: args.priorErrors,
  };
  const response = await lane.provider.generateResponse([
    {
      role: "system",
      content: "You are PRISM's senior mystery writer and trial designer. Author an original, logically fair, Ace Attorney-style prosecution case using only the supplied frozen IDs and truth. Return one JSON object only. All dialogue is final production copy and must cover every requested branch.",
    },
    { role: "user", content: JSON.stringify(prompt) },
  ], {
    model: lane.model,
    reasoningEffort: lane.reasoningEffort,
    turbo: lane.turbo,
    maxTokens: 30_000,
    temperature: 0.82,
    jsonMode: true,
    usagePurpose: "debate_generation",
    allowFinalLocalFallback: lane.providerName === "local",
  });
  const authored = authoredMysteryFromJson({
    value: parseJsonObject(response),
    suspectSeatIds: args.scaffold.suspects.map((suspect) => suspect.seatId),
    evidenceIds: args.scaffold.evidence.map((evidence) => evidence.id),
    examinationIds: args.examinationIds,
    requiredPresentRecordBySeat: args.requiredContradictionBySeat,
  });
  if (args.eyewitnessSeatId && !authored.eyewitnessResolution) {
    throw new Error("The eyewitness case omitted its fair statement-level reconciliation.");
  }
  return authored;
}

function buildMysteryV2Graph(args: {
  sessionId: string;
  config: DebateMysteryResolvedConfigV2;
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
  authored: AuthoredMysteryV2;
  eyewitnessSeatId: string | null;
  alibiSupportDiscoveryIds: string[];
  contradictionBySeat: ReadonlyMap<string, DebateMysteryRecordReferenceV2>;
}): { graph: DebateMysteryDialogueGraphV2; privateCase: PrivateMysteryCaseV2; publicState: DebateWhodunnitFormatStateV2 } {
  const nodes: DebateMysteryDialogueNodeV2[] = [];
  const lines: DebateMysterySpokenLineV2[] = [];
  const interactionRoots: string[] = [];
  const talkTopicNodeIdsBySuspect: Record<string, string[]> = {};
  const presentNodeIdsBySuspect: Record<string, string[]> = {};
  const examineNodeIdByHotspot: Record<string, string> = {};
  const presentNodeIdBySuspectRecord: Record<string, string> = {};
  const defaultPresentNodeIdBySuspect: Record<string, string> = {};
  const botIdBySeat = new Map(args.scaffold.suspects.map((suspect) => [suspect.seatId, suspect.botId]));
  const authoredEvidence = new Map(args.authored.evidence.map((entry) => [entry.id, entry]));
  const authoredExaminations = new Map(args.authored.examinations.map((entry) => [entry.id, entry.text]));
  const addLineNode = (options: {
    id: string;
    kind: DebateMysteryDialogueNodeV2["kind"];
    scene: DebateMysteryDialogueNodeV2["scene"];
    text: string;
    speakerSeatId?: string | null;
    speakerKind?: DebateMysterySpokenLineV2["speakerKind"];
    speakerBotId?: string | null;
    label?: string | null;
    mode?: DebateMysterySpokenLineV2["mode"];
    performance?: Partial<DebateMysteryPerformanceDirectionV2>;
    requirements?: Partial<DebateMysteryDialogueNodeV2["requirements"]>;
    mutations?: Partial<DebateMysteryDialogueNodeV2["mutations"]>;
    records?: DebateMysteryRecordReferenceV2[];
    next?: string[];
    terminal?: DebateMysteryDialogueNodeV2["terminalOutcome"];
    root?: boolean;
  }): DebateMysteryDialogueNodeV2 => {
    const lineId = `line-${options.id}`;
    const node: DebateMysteryDialogueNodeV2 = {
      id: options.id,
      kind: options.kind,
      scene: options.scene,
      speakerSeatId: options.speakerSeatId ?? null,
      intendedRecipientSeatId: null,
      lineId,
      label: options.label ?? null,
      requirements: { ...emptyDebateMysteryRequirementsV2(), ...options.requirements },
      mutations: { ...emptyDebateMysteryMutationsV2(), ...options.mutations },
      recordReferences: options.records ?? [],
      nextNodeIds: options.next ?? [],
      terminalOutcome: options.terminal ?? null,
    };
    const speakerBotId = options.speakerBotId === undefined
      ? options.speakerSeatId
        ? botIdBySeat.get(options.speakerSeatId) ?? null
        : null
      : options.speakerBotId;
    const line: DebateMysterySpokenLineV2 = {
      id: lineId,
      nodeId: node.id,
      speakerKind: options.speakerKind ?? (speakerBotId ? "bot" : "narrator"),
      speakerBotId,
      visibleText: options.text,
      spokenText: options.text,
      performance: performanceDirection(options.performance, options.scene === "court" ? "controlled tension" : "watchful"),
      mode: options.mode ?? "spoken",
      reusableCalloutKey: null,
    };
    nodes.push(node);
    lines.push(line);
    if (options.root !== false) interactionRoots.push(node.id);
    return node;
  };

  const openingNode = addLineNode({
    id: "briefing-opening",
    kind: "briefing",
    scene: "investigation",
    text: args.authored.publicOpening,
    speakerKind: "narrator",
    mutations: { discoverIds: ["briefing:complete"] },
    terminal: "return_to_room",
  });
  const initialDiscoveryIds = ["briefing:complete"];
  const initialAdmittedRecordIds: string[] = [];
  const publicRecord: DebateWhodunnitFormatStateV2["record"] = [];
  const openingWeaponEvidenceId = args.scaffold.evidence.find((item) => item.isCanonicalWeapon)?.id ?? null;

  for (const room of args.scaffold.rooms) {
    const activeOutcomes = args.scaffold.activeRegions.filter((outcome) => outcome.roomId === room.id);
    for (const outcome of activeOutcomes) {
      const key = `${room.id}:${outcome.regionId}`;
      const nodeId = `examine-${room.id}-${outcome.regionId}`;
      const evidence = outcome.evidenceId ? authoredEvidence.get(outcome.evidenceId) : null;
      const record = outcome.evidenceId ? { kind: "evidence" as const, id: outcome.evidenceId } : null;
      addLineNode({
        id: nodeId,
        kind: "examination_result",
        scene: "investigation",
        text: authoredExaminations.get(key)!,
        speakerKind: "narrator",
        requirements: { discoveryIds: ["briefing:complete"] },
        mutations: {
          discoverIds: [`hotspot:${key}`],
          admitRecordIds: record ? [`evidence:${record.id}`] : [],
        },
        records: record ? [record] : [],
        terminal: "return_to_room",
      });
      examineNodeIdByHotspot[key] = nodeId;
      if (evidence && args.scaffold.weapon.revealedAtOpening && outcome.evidenceId === openingWeaponEvidenceId) {
        initialAdmittedRecordIds.push(`evidence:${evidence.id}`);
        publicRecord.push({
          reference: { kind: "evidence", id: evidence.id },
          title: evidence.title,
          description: evidence.description,
          emoji: evidence.emoji,
          admitted: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  for (const suspect of args.authored.suspects) {
    const topicNodeIds: string[] = [];
    suspect.talkTopics.forEach((topic, index) => {
      const nodeId = `talk-${suspect.seatId}-${topic.id}`;
      const nextTopicId = suspect.talkTopics[index + 1]
        ? `talk-${suspect.seatId}-${suspect.talkTopics[index + 1]!.id}`
        : null;
      addLineNode({
        id: nodeId,
        kind: "talk_topic",
        scene: "investigation",
        text: topic.response,
        speakerSeatId: suspect.seatId,
        label: topic.label,
        performance: topic.performance,
        requirements: index === 0 ? {} : { unlockedTopicIds: [nodeId] },
        mutations: {
          discoverIds: [`talk:${suspect.seatId}:${topic.id}`],
          unlockTopicIds: nextTopicId ? [nextTopicId] : [],
        },
        terminal: "return_to_room",
      });
      topicNodeIds.push(nodeId);
    });
    talkTopicNodeIdsBySuspect[suspect.seatId] = topicNodeIds;
    const defaultNode = addLineNode({
      id: `present-${suspect.seatId}-default`,
      kind: "present_reaction",
      scene: "investigation",
      text: suspect.defaultPresentReaction,
      speakerSeatId: suspect.seatId,
      terminal: "return_to_room",
    });
    defaultPresentNodeIdBySuspect[suspect.seatId] = defaultNode.id;
    const presentIds = [defaultNode.id];
    for (const reaction of suspect.presentReactions) {
      const [kind, ...idParts] = reaction.recordId.split(":");
      if (kind !== "evidence" && kind !== "testimony") continue;
      const reference = { kind, id: idParts.join(":") } as DebateMysteryRecordReferenceV2;
      const node = addLineNode({
        id: `present-${suspect.seatId}-${kind}-${reference.id}`,
        kind: "present_reaction",
        scene: "investigation",
        text: reaction.response,
        speakerSeatId: suspect.seatId,
        requirements: { admittedRecordIds: [reaction.recordId] },
        mutations: { discoverIds: [`present:${suspect.seatId}:${reaction.recordId}`] },
        records: [reference],
        terminal: "return_to_room",
      });
      presentNodeIdBySuspectRecord[`${suspect.seatId}:${reaction.recordId}`] = node.id;
      presentIds.push(node.id);
    }
    presentNodeIdsBySuspect[suspect.seatId] = presentIds;
  }

  const witnessChapters: DebateMysteryWitnessChapterV2[] = [];
  let previousPrimaryStatementId: string | null = null;
  for (const [index, suspectSnapshot] of args.scaffold.suspects.entries()) {
    const suspect = args.authored.suspects.find((entry) => entry.seatId === suspectSnapshot.seatId)!;
    const chapterId = `chapter-${suspect.seatId}`;
    const chapterRequirement = previousPrimaryStatementId
      ? { admittedRecordIds: [`testimony:${previousPrimaryStatementId}`] }
      : {};
    const checkpoint = addLineNode({
      id: `${chapterId}-checkpoint`,
      kind: "court_reaction",
      scene: "court",
      text: suspect.chapterOpening,
      speakerKind: "judge",
      speakerBotId: args.config.judgeBotId === "prism:player-judge" ? null : args.config.judgeBotId,
      requirements: chapterRequirement,
    });
    const assignedProof = args.contradictionBySeat.get(suspect.seatId)!;
    const statementVersions: DebateMysteryStatementVersionV2[] = [];
    for (const [statementIndex, authoredStatement] of suspect.testimony.entries()) {
      const statementNode = addLineNode({
        id: `statement-node-${authoredStatement.id}`,
        kind: "testimony_statement",
        scene: "court",
        text: authoredStatement.text,
        speakerSeatId: suspect.seatId,
        performance: authoredStatement.performance,
        requirements: chapterRequirement,
      });
      const press = addLineNode({
        id: `press-${authoredStatement.id}`,
        kind: "press_result",
        scene: "court",
        text: authoredStatement.press,
        speakerSeatId: suspect.seatId,
        requirements: chapterRequirement,
      });
      const rebuttal = addLineNode({
        id: `rebuttal-${authoredStatement.id}`,
        kind: "court_reaction",
        scene: "court",
        text: authoredStatement.rebuttal,
        speakerSeatId: suspect.seatId,
        requirements: chapterRequirement,
      });
      const isContradiction = statementIndex === 1;
      const revision = addLineNode({
        id: `revision-${authoredStatement.id}`,
        kind: "testimony_revision",
        scene: "court",
        text: authoredStatement.revision,
        speakerSeatId: suspect.seatId,
        requirements: {
          ...chapterRequirement,
          admittedRecordIds: [
            ...((chapterRequirement as { admittedRecordIds?: string[] }).admittedRecordIds ?? []),
            ...(isContradiction ? [`${assignedProof.kind}:${assignedProof.id}`] : []),
          ],
        },
        records: isContradiction ? [assignedProof] : [],
      });
      statementVersions.push({
        id: `version-${authoredStatement.id}-1`,
        statementId: authoredStatement.id,
        witnessSeatId: suspect.seatId,
        version: 1,
        lineId: statementNode.lineId!,
        pressNodeId: press.id,
        correctPresentations: isContradiction ? [assignedProof] : [],
        rebuttalNodeId: rebuttal.id,
        revisionNodeId: isContradiction ? revision.id : null,
        nextStatementId: suspect.testimony[statementIndex + 1]?.id ?? null,
      });
    }
    const completion = addLineNode({
      id: `${chapterId}-complete`,
      kind: "court_reaction",
      scene: "court",
      text: suspect.chapterCompletion,
      speakerKind: "judge",
      speakerBotId: args.config.judgeBotId === "prism:player-judge" ? null : args.config.judgeBotId,
      requirements: {
        ...chapterRequirement,
        admittedRecordIds: [
          ...((chapterRequirement as { admittedRecordIds?: string[] }).admittedRecordIds ?? []),
          `${assignedProof.kind}:${assignedProof.id}`,
        ],
      },
      mutations: {
        admitRecordIds: suspect.testimony.map((statement) => `testimony:${statement.id}`),
      },
      terminal: "chapter_complete",
    });
    const contradictoryStatement = statementVersions[1]!;
    const revisionNode = nodes.find((node) => node.id === contradictoryStatement.revisionNodeId)!;
    revisionNode.nextNodeIds = [completion.id];
    witnessChapters.push({
      id: chapterId,
      witnessSeatId: suspect.seatId,
      ordinal: index + 1,
      pivotal:
        suspect.seatId === args.scaffold.culpritSeatId ||
        suspect.seatId === args.eyewitnessSeatId,
      recall: suspect.testimony.length > 4,
      checkpointNodeId: checkpoint.id,
      initialStatementIds: suspect.testimony.map((statement) => statement.id),
      statementVersions,
      completionNodeId: completion.id,
    });
    previousPrimaryStatementId = suspect.testimony[1]!.id;
  }

  const prosecutionChoices: DebateMysteryDialogueGraphV2["prosecutionChoices"] = [];
  for (const choice of args.authored.prosecutionChoices) {
    const prompt = addLineNode({
      id: `choice-${choice.id}-prompt`,
      kind: "prosecution_choice",
      scene: "court",
      text: choice.prompt,
      speakerKind: "judge",
      speakerBotId: args.config.judgeBotId === "prism:player-judge" ? null : args.config.judgeBotId,
    });
    const options: DebateMysteryDialogueGraphV2["prosecutionChoices"][number]["options"] = [];
    for (const option of choice.options) {
      const response = addLineNode({
        id: `choice-${choice.id}-${option.id}-response`,
        kind: "choice_reaction",
        scene: "court",
        text: option.reaction,
        speakerSeatId: choice.witnessSeatId,
        requirements: { choices: [{ choiceId: choice.id, optionId: option.id }] },
      });
      const optionLineId = `line-choice-${choice.id}-${option.id}-option`;
      lines.push({
        id: optionLineId,
        nodeId: response.id,
        speakerKind: "player",
        speakerBotId: null,
        visibleText: option.text,
        spokenText: option.text,
        performance: performanceDirection({}, "decisive"),
        mode: "player_selected",
        reusableCalloutKey: null,
      });
      options.push({ id: option.id, lineId: optionLineId, responseNodeId: response.id });
    }
    prosecutionChoices.push({ id: choice.id, promptLineId: prompt.lineId!, options });
  }

  const partnerConsult = addLineNode({
    id: "partner-consult-default",
    kind: "partner_consult",
    scene: "investigation",
    text: args.authored.partnerConsultation,
    speakerKind: "bot",
    speakerBotId: args.config.prosecutorPartnerBotId,
  });
  const guiltyNode = addLineNode({
    id: "verdict-guilty",
    kind: "verdict",
    scene: "verdict",
    text: "GUILTY",
    speakerKind: "narrator",
    mode: "text_only",
    terminal: "case_complete",
  });
  const notGuiltyNode = addLineNode({
    id: "verdict-not-guilty",
    kind: "verdict",
    scene: "verdict",
    text: "NOT GUILTY",
    speakerKind: "narrator",
    mode: "text_only",
    terminal: "case_complete",
  });
  const recordReferences: DebateMysteryRecordReferenceV2[] = [
    ...args.authored.evidence.map((evidence) => ({ kind: "evidence" as const, id: evidence.id })),
    ...args.authored.suspects.flatMap((suspect) =>
      suspect.testimony.map((statement) => ({ kind: "testimony" as const, id: statement.id }))),
  ];
  const graph: DebateMysteryDialogueGraphV2 = {
    version: 2,
    caseId: args.sessionId,
    initialDiscoveryIds,
    initialAdmittedRecordIds,
    interactionRootNodeIds: [...new Set(interactionRoots)],
    nodes,
    lines,
    witnessChapters,
    prosecutionChoices,
    talkTopicNodeIdsBySuspect,
    presentNodeIdsBySuspect,
    verdictNodeIds: [guiltyNode.id, notGuiltyNode.id],
  };
  const validation = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: args.scaffold.suspects.map((suspect) => suspect.seatId),
    recordReferences,
    eyewitnessSeatId: args.eyewitnessSeatId,
    accusedAlibiSupportDiscoveryIds: args.alibiSupportDiscoveryIds,
  });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const privateCase: PrivateMysteryCaseV2 = {
    version: 2,
    config: args.config,
    sealedCulpritSeatId: args.scaffold.culpritSeatId,
    sealedAccompliceSeatId: args.scaffold.accompliceSeatId,
    motive: args.authored.motive,
    method: args.authored.method,
    victimDescription: args.authored.victimDescription,
    publicOpening: args.authored.publicOpening,
    eyewitnessSeatId: args.eyewitnessSeatId,
    eyewitnessResolution: args.authored.eyewitnessResolution,
    accusedAlibiSupportDiscoveryIds: args.alibiSupportDiscoveryIds,
    actorAccounts: args.authored.suspects.map((suspect) => ({
      seatId: suspect.seatId,
      relationship: suspect.relationship,
      alibi: suspect.alibi,
    })),
    recordItems: recordReferences.map((reference) => {
      if (reference.kind === "evidence") {
        const evidence = authoredEvidence.get(reference.id)!;
        return { reference, title: evidence.title, description: evidence.description, emoji: evidence.emoji };
      }
      const statement = args.authored.suspects.flatMap((suspect) => suspect.testimony).find((entry) => entry.id === reference.id)!;
      return { reference, title: "Prior sworn testimony", description: statement.text, emoji: "💬" };
    }),
    examineNodeIdByHotspot,
    presentNodeIdBySuspectRecord,
    defaultPresentNodeIdBySuspect,
    partnerConsultNodeId: partnerConsult.id,
    crimeSceneRoomId: args.scaffold.crimeSceneRoomId,
    graphValidation: validation,
  };
  const now = new Date().toISOString();
  const publicState: DebateWhodunnitFormatStateV2 = {
    ...initialV2State(args.config, "pending", now),
    caseTitle: args.authored.title,
    victim: { id: args.scaffold.victim.id, name: args.authored.victimName },
    suspects: args.scaffold.suspects.map(({ roomId: _roomId, ...suspect }) => ({ ...suspect, roomId: _roomId })),
    rooms: args.scaffold.rooms.map((room) => {
      const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === room.templateId)!;
      const activeRegionIds = new Set(
        args.scaffold.activeRegions.filter((outcome) => outcome.roomId === room.id).map((outcome) => outcome.regionId),
      );
      return {
        id: room.id,
        name: template.name,
        floor: room.floor,
        emoji: template.emoji,
        imageId: room.imageId,
        bundledAssetPath: template.bundledAssetPath ?? null,
        unlocked: true,
        visited: room.id === args.scaffold.crimeSceneRoomId,
        hotspots: template.regions.filter((region) => activeRegionIds.has(region.id)).map((region) => ({
          id: region.id,
          label: region.label,
          polygon: region.polygon,
          examined: false,
          unlocked: true,
        })),
      };
    }),
    currentRoomId: args.scaffold.crimeSceneRoomId,
    discoveryIds: initialDiscoveryIds,
    record: publicRecord,
    topics: args.authored.suspects.map((suspect) => {
      const topic = suspect.talkTopics[0]!;
      return {
        nodeId: `talk-${suspect.seatId}-${topic.id}`,
        suspectSeatId: suspect.seatId,
        label: topic.label,
        unlocked: true,
        completed: false,
      };
    }),
    dialogueHistory: [{
      nodeId: openingNode.id,
      lineId: openingNode.lineId,
      visibleText: args.authored.publicOpening,
      speakerSeatId: null,
      occurredAt: now,
    }],
    activeDialogueNodeId: openingNode.id,
  };
  return { graph, privateCase, publicState };
}

function storeCompiledCaseV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  privateCase: PrivateMysteryCaseV2,
  graph: DebateMysteryDialogueGraphV2,
): void {
  const now = new Date().toISOString();
  const privateJson = JSON.stringify(privateCase);
  const graphJson = JSON.stringify(graph);
  db.prepare(
    `INSERT INTO debate_mystery_v2_cases
       (session_id, user_id, schema_version, private_case_json,
        dialogue_graph_json, case_hash, graph_hash, validation_json,
        created_at, updated_at)
     VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       private_case_json = excluded.private_case_json,
       dialogue_graph_json = excluded.dialogue_graph_json,
       case_hash = excluded.case_hash,
       graph_hash = excluded.graph_hash,
       validation_json = excluded.validation_json,
       updated_at = excluded.updated_at
     WHERE debate_mystery_v2_cases.user_id = excluded.user_id`,
  ).run(
    sessionId,
    userId,
    privateJson,
    graphJson,
    sha256(privateJson),
    sha256(graphJson),
    JSON.stringify(privateCase.graphValidation),
    now,
    now,
  );
}

export function getDebateMysteryCaseV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): { privateCase: PrivateMysteryCaseV2; graph: DebateMysteryDialogueGraphV2 } {
  const row = db.prepare(
    `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash
       FROM debate_mystery_v2_cases
      WHERE user_id = ? AND session_id = ?`,
  ).get(userId, sessionId) as {
    private_case_json: string;
    dialogue_graph_json: string;
    case_hash: string;
    graph_hash: string;
  } | undefined;
  if (!row) throw new HttpError(404, "The compiled Whodunnit V2 case is unavailable.");
  if (sha256(row.private_case_json) !== row.case_hash || sha256(row.dialogue_graph_json) !== row.graph_hash) {
    throw new HttpError(409, "The compiled Whodunnit V2 case failed its integrity check.");
  }
  return {
    privateCase: JSON.parse(row.private_case_json) as PrivateMysteryCaseV2,
    graph: JSON.parse(row.dialogue_graph_json) as DebateMysteryDialogueGraphV2,
  };
}

function audioProfileForLine(
  line: DebateMysterySpokenLineV2,
  botById: ReadonlyMap<string, MysteryV2BotRow>,
): BotAudioVoiceProfileV1 {
  const bot = line.speakerBotId ? botById.get(line.speakerBotId) : null;
  return normalizeBotAudioVoiceProfileV1(
    parseStoredBotAudioVoiceProfileV1(
      bot?.audio_voice_profile_override ?? bot?.authored_audio_voice_profile,
    ) ?? DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  );
}

function audioCacheRelativePath(userId: string, cacheKey: string): string {
  return `${V2_AUDIO_SUBDIR}/${sha256(userId).slice(0, 24)}/cache/${cacheKey}.wav`;
}

function reclaimExpiredAudioStagingFiles(userId: string, now = Date.now()): number {
  const directory = resolveAbsoluteUnderDataRoot(
    `${V2_AUDIO_SUBDIR}/${sha256(userId).slice(0, 24)}/cache`,
  );
  if (!existsSync(directory)) return 0;
  let reclaimed = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".staging")) continue;
    const absolutePath = `${directory}/${entry.name}`;
    try {
      if (now - statSync(absolutePath).mtimeMs < V2_STAGING_RECLAIM_AGE_MS) continue;
      unlinkSync(absolutePath);
      reclaimed += 1;
    } catch {
      // A live writer may have promoted or removed the staging file.
    }
  }
  return reclaimed;
}

function writeAudioAtomically(relativePath: string, bytes: Uint8Array): void {
  const absolutePath = resolveAbsoluteUnderDataRoot(relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${randomUUID()}.staging`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function audioFileValid(entry: Pick<DebateMysteryAudioManifestEntryV1, "clipPath" | "sha256" | "byteSize">): boolean {
  try {
    const absolutePath = resolveAbsoluteUnderDataRoot(entry.clipPath);
    if (!existsSync(absolutePath) || statSync(absolutePath).size !== entry.byteSize) return false;
    const bytes = readFileSync(absolutePath);
    return sha256(bytes) === entry.sha256 && isPlayablePcmWave(bytes);
  } catch {
    return false;
  }
}

function attachAudioReference(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  lineId: string,
  cacheKey: string,
): void {
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db.prepare(
      `INSERT OR IGNORE INTO debate_mystery_audio_refs
         (session_id, user_id, line_id, cache_key, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, userId, lineId, cacheKey, now);
    if (Number(inserted.changes) === 1) {
      db.prepare(
        `UPDATE debate_mystery_audio_cache
            SET ref_count = ref_count + 1, last_used_at = ?
          WHERE cache_key = ? AND user_id = ?`,
      ).run(now, cacheKey, userId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function loadAudioManifest(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysteryAudioManifestV1 | null {
  const row = db.prepare(
    "SELECT manifest_json FROM debate_mystery_audio_manifests WHERE user_id = ? AND session_id = ?",
  ).get(userId, sessionId) as { manifest_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.manifest_json) as DebateMysteryAudioManifestV1;
  } catch {
    return null;
  }
}

function storeAudioManifest(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  manifest: DebateMysteryAudioManifestV1,
  status: "preparing" | "complete" | "failed" | "silent",
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO debate_mystery_audio_manifests
       (session_id, user_id, status, manifest_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       status = excluded.status,
       manifest_json = excluded.manifest_json,
       updated_at = excluded.updated_at
     WHERE debate_mystery_audio_manifests.user_id = excluded.user_id`,
  ).run(sessionId, userId, status, JSON.stringify(manifest), now, now);
}

async function prepareLocalAudioPackV2(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  botRows: MysteryV2BotRow[];
  generateWave?: typeof generateBuiltinEnglishWave;
}): Promise<DebateMysteryAudioManifestV1> {
  const reachableLineIds = args.privateCase.graphValidation.reachableSpokenLineIds;
  const lineById = new Map(args.graph.lines.map((line) => [line.id, line]));
  const botById = new Map(args.botRows.map((bot) => [bot.id, bot]));
  const graphJson = JSON.stringify(args.graph);
  const privateJson = JSON.stringify(args.privateCase);
  const scriptHash = sha256(
    reachableLineIds.map((id) => {
      const line = lineById.get(id)!;
      return `${line.id}\u0000${line.spokenText}\u0000${JSON.stringify(line.performance)}`;
    }).join("\u0001"),
  );
  const previous = loadAudioManifest(args.db, args.userId, args.sessionId);
  const reusableEntries = new Map(
    previous?.entries.filter((entry) => audioFileValid(entry)).map((entry) => [entry.lineId, entry]) ?? [],
  );
  const manifest: DebateMysteryAudioManifestV1 = {
    version: 1,
    caseId: args.sessionId,
    caseHash: sha256(privateJson),
    scriptHash,
    dialogueGraphHash: sha256(graphJson),
    engine: "prism-instant-local",
    model: PRISM_INSTANT_VOICE_MODEL_ID,
    modelVersion: "q8-pinned-1",
    entries: [],
    complete: false,
    completedAt: null,
    verifiedAt: null,
  };
  updateJob(args.db, args.userId, args.sessionId, {
    requiredAudioCount: reachableLineIds.length,
    preparedAudioCount: reusableEntries.size,
  });
  for (const [index, lineId] of reachableLineIds.entries()) {
    const job = jobRow(args.db, args.userId, args.sessionId);
    if (job.cancellation_requested === 1) throw new DOMException("Cancelled", "AbortError");
    const line = lineById.get(lineId);
    if (!line) throw new Error(`Reachable line ${lineId} disappeared before audio preparation.`);
    const profile = audioProfileForLine(line, botById);
    const textHash = sha256(line.spokenText);
    const voiceProfileHash = sha256(JSON.stringify(profile));
    const performanceDirectionHash = sha256(JSON.stringify(line.performance));
    const cacheKey = sha256(JSON.stringify({
      textHash,
      botId: line.speakerBotId,
      voiceProfileHash,
      model: PRISM_INSTANT_VOICE_MODEL_ID,
      performanceDirectionHash,
    }));
    const reusable = reusableEntries.get(lineId);
    if (
      reusable &&
      reusable.textHash === textHash &&
      reusable.voiceProfileHash === voiceProfileHash &&
      reusable.performanceDirectionHash === performanceDirectionHash
    ) {
      manifest.entries.push(reusable);
      attachAudioReference(args.db, args.userId, args.sessionId, lineId, cacheKey);
      continue;
    }
    const cached = args.db.prepare(
      `SELECT clip_path, mime_type, sha256, byte_size, duration_ms, ref_count
         FROM debate_mystery_audio_cache
        WHERE cache_key = ? AND user_id = ?`,
    ).get(cacheKey, args.userId) as {
      clip_path: string;
      mime_type: string;
      sha256: string;
      byte_size: number;
      duration_ms: number;
      ref_count: number;
    } | undefined;
    let clipPath: string;
    let clipHash: string;
    let byteSize: number;
    let durationMs: number;
    if (cached && audioFileValid({
      clipPath: cached.clip_path,
      sha256: cached.sha256,
      byteSize: cached.byte_size,
    })) {
      clipPath = cached.clip_path;
      clipHash = cached.sha256;
      byteSize = cached.byte_size;
      durationMs = cached.duration_ms;
    } else {
      if (cached?.ref_count) {
        throw new Error("A referenced local Whodunnit audio clip failed integrity verification.");
      }
      if (cached) {
        args.db.prepare(
          "DELETE FROM debate_mystery_audio_cache WHERE cache_key = ? AND user_id = ? AND ref_count = 0",
        ).run(cacheKey, args.userId);
      }
      const wave = await (args.generateWave ?? generateBuiltinEnglishWave)({
        text: line.spokenText,
        profile,
        allowOperatingSystemVoices: false,
        deliveryMood: line.performance.mood,
      });
      if (!isPlayablePcmWave(wave)) throw new Error(`Local voice line ${lineId} is not playable.`);
      durationMs = pcmWaveDurationMs(wave) ?? 0;
      if (durationMs <= 0) throw new Error(`Local voice line ${lineId} has no measurable duration.`);
      clipHash = sha256(wave);
      byteSize = wave.byteLength;
      clipPath = audioCacheRelativePath(args.userId, cacheKey);
      writeAudioAtomically(clipPath, wave);
      if (!audioFileValid({ clipPath, sha256: clipHash, byteSize })) {
        throw new Error(`Local voice line ${lineId} failed its post-write integrity check.`);
      }
      const now = new Date().toISOString();
      args.db.prepare(
        `INSERT INTO debate_mystery_audio_cache
           (cache_key, user_id, clip_path, mime_type, sha256, byte_size,
            duration_ms, ref_count, created_at, last_used_at)
         VALUES (?, ?, ?, 'audio/wav', ?, ?, ?, 0, ?, ?)`,
      ).run(cacheKey, args.userId, clipPath, clipHash, byteSize, durationMs, now, now);
    }
    const entry: DebateMysteryAudioManifestEntryV1 = {
      lineId,
      textHash,
      botId: line.speakerBotId,
      voiceProfileHash,
      performanceDirectionHash,
      clipPath,
      mimeType: "audio/wav",
      durationMs,
      byteSize,
      sha256: clipHash,
      alignment: null,
      reusableCalloutKey: line.reusableCalloutKey,
      verifiedAt: new Date().toISOString(),
    };
    manifest.entries.push(entry);
    attachAudioReference(args.db, args.userId, args.sessionId, lineId, cacheKey);
    storeAudioManifest(args.db, args.userId, args.sessionId, manifest, "preparing");
    updateJob(args.db, args.userId, args.sessionId, {
      preparedAudioCount: index + 1,
      requiredAudioCount: reachableLineIds.length,
    });
  }
  manifest.complete = true;
  manifest.completedAt = new Date().toISOString();
  manifest.verifiedAt = manifest.completedAt;
  const validation = validateDebateMysteryAudioManifestV1({
    graph: args.graph,
    manifest,
    reachableSpokenLineIds: reachableLineIds,
  });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  storeAudioManifest(args.db, args.userId, args.sessionId, manifest, "complete");
  return manifest;
}

function claimCompilationJob(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): { row: MysteryV2JobRow; owner: string } | null {
  const current = jobRow(db, userId, sessionId);
  if (current.status === "complete" || current.status === "cancelled") return null;
  reclaimExpiredAudioStagingFiles(userId);
  const now = new Date();
  const stale = !current.leased_until || Date.parse(current.leased_until) <= now.getTime();
  if (current.status === "running" && !stale) return null;
  if (current.status === "needs_attention") return null;
  const owner = randomUUID();
  const leasedUntil = new Date(now.getTime() + V2_JOB_LEASE_MS).toISOString();
  const result = db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET status = 'running', attempt = attempt + 1, lease_owner = ?,
            leased_until = ?, private_error = NULL, updated_at = ?
      WHERE user_id = ? AND session_id = ?
        AND status IN ('queued', 'running')
        AND (leased_until IS NULL OR leased_until <= ?)`,
  ).run(owner, leasedUntil, now.toISOString(), userId, sessionId, now.toISOString());
  return Number(result.changes) === 1
    ? { row: jobRow(db, userId, sessionId), owner }
    : null;
}

function renewCompilationLease(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  owner: string,
): boolean {
  const now = new Date();
  const result = db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET leased_until = ?, updated_at = ?
      WHERE user_id = ? AND session_id = ? AND status = 'running'
        AND lease_owner = ?`,
  ).run(
    new Date(now.getTime() + V2_JOB_LEASE_MS).toISOString(),
    now.toISOString(),
    userId,
    sessionId,
    owner,
  );
  return Number(result.changes) === 1;
}

function deterministicEyewitnessSeat(
  caseSeed: string,
  chance: number,
  culpritSeatId: string,
  suspects: readonly { seatId: string }[],
): string | null {
  const roll = Number.parseInt(sha256(`${caseSeed}:eyewitness`).slice(0, 8), 16) / 0xffffffff;
  if (roll >= chance) return null;
  return suspects.find((suspect) => suspect.seatId !== culpritSeatId)?.seatId ?? null;
}

function compilationFailure(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  error: unknown,
  localAudioFailure = false,
): void {
  const message = localAudioFailure
    ? "Local voice preparation needs attention"
    : V2_SPOILER_SAFE_MESSAGES.needs_attention;
  const row = updateJob(db, userId, sessionId, {
    stage: "needs_attention",
    status: "needs_attention",
    publicMessage: message,
    privateError: error instanceof Error ? error.message.slice(0, 8_000) : "Unknown compilation failure",
    clearLease: true,
  });
  try {
    setPublicCompilationStatus(db, userId, sessionId, row, {
      ...(localAudioFailure
        ? { localAudioFailure: "The complete text case is safe. Retry local preparation or continue without voices." }
        : {}),
    });
  } catch {
    // The durable job remains the recovery source if a concurrent session update won.
  }
}

export async function runDebateMysteryCompilationV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  runtime: DebateAiRuntime,
  options: { generateWave?: typeof generateBuiltinEnglishWave } = {},
): Promise<DebateSessionV1> {
  const claimed = claimCompilationJob(db, userId, sessionId);
  if (!claimed) return getDebateSession(db, userId, sessionId);
  let localAudioStage = false;
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    try {
      leaseLost = !renewCompilationLease(db, userId, sessionId, claimed.owner);
    } catch {
      leaseLost = true;
    }
  }, Math.floor(V2_JOB_LEASE_MS / 3));
  heartbeat.unref();
  const requireLease = (): void => {
    if (leaseLost || !renewCompilationLease(db, userId, sessionId, claimed.owner)) {
      leaseLost = true;
      throw new Error("The durable compilation lease moved to another worker.");
    }
  };
  try {
    let currentJob = claimed.row;
    setPublicCompilationStatus(db, userId, sessionId, currentJob);
    const session = getDebateSession(db, userId, sessionId);
    if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
      throw new Error("The durable V2 job no longer owns a V2 public session.");
    }
    const config = session.formatState.config;
    const castIds = [
      ...config.suspectBotIds,
      config.judgeBotId,
      config.prosecutorPartnerBotId,
      config.rivalDefenseBotId,
      ...config.jurorBotIds,
    ];
    const bots = botRows(db, userId, castIds);
    let checkpoint: MysteryV2Checkpoint | null = currentJob.checkpoint_json
      ? JSON.parse(currentJob.checkpoint_json) as MysteryV2Checkpoint
      : null;
    if (!checkpoint) {
      const suspectRows = config.suspectBotIds.map((id) => {
        const bot = bots.find((entry) => entry.id === id);
        if (!bot) throw new Error("A frozen suspect is no longer available.");
        return bot;
      });
      const scaffold = compileDeterministicDebateMystery({
        config: v1ScaffoldConfig(config),
        suspects: suspectRows.map((bot) => ({
          botId: bot.id,
          exportHash: bot.export_hash,
          name: bot.name,
          color: bot.color,
          glyph: bot.glyph,
        })),
      });
      const scaffoldValidation = validateDebateMysteryCaseBible(scaffold, 10_000);
      if (!scaffoldValidation.valid) throw new Error(scaffoldValidation.errors.join("\n"));
      const examinationIds = scaffold.activeRegions.map((outcome) => `${outcome.roomId}:${outcome.regionId}`);
      const eyewitnessSeatId = deterministicEyewitnessSeat(
        scaffold.caseSeed,
        config.eyewitnessChance,
        scaffold.culpritSeatId,
        scaffold.suspects,
      );
      const alibiSupportDiscoveryIds = eyewitnessSeatId
        ? examinationIds.slice(0, 2).map((id) => `hotspot:${id}`)
        : [];
      if (eyewitnessSeatId && alibiSupportDiscoveryIds.length < 2) {
        throw new Error("The frozen eyewitness case cannot support two independent alibi discoveries.");
      }
      const evidenceRefs = scaffold.evidence.map((evidence) => ({ kind: "evidence" as const, id: evidence.id }));
      if (!evidenceRefs.length) throw new Error("The frozen case has no admissible physical record.");
      const contradictionBySeat = new Map<string, DebateMysteryRecordReferenceV2>();
      scaffold.suspects.forEach((suspect, index) => {
        const previous = scaffold.suspects[index - 1];
        contradictionBySeat.set(
          suspect.seatId,
          index > 0 && index % 2 === 1 && previous
            ? { kind: "testimony", id: `statement-${previous.seatId}-2` }
            : evidenceRefs[index % evidenceRefs.length]!,
        );
      });
      let authored: AuthoredMysteryV2 | null = null;
      let lastErrors: string[] = [];
      for (let attempt = 0; attempt < V2_MAX_AUTHOR_ATTEMPTS && !authored; attempt += 1) {
        try {
          authored = await authorMysteryV2({
            runtime,
            config,
            scaffold,
            bots,
            eyewitnessSeatId,
            examinationIds,
            requiredContradictionBySeat: contradictionBySeat,
            priorErrors: lastErrors,
          });
          requireLease();
          checkpoint = buildMysteryV2Graph({
            sessionId,
            config,
            scaffold,
            authored,
            eyewitnessSeatId,
            alibiSupportDiscoveryIds,
            contradictionBySeat,
          });
        } catch (error) {
          lastErrors = [error instanceof Error ? (error.stack ?? error.message) : "Unknown authoring error"].slice(0, 12);
          authored = null;
        }
      }
      if (!checkpoint) throw new Error(`The case author could not satisfy validation. ${lastErrors.join(" ")}`);
      requireLease();
      storeCompiledCaseV2(db, userId, sessionId, checkpoint.privateCase, checkpoint.graph);
      currentJob = updateJob(db, userId, sessionId, {
        stage: "testing_contradictions",
        completedPasses: 1,
        checkpointJson: JSON.stringify(checkpoint),
      });
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
      const revalidated = validateDebateMysteryDialogueGraphV2({
        graph: checkpoint.graph,
        suspectSeatIds: checkpoint.publicState.suspects.map((suspect) => suspect.seatId),
        recordReferences: checkpoint.privateCase.recordItems.map((item) => item.reference),
        eyewitnessSeatId: checkpoint.privateCase.eyewitnessSeatId,
        accusedAlibiSupportDiscoveryIds: checkpoint.privateCase.accusedAlibiSupportDiscoveryIds,
      });
      if (!revalidated.valid) throw new Error(revalidated.errors.join("\n"));
      currentJob = updateJob(db, userId, sessionId, {
        stage: "directing_performances",
        completedPasses: 2,
      });
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
      for (const line of checkpoint.graph.lines) {
        if (
          !line.performance.mood.trim() ||
          !line.performance.actorNote.trim() ||
          !Number.isInteger(line.performance.intensity)
        ) throw new Error(`Line ${line.id} has incomplete performance direction.`);
      }
    }
    localAudioStage = true;
    currentJob = updateJob(db, userId, sessionId, {
      stage: "preparing_local_voices",
      completedPasses: 3,
    });
    setPublicCompilationStatus(db, userId, sessionId, currentJob);
    await prepareLocalAudioPackV2({
      db,
      userId,
      sessionId,
      graph: checkpoint.graph,
      privateCase: checkpoint.privateCase,
      botRows: bots,
      generateWave: options.generateWave,
    });
    requireLease();
    currentJob = updateJob(db, userId, sessionId, {
      stage: "verifying_case_audio",
      completedPasses: 4,
    });
    setPublicCompilationStatus(db, userId, sessionId, currentJob);
    const manifest = loadAudioManifest(db, userId, sessionId);
    if (!manifest) throw new Error("The local audio manifest disappeared before final verification.");
    const audioValidation = validateDebateMysteryAudioManifestV1({
      graph: checkpoint.graph,
      manifest,
      reachableSpokenLineIds: checkpoint.privateCase.graphValidation.reachableSpokenLineIds,
    });
    if (!audioValidation.valid) throw new Error(audioValidation.errors.join("\n"));
    if (leaseLost) throw new Error("The durable compilation lease moved to another worker.");
    currentJob = updateJob(db, userId, sessionId, {
      stage: "complete",
      status: "complete",
      completedPasses: 5,
      preparedAudioCount: manifest.entries.length,
      requiredAudioCount: manifest.entries.length,
      privateError: null,
      clearLease: true,
    });
    return setPublicCompilationStatus(db, userId, sessionId, currentJob, {
      ...checkpoint.publicState,
      compilation: compilationStatus(currentJob),
      playPhase: "title_card",
      caseTitle: checkpoint.publicState.caseTitle,
      audioReady: true,
      voicesEnabled: true,
      localAudioFailure: null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const row = updateJob(db, userId, sessionId, {
        stage: "cancelled",
        status: "cancelled",
        publicMessage: V2_SPOILER_SAFE_MESSAGES.cancelled,
        privateError: null,
        clearLease: true,
      });
      return setPublicCompilationStatus(db, userId, sessionId, row);
    }
    if (!leaseLost && jobRow(db, userId, sessionId).lease_owner === claimed.owner) {
      compilationFailure(db, userId, sessionId, error, localAudioStage);
    }
    return getDebateSession(db, userId, sessionId);
  } finally {
    clearInterval(heartbeat);
  }
}

export async function retryDebateMysteryCompilationV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  runtime: DebateAiRuntime,
  options: {
    generateWave?: typeof generateBuiltinEnglishWave;
    deferBackgroundStart?: boolean;
  } = {},
): Promise<DebateSessionV1> {
  const row = jobRow(db, userId, sessionId);
  if (row.status === "complete") return getDebateSession(db, userId, sessionId);
  if (row.status === "cancelled") throw new HttpError(409, "Cancelled case preparation cannot be retried.");
  if (row.status === "queued" || row.status === "running") {
    return getDebateSession(db, userId, sessionId);
  }
  db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET status = 'queued', stage = CASE WHEN checkpoint_json IS NULL
          THEN 'writing_case' ELSE 'preparing_local_voices' END,
            public_message = CASE WHEN checkpoint_json IS NULL
          THEN ? ELSE ? END,
            private_error = NULL, lease_owner = NULL, leased_until = NULL,
            cancellation_requested = 0, updated_at = ?
      WHERE user_id = ? AND session_id = ?`,
  ).run(
    V2_SPOILER_SAFE_MESSAGES.writing_case,
    V2_SPOILER_SAFE_MESSAGES.preparing_local_voices,
    new Date().toISOString(),
    userId,
    sessionId,
  );
  const queued = setPublicCompilationStatus(
    db,
    userId,
    sessionId,
    jobRow(db, userId, sessionId),
  );
  if (!options.deferBackgroundStart) {
    queueMicrotask(() => {
      void runDebateMysteryCompilationV2(db, userId, sessionId, runtime, {
        generateWave: options.generateWave,
      }).catch(() => {
        // The durable job records its spoiler-safe failure state.
      });
    });
  }
  return queued;
}

export function cancelDebateMysteryCompilationV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysteryCompilationStatusV2 {
  const row = jobRow(db, userId, sessionId);
  if (row.status === "complete") throw new HttpError(409, "A completed case cannot be cancelled.");
  if (row.status === "cancelled") return compilationStatus(row);
  db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET cancellation_requested = 1,
            status = CASE WHEN status = 'running' THEN status ELSE 'cancelled' END,
            stage = CASE WHEN status = 'running' THEN stage ELSE 'cancelled' END,
            public_message = CASE WHEN status = 'running' THEN public_message ELSE ? END,
            updated_at = ?
      WHERE user_id = ? AND session_id = ?`,
  ).run(V2_SPOILER_SAFE_MESSAGES.cancelled, new Date().toISOString(), userId, sessionId);
  return compilationStatus(jobRow(db, userId, sessionId));
}

export function continueDebateMysteryV2WithoutVoices(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateSessionV1 {
  const row = jobRow(db, userId, sessionId);
  if (row.status === "complete") {
    const completed = getDebateSession(db, userId, sessionId);
    if (
      completed.formatState.format === "whodunnit" &&
      completed.formatState.version === 2 &&
      !completed.formatState.voicesEnabled
    ) return completed;
  }
  if (!row.checkpoint_json) throw new HttpError(409, "The validated text case is not ready.");
  if (row.status !== "needs_attention") throw new HttpError(409, "Silent continuation is only available after local voice preparation fails.");
  const checkpoint = JSON.parse(row.checkpoint_json) as MysteryV2Checkpoint;
  const emptyManifest: DebateMysteryAudioManifestV1 = {
    version: 1,
    caseId: sessionId,
    caseHash: sha256(JSON.stringify(checkpoint.privateCase)),
    scriptHash: sha256("silent"),
    dialogueGraphHash: sha256(JSON.stringify(checkpoint.graph)),
    engine: "prism-instant-local",
    model: PRISM_INSTANT_VOICE_MODEL_ID,
    modelVersion: "q8-pinned-1",
    entries: [],
    complete: false,
    completedAt: null,
    verifiedAt: null,
  };
  storeAudioManifest(db, userId, sessionId, emptyManifest, "silent");
  const complete = updateJob(db, userId, sessionId, {
    stage: "complete",
    status: "complete",
    completedPasses: 5,
    publicMessage: "Your text case is ready",
    privateError: null,
    clearLease: true,
  });
  return setPublicCompilationStatus(db, userId, sessionId, complete, {
    ...checkpoint.publicState,
    compilation: compilationStatus(complete),
    playPhase: "title_card",
    audioReady: false,
    voicesEnabled: false,
    localAudioFailure: null,
  });
}

export function getDebateMysteryAudioClipV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  lineId: string,
): { absolutePath: string; mimeType: string; byteSize: number } {
  const manifest = loadAudioManifest(db, userId, sessionId);
  const entry = manifest?.entries.find((candidate) => candidate.lineId === lineId);
  if (!entry || !audioFileValid(entry)) throw new HttpError(404, "Prepared case audio not found.");
  const owned = db.prepare(
    `SELECT 1 AS owned
       FROM debate_mystery_audio_refs
      WHERE user_id = ? AND session_id = ? AND line_id = ?`,
  ).get(userId, sessionId, lineId) as { owned?: number } | undefined;
  if (!owned) throw new HttpError(404, "Prepared case audio not found.");
  return {
    absolutePath: resolveAbsoluteUnderDataRoot(entry.clipPath),
    mimeType: entry.mimeType,
    byteSize: entry.byteSize,
  };
}

export interface DebateMysteryAudioStorageSummaryV2 {
  referencedClipCount: number;
  referencedBytes: number;
  cleanupCandidateCount: number;
  cleanupCandidateBytes: number;
}

export function getDebateMysteryAudioStorageSummaryV2(
  db: DatabaseSync,
  userId: string,
): DebateMysteryAudioStorageSummaryV2 {
  const rows = db.prepare(
    `SELECT CASE WHEN ref_count > 0 THEN 'referenced' ELSE 'unreferenced' END AS lifecycle,
            COUNT(*) AS clip_count,
            COALESCE(SUM(byte_size), 0) AS byte_size
       FROM debate_mystery_audio_cache
      WHERE user_id = ?
      GROUP BY CASE WHEN ref_count > 0 THEN 'referenced' ELSE 'unreferenced' END`,
  ).all(userId) as Array<{ lifecycle: "referenced" | "unreferenced"; clip_count: number; byte_size: number }>;
  const referenced = rows.find((row) => row.lifecycle === "referenced");
  const unreferenced = rows.find((row) => row.lifecycle === "unreferenced");
  return {
    referencedClipCount: referenced?.clip_count ?? 0,
    referencedBytes: referenced?.byte_size ?? 0,
    cleanupCandidateCount: unreferenced?.clip_count ?? 0,
    cleanupCandidateBytes: unreferenced?.byte_size ?? 0,
  };
}

export function cleanupUnreferencedDebateMysteryAudioV2(
  db: DatabaseSync,
  userId: string,
): { removedClipCount: number; removedBytes: number; remaining: DebateMysteryAudioStorageSummaryV2 } {
  const candidates = db.prepare(
    `SELECT cache_key, clip_path, byte_size
       FROM debate_mystery_audio_cache
      WHERE user_id = ? AND ref_count = 0`,
  ).all(userId) as Array<{ cache_key: string; clip_path: string; byte_size: number }>;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const candidate of candidates) {
      db.prepare(
        "DELETE FROM debate_mystery_audio_cache WHERE user_id = ? AND cache_key = ? AND ref_count = 0",
      ).run(userId, candidate.cache_key);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  for (const candidate of candidates) {
    try {
      const absolutePath = resolveAbsoluteUnderDataRoot(candidate.clip_path);
      if (existsSync(absolutePath)) unlinkSync(absolutePath);
    } catch {
      // The database no longer references this file; a later storage sweep can reclaim it.
    }
  }
  return {
    removedClipCount: candidates.length,
    removedBytes: candidates.reduce((total, candidate) => total + candidate.byte_size, 0),
    remaining: getDebateMysteryAudioStorageSummaryV2(db, userId),
  };
}

function mysteryRecordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
}

function replayV2Mutation(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  key: string,
): DebateSessionV1 | null {
  const row = db.prepare(
    `SELECT response_json
       FROM debate_mutations
      WHERE user_id = ? AND session_id = ? AND idempotency_key = ?`,
  ).get(userId, sessionId, key) as { response_json?: string } | undefined;
  return row?.response_json ? JSON.parse(row.response_json) as DebateSessionV1 : null;
}

function appendV2Action(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  action: string,
  payload: Record<string, unknown>,
): void {
  const row = db.prepare(
    "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM debate_mystery_actions WHERE user_id = ? AND session_id = ?",
  ).get(userId, sessionId) as { sequence: number };
  db.prepare(
    `INSERT INTO debate_mystery_actions
       (id, user_id, session_id, sequence, action_kind, public_payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    sessionId,
    row.sequence,
    action,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

function executeDialogueNodeV2(args: {
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  nodeId: string;
  choices?: ReadonlyMap<string, string>;
}): DebateWhodunnitFormatStateV2 {
  const node = args.graph.nodes.find((entry) => entry.id === args.nodeId);
  if (!node) throw new HttpError(409, "The authored dialogue branch is unavailable.");
  const recordKeys = new Set(args.state.record.filter((item) => item.admitted).map((item) => mysteryRecordKey(item.reference)));
  const unlockedTopicIds = new Set(args.state.topics.filter((topic) => topic.unlocked).map((topic) => topic.nodeId));
  if (
    !node.requirements.discoveryIds.every((id) => args.state.discoveryIds.includes(id)) ||
    !node.requirements.unlockedTopicIds.every((id) => unlockedTopicIds.has(id)) ||
    !node.requirements.admittedRecordIds.every((id) => recordKeys.has(id)) ||
    !node.requirements.choices.every((choice) => args.choices?.get(choice.choiceId) === choice.optionId)
  ) {
    throw new HttpError(409, "That authored dialogue branch has not unlocked yet.");
  }
  const line = node.lineId ? args.graph.lines.find((entry) => entry.id === node.lineId) : null;
  const now = new Date().toISOString();
  const discoveryIds = [...new Set([...args.state.discoveryIds, ...node.mutations.discoverIds])];
  const record = [...args.state.record];
  for (const key of node.mutations.admitRecordIds) {
    const item = args.privateCase.recordItems.find((candidate) => mysteryRecordKey(candidate.reference) === key);
    if (!item || record.some((candidate) => mysteryRecordKey(candidate.reference) === key)) continue;
    record.push({ ...item, admitted: true, updatedAt: now });
  }
  const topics = args.state.topics.map((topic) => ({ ...topic }));
  for (const topicNodeId of node.mutations.unlockTopicIds) {
    if (topics.some((topic) => topic.nodeId === topicNodeId)) continue;
    const topicNode = args.graph.nodes.find((candidate) => candidate.id === topicNodeId);
    if (!topicNode?.label || !topicNode.speakerSeatId) continue;
    topics.push({
      nodeId: topicNode.id,
      suspectSeatId: topicNode.speakerSeatId,
      label: topicNode.label,
      unlocked: true,
      completed: false,
    });
  }
  return {
    ...args.state,
    discoveryIds,
    record,
    topics,
    activeDialogueNodeId: node.id,
    dialogueHistory: line
      ? [...args.state.dialogueHistory, {
          nodeId: node.id,
          lineId: line.id,
          visibleText: line.visibleText,
          speakerSeatId: node.speakerSeatId,
          occurredAt: now,
        }]
      : args.state.dialogueHistory,
  };
}

function addCallouts(
  state: DebateWhodunnitFormatStateV2,
  callouts: Array<DebateWhodunnitFormatStateV2["calloutHistory"][number]["callout"]>,
  actorColor: string | null,
): DebateWhodunnitFormatStateV2 {
  const now = new Date().toISOString();
  const additions = callouts.map((callout) => ({
    id: randomUUID(),
    callout,
    actorColor,
    occurredAt: now,
  }));
  return {
    ...state,
    calloutHistory: [...state.calloutHistory, ...additions],
    pendingCallout: additions.at(-1)
      ? {
          id: additions.at(-1)!.id,
          callout: additions.at(-1)!.callout,
          actorColor: additions.at(-1)!.actorColor,
        }
      : state.pendingCallout,
  };
}

function publicStatementsForChapter(
  graph: DebateMysteryDialogueGraphV2,
  chapter: DebateMysteryWitnessChapterV2,
): DebateWhodunnitFormatStateV2["court"] extends infer Court
  ? Court extends { statements: infer Statements } ? Statements : never
  : never {
  return chapter.initialStatementIds.map((statementId) => {
    const version = chapter.statementVersions.find((entry) => entry.statementId === statementId && entry.version === 1)!;
    const line = graph.lines.find((entry) => entry.id === version.lineId)!;
    return {
      statementId,
      versionId: version.id,
      witnessSeatId: chapter.witnessSeatId,
      version: version.version,
      lineId: line.id,
      visibleText: line.visibleText,
      pressed: false,
    };
  });
}

function enterWitnessChapterV2(args: {
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  chapter: DebateMysteryWitnessChapterV2;
}): DebateWhodunnitFormatStateV2 {
  const credibilityMaximum = debateMysteryCredibilityMaximumV2(args.state.config.difficulty);
  let next: DebateWhodunnitFormatStateV2 = {
    ...args.state,
    playPhase: "trial",
    pendingProsecutionChoice: null,
    court: {
      witnessOrder: [...args.graph.witnessChapters].sort((a, b) => a.ordinal - b.ordinal).map((chapter) => chapter.id),
      completedChapterIds: args.state.court?.completedChapterIds ?? [],
      activeChapterId: args.chapter.id,
      activeStatementId: args.chapter.initialStatementIds[0] ?? null,
      statements: publicStatementsForChapter(args.graph, args.chapter),
      credibilityRemaining: args.state.court?.credibilityRemaining ?? credibilityMaximum,
      credibilityMaximum,
      checkpoint: null,
    },
  };
  next = executeDialogueNodeV2({
    state: next,
    graph: args.graph,
    privateCase: args.privateCase,
    nodeId: args.chapter.checkpointNodeId,
  });
  const snapshot = { ...next, court: next.court ? { ...next.court, checkpoint: null } : null };
  return {
    ...next,
    court: next.court ? {
      ...next.court,
      checkpoint: {
        chapterId: args.chapter.id,
        publicStateJson: JSON.stringify(snapshot),
        createdAt: new Date().toISOString(),
      },
    } : null,
  };
}

function jurorVerdictV2(args: {
  session: DebateSessionV1;
  state: DebateWhodunnitFormatStateV2;
  privateCase: PrivateMysteryCaseV2;
  proofEstablished: boolean;
}): DebateMysteryVerdictV2 {
  const accusedSeatId = args.state.theory?.culpritSeatId ?? null;
  const accused = args.state.suspects.find((suspect) => suspect.seatId === accusedSeatId);
  const accusedIsCulprit = accusedSeatId === args.privateCase.sealedCulpritSeatId;
  const ballots = args.state.config.trialType === "jury"
    ? args.session.jury.jurors.map((juror) => {
        const predisposition = args.session.voterPredispositions?.find((entry) => entry.voterBotId === juror.id);
        const personaNoise = (Number.parseInt(sha256(`${args.session.id}:${juror.id}:verdict`).slice(0, 8), 16) / 0xffffffff - 0.5) * 0.35;
        const bias = Math.max(-1, Math.min(1, predisposition?.participantBias ?? 0));
        let score = (args.proofEstablished ? 0.65 : -0.45) + bias * 0.6 + personaNoise;
        let powerAffected = false;
        const effects = args.session.powerPlan.bots[juror.id]?.effects.map((entry) => entry.effect) ?? [];
        for (const effect of botPowerChromaticBiasEffectsFromEffectsV1(effects)) {
          const hue = botPowerChromaticBiasResolvedHueV1(effect, juror.color);
          if (hue === null || !accused || !botPowerChromaticBiasColorMatchesV1(hue, accused.color, effect.matchBandDeg)) continue;
          score = effect.polarity === "hate" ? 1 : -1;
          powerAffected = true;
        }
        const vote = score >= 0 ? "guilty" as const : "not_guilty" as const;
        return {
          jurorBotId: juror.id,
          vote,
          reason: powerAffected
            ? "A shared Power overrode this juror's ordinary proof assessment."
            : predisposition?.rationale || (vote === "guilty" ? "The admitted contradictions proved the charge." : "The prosecution did not eliminate reasonable doubt."),
          powerAffected,
        };
      })
    : [];
  const guiltyVotes = ballots.filter((ballot) => ballot.vote === "guilty").length;
  const legalResult = args.state.config.trialType === "bench"
    ? args.proofEstablished ? "guilty" as const : "not_guilty" as const
    : guiltyVotes >= 3 ? "guilty" as const : "not_guilty" as const;
  const proofSafe = args.proofEstablished && (args.state.theory?.evidenceIds.length ?? 0) > 0;
  return {
    legalResult,
    classification: debateMysteryClassifyVerdictV2({
      legalResult,
      accusedIsCulprit,
      proofEstablished: args.proofEstablished,
      proofSafe,
    }),
    sealedCulpritCorrect: accusedIsCulprit,
    proofGrade: args.proofEstablished ? proofSafe ? "proved" : "unsafe" : "failed",
    jurorBallots: ballots,
    deliveredAt: new Date().toISOString(),
  };
}

function finalizeCourtV2(args: {
  session: DebateSessionV1;
  state: DebateWhodunnitFormatStateV2;
  privateCase: PrivateMysteryCaseV2;
  proofEstablished: boolean;
}): DebateWhodunnitFormatStateV2 {
  const verdict = jurorVerdictV2(args);
  return addCallouts({
    ...args.state,
    playPhase: "verdict",
    verdict,
  }, [verdict.legalResult === "guilty" ? "guilty" : "not_guilty"], null);
}

function failCourtForCredibilityV2(
  state: DebateWhodunnitFormatStateV2,
  privateCase: PrivateMysteryCaseV2,
): DebateWhodunnitFormatStateV2 {
  const accusedIsCulprit = state.theory?.culpritSeatId === privateCase.sealedCulpritSeatId;
  const verdict: DebateMysteryVerdictV2 = {
    legalResult: "not_guilty",
    classification: debateMysteryClassifyVerdictV2({
      legalResult: "not_guilty",
      accusedIsCulprit,
      proofEstablished: false,
      proofSafe: false,
    }),
    sealedCulpritCorrect: accusedIsCulprit,
    proofGrade: "failed",
    jurorBallots: state.config.trialType === "jury"
      ? state.config.jurorBotIds.map((jurorBotId) => ({
          jurorBotId,
          vote: "not_guilty" as const,
          reason: "The prosecution exhausted its credibility before proving the active testimony.",
          powerAffected: false,
        }))
      : [],
    deliveredAt: new Date().toISOString(),
  };
  return addCallouts({ ...state, playPhase: "verdict", verdict }, ["not_guilty"], null);
}

export function applyDebateMysteryActionV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryActionRequestV2,
): DebateSessionV1 {
  if (request.version !== 2) throw new HttpError(400, "Whodunnit V2 actions require version 2.");
  const key = compact(request.idempotencyKey, 200);
  if (!key) throw new HttpError(400, "A stable idempotency key is required.");
  const replay = replayV2Mutation(db, userId, sessionId, key);
  if (replay) return replay;
  const session = getDebateSession(db, userId, sessionId);
  if (request.expectedRevision !== session.revision) {
    throw new HttpError(409, "This case changed in another window. Refresh and try again.");
  }
  if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
    throw new HttpError(409, "This session is not a Whodunnit V2 case.");
  }
  if (session.formatState.compilation.stage !== "complete") {
    throw new HttpError(409, "Finish preparing the case before gameplay begins.");
  }
  const { privateCase, graph } = getDebateMysteryCaseV2(db, userId, sessionId);
  let state = structuredClone(session.formatState);
  const publicPayload: Record<string, unknown> = { action: request.action };
  if (request.action === "move") {
    if (state.playPhase === "title_card") state.playPhase = "investigation";
    if (state.playPhase !== "investigation") throw new HttpError(409, "Mansion movement is unavailable right now.");
    if (!request.roomId) {
      state.roomView = "mansion";
    } else {
      const room = state.rooms.find((entry) => entry.id === request.roomId);
      if (!room?.unlocked) throw new HttpError(409, "That location has not unlocked.");
      room.visited = true;
      state.currentRoomId = room.id;
      state.roomView = "room";
    }
  } else if (request.action === "examine") {
    if (state.playPhase !== "investigation" || state.currentRoomId !== request.roomId || state.roomView !== "room") {
      throw new HttpError(409, "Enter this room before examining it.");
    }
    const room = state.rooms.find((entry) => entry.id === request.roomId);
    const hotspot = room?.hotspots.find((entry) => entry.id === request.hotspotId);
    if (!hotspot?.unlocked) throw new HttpError(409, "That examination point is locked.");
    if (hotspot.examined) throw new HttpError(409, "That examination point is already in the record.");
    const nodeId = privateCase.examineNodeIdByHotspot[`${request.roomId}:${request.hotspotId}`];
    if (!nodeId) throw new HttpError(404, "That examination point is not authored for this case.");
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId });
    hotspot.examined = true;
  } else if (request.action === "talk") {
    if (state.playPhase !== "investigation" || state.roomView !== "room") {
      throw new HttpError(409, "Enter the suspect's room before choosing a Talk topic.");
    }
    const suspect = state.suspects.find((entry) => entry.seatId === request.suspectSeatId);
    if (!suspect || suspect.roomId !== state.currentRoomId) throw new HttpError(409, "That suspect is not in this room.");
    const topic = state.topics.find((entry) => entry.nodeId === request.topicNodeId && entry.suspectSeatId === suspect.seatId);
    if (!topic?.unlocked) throw new HttpError(409, "That Talk topic has not unlocked.");
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: topic.nodeId });
    state.topics = state.topics.map((entry) => entry.nodeId === topic.nodeId ? { ...entry, completed: true } : entry);
    state.metSuspectSeatIds = [...new Set([...state.metSuspectSeatIds, suspect.seatId])];
  } else if (request.action === "present_to_suspect") {
    if (state.playPhase !== "investigation" || state.roomView !== "room") {
      throw new HttpError(409, "Enter the suspect's room before presenting the Case File.");
    }
    const suspect = state.suspects.find((entry) => entry.seatId === request.suspectSeatId);
    if (!suspect || suspect.roomId !== state.currentRoomId) throw new HttpError(409, "That suspect is not in this room.");
    const recordKey = mysteryRecordKey(request.record);
    if (!state.record.some((item) => item.admitted && mysteryRecordKey(item.reference) === recordKey)) {
      throw new HttpError(409, "That item is not admitted to the Case File.");
    }
    const nodeId = privateCase.presentNodeIdBySuspectRecord[`${suspect.seatId}:${recordKey}`]
      ?? privateCase.defaultPresentNodeIdBySuspect[suspect.seatId];
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId });
  } else if (request.action === "consult_partner") {
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: privateCase.partnerConsultNodeId });
  } else if (request.action === "file_theory") {
    if (state.playPhase !== "investigation" && state.playPhase !== "theory") {
      throw new HttpError(409, "Charges can only be filed from the investigation.");
    }
    if (!state.theoryAvailable) throw new HttpError(409, "Complete the crime-scene briefing, meet one suspect, and admit one record item first.");
    state.theory = structuredClone(request.theory);
    state.theoryFiledAt = new Date().toISOString();
    const firstChapter = [...graph.witnessChapters].sort((a, b) => a.ordinal - b.ordinal)[0];
    if (!firstChapter) throw new HttpError(409, "The authored trial has no witnesses.");
    state = enterWitnessChapterV2({ state, graph, privateCase, chapter: firstChapter });
    state = addCallouts(state, ["order"], null);
  } else if (request.action === "focus_statement") {
    if (state.playPhase !== "trial" || !state.court?.statements.some((entry) => entry.statementId === request.statementId)) {
      throw new HttpError(409, "That statement is not in the active testimony.");
    }
    state.court.activeStatementId = request.statementId;
  } else if (request.action === "press_statement") {
    if (state.playPhase !== "trial" || !state.court || state.court.activeStatementId !== request.statementId) {
      throw new HttpError(409, "Press the exact active statement.");
    }
    const chapter = graph.witnessChapters.find((entry) => entry.id === state.court?.activeChapterId)!;
    const version = chapter.statementVersions.find((entry) => entry.statementId === request.statementId)!;
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: version.pressNodeId });
    state.court!.statements = state.court!.statements.map((entry) => entry.statementId === request.statementId ? { ...entry, pressed: true } : entry);
    const witness = state.suspects.find((entry) => entry.seatId === chapter.witnessSeatId);
    state = addCallouts(state, ["hold_it"], witness?.color ?? null);
    const choice = graph.prosecutionChoices.find((entry) => {
      const promptNode = graph.lines.find((line) => line.id === entry.promptLineId)?.nodeId;
      return graph.nodes.find((node) => node.id === promptNode)?.speakerSeatId === chapter.witnessSeatId ||
        graph.nodes.find((node) => node.id === promptNode)?.speakerSeatId === null;
    });
    if (choice && !state.discoveryIds.includes(`choice:${choice.id}`)) {
      const promptLine = graph.lines.find((line) => line.id === choice.promptLineId)!;
      state.pendingProsecutionChoice = {
        id: choice.id,
        prompt: promptLine.visibleText,
        options: choice.options.map((option) => ({
          id: option.id,
          text: graph.lines.find((line) => line.id === option.lineId)!.visibleText,
        })),
      };
    }
  } else if (request.action === "choose_prosecution_response") {
    const pending = state.pendingProsecutionChoice;
    if (!pending || pending.id !== request.choiceId) throw new HttpError(409, "That prosecution choice is not active.");
    const choice = graph.prosecutionChoices.find((entry) => entry.id === request.choiceId)!;
    const option = choice.options.find((entry) => entry.id === request.optionId);
    if (!option) throw new HttpError(400, "Choose one of the authored prosecution responses.");
    const optionLine = graph.lines.find((line) => line.id === option.lineId)!;
    state.dialogueHistory.push({
      nodeId: option.responseNodeId,
      lineId: option.lineId,
      visibleText: optionLine.visibleText,
      speakerSeatId: null,
      occurredAt: new Date().toISOString(),
    });
    state = executeDialogueNodeV2({
      state,
      graph,
      privateCase,
      nodeId: option.responseNodeId,
      choices: new Map([[choice.id, option.id]]),
    });
    state.discoveryIds = [...new Set([...state.discoveryIds, `choice:${choice.id}`])];
    state.pendingProsecutionChoice = null;
  } else if (request.action === "present_record") {
    if (state.playPhase !== "trial" || !state.court || state.court.activeStatementId !== request.statementId) {
      throw new HttpError(409, "Present against the exact active statement.");
    }
    const key = mysteryRecordKey(request.record);
    if (!state.record.some((item) => item.admitted && mysteryRecordKey(item.reference) === key)) {
      throw new HttpError(409, "That item is not admitted to the Case File.");
    }
    const chapter = graph.witnessChapters.find((entry) => entry.id === state.court?.activeChapterId)!;
    const version = chapter.statementVersions.find((entry) => entry.statementId === request.statementId)!;
    const witness = state.suspects.find((entry) => entry.seatId === chapter.witnessSeatId);
    const correct = version.correctPresentations.some((reference) => mysteryRecordKey(reference) === key);
    if (!correct) {
      state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: version.rebuttalNodeId });
      state.court!.credibilityRemaining -= 1;
      state = addCallouts(state, ["objection", "overruled"], witness?.color ?? null);
      if (state.court!.credibilityRemaining <= 0) {
        state = failCourtForCredibilityV2(state, privateCase);
      }
    } else {
      state = addCallouts(state, ["objection", "sustained"], witness?.color ?? null);
      if (!version.revisionNodeId) throw new HttpError(409, "This statement has no authored revision.");
      state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: version.revisionNodeId });
      const revisionLine = graph.lines.find((line) => line.nodeId === version.revisionNodeId)!;
      state.court!.statements = state.court!.statements.map((entry) => entry.statementId === request.statementId
        ? { ...entry, version: entry.version + 1, versionId: `${entry.versionId}-revised`, lineId: revisionLine.id, visibleText: revisionLine.visibleText }
        : entry);
      state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: chapter.completionNodeId });
      state = addCallouts(state, ["testimony_revised"], witness?.color ?? null);
      state.court!.completedChapterIds = [...new Set([...state.court!.completedChapterIds, chapter.id])];
      const chapters = [...graph.witnessChapters].sort((a, b) => a.ordinal - b.ordinal);
      const nextChapter = chapters.find((entry) => entry.ordinal === chapter.ordinal + 1);
      if (nextChapter) {
        state = enterWitnessChapterV2({ state, graph, privateCase, chapter: nextChapter });
      } else {
        state = finalizeCourtV2({ session, state, privateCase, proofEstablished: true });
      }
    }
  } else if (request.action === "retry_witness_checkpoint") {
    const checkpoint = state.court?.checkpoint;
    if (!checkpoint || state.playPhase !== "verdict" || state.verdict?.legalResult !== "not_guilty") {
      throw new HttpError(409, "No failed witness checkpoint is available.");
    }
    const restored = JSON.parse(checkpoint.publicStateJson) as DebateWhodunnitFormatStateV2;
    state = {
      ...restored,
      compilation: state.compilation,
      audioReady: state.audioReady,
      voicesEnabled: state.voicesEnabled,
      localAudioFailure: state.localAudioFailure,
      verdict: null,
      playPhase: "trial",
      pendingCallout: null,
      pendingProsecutionChoice: null,
    };
  }
  state.theoryAvailable =
    state.discoveryIds.includes("briefing:complete") &&
    state.metSuspectSeatIds.length > 0 &&
    state.record.some((item) => item.admitted);
  let nextSession: DebateSessionV1 = {
    ...session,
    status: state.playPhase === "verdict" ? "completed" : "waiting_for_player",
    phase: state.playPhase === "verdict" ? "verdict" : state.playPhase === "trial" ? "challenge" : "opening",
    stepKey: `mystery_v2_${state.playPhase}`,
    winnerSideId: state.verdict
      ? state.verdict.legalResult === "guilty" ? "for" : "against"
      : null,
    completedAt: state.playPhase === "verdict" ? new Date().toISOString() : null,
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    nextSession = persistV2Session(db, userId, nextSession, state, session.revision);
    db.prepare(
      `INSERT INTO debate_mutations
         (user_id, session_id, idempotency_key, expected_revision,
          result_revision, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, sessionId, key, session.revision, nextSession.revision, JSON.stringify(nextSession), new Date().toISOString());
    appendV2Action(db, userId, sessionId, request.action, publicPayload);
    db.exec("COMMIT");
    return nextSession;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
