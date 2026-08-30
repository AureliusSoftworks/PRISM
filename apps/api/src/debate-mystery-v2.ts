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
  DEBATE_MYSTERY_PLAY_READINESS_VERSION,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS,
  DEBATE_MYSTERY_V2_SCHEMA_VERSION,
  compileDeterministicDebateMystery,
  bindMysteryIncidentPlanV1,
  composeMysteryIncidentPlanV1,
  deterministicMysteryCaseTitleV1,
  debateEvidenceExhibitTitle,
  botPowerChromaticBiasColorMatchesV1,
  botPowerChromaticBiasEffectsFromEffectsV1,
  botPowerChromaticBiasResolvedHueV1,
  botIdentityMirrorFaceV1,
  debateMysteryAccompliceChance,
  debateMysteryClassifyVerdictV2,
  debateMysteryCredibilityMaximumV2,
  debateMysteryPremiumAvailableV2,
  debateMysteryRoomNarrationNamesPersonaV2,
  debateMysteryRoomNarrationTextV2,
  debateMysteryAccusationMatchesV2,
  debateMysterySpectatorEvidenceReferencesV2,
  debateMysteryTalkTopicMirrorsRecordV2,
  debateMysteryTheoryAccusedSeatIdsV2,
  debateMysteryTheoryWithAccusedSeatIdsV2,
  emptyDebateMysteryMutationsV2,
  emptyDebateMysteryRequirementsV2,
  normalizeBotAudioVoiceProfileV1,
  normalizeDebateEvidenceExhibitAdjective,
  normalizeDebateEvidenceExhibitObject,
  normalizeDebateEvidencePacketV1,
  normalizeDebateMysteryTalkSubjectV2,
  normalizeDebateMysteryV2ForgeProgressMessage,
  resolveMysteryCaseTitleV1,
  mysteryIncidentPlanRequiresAccompliceV1,
  mysteryPublicChargeV1,
  parseStoredBotAvatarDetailsV1,
  parseStoredBotAudioVoiceProfileV1,
  parseStoredBotPrompt,
  REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS,
  reasoningGenerationBudgetMs,
  resolveDebateMysteryLineDeliveryV2,
  resolveDebateMysteryConfigV2,
  resolveDebateMysteryMansionExteriorScaleClassV1,
  validateDebateMysteryAudioManifestV1,
  validateDebateMysteryCaseBible,
  validateDebateMysteryDialogueGraphV2,
  validateDebateMysteryStageCuePerformanceV1,
  validateMysteryIncidentPlanV1,
  validateMysteryCaseTitleV1,
  type BotAudioVoiceProfileV1,
  type DebateMysteryActionRequestV2,
  type DebateEvidenceExhibitV1,
  type DebateMysteryAudioManifestEntryV1,
  type DebateMysteryAudioManifestV1,
  type DebateMysteryCompilationStageV2,
  type DebateMysteryCompilationStatusV2,
  type DebateMysteryCompilationSubstepV2,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryIdentityMirrorTargetSnapshotV1,
  type DebateMysteryDialogueGraphV2,
  type DebateMysteryDialogueNodeV2,
  type DebateMysteryPerformanceDirectionV2,
  type DebateMysteryPlayAgainRequestV2,
  type DebateMysteryPresentationGateV2,
  type DebateMysteryPresentationUnlockTargetV2,
  type DebateMysteryRecordReferenceV2,
  type DebateMysteryResolvedConfigV1,
  type DebateMysteryResolvedConfigV2,
  type DebateMysteryMansionExteriorScaleClassV1,
  type DebateMysteryRoomV2,
  type DebateMysterySealedAssetRefV1,
  type DebateMysterySpokenLineV2,
  type DebateMysteryStageCueV1,
  type DebateMysteryStatementVersionV2,
  type DebateMysteryTalkSubjectV2,
  type DebateMysteryWitnessChapterV2,
  type DebateMysteryVerdictV2,
  type DebateSessionCreateRequest,
  type DebateSessionV1,
  type DebateWhodunnitCreateConfigV2,
  type DebateWhodunnitFormatStateV2,
  type MysteryBoundIncidentPlanV1,
  type MysteryIncidentPlanV1,
  type MysteryPublicChargeV1,
} from "@localai/shared";
import { generateBuiltinEnglishWave, isPlayablePcmWave } from "./builtin-tts.ts";
import { buildBabbleSpeechText } from "./babble-text.ts";
import {
  createDebateSession,
  debatePowerPlanForBots,
  getDebateSession,
  type DebateAiRuntime,
  type DebateGenerationLane,
} from "./debate.ts";
import {
  estimatePrismTextTokens,
  prismGenerationBroker,
} from "./generation-broker.ts";
import { AutoFallbackExhaustedError } from "./auto-fallback.ts";
import type { PrismGenerationWorkReceipt } from "./generation-work.ts";
import { PRISM_INSTANT_VOICE_MODEL_ID, pcmWaveDurationMs } from "./local-voice-engine.ts";
import { resolveAbsoluteUnderDataRoot } from "./image-storage.ts";
import {
  freezeDebateMysteryMansionSnapshotV2,
  getDebateMysteryMansionBundleV2,
  retainDebateMysteryMansionSnapshotAssetsV2,
} from "./debate-mystery-mansion-bundles.ts";
import {
  cloneDebateMysterySealedAssetsForReplayV1,
  deleteDebateMysterySealedAssetsV1,
  resetDebateMysteryAssetRevealsV1,
  revealDebateMysteryAssetV1,
} from "./debate-mystery-assets.ts";
import { debateMysteryIllustratedRoomSubjectIdV1 } from "./debate-mystery-room-art.ts";
import { HttpError } from "./utils.http.ts";

const V2_JOB_LEASE_MS = 90_000;
const V2_TOTAL_PASSES = 5;
const V2_PERSONA_DIALOGUE_POLISH_TIMEOUT_MS = 75_000;
export const V2_ROOM_INTRODUCTION_PERSONA_POLISH_TIMEOUT_MS = 2_000;
export const V2_CRITICAL_AUTHORING_MIN_ATTEMPT_TIMEOUT_MS = 120_000;
const V2_AUDIO_SUBDIR = "debate-mystery-audio-v2";
const V2_STAGING_RECLAIM_AGE_MS = V2_JOB_LEASE_MS * 2;

type MysteryV2CompilationScope =
  | "participant_full"
  | "spectator_review"
  | "court_only";

export type MysteryV2SuspectAwareness = "involved" | "incidental" | "unaware";
export type MysteryV2TemporalRecall = "exact" | "approximate" | "none";

export interface MysteryV2SuspectKnowledge {
  awareness: MysteryV2SuspectAwareness;
  temporalRecall: MysteryV2TemporalRecall;
}

const MYSTERY_UNAWARE_SUSPECT_CHANCE = Object.freeze({
  casual: 0.15,
  classic: 0.28,
  mastermind: 0.42,
});

function deterministicMysteryKnowledgeRoll(
  caseSeed: string,
  seatId: string,
  dimension: string,
): number {
  return (
    Number.parseInt(
      sha256(`${caseSeed}:suspect-knowledge:${seatId}:${dimension}`).slice(0, 8),
      16,
    ) / 0xffffffff
  );
}

/**
 * Server-private epistemic casting. Culpability, awareness, and recall are
 * separate axes: an innocent may merely work in the house or know nothing
 * about the case, while a culprit can know the truth but speak imprecisely.
 */
export function resolveMysterySuspectKnowledgeV2(args: {
  caseSeed: string;
  difficulty: DebateMysteryResolvedConfigV2["difficulty"];
  suspects: readonly { seatId: string }[];
  culpritSeatId: string;
  accompliceSeatId: string | null;
  eyewitnessSeatId: string | null;
}): Record<string, MysteryV2SuspectKnowledge> {
  return Object.fromEntries(
    args.suspects.map((suspect) => {
      const involved =
        suspect.seatId === args.culpritSeatId ||
        suspect.seatId === args.accompliceSeatId;
      const eyewitness = suspect.seatId === args.eyewitnessSeatId;
      const awareness: MysteryV2SuspectAwareness = involved
        ? "involved"
        : eyewitness
          ? "incidental"
          : deterministicMysteryKnowledgeRoll(
                args.caseSeed,
                suspect.seatId,
                "awareness",
              ) < MYSTERY_UNAWARE_SUSPECT_CHANCE[args.difficulty]
            ? "unaware"
            : "incidental";
      const recallRoll = deterministicMysteryKnowledgeRoll(
        args.caseSeed,
        suspect.seatId,
        "temporal-recall",
      );
      let temporalRecall: MysteryV2TemporalRecall;
      if (awareness === "unaware") {
        temporalRecall = "none";
      } else if (args.difficulty === "casual") {
        temporalRecall = involved || eyewitness || recallRoll < 0.8
          ? "exact"
          : "approximate";
      } else if (args.difficulty === "classic") {
        temporalRecall = involved
          ? recallRoll < 0.4 ? "exact" : "approximate"
          : eyewitness
            ? recallRoll < 0.55 ? "exact" : "approximate"
            : recallRoll < 0.15
              ? "none"
              : recallRoll < 0.75
                ? "approximate"
                : "exact";
      } else {
        temporalRecall = involved
          ? recallRoll < 0.15 ? "exact" : "approximate"
          : eyewitness
            ? "approximate"
            : recallRoll < 0.3
              ? "none"
              : recallRoll < 0.9
                ? "approximate"
                : "exact";
      }
      return [suspect.seatId, { awareness, temporalRecall }];
    }),
  );
}

function resolveMysteryCompilationScopeV2(
  config: Pick<DebateMysteryResolvedConfigV2, "investigationMode" | "playerRole">,
): MysteryV2CompilationScope {
  if (config.investigationMode === "court_only") return "court_only";
  return config.playerRole === "spectator"
    ? "spectator_review"
    : "participant_full";
}

function mysteryCompilationOmitsInvestigationV2(
  scope: MysteryV2CompilationScope,
): boolean {
  return scope !== "participant_full";
}

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
  avatar_details_json: string | null;
  face_eyes_font: string | null;
  face_eye_character: string | null;
  face_eye_count: number | null;
  face_eye_spacing: number | null;
  face_eye_animation: string | null;
  face_mouth_font: string | null;
  face_mouth_character: string | null;
  face_mouth_animation: string | null;
  face_mouth_speech_poses: string | null;
  face_mouth_coffee_pucker: number | null;
  face_font_weight: number | null;
  face_eye_scale: number | null;
  face_eye_offset_x: number | null;
  face_eye_offset_y: number | null;
  face_eye_rotation_deg: number | null;
  face_mouth_scale: number | null;
  face_mouth_offset_x: number | null;
  face_mouth_offset_y: number | null;
  face_mouth_rotation_deg: number | null;
  face_blink_bar: string | null;
  face_blink_count: number | null;
  face_blink_scale: number | null;
  face_blink_offset_x: number | null;
  face_blink_offset_y: number | null;
  face_blink_rotation_deg: number | null;
  face_thinking_frames: string | null;
  face_thinking_scale: number | null;
  face_thinking_offset_x: number | null;
  face_thinking_offset_y: number | null;
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
  created_at: string;
  updated_at: string;
}

interface MysteryV2CaseRow {
  session_id: string;
  user_id: string;
  case_family_id: string;
  run_ordinal: number;
  schema_version: number;
  private_case_json: string;
  dialogue_graph_json: string;
  case_hash: string;
  graph_hash: string;
  validation_json: string;
  created_at: string;
  updated_at: string;
}

export interface DebateMysteryEvidenceAssetPreparationV2 {
  userId: string;
  sessionId: string;
  exhibits: Array<DebateEvidenceExhibitV1 & { roomId: string | null }>;
  crimeSceneRoomId: string;
  /** Room-enabled Forge settles only the opening pack; background settles one room pack. */
  mode: "all" | "initial" | "background";
  houseStyle: DebateMysteryHouseStyleV2;
  signal?: AbortSignal;
  /** Called after one encrypted asset is durable so a restarted Forge can skip it. */
  onPrepared?: (
    exhibitId: string,
    asset: DebateMysterySealedAssetRefV1,
  ) => void | Promise<void>;
}

export type DebateMysteryEvidenceAssetPreparerV2 = (
  args: DebateMysteryEvidenceAssetPreparationV2,
) => Promise<Record<string, DebateMysterySealedAssetRefV1>>;

export interface DebateMysteryRoomAssetPreparationV2 {
  userId: string;
  sessionId: string;
  rooms: Array<Pick<
    DebateMysteryRoomV2,
    "id" | "templateId" | "name" | "bundledAssetPath"
  >>;
  crimeSceneRoomId: string;
  /** Initial Forge prepares only the incident scene; background resolves the frontier. */
  mode: "initial" | "background";
  houseStyle: DebateMysteryHouseStyleV2;
  signal?: AbortSignal;
  onPrepared?: (
    roomId: string,
    asset: DebateMysterySealedAssetRefV1,
  ) => void | Promise<void>;
}

export type DebateMysteryRoomAssetPreparerV2 = (
  args: DebateMysteryRoomAssetPreparationV2,
) => Promise<Record<string, DebateMysterySealedAssetRefV1>>;

export interface DebateMysteryIllustratedRoomPreparationV2 {
  userId: string;
  sessionId: string;
  signal?: AbortSignal;
}

export type DebateMysteryIllustratedRoomPreparerV2 = (
  args: DebateMysteryIllustratedRoomPreparationV2,
) => Promise<void>;

export interface DebateMysteryMansionExteriorAssetPreparationV2 {
  userId: string;
  sessionId: string;
  houseStyle: DebateMysteryHouseStyleV2;
  scaleClass: DebateMysteryMansionExteriorScaleClassV1;
  /** Explicit setup art is adopted before Case Forge; this only resolves fallback art. */
  synthesize: boolean;
  signal?: AbortSignal;
}

export type DebateMysteryMansionExteriorAssetPreparerV2 = (
  args: DebateMysteryMansionExteriorAssetPreparationV2,
) => Promise<DebateMysterySealedAssetRefV1>;

interface DebateMysteryCompilationOptionsV2 {
  generateWave?: typeof generateBuiltinEnglishWave;
  prepareEvidenceAssets?: DebateMysteryEvidenceAssetPreparerV2;
  prepareRoomAssets?: DebateMysteryRoomAssetPreparerV2;
  prepareIllustratedRooms?: DebateMysteryIllustratedRoomPreparerV2;
  prepareMansionExteriorAsset?: DebateMysteryMansionExteriorAssetPreparerV2;
  adoptMansionExteriorDraft?: (args: {
    userId: string;
    sessionId: string;
    imageId: string;
  }) => Promise<DebateMysterySealedAssetRefV1>;
  onCompilationReady?: (session: DebateSessionV1) => void;
}

interface AuthoredTopicV2 {
  id: string;
  label: string;
  subject: DebateMysteryTalkSubjectV2;
  question: string;
  questionStageAction: string | null;
  questionPerformance: Partial<DebateMysteryPerformanceDirectionV2>;
  response: string;
  responseStageAction: string | null;
  performance: Partial<DebateMysteryPerformanceDirectionV2>;
  repeatResponses: Array<{
    response: string;
    responseStageAction: string | null;
    performance: Partial<DebateMysteryPerformanceDirectionV2>;
  }>;
}

interface AuthoredPresentationGateV2 {
  id: string;
  requiredRecord: DebateMysteryRecordReferenceV2;
  unlockTopicId: string;
}

interface AuthoredStatementV2 {
  id: string;
  text: string;
  stageAction: string | null;
  press: string;
  pressStageAction: string | null;
  defenseRebuttal: string;
  defenseRebuttalStageAction: string | null;
  defenseObjection: string;
  defenseObjectionStageAction: string | null;
  revision: string;
  revisionStageAction: string | null;
  performance: Partial<DebateMysteryPerformanceDirectionV2>;
  /**
   * Private Case Forge grounding for the one proof-bearing statement. The
   * author must quote both sides from the supplied texts; the critical
   * semantic pass independently decides whether they truly conflict.
   */
  contradictionBasis?: AuthoredContradictionBasisV2 | null;
}

interface AuthoredContradictionBasisV2 {
  version: 1;
  recordId: string;
  statementClaim: string;
  recordClaim: string;
  relationship: "cannot_both_be_true";
}

interface MysteryV2ContradictionRecordV2 {
  reference: DebateMysteryRecordReferenceV2;
  title: string | null;
  text: string;
}

interface MysteryV2ContradictionEvaluationV2 {
  witnessSeatId: string;
  statementId: string;
  recordId: string;
  verdict: "clear_contradiction" | "not_clear";
  relationship:
    | "direct_denial"
    | "timeline_impossibility"
    | "identity_or_possession_conflict"
    | "other_mutual_exclusion"
    | "none";
  statementClaim: string;
  recordClaim: string;
  rationale: string;
  repairInstruction: string | null;
}

interface AuthoredSuspectV2 {
  seatId: string;
  relationship: string;
  alibi: string;
  roomIntroduction: string;
  roomIntroductionStageAction: string | null;
  roomIntroductionPerformance: Partial<DebateMysteryPerformanceDirectionV2>;
  chapterOpening: string;
  chapterCompletion: string;
  defaultPresentProsecutionLine: string;
  defaultPresentProsecutionStageAction: string | null;
  defaultPresentReaction: string;
  defaultPresentReactionStageAction: string | null;
  presentReactions: Array<{
    recordId: string;
    prosecutionLine: string;
    prosecutionStageAction: string | null;
    response: string;
    responseStageAction: string | null;
  }>;
  talkTopics: AuthoredTopicV2[];
  presentationGate: AuthoredPresentationGateV2 | null;
  testimony: AuthoredStatementV2[];
}

interface AuthoredProsecutionChoiceV2 {
  id: string;
  witnessSeatId: string;
  prompt: string;
  options: Array<{
    id: string;
    text: string;
    stageAction: string | null;
    reaction: string;
    reactionStageAction: string | null;
  }>;
}

interface AuthoredMysteryV2 {
  title: string;
  victimName: string;
  victimDescription: string;
  publicOpening: string;
  motive: string;
  method: string;
  prosecutorInternalReasoning: string;
  eyewitnessResolution: string | null;
  evidence: Array<{ id: string; title: string; description: string; emoji: string }>;
  examinations: Array<{ id: string; text: string }>;
  suspects: AuthoredSuspectV2[];
  prosecutionChoices: AuthoredProsecutionChoiceV2[];
}

type AuthoredMysteryFoundationV2 = Omit<AuthoredMysteryV2, "suspects" | "prosecutionChoices">;
type AuthoredMysteryFoundationCoreV2 = Omit<AuthoredMysteryFoundationV2, "examinations">;

class MysteryFoundationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MysteryFoundationValidationError";
  }
}

class MysteryExaminationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MysteryExaminationValidationError";
  }
}

class MysteryWitnessChapterValidationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "MysteryWitnessChapterValidationError";
  }
}

class MysteryProsecutionChoiceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MysteryProsecutionChoiceValidationError";
  }
}

function mysteryExaminationValidationExhausted(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : null;
  if (
    cause instanceof MysteryExaminationValidationError ||
    cause instanceof SyntaxError
  ) return true;
  return cause instanceof AutoFallbackExhaustedError &&
    cause.attempts.length > 0 &&
    cause.attempts.every((attempt) =>
      attempt.outcome === "failed" && attempt.reason === "invalid_output"
    );
}

function mysteryWitnessChapterValidationExhausted(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : null;
  if (
    cause instanceof MysteryWitnessChapterValidationError ||
    cause instanceof SyntaxError
  ) return true;
  return cause instanceof AutoFallbackExhaustedError &&
    cause.attempts.length > 0 &&
    cause.attempts.every((attempt) =>
      attempt.outcome === "failed" && attempt.reason === "invalid_output"
    );
}

function mysteryProsecutionChoiceValidationExhausted(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : null;
  if (
    cause instanceof MysteryProsecutionChoiceValidationError ||
    cause instanceof SyntaxError
  ) return true;
  return cause instanceof AutoFallbackExhaustedError &&
    cause.attempts.length > 0 &&
    cause.attempts.every((attempt) =>
      attempt.outcome === "failed" && attempt.reason === "invalid_output"
    );
}

interface MysteryV2AuthoringCheckpointV1 {
  kind: "authoring-v1";
  foundation: AuthoredMysteryFoundationV2 | null;
  foundationCore?: AuthoredMysteryFoundationCoreV2 | null;
  examinationsById?: Record<string, string>;
  suspectsBySeatId: Record<string, AuthoredSuspectV2>;
  prosecutionChoices: AuthoredProsecutionChoiceV2[] | null;
}

interface MysteryV2FactLedger {
  version: 1;
  sourceHash: string;
  /** Deterministic sealed incident composition. Models may phrase it but may
   * never add, remove, or reassign one of these facts. */
  incidentPlan: MysteryBoundIncidentPlanV1;
  culpritSeatId: string;
  accompliceSeatId: string | null;
  eyewitnessSeatId: string | null;
  suspectKnowledgeBySeat: Record<string, MysteryV2SuspectKnowledge>;
  frozenIds: {
    victimId: string;
    suspectSeatIds: string[];
    roomIds: string[];
    evidenceIds: string[];
    examinationIds: string[];
    statementIdsBySeat: Record<string, string[]>;
  };
  roleAssignments: {
    suspectBotIdBySeat: Record<string, string>;
    prosecutorBotId: string;
    defenseCounselBotId: string;
    judgeBotId: string;
    jurorBotIds: string[];
  };
  proofRoutesBySeat: Record<string, string>;
  schemaConstraints: {
    investigationMode: DebateMysteryResolvedConfigV2["investigationMode"];
    trialType: DebateMysteryResolvedConfigV2["trialType"];
    preset: DebateMysteryResolvedConfigV2["preset"];
    difficulty: DebateMysteryResolvedConfigV2["difficulty"];
  };
}

interface MysteryV2VoiceCard {
  botId: string;
  sourceHash: string;
  cues: string[];
}

interface MysteryV2AuditIssue {
  fieldPath: string;
  code: string;
  severity: "advisory" | "high";
  relatedFrozenIds: string[];
  repairInstruction: string;
}

interface MysteryV2SectionProvenance {
  provider: PrismGenerationWorkReceipt["provider"];
  model: string;
  role: PrismGenerationWorkReceipt["role"];
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  fallbackReason: string | null;
  validation: PrismGenerationWorkReceipt["validation"];
  auditIssues: MysteryV2AuditIssue[];
}

interface MysteryV2SectionRecoveryReceipt {
  kind: "deterministic_fallback";
  reason: "invalid_output_exhausted";
  attemptCount: number;
  source: "frozen_scaffold";
  /** Hash-only linkage to the frozen authoring ledger; never case truth. */
  sourceHash: string;
}

interface MysteryV2AuthoringCheckpoint {
  kind: "authoring-v2";
  foundation: AuthoredMysteryFoundationV2 | null;
  foundationCore: AuthoredMysteryFoundationCoreV2 | null;
  examinationsById: Record<string, string>;
  suspectsBySeatId: Record<string, AuthoredSuspectV2>;
  prosecutionChoices: AuthoredProsecutionChoiceV2[] | null;
  contextCapsule: {
    version: 1;
    sourceHash: string;
    factLedger: MysteryV2FactLedger;
    voiceCardsByBotId: Record<string, MysteryV2VoiceCard>;
  } | null;
  connectiveAdditions: Record<string, Record<string, string>>;
  provenanceBySection: Record<string, MysteryV2SectionProvenance>;
  recoveryBySection: Record<string, MysteryV2SectionRecoveryReceipt>;
}

interface PrivateMysteryCaseV2 {
  version: 2;
  config: DebateMysteryResolvedConfigV2;
  /** Additive private truth contract. Legacy compiled cases omit it. */
  incidentPlan?: MysteryBoundIncidentPlanV1;
  /** Spoiler-safe charge duplicated privately so imported/archive repairs do
   * not need to infer it from presentation copy. */
  publicCharge?: MysteryPublicChargeV1;
  /** Charge-agnostic responsible parties. Legacy homicide cases derive this
   * from sealedCulpritSeatId; old accomplices may belong only to a secondary
   * incident, so they are not silently added to the filed charge. */
  sealedResponsibleSeatIds?: string[];
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
    /** Additive private metadata; absent only on legacy compiled cases. */
    awareness?: MysteryV2SuspectAwareness;
    temporalRecall?: MysteryV2TemporalRecall;
  }>;
  recordItems: Array<{
    reference: DebateMysteryRecordReferenceV2;
    title: string;
    description: string;
    emoji: string;
    /** Presentation-only art remains sealed here until this item is admitted. */
    visualKind?: "emoji" | "upload" | "synthesized";
    imageId?: string | null;
    sealedAsset?: DebateMysterySealedAssetRefV1 | null;
  }>;
  /** Private presentation routing only; never serialized into the public case state. */
  evidenceRoomIdById?: Record<string, string>;
  examineNodeIdByHotspot: Record<string, string>;
  presentNodeIdBySuspectRecord: Record<string, string>;
  defaultPresentNodeIdBySuspect: Record<string, string>;
  prosecutorStrategyNodeId: string;
  /** Legacy persisted alias, removed when an active case passes readiness repair. */
  partnerConsultNodeId?: string;
  crimeSceneRoomId: string;
  investigationRoomIds?: string[];
  investigationHotspotIdsByRoom?: Record<string, string[]>;
  investigationPersonIds?: string[];
  /**
   * A compact, private snapshot of each cast member's authored voice cues.
   * The post-graph polish pass uses this rather than a mutable bot profile,
   * so a compiling case keeps the persona it was built around.
   */
  personaVoiceCardsByBotId?: Record<string, MysteryV2VoiceCard>;
  /** Spoiler-safe authoring recovery receipts retained for Case Forge review. */
  authoringRecoveryBySection?: Record<string, MysteryV2SectionRecoveryReceipt>;
  /** Frozen synthesis inputs for runtime-safe single-line repairs. Older
   * cases may recover the same profile by matching their verified manifest
   * hash against other frozen/default candidates. */
  audioVoiceProfilesByBotId?: Record<string, BotAudioVoiceProfileV1>;
  /** Additive compatibility boundary. Missing means the archived case owns a
   * complete eager pack; new stage-cue cases prepare only spoken lines. */
  audioPreparationMode?: "eager-v1" | "lazy-on-demand-v1";
  /** Marks a durable checkpoint whose graph already carries persona lead-ins. */
  personaDialoguePolishVersion?: 1;
  /**
   * One-shot, private room-performance receipts. The public session receives
   * only the resulting ordinary dialogue entry; routing and persona cues stay
   * sealed with the compiled case.
   */
  roomIntroductionPersonaPolishByRoom?: Record<string, {
    version: 1;
    lineId: string;
    sourceTextHash: string;
    appliedTextHash: string;
    outcome: "polished" | "canonical";
    leadIn: string | null;
    /** Additive on stronger persona-shaped spoken introductions. Receipts
     * without this field remain replayable and can upgrade on a later reveal. */
    dialogueTemplateId?: string | null;
    /** Runtime-generated cue performances remain durable without being
     * mistaken for an old cadence-only receipt on replay. */
    stageCueVersion?: 1;
  }>;
  playerRoleContractVersion?: 1;
  investigationProgressionContractVersion?: 2;
  /** Private readiness marker: every playable statement #2 was independently
   * checked against its exact assigned record after final author repairs. */
  contradictionSemanticContractVersion?: 1;
  graphValidation: ReturnType<typeof validateDebateMysteryDialogueGraphV2>;
}

interface MysteryV2Checkpoint {
  kind?: "compiled-v1";
  privateCase: PrivateMysteryCaseV2;
  graph: DebateMysteryDialogueGraphV2;
  publicState: DebateWhodunnitFormatStateV2;
}

function isMysteryV2AuthoringCheckpoint(
  value: unknown,
): value is MysteryV2AuthoringCheckpoint | MysteryV2AuthoringCheckpointV1 {
  const kind = value && typeof value === "object"
    ? (value as { kind?: unknown }).kind
    : null;
  return kind === "authoring-v1" || kind === "authoring-v2";
}

function normalizeMysteryV2AuthoringCheckpoint(
  value: unknown,
): MysteryV2AuthoringCheckpoint {
  if (isMysteryV2AuthoringCheckpoint(value)) {
    return {
      kind: "authoring-v2",
      foundation: value.foundation ?? null,
      foundationCore: value.foundationCore ?? null,
      examinationsById: value.examinationsById ?? {},
      suspectsBySeatId: value.suspectsBySeatId ?? {},
      prosecutionChoices: value.prosecutionChoices ?? null,
      contextCapsule:
        value.kind === "authoring-v2" ? value.contextCapsule ?? null : null,
      connectiveAdditions:
        value.kind === "authoring-v2" ? value.connectiveAdditions ?? {} : {},
      provenanceBySection:
        value.kind === "authoring-v2" ? value.provenanceBySection ?? {} : {},
      recoveryBySection:
        value.kind === "authoring-v2" ? value.recoveryBySection ?? {} : {},
    };
  }
  return {
    kind: "authoring-v2",
    foundation: null,
    foundationCore: null,
    examinationsById: {},
    suspectsBySeatId: {},
    prosecutionChoices: null,
    contextCapsule: null,
    connectiveAdditions: {},
    provenanceBySection: {},
    recoveryBySection: {},
  };
}

function isMysteryV2CompiledCheckpoint(value: unknown): value is MysteryV2Checkpoint {
  return Boolean(
    value &&
    typeof value === "object" &&
    !isMysteryV2AuthoringCheckpoint(value) &&
    (value as MysteryV2Checkpoint).privateCase &&
    (value as MysteryV2Checkpoint).graph &&
    (value as MysteryV2Checkpoint).publicState,
  );
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function mysteryCasekeeperVoiceBotIdV2(
  config: DebateMysteryResolvedConfigV2,
  bots: readonly Pick<MysteryV2BotRow, "id">[],
): string {
  const available = new Set(bots.map((bot) => bot.id));
  // The Casekeeper's Bottish should feel like the player's embodied Persona.
  // In participant cases the Prosecutor seat is that frozen player identity,
  // even when a bot Judge presides. Keep the legacy carrier fallback for
  // spectator cases and archived cases whose player Persona row is unavailable.
  if (config.playerRole !== "spectator" && available.has(config.prosecutorBotId)) {
    return config.prosecutorBotId;
  }
  // A bot-Judge remains the stable carrier when no embodied player voice is
  // available; never re-select another mutable Library row in that case.
  if (config.judgeBotId !== "prism:player-judge") return config.judgeBotId;
  const preferred = [
    config.prosecutorBotId,
    config.rivalDefenseBotId,
    ...config.suspectBotIds,
    ...config.jurorBotIds,
  ].find((botId) => available.has(botId));
  if (!preferred) throw new Error("The frozen Casekeeper has no bot voice carrier.");
  return preferred;
}

function publicMysteryLineDeliveryV2(
  line: DebateMysterySpokenLineV2,
  nodeKind?: DebateMysteryDialogueNodeV2["kind"],
): "spoken" | "text_only" | "anonymous_babble" {
  if (nodeKind === "examination_result" || line.mode === "text_only") return "text_only";
  return line.mode === "anonymous_babble" ? "anonymous_babble" : "spoken";
}

function publicMysteryLineSpeakerBotIdV2(
  line: DebateMysterySpokenLineV2,
): string | null {
  return line.mode === "anonymous_babble" ? null : line.speakerBotId;
}

function mysteryLineVoiceTreatmentV2(
  line: DebateMysterySpokenLineV2,
): "english" | "babble" {
  return line.mode === "anonymous_babble" ? "babble" : "english";
}

function mysteryLineSynthesisTextV2(
  line: DebateMysterySpokenLineV2,
  privateCase: PrivateMysteryCaseV2,
): string {
  if (line.mode !== "anonymous_babble") return line.spokenText;
  return buildBabbleSpeechText({
    text: line.spokenText,
    seed: `${privateCase.config.nonce}:${line.id}:${line.speakerBotId ?? "casekeeper"}`,
  });
}

function compact(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

function normalizedMysteryContradictionExcerptV2(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function mysteryContradictionExcerptIsGroundedV2(
  excerpt: string,
  source: string,
): boolean {
  const normalizedExcerpt = normalizedMysteryContradictionExcerptV2(excerpt);
  const normalizedSource = normalizedMysteryContradictionExcerptV2(source);
  const substantiveWords = normalizedExcerpt.match(/[\p{L}\p{N}]+/gu) ?? [];
  return (
    normalizedExcerpt.length >= 12 &&
    substantiveWords.length >= 3 &&
    normalizedSource.includes(normalizedExcerpt)
  );
}

function groundedMysteryContradictionExcerptV2(
  candidate: unknown,
  source: string,
): string {
  const supplied = compact(candidate, 500);
  if (mysteryContradictionExcerptIsGroundedV2(supplied, source)) {
    return supplied;
  }
  const exactSourceExcerpt = compact(source, 500);
  return mysteryContradictionExcerptIsGroundedV2(exactSourceExcerpt, source)
    ? exactSourceExcerpt
    : "";
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

export function mysteryV2CriticalAuthoringAttemptTimeoutMs(
  lane: Pick<
    DebateGenerationLane,
    "providerName" | "model" | "reasoningEffort"
  >,
): number {
  return Math.max(
    V2_CRITICAL_AUTHORING_MIN_ATTEMPT_TIMEOUT_MS,
    reasoningGenerationBudgetMs(lane.reasoningEffort, {
      provider: lane.providerName,
      modelId: lane.model,
    }),
  );
}

function botRows(db: DatabaseSync, userId: string, ids: readonly string[]): MysteryV2BotRow[] {
  const ownedIds = [...new Set(ids.filter((id) => id && id !== "prism:player-judge"))];
  if (!ownedIds.length) return [];
  return db.prepare(
    `SELECT id, name, system_prompt, export_hash, color, glyph,
            avatar_details_json,
            face_eyes_font, face_eye_character, face_eye_count,
            face_eye_spacing, face_eye_animation,
            face_mouth_font, face_mouth_character, face_mouth_animation,
            face_mouth_speech_poses, face_mouth_coffee_pucker,
            face_font_weight,
            face_eye_scale, face_eye_offset_x, face_eye_offset_y,
            face_eye_rotation_deg,
            face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y,
            face_mouth_rotation_deg,
            face_blink_bar, face_blink_count, face_blink_scale,
            face_blink_offset_x, face_blink_offset_y,
            face_blink_rotation_deg,
            face_thinking_frames, face_thinking_scale,
            face_thinking_offset_x, face_thinking_offset_y,
            authored_audio_voice_profile, audio_voice_profile_override
       FROM bots
      WHERE user_id = ? AND id IN (${ownedIds.map(() => "?").join(", ")})`,
  ).all(userId, ...ownedIds) as unknown as MysteryV2BotRow[];
}

function mysteryRoomNarrationForBotV2(args: {
  bot: Pick<MysteryV2BotRow, "name" | "system_prompt"> | null | undefined;
  fixtureLabels: readonly string[];
}): string {
  const profile = args.bot
    ? parseStoredBotPrompt(args.bot.system_prompt).fields
    : null;
  return debateMysteryRoomNarrationTextV2({
    personaName: args.bot?.name ?? null,
    fixtureLabels: args.fixtureLabels,
    appearance: profile
      ? {
          description: profile.appearance.description,
          style: profile.appearance.style,
          presence: profile.appearance.presence,
          pronouns: profile.identity.pronouns,
        }
      : null,
  });
}

function mysteryIdentityMirrorTargetSnapshotV1(
  bot: MysteryV2BotRow,
): DebateMysteryIdentityMirrorTargetSnapshotV1 {
  return {
    version: 1,
    botId: bot.id,
    name: bot.name,
    faceStyle: botIdentityMirrorFaceV1({
      faceEyesFont: bot.face_eyes_font,
      faceEyeCharacter: bot.face_eye_character,
      faceEyeCount: bot.face_eye_count,
      faceEyeSpacing: bot.face_eye_spacing,
      faceEyeAnimation: bot.face_eye_animation,
      faceMouthFont: bot.face_mouth_font,
      faceMouthCharacter: bot.face_mouth_character,
      faceMouthAnimation: bot.face_mouth_animation,
      faceMouthSpeechPoses: bot.face_mouth_speech_poses,
      faceMouthCoffeePucker: bot.face_mouth_coffee_pucker,
      faceFontWeight: bot.face_font_weight,
      faceEyeScale: bot.face_eye_scale,
      faceEyeOffsetX: bot.face_eye_offset_x,
      faceEyeOffsetY: bot.face_eye_offset_y,
      faceEyeRotationDeg: bot.face_eye_rotation_deg,
      faceMouthScale: bot.face_mouth_scale,
      faceMouthOffsetX: bot.face_mouth_offset_x,
      faceMouthOffsetY: bot.face_mouth_offset_y,
      faceMouthRotationDeg: bot.face_mouth_rotation_deg,
      faceBlinkBar: bot.face_blink_bar,
      faceBlinkCount: bot.face_blink_count ?? bot.face_eye_count,
      faceBlinkScale: bot.face_blink_scale,
      faceBlinkOffsetX: bot.face_blink_offset_x,
      faceBlinkOffsetY: bot.face_blink_offset_y,
      faceBlinkRotationDeg: bot.face_blink_rotation_deg,
      faceThinkingFrames: bot.face_thinking_frames,
      faceThinkingScale: bot.face_thinking_scale,
      faceThinkingOffsetX: bot.face_thinking_offset_x,
      faceThinkingOffsetY: bot.face_thinking_offset_y,
    }),
    avatarDetails: parseStoredBotAvatarDetailsV1(bot.avatar_details_json),
    glyph: bot.glyph,
  };
}

function v1ScaffoldConfig(
  config: DebateMysteryResolvedConfigV2,
  incidentPlan?: MysteryIncidentPlanV1,
): DebateMysteryResolvedConfigV1 {
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
    prosecutorPartnerBotId: config.prosecutorBotId,
    rivalDefenseBotId: config.rivalDefenseBotId,
    actionBudget: 10_000,
    accompliceChance: incidentPlan && mysteryIncidentPlanRequiresAccompliceV1(incidentPlan)
      ? 1
      : debateMysteryAccompliceChance(
          config.difficulty,
          config.preset,
          config.suspectBotIds.length,
        ),
  };
}

function completedPassTiming(
  db: DatabaseSync,
  row: MysteryV2JobRow,
  elapsedMs: number,
): { basisPasses: number; approximateRemainingMs: number | null } {
  const markers = db.prepare(
    `SELECT pass_number, elapsed_ms
       FROM debate_mystery_v2_checkpoints
      WHERE user_id = ? AND session_id = ? AND pass_number IS NOT NULL
      ORDER BY pass_number`,
  ).all(row.user_id, row.session_id) as unknown as Array<{
    pass_number: number;
    elapsed_ms: number;
  }>;
  const completed = markers.filter((marker) => marker.pass_number <= row.completed_passes);
  if (completed.length < 2 || row.completed_passes >= row.total_passes) {
    return { basisPasses: completed.length, approximateRemainingMs: null };
  }
  const latestElapsed = completed.at(-1)?.elapsed_ms ?? 0;
  const averageMs = latestElapsed / Math.max(1, row.completed_passes);
  return {
    basisPasses: completed.length,
    approximateRemainingMs: Math.max(
      0,
      Math.round((averageMs * row.total_passes) - elapsedMs),
    ),
  };
}

function forgeSubstep(
  id: string,
  label: string,
  state: DebateMysteryCompilationSubstepV2["state"],
): DebateMysteryCompilationSubstepV2 {
  return { id, label, state };
}

/**
 * This projection may only use durable checkpoints, deterministic pass state,
 * and local-audio counters. It deliberately does not expose case text, cast
 * identities, evidence, or private compiler payloads.
 */
function compilationSubsteps(
  db: DatabaseSync,
  row: MysteryV2JobRow,
): DebateMysteryCompilationSubstepV2[] {
  const session = getDebateSession(db, row.user_id, row.session_id);
  const frozenConfig = session.formatState.format === "whodunnit" && session.formatState.version === 2
    ? session.formatState.config
    : null;
  const omitInvestigation = frozenConfig
    ? mysteryCompilationOmitsInvestigationV2(
        resolveMysteryCompilationScopeV2(frozenConfig),
      )
    : false;
  const attention = row.status === "needs_attention";
  const currentState: DebateMysteryCompilationSubstepV2["state"] = attention
    ? "attention"
    : "active";
  // Failure recovery retains the last durable boundary; keep projecting that
  // boundary instead of cosmetically collapsing the Forge to a generic error.
  const stage = row.stage === "needs_attention"
    ? row.completed_passes <= 0
      ? "writing_case"
      : row.completed_passes === 1
        ? "testing_contradictions"
        : row.completed_passes === 2
          ? "directing_performances"
          : row.completed_passes === 3
            ? "preparing_local_voices"
            : "verifying_case_audio"
    : row.stage;
  let stored: unknown = null;
  if (row.checkpoint_json) {
    try {
      stored = JSON.parse(row.checkpoint_json) as unknown;
    } catch {
      // A damaged private checkpoint must not make the spoiler-safe status
      // endpoint unusable. Recovery will still stop at the durable pass edge.
    }
  }
  const draft = isMysteryV2AuthoringCheckpoint(stored) ? stored : null;
  const completedWitnesses = draft ? Object.keys(draft.suspectsBySeatId).length : 0;
  const totalWitnesses = frozenConfig?.suspectBotIds.length ?? 0;

  switch (stage) {
    case "writing_case": {
      const foundationCoreComplete = Boolean(draft?.foundationCore);
      const foundationComplete = Boolean(draft?.foundation);
      const witnessesComplete = totalWitnesses > 0 && completedWitnesses >= totalWitnesses;
      if (!foundationCoreComplete) {
        return [
          forgeSubstep("foundation", "Case foundation", currentState),
          ...(!omitInvestigation ? [forgeSubstep("room-details", "Room details", "upcoming" as const)] : []),
          forgeSubstep("witness-chapters", "Witness chapters", "upcoming"),
          forgeSubstep("prosecution-responses", "Prosecution responses", "upcoming"),
        ];
      }
      if (!omitInvestigation && !foundationComplete) {
        return [
          forgeSubstep("foundation", "Case foundation", "complete"),
          forgeSubstep("room-details", "Room details", currentState),
          forgeSubstep("witness-chapters", "Witness chapters", "upcoming"),
          forgeSubstep("prosecution-responses", "Prosecution responses", "upcoming"),
        ];
      }
      if (!witnessesComplete) {
        return [
          forgeSubstep("foundation", "Case foundation", "complete"),
          ...(!omitInvestigation ? [forgeSubstep("room-details", "Room details", "complete" as const)] : []),
          forgeSubstep(
            "witness-chapters",
            totalWitnesses > 0 ? `Witness chapters · ${completedWitnesses} of ${totalWitnesses}` : "Witness chapters",
            currentState,
          ),
          forgeSubstep("prosecution-responses", "Prosecution responses", "upcoming"),
        ];
      }
      if (!draft?.prosecutionChoices) {
        return [
          forgeSubstep("foundation", "Case foundation", "complete"),
          ...(!omitInvestigation ? [forgeSubstep("room-details", "Room details", "complete" as const)] : []),
          forgeSubstep("witness-chapters", "Witness chapters", "complete"),
          forgeSubstep("prosecution-responses", "Prosecution responses", currentState),
        ];
      }
      return [
        forgeSubstep("foundation", "Case foundation", "complete"),
        ...(!omitInvestigation ? [forgeSubstep("room-details", "Room details", "complete" as const)] : []),
        forgeSubstep("witness-chapters", "Witness chapters", "complete"),
        forgeSubstep("prosecution-responses", "Prosecution responses", "complete"),
        forgeSubstep("assemble-case", "Assembling the case package", currentState),
      ];
    }
    case "testing_contradictions":
      return [
        forgeSubstep("case-draft", "Case draft", "complete"),
        forgeSubstep("contradiction-checks", "Checking contradictions", currentState),
      ];
    case "directing_performances":
      return [
        forgeSubstep("contradiction-checks", "Contradictions checked", "complete"),
        forgeSubstep("performance-directions", "Checking performance directions", currentState),
      ];
    case "preparing_local_voices": {
      const recordingsComplete = row.required_audio_count > 0 &&
        row.prepared_audio_count >= row.required_audio_count;
      return [
        forgeSubstep("dialogue-graph", "Dialogue graph frozen", "complete"),
        forgeSubstep(
          "local-recordings",
          row.required_audio_count > 0
            ? `Preparing local recordings · ${row.prepared_audio_count} of ${row.required_audio_count}`
            : "Mapping reachable dialogue",
          recordingsComplete ? "complete" : currentState,
        ),
        forgeSubstep("audio-verification", "Verifying the local audio pack", recordingsComplete ? currentState : "upcoming"),
      ];
    }
    case "verifying_case_audio":
      return [
        forgeSubstep("local-recordings", "Local recordings prepared", "complete"),
        forgeSubstep("audio-verification", "Verifying the local audio pack", currentState),
        forgeSubstep("open-case", "Opening the case", "upcoming"),
      ];
    case "complete":
      return [
        forgeSubstep("local-recordings", "Local recordings prepared", "complete"),
        forgeSubstep("audio-verification", "Audio pack verified", "complete"),
        forgeSubstep("open-case", "Case ready", "complete"),
      ];
    case "cancelled":
      return [forgeSubstep("cancelled", "Preparation cancelled", "attention")];
  }
}

function compilationStatus(
  db: DatabaseSync,
  row: MysteryV2JobRow,
): DebateMysteryCompilationStatusV2 {
  const publicFailureStage = row.status !== "needs_attention"
    ? null
    : row.completed_passes <= 0
      ? "writing_case"
      : row.completed_passes === 1
        ? "testing_contradictions"
        : row.completed_passes === 2
          ? "directing_performances"
          : row.completed_passes === 3
            ? "preparing_local_voices"
            : "verifying_case_audio";
  const terminal =
    row.status === "complete" ||
    row.status === "cancelled" ||
    row.status === "needs_attention";
  const elapsedEnd = terminal ? Date.parse(row.updated_at) : Date.now();
  const elapsedMs = Math.max(0, elapsedEnd - Date.parse(row.created_at));
  const normalizedElapsedMs = Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : 0;
  const timing = completedPassTiming(db, row, normalizedElapsedMs);
  return {
    version: 2,
    jobId: row.id,
    stage: row.stage,
    attempt: row.attempt,
    completedPasses: row.completed_passes,
    totalPasses: row.total_passes,
    preparedAudioCount: row.prepared_audio_count,
    requiredAudioCount: row.required_audio_count,
    substeps: compilationSubsteps(db, row),
    retryable: row.status === "needs_attention",
    publicFailureCode: row.status !== "needs_attention"
      ? null
      : row.public_message === "Local voice preparation needs attention"
        ? "CASE_FORGE_LOCAL_AUDIO_FAILED"
        : "CASE_FORGE_COMPILATION_STOPPED",
    publicFailureStage,
    spoilerSafeMessage: normalizeDebateMysteryV2ForgeProgressMessage(
      row.public_message,
    ),
    startedAt: row.created_at,
    elapsedMs: normalizedElapsedMs,
    approximateRemainingMs: timing.approximateRemainingMs,
    etaBasisPasses: timing.basisPasses,
    updatedAt: row.updated_at,
  };
}

function jobRow(db: DatabaseSync, userId: string, sessionId: string): MysteryV2JobRow {
  const row = db.prepare(
    `SELECT id, user_id, session_id, status, stage, attempt,
            completed_passes, total_passes, prepared_audio_count,
            required_audio_count, public_message, private_error, input_json,
            checkpoint_json, lease_owner, leased_until,
            cancellation_requested, created_at, updated_at
       FROM debate_mystery_v2_jobs
      WHERE user_id = ? AND session_id = ?`,
  ).get(userId, sessionId) as MysteryV2JobRow | undefined;
  if (!row) throw new HttpError(404, "Whodunnit V2 compilation job not found.");
  return row;
}

function publicSessionJson(session: DebateSessionV1): string {
  return JSON.stringify({ ...session, events: [] });
}

function mysteryV2ExhibitDescriptor(
  item: { title: string },
): { adjective: string; object: string } {
  const words = item.title.replace(/\s+/gu, " ").trim().split(" ").filter(Boolean);
  const adjective = normalizeDebateEvidenceExhibitAdjective(words[0] ?? "Recovered") || "Recovered";
  const object = normalizeDebateEvidenceExhibitObject(words.slice(1).join(" ") || words[0] || "evidence") || "evidence";
  return { adjective, object };
}

function syncMysteryV2PresentationEvidence(
  session: DebateSessionV1,
  state: DebateWhodunnitFormatStateV2,
): { state: DebateWhodunnitFormatStateV2; evidence: DebateSessionV1["evidence"] } {
  const existingById = new Map(
    (session.evidence.exhibits ?? []).map((exhibit) => [exhibit.id, exhibit]),
  );
  const record = state.record.map((item) => {
    if (item.reference.kind !== "evidence") return item;
    const existing = existingById.get(item.reference.id);
    const imageId = item.imageId ?? existing?.imageId ?? null;
    const visualKind = imageId
      ? item.visualKind === "upload" || existing?.visualKind === "upload"
        ? "upload" as const
        : "synthesized" as const
      : "emoji" as const;
    return { ...item, imageId, visualKind };
  });
  const exhibits: DebateEvidenceExhibitV1[] = record.flatMap((item) => {
    if (item.reference.kind !== "evidence") return [];
    const descriptor = mysteryV2ExhibitDescriptor(item);
    const existing = existingById.get(item.reference.id);
    const imageId = item.imageId ?? existing?.imageId ?? null;
    return [{
      id: item.reference.id,
      adjective: descriptor.adjective,
      object: descriptor.object,
      title: debateEvidenceExhibitTitle(descriptor),
      observation: item.description,
      emoji: item.emoji,
      visualKind: imageId
        ? item.visualKind === "upload" || existing?.visualKind === "upload"
          ? "upload"
          : "synthesized"
        : "emoji",
      imageId,
      createdBy: "prism",
    }];
  });
  return {
    state: { ...state, record },
    evidence: normalizeDebateEvidencePacketV1({
      ...session.evidence,
      exhibits,
      frozenAt: session.evidence.frozenAt ?? new Date().toISOString(),
    }),
  };
}

function persistV2Session(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
  state: DebateWhodunnitFormatStateV2,
  expectedRevision = session.revision,
): DebateSessionV1 {
  const synced = syncMysteryV2PresentationEvidence(session, state);
  const next: DebateSessionV1 = {
    ...session,
    revision: expectedRevision + 1,
    updatedAt: new Date().toISOString(),
    formatState: synced.state,
    evidence: synced.evidence,
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

function persistMysteryV2ReadinessMigration(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
  state: DebateWhodunnitFormatStateV2,
  checkpointState: DebateWhodunnitFormatStateV2,
  privateCase: PrivateMysteryCaseV2,
  graph: DebateMysteryDialogueGraphV2,
): DebateSessionV1 {
  db.exec("BEGIN IMMEDIATE");
  try {
    const job = jobRow(db, userId, session.id);
    const storedCheckpoint = job.checkpoint_json
      ? JSON.parse(job.checkpoint_json) as unknown
      : null;
    if (job.status !== "complete" || !isMysteryV2CompiledCheckpoint(storedCheckpoint)) {
      throw new HttpError(409, "The compiled Whodunnit V2 checkpoint is unavailable.");
    }
    const next = persistV2Session(db, userId, session, state);
    storeCompiledCaseV2(db, userId, session.id, privateCase, graph);
    const checkpoint: MysteryV2Checkpoint = {
      ...storedCheckpoint,
      kind: "compiled-v1",
      privateCase,
      graph,
      publicState: checkpointState,
    };
    const result = db.prepare(
      `UPDATE debate_mystery_v2_jobs
          SET checkpoint_json = ?, updated_at = ?
        WHERE user_id = ? AND session_id = ? AND status = 'complete'`,
    ).run(
      JSON.stringify(checkpoint),
      new Date().toISOString(),
      userId,
      session.id,
    );
    if (Number(result.changes) !== 1) {
      throw new HttpError(409, "The compiled Whodunnit V2 checkpoint changed during repair.");
    }
    db.exec("COMMIT");
    return next;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
    normalizeDebateMysteryV2ForgeProgressMessage(
      values.publicMessage ?? V2_SPOILER_SAFE_MESSAGES[stage],
    ),
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

function recordCompilationCheckpoint(
  db: DatabaseSync,
  row: MysteryV2JobRow,
  args: {
    key: string;
    stage: DebateMysteryCompilationStageV2;
    payload: string;
    passNumber?: number | null;
  },
): void {
  const completedAt = new Date().toISOString();
  const elapsedMs = Math.max(0, Date.parse(completedAt) - Date.parse(row.created_at));
  db.prepare(
    `INSERT INTO debate_mystery_v2_checkpoints
       (session_id, user_id, checkpoint_key, pass_number, stage,
        payload_hash, elapsed_ms, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, checkpoint_key) DO NOTHING`,
  ).run(
    row.session_id,
    row.user_id,
    args.key,
    args.passNumber ?? null,
    args.stage,
    sha256(args.payload),
    Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : 0,
    completedAt,
  );
}

function authoringCheckpointKeys(
  draft: MysteryV2AuthoringCheckpoint,
): Array<{ key: string; payload: string }> {
  const checkpoints: Array<{ key: string; payload: string }> = [];
  if (draft.foundationCore) {
    checkpoints.push({ key: "section:foundation-core", payload: JSON.stringify(draft.foundationCore) });
  }
  for (const [id, value] of Object.entries(draft.examinationsById ?? {})) {
    if (value?.trim()) checkpoints.push({ key: `section:examination:${id}`, payload: value });
  }
  if (draft.foundation) {
    checkpoints.push({ key: "section:foundation", payload: JSON.stringify(draft.foundation) });
  }
  for (const [seatId, suspect] of Object.entries(draft.suspectsBySeatId)) {
    checkpoints.push({ key: `section:witness:${seatId}`, payload: JSON.stringify(suspect) });
  }
  if (draft.prosecutionChoices) {
    checkpoints.push({
      key: "section:prosecution-choices",
      payload: JSON.stringify(draft.prosecutionChoices),
    });
  }
  for (const [sectionKey, receipt] of Object.entries(draft.recoveryBySection)) {
    checkpoints.push({
      key: `recovery:${sectionKey}`,
      payload: JSON.stringify(receipt),
    });
  }
  return checkpoints;
}

function persistAuthoringCheckpoint(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  draft: MysteryV2AuthoringCheckpoint,
  publicMessage: string,
): MysteryV2JobRow {
  const checkpointJson = JSON.stringify(draft);
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = updateJob(db, userId, sessionId, { checkpointJson, publicMessage });
    for (const checkpoint of authoringCheckpointKeys(draft)) {
      recordCompilationCheckpoint(db, row, {
        key: checkpoint.key,
        stage: "writing_case",
        payload: checkpoint.payload,
      });
    }
    db.exec("COMMIT");
    return jobRow(db, userId, sessionId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function persistCompiledSectionCheckpoint(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  args: {
    key: string;
    stage: DebateMysteryCompilationStageV2;
    checkpoint: MysteryV2Checkpoint;
    payload: string;
  },
): MysteryV2JobRow {
  const checkpointJson = JSON.stringify(args.checkpoint);
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = updateJob(db, userId, sessionId, { checkpointJson });
    recordCompilationCheckpoint(db, row, {
      key: args.key,
      stage: args.stage,
      payload: args.payload,
    });
    db.exec("COMMIT");
    return jobRow(db, userId, sessionId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function withPreparedEvidenceAsset(
  checkpoint: MysteryV2Checkpoint,
  exhibitId: string,
  asset: DebateMysterySealedAssetRefV1,
): MysteryV2Checkpoint {
  const visualKind = asset.status === "ready" ? "synthesized" as const : "emoji" as const;
  return {
    ...checkpoint,
    privateCase: {
      ...checkpoint.privateCase,
      recordItems: checkpoint.privateCase.recordItems.map((item) =>
        item.reference.kind === "evidence" && item.reference.id === exhibitId
          ? { ...item, visualKind, sealedAsset: asset }
          : item),
    },
    publicState: {
      ...checkpoint.publicState,
      record: checkpoint.publicState.record.map((item) =>
        item.reference.kind === "evidence" && item.reference.id === exhibitId
          ? { ...item, visualKind, sealedAsset: asset }
          : item),
    },
  };
}

function withPreparedRoomAsset(
  checkpoint: MysteryV2Checkpoint,
  roomId: string,
  asset: DebateMysterySealedAssetRefV1,
): MysteryV2Checkpoint {
  return {
    ...checkpoint,
    publicState: {
      ...checkpoint.publicState,
      rooms: checkpoint.publicState.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              sealedAsset: asset,
              accessState: room.visited
                ? "visited"
                : asset.status === "pending"
                  ? "being_secured"
                  : "ready_to_enter",
            }
          : room),
    },
  };
}

function withPreparedMansionExteriorAsset(
  checkpoint: MysteryV2Checkpoint,
  asset: DebateMysterySealedAssetRefV1,
): MysteryV2Checkpoint {
  return {
    ...checkpoint,
    publicState: { ...checkpoint.publicState, mansionExterior: asset },
  };
}

/** Publishes the title-card exterior after a retry or background preparation. */
export function attachDebateMysteryMansionExteriorAssetV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  asset: DebateMysterySealedAssetRefV1,
): DebateSessionV1 {
  const session = getDebateSession(db, userId, sessionId);
  if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
    throw new HttpError(409, "Mansion artwork requires a Whodunnit V2 case.");
  }
  if (JSON.stringify(session.formatState.mansionExterior ?? null) === JSON.stringify(asset)) {
    return session;
  }
  return persistV2Session(db, userId, session, {
    ...session.formatState,
    mansionExterior: asset,
  });
}

/**
 * Publishes one spoiler-safe room asset state after the durable background
 * worker settles it. Optimistic retries preserve simultaneous player actions.
 */
export function attachDebateMysteryRoomAssetV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  roomId: string,
  asset: DebateMysterySealedAssetRefV1,
): DebateSessionV1 {
  let lastConflict: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const session = getDebateSession(db, userId, sessionId);
    if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
      throw new HttpError(409, "Room artwork requires a Whodunnit V2 case.");
    }
    if (session.status === "cancelled") {
      throw new HttpError(409, "That case is no longer available.");
    }
    const room = session.formatState.rooms.find((entry) => entry.id === roomId);
    if (!room) throw new HttpError(404, "That mystery room was not found.");
    if (JSON.stringify(room.sealedAsset ?? null) === JSON.stringify(asset)) {
      return session;
    }
    const state = structuredClone(session.formatState);
    state.rooms = state.rooms.map((entry) =>
      entry.id === roomId
        ? {
            ...entry,
            sealedAsset: asset,
            accessState: entry.visited
              ? "visited"
              : asset.status === "pending"
                ? "being_secured"
                : "ready_to_enter",
          }
        : entry);
    try {
      return persistV2Session(db, userId, session, state);
    } catch (error) {
      lastConflict = error;
      if (!(error instanceof HttpError) || error.statusCode !== 409) throw error;
    }
  }
  throw lastConflict;
}

/** Publishes one encrypted exhibit result into the private case and, only when
 * already admitted, its public Case File row. */
export function attachDebateMysteryEvidenceAssetV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  exhibitId: string,
  asset: DebateMysterySealedAssetRefV1,
): DebateSessionV1 {
  db.exec("BEGIN IMMEDIATE");
  try {
    const session = getDebateSession(db, userId, sessionId);
    if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
      throw new HttpError(409, "Evidence artwork requires a Whodunnit V2 case.");
    }
    if (session.status === "cancelled") {
      throw new HttpError(409, "That case is no longer available.");
    }
    const stored = getDebateMysteryCaseV2(db, userId, sessionId);
    const privateItem = stored.privateCase.recordItems.find(
      (item) => item.reference.kind === "evidence" && item.reference.id === exhibitId,
    );
    if (!privateItem) throw new HttpError(404, "That mystery evidence was not found.");
    const visualKind = asset.status === "ready" ? "synthesized" as const : "emoji" as const;
    const privateCase: PrivateMysteryCaseV2 = {
      ...stored.privateCase,
      recordItems: stored.privateCase.recordItems.map((item) =>
        item.reference.kind === "evidence" && item.reference.id === exhibitId
          ? { ...item, visualKind, sealedAsset: asset }
          : item),
    };
    const state = structuredClone(session.formatState);
    state.record = state.record.map((item) =>
      item.reference.kind === "evidence" && item.reference.id === exhibitId
        ? { ...item, visualKind, sealedAsset: asset }
        : item);
    storeCompiledCaseV2(db, userId, sessionId, privateCase, stored.graph);
    const updated = persistV2Session(db, userId, session, state);
    db.exec("COMMIT");
    return updated;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function unpreparedMysteryV2EvidenceAssets(
  session: DebateSessionV1,
  checkpoint: MysteryV2Checkpoint,
  roomId?: string,
): Array<DebateEvidenceExhibitV1 & { roomId: string | null }> {
  const existingById = new Map(
    (session.evidence.exhibits ?? []).map((exhibit) => [exhibit.id, exhibit]),
  );
  return checkpoint.privateCase.recordItems.flatMap((item) => {
    if (item.reference.kind !== "evidence") return [];
    const evidenceRoomId = checkpoint.privateCase.evidenceRoomIdById?.[item.reference.id] ?? null;
    if (roomId !== undefined && evidenceRoomId !== roomId) return [];
    const existing = existingById.get(item.reference.id);
    const imageId = item.imageId ?? existing?.imageId ?? null;
    if (imageId || item.sealedAsset?.status === "ready" || item.sealedAsset?.status === "fallback") return [];
    const descriptor = mysteryV2ExhibitDescriptor(item);
    return [{
      id: item.reference.id,
      adjective: descriptor.adjective,
      object: descriptor.object,
      title: debateEvidenceExhibitTitle(descriptor),
      observation: item.description,
      emoji: item.emoji,
      visualKind: "emoji",
      imageId: null,
      createdBy: "prism",
      roomId: evidenceRoomId,
    }];
  });
}

export function pendingDebateMysteryEvidenceAssetsForRoomV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  roomId: string,
): Array<DebateEvidenceExhibitV1 & { roomId: string | null }> {
  const session = getDebateSession(db, userId, sessionId);
  if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
    throw new HttpError(409, "Evidence artwork requires a Whodunnit V2 case.");
  }
  const stored = getDebateMysteryCaseV2(db, userId, sessionId);
  return unpreparedMysteryV2EvidenceAssets(session, {
    privateCase: stored.privateCase,
    graph: stored.graph,
    publicState: session.formatState,
  }, roomId);
}

function completeCompilationPass(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  args: {
    passNumber: number;
    key: string;
    stage: DebateMysteryCompilationStageV2;
    payload: string;
    checkpointJson?: string;
    publicMessage?: string;
    preparedAudioCount?: number;
    requiredAudioCount?: number;
    status?: MysteryV2JobRow["status"];
    privateError?: string | null;
    clearLease?: boolean;
  },
): MysteryV2JobRow {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = jobRow(db, userId, sessionId);
    recordCompilationCheckpoint(db, current, {
      key: args.key,
      stage: args.stage,
      payload: args.payload,
      passNumber: args.passNumber,
    });
    updateJob(db, userId, sessionId, {
      stage: args.stage,
      completedPasses: Math.max(current.completed_passes, args.passNumber),
      checkpointJson: args.checkpointJson,
      publicMessage: args.publicMessage,
      preparedAudioCount: args.preparedAudioCount,
      requiredAudioCount: args.requiredAudioCount,
      status: args.status,
      privateError: args.privateError,
      clearLease: args.clearLease,
    });
    db.exec("COMMIT");
    return jobRow(db, userId, sessionId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function publicCaseTitleFromMysteryV2Checkpoint(
  row: MysteryV2JobRow,
): string | null {
  if (!row.checkpoint_json) return null;
  try {
    const stored = JSON.parse(row.checkpoint_json) as unknown;
    if (isMysteryV2CompiledCheckpoint(stored)) {
      const validation = validateMysteryCaseTitleV1(
        stored.publicState.caseTitle ?? "",
      );
      return validation.valid ? validation.normalizedTitle : null;
    }
    if (!isMysteryV2AuthoringCheckpoint(stored)) return null;
    const draft = normalizeMysteryV2AuthoringCheckpoint(stored);
    const authoredTitle = draft.foundationCore?.title ?? draft.foundation?.title;
    if (!authoredTitle) return null;
    const incidentPlan = draft.contextCapsule?.factLedger.incidentPlan;
    if (incidentPlan) {
      return resolveMysteryCaseTitleV1({
        authoredTitle,
        plan: incidentPlan,
      });
    }
    const validation = validateMysteryCaseTitleV1(authoredTitle);
    return validation.valid ? validation.normalizedTitle : null;
  } catch {
    // A damaged private checkpoint must not prevent the spoiler-safe public
    // session from reporting its last known compilation state.
    return null;
  }
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
  const checkpointTitle = publicCaseTitleFromMysteryV2Checkpoint(row);
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
    error: row.status === "needs_attention"
      ? normalizeDebateMysteryV2ForgeProgressMessage(row.public_message)
      : null,
  }, {
    ...session.formatState,
    ...(checkpointTitle ? { caseTitle: checkpointTitle } : {}),
    ...extras,
    compilation: compilationStatus(db, row),
  });
}

function initialV2State(
  config: DebateMysteryResolvedConfigV2,
  jobId: string,
  now: string,
  mansionExterior: DebateMysterySealedAssetRefV1 | null = null,
): DebateWhodunnitFormatStateV2 {
  const omitInvestigation = mysteryCompilationOmitsInvestigationV2(
    resolveMysteryCompilationScopeV2(config),
  );
  return {
    version: 2,
    format: "whodunnit",
    playPhase: "case_forge",
    mansionExterior,
    compilation: {
      version: 2,
      jobId,
      stage: "writing_case",
      attempt: 0,
      completedPasses: 0,
      totalPasses: V2_TOTAL_PASSES,
      preparedAudioCount: 0,
      requiredAudioCount: 0,
      substeps: [
        forgeSubstep("foundation", "Case foundation", "active"),
        ...(!omitInvestigation
          ? [forgeSubstep("room-details", "Room details", "upcoming" as const)]
          : []),
        forgeSubstep("witness-chapters", "Witness chapters", "upcoming"),
        forgeSubstep("prosecution-responses", "Prosecution responses", "upcoming"),
      ],
      retryable: false,
      publicFailureCode: null,
      publicFailureStage: null,
      spoilerSafeMessage: V2_SPOILER_SAFE_MESSAGES.writing_case,
      startedAt: now,
      elapsedMs: 0,
      approximateRemainingMs: null,
      etaBasisPasses: 0,
      updatedAt: now,
    },
    caseTitle: null,
    fictionLabel: "Fictional, non-canonical case",
    caseCharge: null,
    config,
    victim: null,
    suspects: [],
    rooms: [],
    crimeSceneRoomId: null,
    openingSweepComplete: omitInvestigation,
    roomIntroductions: {},
    currentRoomId: null,
    roomView: "mansion",
    metSuspectSeatIds: [],
    discoveryIds: [],
    record: [],
    topics: [],
    dialogueHistory: [],
    identityMirrorTargetSnapshots: {},
    activeDialogueNodeId: null,
    theoryAvailable: false,
    theory: null,
    theoryFiledAt: null,
    court: null,
    verdict: null,
    readiness: {
      version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
      status: "repairing",
      spoilerSafeMessage: "Preparing the finite local case pack",
      contractHash: null,
      checkedAt: null,
    },
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
    whodunnit: {
      ...source,
      // The session's immediate V2 projection is constructed before the
      // compiler's private checkpoint. Keep this resolved choice there too.
      assetSynthesis: config.assetSynthesis,
    } as unknown as DebateSessionCreateRequest["whodunnit"],
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
      motion: "Determine who is responsible for the central incident and prove the filed accusation in court.",
      forSide: { label: "Prosecution", brief: "Investigate, file charges, and prove the accusation from the admitted record." },
      againstSide: { label: "Defense", brief: "Test the accusation against every fair alternative in the admitted record." },
    },
    evidence: { version: 1, notes: "", sources: [], exhibits: [], frozenAt: null },
    moderatorTitle: "The Court",
    moderatorBotId: config.judgeBotId,
    playerJudgeUsesPrism: config.judgeBotId === "prism:player-judge",
    forAdvocateBotId: config.prosecutorBotId,
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
  return compilationStatus(db, jobRow(db, userId, sessionId));
}

export function claimDebateMysteryAssetBackgroundLeaseV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  owner: string,
  leaseMs = 15 * 60_000,
): boolean {
  const now = new Date();
  const leasedUntil = new Date(now.getTime() + leaseMs).toISOString();
  return Number(db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET lease_owner = ?, leased_until = ?, updated_at = ?
      WHERE user_id = ? AND session_id = ? AND status = 'complete'
        AND cancellation_requested = 0
        AND (lease_owner IS NULL OR leased_until IS NULL OR leased_until < ? OR lease_owner = ?)`,
  ).run(
    owner,
    leasedUntil,
    now.toISOString(),
    userId,
    sessionId,
    now.toISOString(),
    owner,
  ).changes) === 1;
}

export function releaseDebateMysteryAssetBackgroundLeaseV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  owner: string,
): void {
  db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET lease_owner = NULL, leased_until = NULL, updated_at = ?
      WHERE user_id = ? AND session_id = ? AND lease_owner = ?`,
  ).run(new Date().toISOString(), userId, sessionId, owner);
}

export interface DebateMysteryActiveCompilationV2 {
  sessionId: string;
  status: "queued" | "running";
}

/**
 * One account owns one active Case Forge slot. Other Debate and synthesis
 * work deliberately does not participate in this mutex.
 */
export function activeDebateMysteryCompilationV2(
  db: DatabaseSync,
  userId: string,
  excludingSessionId?: string,
): DebateMysteryActiveCompilationV2 | null {
  const row = db.prepare(
    `SELECT session_id, status
       FROM debate_mystery_v2_jobs
      WHERE user_id = ?
        AND status IN ('queued', 'running')
        AND (status = 'running' OR cancellation_requested = 0)
        AND (? IS NULL OR session_id != ?)
      ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END,
               created_at ASC,
               id ASC
      LIMIT 1`,
  ).get(
    userId,
    excludingSessionId ?? null,
    excludingSessionId ?? null,
  ) as { session_id: string; status: "queued" | "running" } | undefined;
  return row
    ? { sessionId: row.session_id, status: row.status }
    : null;
}

function throwActiveCaseForgeConflict(): never {
  throw new HttpError(
    409,
    "Another Case Forge is already preparing a Whodunnit. Let it finish or cancel it before compiling another.",
    "MYSTERY_CASE_FORGE_ALREADY_ACTIVE",
  );
}

export async function createDebateMysterySessionV2(
  db: DatabaseSync,
  userId: string,
  configInput: DebateWhodunnitCreateConfigV2,
  idempotencyKeyInput: unknown,
  runtime: DebateAiRuntime,
  options: {
    deferBackgroundStart?: boolean;
    generateWave?: DebateMysteryCompilationOptionsV2["generateWave"];
    prepareEvidenceAssets?: DebateMysteryCompilationOptionsV2["prepareEvidenceAssets"];
    prepareRoomAssets?: DebateMysteryCompilationOptionsV2["prepareRoomAssets"];
    prepareIllustratedRooms?: DebateMysteryCompilationOptionsV2["prepareIllustratedRooms"];
    prepareMansionExteriorAsset?: DebateMysteryCompilationOptionsV2["prepareMansionExteriorAsset"];
    adoptMansionExteriorDraft?: DebateMysteryCompilationOptionsV2["adoptMansionExteriorDraft"];
    onCompilationReady?: DebateMysteryCompilationOptionsV2["onCompilationReady"];
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
  const existingForKey = db.prepare(
    "SELECT id FROM debate_sessions WHERE user_id = ? AND create_idempotency_key = ?",
  ).get(userId, idempotencyKey) as { id?: string } | undefined;
  if (existingForKey?.id) return getDebateSession(db, userId, existingForKey.id);
  const mansionExteriorImageId = compact(configInput.mansionExteriorImageId, 200) || null;
  if (activeDebateMysteryCompilationV2(db, userId)) {
    throwActiveCaseForgeConflict();
  }
  if (mysteryCompilationOmitsInvestigationV2(resolveMysteryCompilationScopeV2(config))) {
    config = {
      ...config,
      assetSynthesis: {
        ...config.assetSynthesis,
        rooms: false,
        illustratedRooms: false,
        music: false,
        ambience: false,
      },
    };
  }
  if (
    config.assetSynthesis.rooms &&
    (runtime.responseMode === "local" ||
      (runtime.responseMode === undefined && runtime.preferredProvider === "local"))
  ) {
    throw new HttpError(
      400,
      "Room synthesis is available in ONLINE or Auto mode. LOCAL uses bundled rooms.",
      "MYSTERY_ROOM_SYNTHESIS_REQUIRES_ONLINE",
    );
  }
  if (config.mansionBundleId) {
    if (mansionExteriorImageId) {
      throw new HttpError(400, "Installed and authored mansions keep their existing exterior artwork.");
    }
    const mansion = getDebateMysteryMansionBundleV2(
      db,
      userId,
      config.mansionBundleId,
    );
    if (mansion.suspectCount !== config.suspectBotIds.length) {
      throw new HttpError(
        400,
        `This saved mansion requires exactly ${mansion.suspectCount} suspects.`,
      );
    }
    const mansionSnapshot = freezeDebateMysteryMansionSnapshotV2(mansion);
    config = {
      ...config,
      preset: "custom",
      floors: mansion.floors,
      totalRooms: mansion.totalRooms,
      scaleClass: mansion.scaleClass,
      mansionSnapshot,
      houseStyle: {
        ...mansionSnapshot.presentation.houseStyle,
      },
    };
  }
  if (debateMysteryPremiumAvailableV2()) {
    throw new Error("Whodunnit V2 Premium must remain disabled during the core release.");
  }
  const allBotIds = [
    ...config.suspectBotIds,
    config.judgeBotId,
    config.prosecutorBotId,
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
  if (mansionExteriorImageId && !options.adoptMansionExteriorDraft) {
    throw new HttpError(500, "Mansion exterior draft adoption is unavailable.");
  }
  const mansionExterior = mansionExteriorImageId
    ? await options.adoptMansionExteriorDraft!({ userId, sessionId: session.id, imageId: mansionExteriorImageId })
    : null;
  session = persistV2Session(db, userId, {
    ...session,
    status: "live",
    phase: "opening",
    stepKey: "mystery_v2_writing_case",
    error: null,
    powerPlan: debatePowerPlanForBots(db, userId, allBotIds, "dark"),
  }, initialV2State(config, jobId, now, mansionExterior));
  if (config.mansionSnapshot) {
    retainDebateMysteryMansionSnapshotAssetsV2(
      db,
      userId,
      session.id,
      config.mansionSnapshot,
    );
  }
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
    JSON.stringify(config),
    now,
    now,
  );
  if (!options.deferBackgroundStart) {
    queueMicrotask(() => {
      void runDebateMysteryCompilationV2(db, userId, session.id, runtime, {
        generateWave: options.generateWave,
        prepareEvidenceAssets: options.prepareEvidenceAssets,
        prepareRoomAssets: options.prepareRoomAssets,
        prepareIllustratedRooms: options.prepareIllustratedRooms,
        prepareMansionExteriorAsset: options.prepareMansionExteriorAsset,
        onCompilationReady: options.onCompilationReady,
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

function authoredFoundationCoreFromJson(args: {
  value: Record<string, unknown>;
  evidenceIds: readonly string[];
  incidentPlan: MysteryBoundIncidentPlanV1;
}): AuthoredMysteryFoundationCoreV2 {
  const title = compact(args.value.title, 120);
  const titleValidation = validateMysteryCaseTitleV1(title);
  if (!titleValidation.valid) {
    throw new MysteryFoundationValidationError(
      `The authored case title failed its public quality boundary: ${titleValidation.errors.join(" ")}`,
    );
  }
  const victimName = compact(args.value.victimName, 100);
  const victimDescription = compact(args.value.victimDescription, 700);
  const publicOpening = compact(args.value.publicOpening, 1_400);
  const motive = compact(args.value.motive, 800);
  const method = compact(args.value.method, 800);
  const prosecutorInternalReasoning =
    compact(args.value.prosecutorInternalReasoning, 800) ||
    compact(args.value.partnerConsultation, 800);
  if (!title || !victimName || !victimDescription || !publicOpening || !motive || !method || !prosecutorInternalReasoning) {
    throw new MysteryFoundationValidationError("The authored case omitted required case prose.");
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
    throw new MysteryFoundationValidationError("The authored case did not describe every frozen evidence item exactly once.");
  }
  return {
    title: titleValidation.normalizedTitle,
    victimName,
    victimDescription,
    publicOpening,
    motive,
    method,
    prosecutorInternalReasoning,
    eyewitnessResolution: compact(args.value.eyewitnessResolution, 900) || null,
    evidence,
  };
}

function deterministicAuthoredMysteryFoundationCoreV2(args: {
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
  eyewitnessSeatId: string | null;
  incidentPlan: MysteryBoundIncidentPlanV1;
}): AuthoredMysteryFoundationCoreV2 {
  return {
    title: deterministicMysteryCaseTitleV1(args.incidentPlan),
    victimName: args.scaffold.victim.name,
    victimDescription: args.scaffold.victim.description,
    publicOpening: args.scaffold.publicOpening,
    motive: args.scaffold.motive,
    method: args.scaffold.method,
    prosecutorInternalReasoning:
      "Follow the admitted physical record and testimony, test each contradiction against the frozen timeline, and leave the player's theory and courtroom strategy to them.",
    eyewitnessResolution: args.eyewitnessSeatId
      ? "The eyewitness account supplies context but cannot establish identity alone; reconcile it with the independently frozen timeline and physical record."
      : null,
    evidence: args.scaffold.evidence.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.observation,
      emoji: item.emoji,
    })),
  };
}

/**
 * Grounds each deterministic complication in two ordinary Case File records.
 * The authoring model can make the prose elegant, but this final pass owns the
 * exact material trace and opportunity claim so a complication cannot exist as
 * flavor text alone or silently drift between retries.
 */
function applyMysteryIncidentPlanToFoundationV2<
  TFoundation extends AuthoredMysteryFoundationCoreV2,
>(args: {
  foundation: TFoundation;
  incidentPlan: MysteryBoundIncidentPlanV1;
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
}): TFoundation {
  if (!args.foundation.evidence.length) return args.foundation;
  const primary = args.incidentPlan.primary;
  const affectedName = args.foundation.victimName;
  const incidentNoun = primary.title.toLocaleLowerCase();
  const caseTitle = resolveMysteryCaseTitleV1({
    authoredTitle: args.foundation.title,
    plan: args.incidentPlan,
  });
  const primaryFoundation = primary.kind === "homicide"
    ? { ...args.foundation, title: caseTitle }
    : {
        ...args.foundation,
        title: caseTitle,
        victimDescription:
          `${affectedName} is the person most directly affected by ${primary.subject}, with private relationships to every member of the frozen ensemble.`,
        publicOpening:
          `A suspected ${incidentNoun} involving ${primary.subject} has drawn every selected suspect into the same mansion. The decisive facts are hidden in its rooms, records, and testimony. You are the lead investigator.`,
        motive:
          `Control of ${primary.subject}, and the consequences of its discovery, supplied the decisive motive.`,
        method: primary.method,
        prosecutorInternalReasoning:
          "Follow the admitted physical record and testimony, test each contradiction against the frozen incident window, and leave the player's accusation and courtroom strategy to them.",
        evidence: args.foundation.evidence.map((entry, index) => ({
          ...entry,
          title: index === 0
            ? `${primary.title} access record`
            : index === 1
              ? `${primary.title} material trace`
              : `${primary.title} timeline trace ${index}`,
          description: index === 0
            ? `A preserved access record establishes who could reach ${primary.subject} during the incident window.`
            : index === 1
              ? `A material trace links ${primary.subject} to a deliberate act during the incident window.`
              : `A timestamped detail narrows the opportunity surrounding ${primary.subject} without identifying the responsible party by itself.`,
        })),
      };
  const suspectNameBySeat = new Map(
    args.scaffold.suspects.map((suspect) => [suspect.seatId, suspect.name]),
  );
  const evidence = primaryFoundation.evidence.map((entry) => ({ ...entry }));
  const reachableEvidenceIds = new Set(
    args.scaffold.activeRegions.flatMap((outcome) =>
      outcome.evidenceId ? [outcome.evidenceId] : []),
  );
  const reachableEvidenceIndexes = evidence.flatMap((entry, index) =>
    reachableEvidenceIds.has(entry.id) ? [index] : []);
  const proofEvidenceIndexes = reachableEvidenceIndexes.length
    ? reachableEvidenceIndexes
    : evidence.map((_entry, index) => index);
  args.incidentPlan.complications.forEach((complication, index) => {
    const traceIndex = proofEvidenceIndexes[(index * 2) % proofEvidenceIndexes.length]!;
    const opportunityIndex = proofEvidenceIndexes[(index * 2 + 1) % proofEvidenceIndexes.length]!;
    const traceSentence = complication.sealedTruth;
    const actorName = suspectNameBySeat.get(complication.actorSeatId) ?? "A participant";
    const opportunitySentence =
      `${actorName} had access to ${complication.subject} during the same window.`;
    const trace = evidence[traceIndex]!;
    if (!trace.description.includes(traceSentence)) {
      trace.description = `${trace.description} ${traceSentence}`.trim();
    }
    const opportunity = evidence[opportunityIndex]!;
    if (!opportunity.description.includes(opportunitySentence)) {
      opportunity.description = `${opportunity.description} ${opportunitySentence}`.trim();
    }
  });
  return { ...primaryFoundation, evidence };
}

const MYSTERY_HOMICIDE_LANGUAGE_RE =
  /\b(?:murder(?:ed|er|ing)?|kill(?:ed|er|ing)?|dead|death|corpse|fatal(?:ly)?|body\s+(?:was\s+)?found)\b/iu;

function assertMysteryIncidentLanguageV2<T>(args: {
  value: T;
  incidentPlan: MysteryBoundIncidentPlanV1;
  section: string;
}): T {
  const homicideIsCanonical = args.incidentPlan.primary.kind === "homicide" ||
    args.incidentPlan.complications.some((incident) => incident.kind === "homicide");
  if (!homicideIsCanonical && MYSTERY_HOMICIDE_LANGUAGE_RE.test(JSON.stringify(args.value))) {
    throw new Error(
      `${args.section} asserted homicide even though the frozen incident plan contains none.`,
    );
  }
  return args.value;
}

function authoredExaminationsFromJson(args: {
  value: Record<string, unknown>;
  examinationIds: readonly string[];
}): Array<{ id: string; text: string }> {
  const rowsFromContainer = (container: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(container)) {
      return container.flatMap((value) => {
        if (Array.isArray(value)) {
          return value.length >= 2 ? [{ id: value[0], text: value[1] }] : [];
        }
        return value && typeof value === "object"
          ? [value as Record<string, unknown>]
          : [];
      });
    }
    if (!container || typeof container !== "object") return [];
    return Object.entries(container as Record<string, unknown>).map(([id, value]) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>), id }
        : { id, text: value });
  };
  const examinationRows: Array<Record<string, unknown>> = [
    ...rowsFromContainer(args.value.examinationsById),
    ...rowsFromContainer(args.value.examinations),
    ...rowsFromContainer(args.value.roomExaminations),
    ...args.examinationIds.flatMap((id) =>
      Object.prototype.hasOwnProperty.call(args.value, id)
        ? [{ id, text: args.value[id] } as Record<string, unknown>]
        : []),
  ];
  const examinations = examinationRows.flatMap((value) => {
    const id = compact(
      value.id ?? value.examinationId ?? value.hotspotId,
      240,
    );
    const text = compact(
      value.text ??
        value.result ??
        value.description ??
        value.observation ??
        value.inspectionResponse,
      1_200,
    );
    return id && text ? [{ id, text }] : [];
  });
  const byId = new Map(examinations.map((entry) => [entry.id, entry.text]));
  const missingIds = args.examinationIds.filter((id) => !byId.has(id));
  if (missingIds.length) {
    throw new MysteryExaminationValidationError(
      `The authored case omitted ${missingIds.length} requested room examination result${missingIds.length === 1 ? "" : "s"}: ${missingIds.join(", ")}`,
    );
  }
  return args.examinationIds.map((id) => ({ id, text: byId.get(id)! }));
}

function deterministicAuthoredMysteryExaminationsV2(args: {
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
  examinationIds: readonly string[];
}): Array<{ id: string; text: string }> {
  const textById = new Map(args.scaffold.activeRegions.map((outcome) => [
    `${outcome.roomId}:${outcome.regionId}`,
    outcome.inspectionResponse,
  ]));
  return args.examinationIds.map((id) => {
    const text = compact(textById.get(id), 1_200);
    if (!text) {
      throw new Error(`The frozen case omitted its room examination result for ${id}.`);
    }
    return { id, text };
  });
}

function deterministicAuthoredMysteryProsecutionChoicesV2(args: {
  suspectSeatIds: readonly string[];
  automatedSpectator: boolean;
}): AuthoredProsecutionChoiceV2[] {
  const witnessSeatId = args.suspectSeatIds[0];
  if (!witnessSeatId) {
    throw new Error("The frozen case omitted every prosecution witness.");
  }
  const options: AuthoredProsecutionChoiceV2["options"] = [
    {
      id: "exact-conflict",
      text: "Answer the contradiction directly. Which part of your account should this court believe?",
      stageAction: null,
      reaction: "I have answered as directly as I can. The court may place my account beside the admitted record.",
      reactionStageAction: null,
    },
    {
      id: "record-comparison",
      text: "Place your account beside the admitted record and explain why they cannot be reconciled.",
      stageAction: null,
      reaction: "My account is before the court. I cannot make the record say anything different.",
      reactionStageAction: null,
    },
  ];
  return [{
    id: "deterministic-record-conflict",
    witnessSeatId,
    prompt: "Prosecution, identify how this contradiction should be tested.",
    options: args.automatedSpectator ? options.slice(0, 1) : options,
  }];
}

const MYSTERY_INVESTIGATION_COURT_LANGUAGE_RE = /\b(?:(?:the|this|our)\s+court|courtroom|your\s+honou?r|the\s+bench|the\s+jury|witness\s+stand|sworn\s+testimony)\b/iu;
const MYSTERY_EXACT_NUMERIC_CLOCK_RE =
  /(?<![\p{L}\p{N}:])(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))?(?![\p{L}\p{N}:])/iu;
const MYSTERY_EXACT_SPOKEN_CLOCK_RE = new RegExp(
  String.raw`\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(?:oh\s+)?(?:one|two|three|four|five|six|seven|eight|nine)|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)\s+(?:a\.?\s*m\.?|p\.?\s*m\.?|in\s+the\s+(?:morning|afternoon|evening)|at\s+night)\b`,
  "iu",
);

function assertMysteryTemporalRecallV2(args: {
  seatId: string;
  suspect: AuthoredSuspectV2;
  temporalRecall: MysteryV2TemporalRecall;
}): void {
  if (args.temporalRecall === "exact") return;
  // Only constrain lines or private accounts owned by this suspect. The
  // Prosecutor and Defense may still confront an imprecise witness with an
  // exact timestamp from the admitted record.
  const authoredText = [
    args.suspect.relationship,
    args.suspect.alibi,
    args.suspect.roomIntroduction,
    args.suspect.defaultPresentReaction,
    ...args.suspect.talkTopics.flatMap((topic) => [
      topic.response,
      ...topic.repeatResponses.map((repeat) => repeat.response),
    ]),
    ...args.suspect.presentReactions.map((reaction) => reaction.response),
    ...args.suspect.testimony.flatMap((statement) => [
      statement.text,
      statement.press,
      statement.revision,
    ]),
  ].join("\n");
  const exactClock =
    authoredText.match(MYSTERY_EXACT_NUMERIC_CLOCK_RE)?.[0] ??
    authoredText.match(MYSTERY_EXACT_SPOKEN_CLOCK_RE)?.[0];
  if (exactClock) {
    throw new Error(
      `The authored chapter for ${args.seatId} gives exact clock recall (${exactClock}) to a suspect with ${args.temporalRecall} temporal recall.`,
    );
  }
}

function assertMysteryInvestigationDialogueStaysInPhaseV2(args: {
  seatId: string;
  suspect: AuthoredSuspectV2;
}): void {
  const lines: Array<{ field: string; text: string }> = [
    { field: "room introduction", text: args.suspect.roomIntroduction },
    { field: "default Present prompt", text: args.suspect.defaultPresentProsecutionLine },
    { field: "default Present response", text: args.suspect.defaultPresentReaction },
    ...args.suspect.talkTopics.flatMap((topic) => [
      { field: `Talk question \"${topic.id}\"`, text: topic.question },
      { field: `Talk response \"${topic.id}\"`, text: topic.response },
      ...topic.repeatResponses.map((repeat, index) => ({
        field: `Talk repeat response \"${topic.id}\" #${index + 1}`,
        text: repeat.response,
      })),
    ]),
    ...args.suspect.presentReactions.flatMap((reaction) => [
      { field: `Present prompt \"${reaction.recordId}\"`, text: reaction.prosecutionLine },
      { field: `Present response \"${reaction.recordId}\"`, text: reaction.response },
    ]),
  ];
  for (const line of lines) {
    const courtLanguage = line.text.match(MYSTERY_INVESTIGATION_COURT_LANGUAGE_RE)?.[0];
    if (courtLanguage) {
      throw new Error(
        `The authored investigation dialogue for ${args.seatId} uses courtroom language (${courtLanguage}) in ${line.field}.`,
      );
    }
  }
}

function assertMysteryPresentDialogueMatchesRecordTitlesV2(args: {
  seatId: string;
  suspect: AuthoredSuspectV2;
  recordItems: readonly { reference: DebateMysteryRecordReferenceV2; title: string }[];
}): void {
  const namedDefaultRecord = args.recordItems.find((item) =>
    presentRecordTitleMentionedV2(args.suspect.defaultPresentProsecutionLine, item.title) ||
    presentRecordTitleMentionedV2(args.suspect.defaultPresentReaction, item.title));
  if (namedDefaultRecord) {
    throw new Error(
      `The authored default Present dialogue for ${args.seatId} names the specific Case File record ${namedDefaultRecord.title}.`,
    );
  }
  for (const reaction of args.suspect.presentReactions) {
    const expectedRecord = args.recordItems.find((item) =>
      mysteryRecordKey(item.reference) === reaction.recordId);
    if (!expectedRecord) continue;
    const fields = [
      { name: "Prosecutor line", text: reaction.prosecutionLine },
      { name: "witness response", text: reaction.response },
    ];
    for (const field of fields) {
      const mismatchedRecord = args.recordItems.find((item) =>
        mysteryRecordKey(item.reference) !== reaction.recordId &&
        presentRecordTitleMentionedV2(field.text, item.title));
      if (mismatchedRecord) {
        throw new Error(
          `The authored ${field.name} for ${args.seatId}'s ${expectedRecord.title} Present exchange names a different Case File record (${mismatchedRecord.title}).`,
        );
      }
    }
  }
}

function authoredSuspectFromJson(args: {
  value: Record<string, unknown>;
  seatId: string;
  requiredPresentRecords: readonly DebateMysteryRecordReferenceV2[];
  requiredContradictionRecord: MysteryV2ContradictionRecordV2;
  requiredPresentationGateRecord: DebateMysteryRecordReferenceV2 | null;
  recordItems: readonly { reference: DebateMysteryRecordReferenceV2; title: string }[];
  rooms: readonly { id: string; name: string }[];
  people: readonly { id: string; name: string }[];
  knowledge: MysteryV2SuspectKnowledge;
  courtOnly?: boolean;
}): AuthoredSuspectV2 {
  const row = args.value.suspect && typeof args.value.suspect === "object"
    ? args.value.suspect as Record<string, unknown>
    : args.value;
  const seatId = compact(row.seatId, 120);
  const relationship = compact(row.relationship, 700);
  const alibi = compact(row.alibi, 800);
  const suspectName = args.people.find((person) => person.id === args.seatId)?.name ?? "The witness";
  const victim = args.people.find((person) => person.id !== args.seatId) ?? args.people[0];
  const requiredStatementIds = [1, 2, 3].map((ordinal) => `statement-${args.seatId}-${ordinal}`);
  const parsedTalkTopics: AuthoredTopicV2[] = (Array.isArray(row.talkTopics) ? row.talkTopics : []).flatMap((topicValue) => {
    if (!topicValue || typeof topicValue !== "object") return [];
    const topic = topicValue as Record<string, unknown>;
    const id = compact(topic.id, 100);
    const label = compact(topic.label, 100);
    const question = compact(topic.question, 600);
    const response = compact(topic.response, 1_200);
    const repeatResponses = (Array.isArray(topic.repeatResponses) ? topic.repeatResponses : []).flatMap((repeatValue) => {
      if (!repeatValue || typeof repeatValue !== "object") return [];
      const repeat = repeatValue as Record<string, unknown>;
      const repeatResponse = compact(repeat.response, 1_200);
      return repeatResponse ? [{
        response: repeatResponse,
        responseStageAction: compact(repeat.responseStageAction, 180) || null,
        performance: repeat.performance && typeof repeat.performance === "object"
          ? repeat.performance as Partial<DebateMysteryPerformanceDirectionV2>
          : {},
      }] : [];
    });
    return id && label && question && response ? [{
      id,
      label,
      subject: normalizeDebateMysteryTalkSubjectV2({
        value: topic.subject && typeof topic.subject === "object" ? topic.subject : topic,
        label,
        question,
        rooms: args.rooms,
        people: args.people,
      }),
      question,
      questionStageAction: compact(topic.questionStageAction, 180) || null,
      questionPerformance: topic.questionPerformance && typeof topic.questionPerformance === "object"
        ? topic.questionPerformance as Partial<DebateMysteryPerformanceDirectionV2>
        : {},
      response,
      responseStageAction: compact(topic.responseStageAction, 180) || null,
      performance: topic.performance && typeof topic.performance === "object"
        ? topic.performance as Partial<DebateMysteryPerformanceDirectionV2>
        : {},
      // Repeat beats enrich a frozen case, but they must not make an otherwise
      // complete local-model chapter unusable. Older/smaller models commonly
      // omit this newly-added optional array even when they supply the primary
      // exchange, so preserve the authored answer as the deterministic fallback.
      repeatResponses: repeatResponses.length
        ? repeatResponses.slice(0, 2)
        : [{
            response: `As I said, ${response}`,
            responseStageAction: null,
            performance: topic.performance && typeof topic.performance === "object"
              ? topic.performance as Partial<DebateMysteryPerformanceDirectionV2>
              : {},
          }],
    }] : [];
  });
  const authoredTalkTopics = parsedTalkTopics.filter((topic) =>
    !debateMysteryTalkTopicMirrorsRecordV2({
      topicId: topic.id,
      label: topic.label,
      question: topic.question,
      subject: topic.subject,
      records: args.recordItems,
    })).slice(0, 5);
  const gateSource = row.presentationGate && typeof row.presentationGate === "object"
    ? row.presentationGate as Record<string, unknown>
    : {};
  const authoredGateTopicId = compact(gateSource.unlockTopicId, 100);
  const authoredGateTopic = authoredGateTopicId
    ? authoredTalkTopics.find((topic) => topic.id === authoredGateTopicId) ?? null
    : null;
  const fallbackTopicIds = new Set(authoredTalkTopics.map((topic) => topic.id));
  const fallbackTopic = (args: {
    id: string;
    label: string;
    subject: DebateMysteryTalkSubjectV2;
    question: string;
    response: string;
  }): AuthoredTopicV2 => {
    let id = args.id;
    let suffix = 2;
    while (fallbackTopicIds.has(id)) id = `${args.id}-${suffix++}`;
    fallbackTopicIds.add(id);
    return {
      id,
      label: args.label,
      subject: args.subject,
      question: args.question,
      questionStageAction: null,
      questionPerformance: {},
      response: args.response,
      responseStageAction: null,
      performance: {},
      repeatResponses: [{
        response: `As I said, ${args.response}`,
        responseStageAction: null,
        performance: {},
      }],
    };
  };
  const fallbackCandidates = [
    ...(relationship && victim ? [fallbackTopic({
      id: `relationship-${args.seatId}`,
      label: `Relationship with ${victim.name}`,
      subject: { category: "person" as const, personId: victim.id },
      question: `Describe your relationship with ${victim.name}.`,
      response: relationship,
    })] : []),
    ...(alibi ? [fallbackTopic({
      id: `alibi-${args.seatId}`,
      label: "Your alibi",
      subject: { category: "alibi" as const },
      question: "State your alibi and the movements that support it.",
      response: alibi,
    })] : []),
    ...(relationship && alibi ? [fallbackTopic({
      id: `firsthand-${args.seatId}`,
      label: "What you can confirm",
      subject: { category: "general" as const },
      question: "What can you personally confirm from your own observations?",
      response: args.knowledge.temporalRecall === "exact"
        ? "I can speak to what I personally saw and did, but I will not claim knowledge of anyone else's movements."
        : args.knowledge.temporalRecall === "approximate"
          ? "I remember the order of what I personally saw and did, but I cannot place it at precise clock times."
          : "I cannot place events by time; I can only tell you what I personally observed.",
    })] : []),
  ];
  const existingFallbackSubjects = new Set(authoredTalkTopics.map((topic) => {
    if (topic.subject.category === "person") return `person:${topic.subject.personId}`;
    return topic.subject.category;
  }));
  const neededFallbacks: AuthoredTopicV2[] = [];
  for (const candidate of fallbackCandidates) {
    if (authoredTalkTopics.length + neededFallbacks.length >= 3) break;
    const subjectKey = candidate.subject.category === "person"
      ? `person:${candidate.subject.personId}`
      : candidate.subject.category;
    if (existingFallbackSubjects.has(subjectKey) && candidate.subject.category !== "general") {
      continue;
    }
    existingFallbackSubjects.add(subjectKey);
    neededFallbacks.push(candidate);
  }
  const testimony: AuthoredStatementV2[] = (Array.isArray(row.testimony) ? row.testimony : []).flatMap((statementValue) => {
    if (!statementValue || typeof statementValue !== "object") return [];
    const statement = statementValue as Record<string, unknown>;
    const id = compact(statement.id, 120);
    const text = compact(statement.text, 1_000);
    const press = compact(statement.press, 1_000);
    const defenseRebuttal =
      compact(statement.defenseRebuttal, 1_000) ||
      compact(statement.rebuttal, 1_000);
    const defenseObjection =
      compact(statement.defenseObjection, 1_000) ||
      "Objection. The prosecution is asking this record to prove more than it does.";
    const revision = compact(statement.revision, 1_000);
    const basisSource =
      statement.contradictionBasis &&
      typeof statement.contradictionBasis === "object" &&
      !Array.isArray(statement.contradictionBasis)
        ? statement.contradictionBasis as Record<string, unknown>
        : null;
    const statementClaim = compact(basisSource?.statementClaim, 500);
    const recordClaim = compact(basisSource?.recordClaim, 500);
    const contradictionBasis: AuthoredContradictionBasisV2 | null =
      basisSource?.relationship === "cannot_both_be_true"
      ? {
          version: 1,
          recordId: compact(basisSource.recordId, 180),
          statementClaim,
          recordClaim,
          relationship: "cannot_both_be_true",
        }
      : null;
    return id && text && press && defenseRebuttal && defenseObjection && revision ? [{
      id,
      text,
      stageAction: compact(statement.stageAction, 180) || null,
      press,
      pressStageAction: compact(statement.pressStageAction, 180) || null,
      defenseRebuttal,
      defenseRebuttalStageAction:
        compact(statement.defenseRebuttalStageAction, 180) || null,
      defenseObjection,
      defenseObjectionStageAction:
        compact(statement.defenseObjectionStageAction, 180) || null,
      revision,
      revisionStageAction: compact(statement.revisionStageAction, 180) || null,
      performance: statement.performance && typeof statement.performance === "object"
        ? statement.performance as Partial<DebateMysteryPerformanceDirectionV2>
        : {},
      contradictionBasis,
    }] : [];
  });
  const presentReactions = (Array.isArray(row.presentReactions) ? row.presentReactions : []).flatMap((reactionValue) => {
    if (!reactionValue || typeof reactionValue !== "object") return [];
    const reaction = reactionValue as Record<string, unknown>;
    const recordId = compact(reaction.recordId, 180);
    const prosecutionLine =
      compact(reaction.prosecutionLine, 1_000) ||
      "I am placing this admitted record before you. Tell me what it means.";
    const response = compact(reaction.response, 1_000);
    return recordId && prosecutionLine && response
      ? [{
          recordId,
          prosecutionLine,
          prosecutionStageAction:
            compact(reaction.prosecutionStageAction, 180) || null,
          response,
          responseStageAction: compact(reaction.responseStageAction, 180) || null,
        }]
      : [];
  });
  const requiredPresentationGateRecordId = args.requiredPresentationGateRecord
    ? `${args.requiredPresentationGateRecord.kind}:${args.requiredPresentationGateRecord.id}`
    : null;
  const requiredPresentationGateReaction = requiredPresentationGateRecordId
    ? presentReactions.find((reaction) =>
        reaction.recordId === requiredPresentationGateRecordId) ?? null
    : null;
  const synthesizedGateTopic =
    args.requiredPresentationGateRecord &&
      !authoredGateTopic &&
      requiredPresentationGateReaction
      ? fallbackTopic({
          id: `record-follow-up-${args.seatId}`,
          label: "What the record changes",
          subject: { category: "general" },
          question: "What does this Case File record change about your account?",
          response: requiredPresentationGateReaction.response,
        })
      : null;
  const gateTopic = authoredGateTopic ?? synthesizedGateTopic;
  const ordinaryTalkTopics = [
    ...authoredTalkTopics.filter((topic) => topic.id !== gateTopic?.id),
    ...neededFallbacks.filter((topic) => topic.id !== gateTopic?.id),
  ];
  const talkTopics = gateTopic
    ? [...ordinaryTalkTopics.slice(0, 4), gateTopic]
    : ordinaryTalkTopics.slice(0, 5);
  let presentationGate: AuthoredPresentationGateV2 | null = null;
  if (
    !args.courtOnly &&
    args.requiredPresentationGateRecord &&
    gateTopic
  ) {
    presentationGate = {
      id: `gate-${args.seatId}-${gateTopic.id}`,
      requiredRecord: args.requiredPresentationGateRecord,
      unlockTopicId: gateTopic.id,
    };
  }
  const suspect: AuthoredSuspectV2 = {
    seatId,
    relationship,
    alibi,
    // Room introductions are presentation polish, not proof-bearing case
    // logic. Keep a valid earlier-format chapter playable when its authoring
    // model has not yet learned this optional V2 field.
    roomIntroduction: compact(row.roomIntroduction, 900) || (() => {
      const suspectName = args.people.find((person) => person.id === args.seatId)?.name ?? "I";
      return `I am ${suspectName}. The house has given everyone reasons to be careful; ask what you need, and I will answer.`;
    })(),
    roomIntroductionStageAction: compact(row.roomIntroductionStageAction, 180) || null,
    roomIntroductionPerformance:
      row.roomIntroductionPerformance && typeof row.roomIntroductionPerformance === "object"
        ? row.roomIntroductionPerformance as Partial<DebateMysteryPerformanceDirectionV2>
        : {},
    chapterOpening:
      compact(row.chapterOpening, 700) ||
      `The court calls ${suspectName}. Give a clear account and answer only what you know.`,
    chapterCompletion:
      compact(row.chapterCompletion, 700) ||
      `The court records the material revision to ${suspectName}'s account and releases this witness subject to recall.`,
    defaultPresentProsecutionLine:
      compact(row.defaultPresentProsecutionLine, 700) ||
      "I am placing this admitted record before you. What do you make of it?",
    defaultPresentProsecutionStageAction:
      compact(row.defaultPresentProsecutionStageAction, 180) || null,
    defaultPresentReaction:
      compact(row.defaultPresentReaction, 700) ||
      "I can answer only what this Case File record establishes. It does not change the account I have given you.",
    defaultPresentReactionStageAction:
      compact(row.defaultPresentReactionStageAction, 180) || null,
    presentReactions,
    talkTopics,
    presentationGate,
    testimony,
  };
  if (suspect.seatId !== args.seatId) throw new Error(`The authored chapter changed frozen seat ${args.seatId}.`);
  const rawTestimony = Array.isArray(row.testimony)
    ? row.testimony.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    : [];
  const rawPresentReactions = Array.isArray(row.presentReactions)
    ? row.presentReactions.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    : [];
  const missingRequiredStatementFields = requiredStatementIds.flatMap((requiredId) => {
    const statement = rawTestimony.find((entry) => compact(entry.id, 120) === requiredId);
    if (!statement) return [`testimony.${requiredId}`];
    return [
      ...(!compact(statement.text, 1_000) ? [`testimony.${requiredId}.text`] : []),
      ...(!compact(statement.press, 1_000) ? [`testimony.${requiredId}.press`] : []),
      ...(!(compact(statement.defenseRebuttal, 1_000) || compact(statement.rebuttal, 1_000))
        ? [`testimony.${requiredId}.defenseRebuttal`]
        : []),
      ...(!compact(statement.revision, 1_000) ? [`testimony.${requiredId}.revision`] : []),
    ];
  });
  const missingRequiredPresentFields = args.courtOnly
    ? []
    : args.requiredPresentRecords.flatMap((reference) => {
        const requiredId = `${reference.kind}:${reference.id}`;
        const reaction = rawPresentReactions.find((entry) =>
          compact(entry.recordId, 180) === requiredId);
        if (!reaction) return [`presentReactions.${requiredId}`];
        return compact(reaction.response, 1_000)
          ? []
          : [`presentReactions.${requiredId}.response`];
      });
  const missingCoreFields = [
    ...(!suspect.relationship ? ["relationship"] : []),
    ...(!suspect.alibi ? ["alibi"] : []),
    ...missingRequiredStatementFields,
    ...missingRequiredPresentFields,
    ...(suspect.testimony.length < 3
      ? [`testimony (${suspect.testimony.length} of 3 complete statements)`]
      : []),
    ...(!args.courtOnly && suspect.talkTopics.length < 3
      ? [`Talk subjects (${suspect.talkTopics.length} of 3 after safe fallbacks)`]
      : []),
  ];
  if (missingCoreFields.length) {
    throw new Error(
      `The authored chapter for ${args.seatId} omitted required core dialogue: ${missingCoreFields.join(", ")}.`,
    );
  }
  if (
    suspect.testimony.length !== requiredStatementIds.length ||
    !requiredStatementIds.every((id) =>
      suspect.testimony.some((statement) => statement.id === id))
  ) {
    throw new Error(`The authored chapter for ${args.seatId} changed its frozen statement IDs.`);
  }
  if (!uniqueIds(suspect.testimony.map((statement) => statement.id))) {
    throw new Error(`The authored chapter for ${args.seatId} repeated a statement ID.`);
  }
  // Court assigns the contradiction to statementIndex === 1. Canonicalize the
  // exact three frozen rows before graph construction so reordered model JSON
  // cannot move the certified statement away from the playable second beat.
  suspect.testimony = requiredStatementIds.map((id) =>
    suspect.testimony.find((statement) => statement.id === id)!,
  );
  const secondStatement = suspect.testimony.find((statement) =>
    statement.id === requiredStatementIds[1]);
  const contradictionBasis = secondStatement?.contradictionBasis;
  const requiredRecordId = mysteryRecordKey(
    args.requiredContradictionRecord.reference,
  );
  if (
    !secondStatement ||
    !contradictionBasis ||
    contradictionBasis.recordId !== requiredRecordId ||
    contradictionBasis.relationship !== "cannot_both_be_true" ||
    !mysteryContradictionExcerptIsGroundedV2(
      contradictionBasis.statementClaim,
      secondStatement.text,
    ) ||
    !mysteryContradictionExcerptIsGroundedV2(
      contradictionBasis.recordClaim,
      args.requiredContradictionRecord.text,
    )
  ) {
    throw new Error(
      `The authored chapter for ${args.seatId} did not ground statement #2 against its exact assigned record (${requiredRecordId}).`,
    );
  }
  const missingPresentReaction = args.courtOnly ? undefined : args.requiredPresentRecords.find((reference) =>
    !suspect.presentReactions.some((reaction) =>
      reaction.recordId === `${reference.kind}:${reference.id}`));
  if (missingPresentReaction) {
    throw new Error(`The authored investigation omitted ${args.seatId}'s proof-bearing evidence reaction.`);
  }
  if (!args.courtOnly) {
    assertMysteryInvestigationDialogueStaysInPhaseV2({
      seatId: args.seatId,
      suspect,
    });
    assertMysteryPresentDialogueMatchesRecordTitlesV2({
      seatId: args.seatId,
      suspect,
      recordItems: args.recordItems,
    });
  }
  assertMysteryTemporalRecallV2({
    seatId: args.seatId,
    suspect,
    temporalRecall: args.knowledge.temporalRecall,
  });
  return suspect;
}

function authoredProsecutionChoicesFromJson(
  value: Record<string, unknown>,
  suspectSeatIds: readonly string[],
  minimumOptions = 2,
): AuthoredProsecutionChoiceV2[] {
  const choiceRows = Array.isArray(value.prosecutionChoices) ? value.prosecutionChoices : [];
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
      // Earlier author prompts used the adjacent Present-reaction names for
      // these presentation-only lines. Normalize that valid shape without
      // relaxing the frozen choice, witness, or option ID contract.
      const text =
        compact(option.text, 300) ||
        compact(option.prosecutionLine, 300) ||
        compact(option.selectedProsecutorText, 300);
      const reaction =
        compact(option.reaction, 800) ||
        compact(option.witnessReaction, 800) ||
        compact(option.response, 800);
      return optionId && text && reaction
        ? [{
            id: optionId,
            text,
            stageAction:
              compact(option.stageAction, 180) ||
              compact(option.prosecutionStageAction, 180) ||
              null,
            reaction,
            reactionStageAction:
              compact(option.reactionStageAction, 180) ||
              compact(option.witnessReactionStageAction, 180) ||
              compact(option.responseStageAction, 180) ||
              null,
          }]
        : [];
    });
    return id && witnessSeatId && prompt && options.length >= minimumOptions
      ? [{ id, witnessSeatId, prompt, options: options.slice(0, 4) }]
      : [];
  });
  if (!prosecutionChoices.length) {
    throw new MysteryProsecutionChoiceValidationError(
      "The authored trial omitted its prosecution response choice.",
    );
  }
  if (prosecutionChoices.some((choice) => !suspectSeatIds.includes(choice.witnessSeatId))) {
    throw new MysteryProsecutionChoiceValidationError(
      "The authored trial attached a prosecution choice to an unknown witness.",
    );
  }
  return prosecutionChoices;
}

function deterministicMysteryVoiceCard(
  bot: MysteryV2BotRow,
): MysteryV2VoiceCard {
  const sourceHash = sha256(bot.system_prompt);
  const cues = bot.system_prompt
    .split(/(?<=[.!?])\s+/u)
    .map((entry) => compact(entry, 120))
    .filter(Boolean)
    .slice(0, 3);
  return {
    botId: bot.id,
    sourceHash,
    cues: cues.length > 0 ? cues : [`Keep ${bot.name}'s established voice.`],
  };
}

async function prepareMysteryVoiceCardsV2(args: {
  runtime: DebateAiRuntime;
  bots: MysteryV2BotRow[];
}): Promise<Record<string, MysteryV2VoiceCard>> {
  const fallback = Object.fromEntries(
    args.bots.map((bot) => [bot.id, deterministicMysteryVoiceCard(bot)]),
  );
  // ONLINE Case Forge must not wake the local model as a hidden secondary
  // workload. Its deterministic voice-card fallback is already sealed and
  // sufficient; LOCAL keeps the private auxiliary polish path.
  const auxiliary = args.runtime.preferredProvider === "local"
    ? args.runtime.auxiliary
    : undefined;
  if (!auxiliary || args.bots.length === 0) return fallback;
  const sourceByBotId = new Map(
    args.bots.map((bot) => [bot.id, sha256(bot.system_prompt)]),
  );
  try {
    const result = await prismGenerationBroker.runStructured({
      work: {
        workflow: "case_forge",
        operation: "prepare_voice_cards",
        stage: "writing_case",
        executionLane: "auxiliary",
        role: "prepare",
        outputClass: "internal",
        priority: "compilation",
        privacyMode: "local",
        cacheKey: `case-forge-voice-v1:${sha256(JSON.stringify([...sourceByBotId]))}`,
      },
      lanes: [{
        provider: auxiliary,
        providerName: "local",
        model: auxiliary.diagnosticModel ?? "auxiliary",
      }],
      modelSelectionKind: "fixed",
      maxFixedAttempts: 1,
      run: ({ lane, signal, work }) => lane.provider.generateResponse([
        {
          role: "system",
          content: "Compress persona text into style-only voice cues. Do not add biography, relationships, case facts, clues, motives, alibis, or plot. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            bots: args.bots.map((bot) => ({
              botId: bot.id,
              sourceHash: sourceByBotId.get(bot.id),
              persona: bot.system_prompt,
            })),
            outputContract: {
              voiceCards: "one card per bot with exact botId, exact sourceHash, and 1-4 short style cues",
            },
          }),
        },
      ], {
        model: lane.model,
        maxTokens: Math.min(1_800, 220 * args.bots.length),
        temperature: 0.2,
        jsonMode: true,
        usagePurpose: "debate_generation",
        generationWork: work,
        signal,
      }),
      validate: (raw) => {
        const parsed = parseJsonObject(raw);
        const cards = Array.isArray(parsed.voiceCards)
          ? parsed.voiceCards
          : [];
        const normalized = cards.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const row = value as Record<string, unknown>;
          const botId = compact(row.botId, 120);
          const sourceHash = compact(row.sourceHash, 80);
          const cues = (Array.isArray(row.cues) ? row.cues : [])
            .map((cue) => compact(cue, 120))
            .filter(Boolean)
            .slice(0, 4);
          return botId && sourceHash === sourceByBotId.get(botId) && cues.length
            ? [{ botId, sourceHash, cues }]
            : [];
        });
        if (
          normalized.length !== args.bots.length ||
          !uniqueIds(normalized.map((card) => card.botId))
        ) {
          throw new Error("Voice cards did not preserve the frozen bot sources.");
        }
        return Object.fromEntries(normalized.map((card) => [card.botId, card]));
      },
    });
    return result.value;
  } catch {
    return fallback;
  }
}

async function prepareMysteryConnectiveAdditionsV2(args: {
  runtime: DebateAiRuntime;
  sectionKey: string;
  voiceCard: MysteryV2VoiceCard | undefined;
  topicIds: string[];
}): Promise<Record<string, string>> {
  const fallback = Object.fromEntries(
    args.topicIds.map((topicId, index) => [
      topicId,
      index % 2 === 0 ? "As I said," : "I have already answered that:",
    ]),
  );
  // Fact-free connective polish is optional. Avoid materializing a local
  // model process behind an explicitly ONLINE compilation.
  const auxiliary = args.runtime.preferredProvider === "local"
    ? args.runtime.auxiliary
    : undefined;
  if (!auxiliary || args.topicIds.length === 0) return fallback;
  try {
    const result = await prismGenerationBroker.runStructured({
      work: {
        workflow: "case_forge",
        operation: "complete_connective_copy",
        stage: args.sectionKey,
        executionLane: "auxiliary",
        role: "connective",
        outputClass: "connective",
        priority: "background",
        privacyMode: "local",
        cacheKey: `case-forge-connective-v1:${sha256(JSON.stringify({
          voiceCard: args.voiceCard,
          topicIds: args.topicIds,
        }))}`,
      },
      lanes: [{
        provider: auxiliary,
        providerName: "local",
        model: auxiliary.diagnosticModel ?? "auxiliary",
      }],
      modelSelectionKind: "fixed",
      maxFixedAttempts: 1,
      run: ({ lane, signal, work }) => lane.provider.generateResponse([
        {
          role: "system",
          content: "Write only short persona-shaped acknowledgments that a question is being repeated. Do not mention or imply facts, clues, relationships, alibis, motives, evidence, deductions, or answers. JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            voiceCues: args.voiceCard?.cues ?? [],
            topicIds: args.topicIds,
            outputContract: {
              acknowledgments: "object keyed by exact topicId; each value is a fact-free acknowledgment under 12 words",
            },
          }),
        },
      ], {
        model: lane.model,
        maxTokens: 500,
        temperature: 0.45,
        jsonMode: true,
        usagePurpose: "debate_generation",
        generationWork: work,
        signal,
      }),
      validate: (raw) => {
        const parsed = parseJsonObject(raw);
        const acknowledgments = parsed.acknowledgments &&
          typeof parsed.acknowledgments === "object" &&
          !Array.isArray(parsed.acknowledgments)
          ? parsed.acknowledgments as Record<string, unknown>
          : {};
        const normalized: Record<string, string> = {};
        for (const topicId of args.topicIds) {
          const acknowledgment = compact(acknowledgments[topicId], 90);
          if (
            !acknowledgment ||
            acknowledgment.split(/\s+/u).length > 12 ||
            /\b(?:evidence|clue|culprit|alibi|motive|proof|record|victim)\b/iu.test(
              acknowledgment,
            )
          ) {
            throw new Error("Connective copy crossed the fact-free boundary.");
          }
          normalized[topicId] = acknowledgment;
        }
        return normalized;
      },
    });
    return result.value;
  } catch {
    return fallback;
  }
}

function recordMysterySectionReceipt(
  draft: MysteryV2AuthoringCheckpoint,
  sectionKey: string,
  receipt: PrismGenerationWorkReceipt,
): void {
  draft.provenanceBySection[sectionKey] = {
    provider: receipt.provider,
    model: receipt.model,
    role: receipt.role,
    durationMs: receipt.durationMs,
    inputTokens: receipt.inputTokens,
    outputTokens: receipt.outputTokens,
    fallbackReason: receipt.fallbackReason,
    validation: receipt.validation,
    auditIssues: draft.provenanceBySection[sectionKey]?.auditIssues ?? [],
  };
}

async function auditMysterySectionV2(args: {
  runtime: DebateAiRuntime;
  sectionKey: string;
  section: unknown;
  ledger: MysteryV2FactLedger;
  relevantFrozenIds: string[];
}): Promise<MysteryV2AuditIssue[]> {
  // Deterministic validators remain authoritative. ONLINE authoring therefore
  // skips this optional LOCAL-only audit instead of starting a second model
  // lane with a separate memory and swap footprint.
  const auxiliary = args.runtime.preferredProvider === "local"
    ? args.runtime.auxiliary
    : undefined;
  if (!auxiliary) return [];
  const relevantFrozenIds = [...new Set(args.relevantFrozenIds.filter(Boolean))];
  const allowedHighCodes = new Set([
    "frozen_id_mismatch",
    "proof_route_conflict",
    "culprit_role_conflict",
    "knowledge_boundary_conflict",
    "cross_section_contradiction",
  ]);
  try {
    const result = await prismGenerationBroker.runStructured({
      work: {
        workflow: "case_forge",
        operation: "audit_case_section",
        stage: args.sectionKey,
        executionLane: "auxiliary",
        role: "audit",
        outputClass: "internal",
        priority: "background",
        privacyMode: "local",
        cacheKey: `case-forge-audit-v1:${sha256(JSON.stringify({
          sectionKey: args.sectionKey,
          section: args.section,
          relevantFrozenIds,
          ledgerHash: args.ledger.sourceHash,
        }))}`,
      },
      lanes: [{
        provider: auxiliary,
        providerName: "local",
        model: auxiliary.diagnosticModel ?? "auxiliary",
      }],
      modelSelectionKind: "fixed",
      maxFixedAttempts: 1,
      run: ({ lane, signal, work }) => lane.provider.generateResponse([
        {
          role: "system",
          content: "Audit one already schema-valid mystery section against only the supplied frozen ledger slice. Treat each suspect's awareness and temporal recall as hard knowledge boundaries: unaware suspects cannot possess case facts, and approximate or absent recall cannot become exact clock knowledge. Do not rewrite prose or invent facts. Return JSON only. Deterministic validators remain authoritative.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sectionKey: args.sectionKey,
            ledger: {
              sourceHash: args.ledger.sourceHash,
              culpritSeatId: args.ledger.culpritSeatId,
              accompliceSeatId: args.ledger.accompliceSeatId,
              suspectKnowledgeBySeat: args.ledger.suspectKnowledgeBySeat,
              proofRoutesBySeat: args.ledger.proofRoutesBySeat,
              relevantFrozenIds,
            },
            section: args.section,
            outputContract: {
              issues: "array of fieldPath, code, advisory|high severity, relatedFrozenIds, and one minimal repairInstruction",
            },
          }),
        },
      ], {
        model: lane.model,
        maxTokens: 1_200,
        temperature: 0,
        jsonMode: true,
        usagePurpose: "debate_generation",
        generationWork: work,
        signal,
      }),
      validate: (raw) => {
        const parsed = parseJsonObject(raw);
        const rows = Array.isArray(parsed.issues) ? parsed.issues : [];
        return rows.flatMap((value): MysteryV2AuditIssue[] => {
          if (!value || typeof value !== "object") return [];
          const row = value as Record<string, unknown>;
          const fieldPath = compact(row.fieldPath, 220);
          const code = compact(row.code, 100)
            .toLowerCase()
            .replace(/[^a-z0-9_]+/gu, "_");
          const relatedIds = (Array.isArray(row.relatedFrozenIds)
            ? row.relatedFrozenIds
            : [])
            .map((id) => compact(id, 160))
            .filter((id) => relevantFrozenIds.includes(id));
          const repairInstruction = compact(row.repairInstruction, 280);
          if (!fieldPath || !code || !repairInstruction) return [];
          const requestedHigh = row.severity === "high";
          return [{
            fieldPath,
            code,
            severity:
              requestedHigh &&
              allowedHighCodes.has(code) &&
              relatedIds.length > 0
                ? "high"
                : "advisory",
            relatedFrozenIds: relatedIds,
            repairInstruction,
          }];
        }).slice(0, 12);
      },
    });
    return result.value;
  } catch {
    return [];
  }
}

async function generateMysteryAuthoringSectionV2<T>(args: {
  runtime: DebateAiRuntime;
  label: string;
  prompt: Record<string, unknown>;
  sourcePrompt?: Record<string, unknown>;
  maxTokens: number;
  role?: "author" | "repair";
  validate: (value: Record<string, unknown>) => T;
  onAttempt?: (attempt: number) => void;
  onReceipt?: (receipt: PrismGenerationWorkReceipt) => void;
}): Promise<T> {
  const promptText = JSON.stringify(args.prompt);
  const sourcePromptText = JSON.stringify(args.sourcePrompt ?? args.prompt);
  const lanes = args.runtime.lanes?.length
    ? args.runtime.lanes
    : [mysteryV2Lane(args.runtime)];
  const result = await prismGenerationBroker.runStructured({
    work: {
      workflow: "case_forge",
      operation:
        args.role === "repair"
          ? "repair_case_section"
          : "author_case_section",
      stage: compact(args.prompt.section, 100) || "writing_case",
      executionLane: "selected",
      role: args.role ?? "author",
      outputClass: "critical",
      priority: "compilation",
      privacyMode:
        args.runtime.preferredProvider === "local"
          ? "local"
          : args.runtime.modelSelectionKind === "auto"
            ? "auto"
            : "online",
      cacheKey: `case-forge-author-v2:${sha256(promptText)}`,
      sourceTokenEstimate: estimatePrismTextTokens(sourcePromptText),
      exportedTokenEstimate: estimatePrismTextTokens(promptText),
    },
    lanes,
    modelSelectionKind: args.runtime.modelSelectionKind ?? "fixed",
    maxAttempts: DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS,
    perAttemptTimeoutMs: mysteryV2CriticalAuthoringAttemptTimeoutMs,
    totalTimeoutMs: REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS,
    run: async ({ lane, attempt, priorError, signal, work }) => {
      args.onAttempt?.(attempt);
      return lane.provider.generateResponse([
          {
            role: "system",
            content: "You are PRISM's senior mystery writer and trial designer. Author only the requested bounded section of an original, logically fair prosecution case. Preserve every frozen ID. Return one JSON object only; all prose and dialogue is final production copy.",
          },
          {
            role: "user",
            content: JSON.stringify({
              ...args.prompt,
              repair: attempt > 1
                ? { attempt, priorValidationError: priorError }
                : null,
            }),
          },
        ], {
          model: lane.model,
          reasoningEffort: lane.reasoningEffort,
          turbo: lane.turbo,
          maxTokens: args.maxTokens,
          temperature: 0.78,
          jsonMode: true,
          usagePurpose: "debate_generation",
          allowFinalLocalFallback: lane.providerName === "local",
          generationWork: work,
          signal,
        });
    },
    validate: (response) => args.validate(parseJsonObject(response)),
  }).catch((error) => {
    const detail = error instanceof Error
      ? error.message
      : "Unknown authoring error";
    throw new Error(
      `${args.label} could not satisfy validation after bounded generation. ${detail}`,
      { cause: error },
    );
  });
  args.onReceipt?.(result.receipt);
  return result.value;
}

function mysteryContradictionRecordV2(args: {
  reference: DebateMysteryRecordReferenceV2;
  foundation: AuthoredMysteryFoundationV2;
  suspects: readonly AuthoredSuspectV2[];
}): MysteryV2ContradictionRecordV2 | null {
  if (args.reference.kind === "evidence") {
    const evidence = args.foundation.evidence.find(
      (entry) => entry.id === args.reference.id,
    );
    return evidence
      ? {
          reference: args.reference,
          title: evidence.title,
          text: evidence.description,
        }
      : null;
  }
  for (const suspect of args.suspects) {
    const statement = suspect.testimony.find(
      (entry) => entry.id === args.reference.id,
    );
    if (statement) {
      return {
        reference: args.reference,
        title: null,
        text: statement.text,
      };
    }
  }
  return null;
}

async function evaluateMysteryContradictionSemanticsV2(args: {
  runtime: DebateAiRuntime;
  pairs: ReadonlyArray<{
    witnessSeatId: string;
    statement: AuthoredStatementV2;
    record: MysteryV2ContradictionRecordV2;
  }>;
}): Promise<MysteryV2ContradictionEvaluationV2[]> {
  if (args.pairs.length === 0) return [];
  const deterministicRepairEvaluation = (
    pair: (typeof args.pairs)[number],
  ): MysteryV2ContradictionEvaluationV2 => ({
    witnessSeatId: pair.witnessSeatId,
    statementId: pair.statement.id,
    recordId: mysteryRecordKey(pair.record.reference),
    verdict: "not_clear",
    relationship: "none",
    statementClaim:
      groundedMysteryContradictionExcerptV2("", pair.statement.text) ||
      pair.statement.text,
    recordClaim:
      groundedMysteryContradictionExcerptV2("", pair.record.text) ||
      pair.record.text,
    rationale:
      "The bounded semantic audit did not return every frozen route, so this route must receive the deterministic exact-claim repair before court.",
    repairInstruction:
      "Rewrite statement #2 so it directly denies the assigned record's exact claim under an ordinary literal reading.",
  });
  const deterministicDenial =
    "The assigned record's exact claim is false.";
  const deterministicByKey = new Map<string, MysteryV2ContradictionEvaluationV2>();
  const pendingPairs = args.pairs.filter((pair) => {
    const recordId = mysteryRecordKey(pair.record.reference);
    const legacyDeterministicPrefix =
      "The assigned record's exact claim is false: ";
    const basis = pair.statement.contradictionBasis;
    const conciseDeterministicDenial =
      pair.statement.text === deterministicDenial;
    const deniedRecordClaim = conciseDeterministicDenial
      ? basis?.recordClaim ?? ""
      : pair.statement.text.startsWith(legacyDeterministicPrefix)
        ? pair.statement.text.slice(legacyDeterministicPrefix.length)
        : "";
    if (
      !mysteryContradictionExcerptIsGroundedV2(
        deniedRecordClaim,
        pair.record.text,
      ) ||
      !basis ||
      basis.recordId !== recordId ||
      basis.relationship !== "cannot_both_be_true" ||
      !mysteryContradictionExcerptIsGroundedV2(
        basis.statementClaim,
        pair.statement.text,
      ) ||
      normalizedMysteryContradictionExcerptV2(basis.recordClaim) !==
        normalizedMysteryContradictionExcerptV2(deniedRecordClaim)
    ) {
      return true;
    }
    deterministicByKey.set(
      `${pair.witnessSeatId}:${pair.statement.id}:${recordId}`,
      {
        witnessSeatId: pair.witnessSeatId,
        statementId: pair.statement.id,
        recordId,
        verdict: "clear_contradiction",
        relationship: "direct_denial",
        statementClaim: groundedMysteryContradictionExcerptV2(
          "",
          pair.statement.text,
        ),
        recordClaim: deniedRecordClaim,
        rationale:
          "The deterministic repair directly denies the exact assigned claim while keeping the record's exact wording out of witness recall.",
        repairInstruction: null,
      },
    );
    return false;
  });
  if (pendingPairs.length === 0) {
    return args.pairs.map((pair) =>
      deterministicByKey.get(
        `${pair.witnessSeatId}:${pair.statement.id}:${mysteryRecordKey(pair.record.reference)}`,
      )!);
  }
  const prompt = {
    section: "contradiction_semantic_validation",
    contractVersion: 1,
    pairs: pendingPairs.map((pair) => ({
      witnessSeatId: pair.witnessSeatId,
      statement: {
        id: pair.statement.id,
        text: pair.statement.text,
      },
      record: {
        id: mysteryRecordKey(pair.record.reference),
        kind: pair.record.reference.kind,
        title: pair.record.title,
        text: pair.record.text,
      },
    })),
    decisionRule:
      "Return clear_contradiction only when statement #2 and the assigned record cannot both be true under an ordinary literal reading. Mere shared subject matter, suspicion, omission, tension, or a conflict that depends on an unstated fact is not enough.",
    outputContract: {
      evaluations:
        "one entry for every exact witnessSeatId/statementId/recordId with verdict clear_contradiction or not_clear; relationship direct_denial, timeline_impossibility, identity_or_possession_conflict, other_mutual_exclusion, or none; verbatim 3+ word statementClaim and recordClaim excerpts; short rationale; and repairInstruction only when not_clear",
    },
  };
  const promptText = JSON.stringify(prompt);
  const pairByKey = new Map(
    pendingPairs.map((pair) => [
      `${pair.witnessSeatId}:${pair.statement.id}:${mysteryRecordKey(pair.record.reference)}`,
      pair,
    ]),
  );
  const lanes = args.runtime.lanes?.length
    ? args.runtime.lanes
    : [mysteryV2Lane(args.runtime)];
  const result = await prismGenerationBroker.runStructured({
    work: {
      workflow: "case_forge",
      operation: "validate_court_contradictions",
      stage: "testing_contradictions",
      executionLane: "selected",
      role: "audit",
      outputClass: "critical",
      priority: "compilation",
      privacyMode:
        args.runtime.preferredProvider === "local"
          ? "local"
          : args.runtime.modelSelectionKind === "auto"
            ? "auto"
            : "online",
      cacheKey: `case-forge-contradiction-semantics-v1:${sha256(promptText)}`,
      sourceTokenEstimate: estimatePrismTextTokens(promptText),
      exportedTokenEstimate: estimatePrismTextTokens(promptText),
    },
    lanes,
    modelSelectionKind: args.runtime.modelSelectionKind ?? "fixed",
    maxAttempts: DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS,
    perAttemptTimeoutMs: mysteryV2CriticalAuthoringAttemptTimeoutMs,
    totalTimeoutMs: REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS,
    run: ({ lane, attempt, priorError, signal, work }) =>
      lane.provider.generateResponse([
        {
          role: "system",
          content:
            "You are PRISM's strict trial-logic editor. Judge only the supplied statement and assigned record. A clear contradiction means both cannot be true under their ordinary literal reading; relevance, suspicion, omission, or two different moments are not contradictions. Quote both claims verbatim from the supplied text, never invent a fact, and return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            ...prompt,
            repair: attempt > 1
              ? { attempt, priorValidationError: priorError }
              : null,
          }),
        },
      ], {
        model: lane.model,
        reasoningEffort: lane.reasoningEffort,
        turbo: lane.turbo,
        maxTokens: Math.min(3_600, Math.max(1_200, args.pairs.length * 600)),
        temperature: 0,
        jsonMode: true,
        usagePurpose: "debate_generation",
        allowFinalLocalFallback: lane.providerName === "local",
        generationWork: work,
        signal,
      }),
    validate: (raw) => {
      const parsed = parseJsonObject(raw);
      const rows = Array.isArray(parsed.evaluations)
        ? parsed.evaluations
        : [];
      const evaluations: MysteryV2ContradictionEvaluationV2[] = [];
      const seen = new Set<string>();
      for (const value of rows) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Contradiction validation returned an invalid evaluation.");
        }
        const row = value as Record<string, unknown>;
        const witnessSeatId = compact(row.witnessSeatId, 120);
        const statementId = compact(row.statementId, 120);
        const recordId = compact(row.recordId, 180);
        const key = `${witnessSeatId}:${statementId}:${recordId}`;
        const pair = pairByKey.get(key);
        if (!pair || seen.has(key)) {
          throw new Error("Contradiction validation changed or repeated a frozen route.");
        }
        seen.add(key);
        const verdict = row.verdict === "clear_contradiction"
          ? "clear_contradiction"
          : row.verdict === "not_clear"
            ? "not_clear"
            : null;
        const allowedRelationships = new Set([
          "direct_denial",
          "timeline_impossibility",
          "identity_or_possession_conflict",
          "other_mutual_exclusion",
          "none",
        ]);
        const reportedRelationship = compact(row.relationship, 80);
        const relationship = verdict === "not_clear"
          ? "none"
          : reportedRelationship;
        const statementClaim = groundedMysteryContradictionExcerptV2(
          row.statementClaim,
          pair.statement.text,
        );
        const recordClaim = groundedMysteryContradictionExcerptV2(
          row.recordClaim,
          pair.record.text,
        );
        const rationale = compact(row.rationale, 700);
        const repairInstruction = verdict === "not_clear"
          ? compact(row.repairInstruction, 700) ||
            "Rewrite statement #2 so it directly denies the assigned record's exact claim under an ordinary literal reading."
          : null;
        if (
          !verdict ||
          !allowedRelationships.has(relationship) ||
          !rationale ||
          !statementClaim ||
          !recordClaim ||
          (verdict === "clear_contradiction" && relationship === "none") ||
          (verdict === "not_clear" && relationship !== "none")
        ) {
          throw new Error(
            "Contradiction validation did not provide a grounded semantic decision.",
          );
        }
        evaluations.push({
          witnessSeatId,
          statementId,
          recordId,
          verdict,
          relationship: relationship as MysteryV2ContradictionEvaluationV2["relationship"],
          statementClaim,
          recordClaim,
          rationale,
          repairInstruction,
        });
      }
      if (evaluations.length !== pairByKey.size) {
        throw new Error(
          "Contradiction validation omitted a frozen witness proof route.",
        );
      }
      return evaluations;
    },
  }).catch(() => null);
  if (!result) {
    // The semantic auditor is an extra defense, not the sole owner of court
    // playability. If a provider times out or omits one of the frozen routes,
    // mark every unaudited pair for the same deterministic repair used after a
    // negative audit instead of stranding an otherwise durable Case Forge.
    return args.pairs.map((pair) => {
      const key = `${pair.witnessSeatId}:${pair.statement.id}:${mysteryRecordKey(pair.record.reference)}`;
      return deterministicByKey.get(key) ?? deterministicRepairEvaluation(pair);
    });
  }
  const evaluatedByKey = new Map(
    result.value.map((evaluation) => [
      `${evaluation.witnessSeatId}:${evaluation.statementId}:${evaluation.recordId}`,
      evaluation,
    ]),
  );
  return args.pairs.map((pair) => {
    const key = `${pair.witnessSeatId}:${pair.statement.id}:${mysteryRecordKey(pair.record.reference)}`;
    return deterministicByKey.get(key) ?? evaluatedByKey.get(key)!;
  });
}

async function authorMysteryV2(args: {
  runtime: DebateAiRuntime;
  config: DebateMysteryResolvedConfigV2;
  incidentPlan: MysteryBoundIncidentPlanV1;
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
  bots: MysteryV2BotRow[];
  powerPlan: DebateSessionV1["powerPlan"];
  eyewitnessSeatId: string | null;
  examinationIds: string[];
  requiredContradictionBySeat: ReadonlyMap<string, DebateMysteryRecordReferenceV2>;
  draft: MysteryV2AuthoringCheckpoint;
  onDraft: (draft: MysteryV2AuthoringCheckpoint, message: string) => void;
}): Promise<AuthoredMysteryV2> {
  const compilationScope = resolveMysteryCompilationScopeV2(args.config);
  const omitInvestigation = mysteryCompilationOmitsInvestigationV2(compilationScope);
  const automatedSpectator = args.config.playerRole === "spectator";
  const botById = new Map(args.bots.map((bot) => [bot.id, bot]));
  const prosecutor = botById.get(args.config.prosecutorBotId);
  const defenseCounsel = botById.get(args.config.rivalDefenseBotId);
  if (!prosecutor || !defenseCounsel) {
    throw new Error("The frozen Prosecutor or Defense Counsel is unavailable.");
  }
  const reachableEvidenceIds = new Set(
    args.scaffold.activeRegions.flatMap((outcome) => outcome.evidenceId ? [outcome.evidenceId] : []),
  );
  const pivotalGateEvidence =
    args.scaffold.evidence.find((evidence) =>
      evidence.isCanonicalWeapon && reachableEvidenceIds.has(evidence.id)) ??
    args.scaffold.evidence.find((evidence) => reachableEvidenceIds.has(evidence.id)) ??
    null;
  const suspectKnowledgeBySeat = resolveMysterySuspectKnowledgeV2({
    caseSeed: args.scaffold.caseSeed,
    difficulty: args.config.difficulty,
    suspects: args.scaffold.suspects,
    culpritSeatId: args.scaffold.culpritSeatId,
    accompliceSeatId: args.scaffold.accompliceSeatId,
    eyewitnessSeatId: args.eyewitnessSeatId,
  });
  const suspectRequirements = args.scaffold.suspects.map((suspect, index) => {
    const bot = botById.get(suspect.botId)!;
    const contradiction = args.requiredContradictionBySeat.get(suspect.seatId)!;
    const presentationGateRecord =
      suspect.seatId === args.scaffold.culpritSeatId && pivotalGateEvidence
        ? { kind: "evidence" as const, id: pivotalGateEvidence.id }
        : null;
    const requiredPresentReactionRecordIds = [...new Set([
      `${contradiction.kind}:${contradiction.id}`,
      ...(presentationGateRecord
        ? [`${presentationGateRecord.kind}:${presentationGateRecord.id}`]
        : []),
    ])];
    return {
      seatId: suspect.seatId,
      name: suspect.name,
      botId: bot.id,
      privateRole: suspect.seatId === args.scaffold.culpritSeatId
        ? "culprit"
        : suspect.seatId === args.scaffold.accompliceSeatId
          ? "accomplice"
          : "innocent",
      ...suspectKnowledgeBySeat[suspect.seatId]!,
      requiredStatementIds: [1, 2, 3].map((ordinal) => `statement-${suspect.seatId}-${ordinal}`),
      requiredContradictionOnSecondStatement: `${contradiction.kind}:${contradiction.id}`,
      requiredPresentReactionRecordId: `${contradiction.kind}:${contradiction.id}`,
      requiredPresentReactionRecordIds,
      requiredPresentationGateRecordId: presentationGateRecord
        ? `${presentationGateRecord.kind}:${presentationGateRecord.id}`
        : null,
      ordinal: index + 1,
    };
  });
  const factLedgerWithoutHash = {
    version: 1 as const,
    incidentPlan: args.incidentPlan,
    culpritSeatId: args.scaffold.culpritSeatId,
    accompliceSeatId: args.scaffold.accompliceSeatId,
    eyewitnessSeatId: args.eyewitnessSeatId,
    suspectKnowledgeBySeat,
    frozenIds: {
      victimId: args.scaffold.victim.id,
      suspectSeatIds: args.scaffold.suspects.map((suspect) => suspect.seatId),
      roomIds: omitInvestigation ? [] : args.scaffold.rooms.map((room) => room.id),
      evidenceIds: args.scaffold.evidence.map((evidence) => evidence.id),
      examinationIds: omitInvestigation ? [] : [...args.examinationIds],
      statementIdsBySeat: Object.fromEntries(
        suspectRequirements.map((suspect) => [
          suspect.seatId,
          suspect.requiredStatementIds,
        ]),
      ),
    },
    roleAssignments: {
      suspectBotIdBySeat: Object.fromEntries(
        args.scaffold.suspects.map((suspect) => [
          suspect.seatId,
          suspect.botId,
        ]),
      ),
      prosecutorBotId: args.config.prosecutorBotId,
      defenseCounselBotId: args.config.rivalDefenseBotId,
      judgeBotId: args.config.judgeBotId,
      jurorBotIds: [...args.config.jurorBotIds],
    },
    powerPlan: Object.fromEntries(
      Object.entries(args.powerPlan.bots).map(([botId, plan]) => [
        botId,
        plan.effects.map(({ powerId, effect }) => ({
          powerId,
          type: effect.type,
          trigger: "trigger" in effect ? effect.trigger : null,
        })),
      ]),
    ),
    proofRoutesBySeat: Object.fromEntries(
      [...args.requiredContradictionBySeat].map(([seatId, reference]) => [
        seatId,
        `${reference.kind}:${reference.id}`,
      ]),
    ),
    schemaConstraints: {
      investigationMode: args.config.investigationMode,
      trialType: args.config.trialType,
      preset: args.config.preset,
      difficulty: args.config.difficulty,
    },
  };
  const factLedger: MysteryV2FactLedger = {
    ...factLedgerWithoutHash,
    sourceHash: sha256(JSON.stringify(factLedgerWithoutHash)),
  };
  if (
    !args.draft.contextCapsule ||
    args.draft.contextCapsule.sourceHash !== factLedger.sourceHash
  ) {
    const previousFactLedger = args.draft.contextCapsule?.factLedger ?? null;
    if (previousFactLedger) {
      for (const requirement of suspectRequirements) {
        const previousRoute =
          previousFactLedger.proofRoutesBySeat[requirement.seatId] ?? null;
        const nextRoute =
          factLedger.proofRoutesBySeat[requirement.seatId] ?? null;
        if (previousRoute === nextRoute) continue;
        const sectionKey = `suspect:${requirement.seatId}`;
        delete args.draft.suspectsBySeatId[requirement.seatId];
        delete args.draft.connectiveAdditions[sectionKey];
        delete args.draft.provenanceBySection[sectionKey];
      }
    }
    const voiceCardsByBotId = await prepareMysteryVoiceCardsV2({
      runtime: args.runtime,
      bots: args.bots,
    });
    args.draft.contextCapsule = {
      version: 1,
      sourceHash: factLedger.sourceHash,
      factLedger,
      voiceCardsByBotId,
    };
    args.onDraft(args.draft, "Writing the Case · Context prepared");
  }
  const voiceCardsByBotId = args.draft.contextCapsule.voiceCardsByBotId;
  const pendingAudits: Array<
    Promise<{ sectionKey: string; issues: MysteryV2AuditIssue[] }>
  > = [];
  const pendingConnectives: Promise<void>[] = [];
  const targetedRepairs = new Map<
    string,
    (issues: MysteryV2AuditIssue[]) => Promise<void>
  >();
  const queueAudit = (
    sectionKey: string,
    section: unknown,
    relevantFrozenIds: string[],
  ): void => {
    pendingAudits.push(
      auditMysterySectionV2({
        runtime: args.runtime,
        sectionKey,
        section,
        ledger: factLedger,
        relevantFrozenIds,
      }).then((issues) => {
        const provenance = args.draft.provenanceBySection[sectionKey];
        if (provenance) provenance.auditIssues = issues;
        return { sectionKey, issues };
      }),
    );
  };
  const primaryIsHomicide = args.incidentPlan.primary.kind === "homicide";
  const caseIncludesHomicide = primaryIsHomicide ||
    args.incidentPlan.complications.some((incident) => incident.kind === "homicide");
  const authoredTimeline = primaryIsHomicide
    ? args.scaffold.timeline
    : args.scaffold.timeline.map((entry, index) => ({
        ...entry,
        fact: index === 0
          ? `${args.incidentPlan.primary.subject} was last documented as secure.`
          : index === args.scaffold.timeline.length - 1
            ? `The discrepancy involving ${args.incidentPlan.primary.subject} was discovered.`
            : `A material event narrowed the incident window without establishing responsibility by itself.`,
      }));
  const setup = {
    investigationMode: args.config.investigationMode,
    inspiration: args.config.inspiration,
    spark: args.config.spark,
    incidentPlan: args.incidentPlan,
    houseStyle: args.config.houseStyle.promptContract,
    difficulty: args.config.difficulty,
    preset: args.config.preset,
    trialType: args.config.trialType,
    culpritSeatId: args.scaffold.culpritSeatId,
    accompliceSeatId: args.scaffold.accompliceSeatId,
    eyewitnessSeatId: args.eyewitnessSeatId,
    victimId: args.scaffold.victim.id,
    timeline: authoredTimeline,
    roomNames: omitInvestigation ? [] : args.scaffold.rooms.map((room) => ({
      roomId: room.id,
      name: DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === room.templateId)?.name ?? room.templateId,
    })),
    evidenceIds: args.scaffold.evidence.map((item) => item.id),
    examinationIds: omitInvestigation ? [] : args.examinationIds,
    identityMirrorHolders: Object.entries(args.powerPlan.bots).flatMap(
      ([botId, plan]) => plan.effects.some(({ effect }) =>
        effect.type === "identity_mirror" && effect.trigger === "direct_bot_address")
        ? [{
            botId,
            name: botById.get(botId)?.name ?? botId,
            rule: "When another cast bot or the player-controlled Prosecutor directly addresses this holder, the holder knowingly masquerades as that addresser to appropriate only their exact eyes and blink package, complete resting/live mouth package including glyph style and Custom Speech poses, Avatar Details Ink, lower glyph, and a literally double-quoted copy of the addresser's public name. The holder defensively treats the original as the imitator, with mild concern rather than panic or constant repetition. The holder keeps their color, communication frame, complete authored voice, Accent Map location, pronunciation, Speechprint, provider voice identity, Powers, memories, role, and every other speech or mechanical identity field. This is presentation and authored dialogue only and must not change sealed facts or gameplay.",
          }]
        : [],
    ),
    prosecutor: {
      botId: prosecutor.id,
      name: prosecutor.name,
      voiceCard: voiceCardsByBotId[prosecutor.id],
    },
    defenseCounsel: {
      botId: defenseCounsel.id,
      name: defenseCounsel.name,
      voiceCard: voiceCardsByBotId[defenseCounsel.id],
    },
    suspects: suspectRequirements.map((suspect) => ({
      ...suspect,
      voiceCard: voiceCardsByBotId[suspect.botId],
    })),
  };

  let foundation = args.draft.foundation;
  if (!foundation) {
    let foundationCore = args.draft.foundationCore ?? null;
    if (!foundationCore) {
      let deterministicFoundationFallback = false;
      try {
        foundationCore = await generateMysteryAuthoringSectionV2({
          runtime: args.runtime,
          label: "The case foundation",
          maxTokens: 4_500,
          onAttempt: (attempt) => args.onDraft(
            args.draft,
            `Writing the Case · Drafting foundation · attempt ${attempt} of ${DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS}`,
          ),
          onReceipt: (receipt) =>
            recordMysterySectionReceipt(args.draft, "foundation", receipt),
          prompt: {
            section: "case_foundation",
            setup,
            outputContract: {
              title: "original spoiler-safe case title",
              victimName: "fictional name",
              victimDescription: "specific original identity and stakes",
              publicOpening: omitInvestigation
                ? "spoiler-safe prosecution case summary suitable for a court title card"
                : "crime-scene briefing without naming the culprit",
              motive: "sealed motive",
              method: "sealed method",
              prosecutorInternalReasoning: "spoiler-free first-person internal reasoning in the selected Prosecutor persona; it reviews the record but never chooses strategy for the player",
              eyewitnessResolution: args.eyewitnessSeatId ? "exact fair weakness or reconciliation of eyewitness and two-source alibi" : null,
              evidence: "every evidence id exactly once with id, title, description, emoji",
            },
            qualityRules: [
              "Write a specific, coherent case foundation rather than an outline.",
              "The frozen incident plan is canonical truth. Thread every listed complication through the supplied evidence without adding another incident, changing its actor, or exposing private role labels in public prose.",
              primaryIsHomicide
                ? "The primary charge is homicide. Do not substitute a different central incident."
                : caseIncludesHomicide
                  ? `The primary charge is ${args.incidentPlan.primary.title}. Homicide is a linked secondary incident only; preserve it without turning it into the filed charge.`
                : `The primary charge is ${args.incidentPlan.primary.title}, not homicide. Never describe a murder, killing, death, corpse, fatal injury, or murder weapon anywhere in this case. The person named by victimName is the affected party and remains alive.`,
              "Keep the public opening, victim description, motive, method, and Prosecutor internal reasoning under 120 words each.",
              "Keep each evidence description under 55 words.",
              "Keep public prose free of culprit labels and private proof-route metadata.",
              "Identity Crisis is presentation-only. Its cues must never change the sealed culprit, evidence, alibis, or proof routes.",
              "No placeholders, TODOs, bracketed alternatives, or copied franchise characters.",
            ],
          },
          validate: (value) => authoredFoundationCoreFromJson({
            value,
            evidenceIds: setup.evidenceIds,
            incidentPlan: args.incidentPlan,
          }),
        });
      } catch (error) {
        const cause = error instanceof Error ? error.cause : null;
        if (!(cause instanceof MysteryFoundationValidationError)) throw error;
        foundationCore = deterministicAuthoredMysteryFoundationCoreV2({
          scaffold: args.scaffold,
          eyewitnessSeatId: args.eyewitnessSeatId,
          incidentPlan: args.incidentPlan,
        });
        deterministicFoundationFallback = true;
      }
      foundationCore = applyMysteryIncidentPlanToFoundationV2({
        foundation: foundationCore,
        incidentPlan: args.incidentPlan,
        scaffold: args.scaffold,
      });
      args.draft.foundationCore = foundationCore;
      args.onDraft(
        args.draft,
        deterministicFoundationFallback
          ? "Writing the Case · Foundation complete with deterministic case prose"
          : "Writing the Case · Foundation complete",
      );
      if (!deterministicFoundationFallback) {
        queueAudit("foundation", foundationCore, [
          factLedger.frozenIds.victimId,
          ...factLedger.frozenIds.suspectSeatIds,
          ...factLedger.frozenIds.evidenceIds,
        ]);
        targetedRepairs.set("foundation", async (issues) => {
          const repaired = await generateMysteryAuthoringSectionV2({
            runtime: args.runtime,
            label: "The case foundation repair",
            role: "repair",
            maxTokens: 4_500,
            prompt: {
              section: "targeted_section_repair",
              targetSectionKey: "foundation",
              frozenLedgerSlice: {
                sourceHash: factLedger.sourceHash,
                culpritSeatId: factLedger.culpritSeatId,
                accompliceSeatId: factLedger.accompliceSeatId,
                frozenIds: factLedger.frozenIds,
              },
              existingSection: args.draft.foundationCore,
              repairDelta: issues,
              outputContract: "Return one complete replacement foundation object in the same schema.",
            },
            validate: (value) => authoredFoundationCoreFromJson({
              value,
              evidenceIds: setup.evidenceIds,
              incidentPlan: args.incidentPlan,
            }),
            onReceipt: (receipt) =>
              recordMysterySectionReceipt(args.draft, "foundation", receipt),
          });
          args.draft.foundationCore = repaired;
          args.draft.foundation = {
            ...repaired,
            examinations: setup.examinationIds.map((id) => ({
              id,
              text: args.draft.examinationsById[id]!,
            })),
          };
          args.onDraft(args.draft, "Writing the Case · Foundation repaired");
        });
      }
    }

    const examinationChunkSize = 8;
    const examinationsById = args.draft.examinationsById ?? {};
    args.draft.examinationsById = examinationsById;
    const examinationChunks: string[][] = [];
    for (let index = 0; index < setup.examinationIds.length; index += examinationChunkSize) {
      examinationChunks.push(setup.examinationIds.slice(index, index + examinationChunkSize));
    }
    for (let index = 0; index < examinationChunks.length && !omitInvestigation; index += 1) {
      const chunk = examinationChunks[index]!;
      const missingIds = chunk.filter((id) => !compact(examinationsById[id], 1_200));
      if (!missingIds.length) continue;
      const examinationSectionKey = `examinations:${index + 1}`;
      let authoredChunk: Array<{ id: string; text: string }>;
      let deterministicExaminationFallback = false;
      try {
        authoredChunk = await generateMysteryAuthoringSectionV2({
          runtime: args.runtime,
          label: `Room examination batch ${index + 1}`,
          maxTokens: 2_500,
          onAttempt: (attempt) => args.onDraft(
            args.draft,
            `Writing the Case · Drafting room details ${index + 1} of ${examinationChunks.length} · attempt ${attempt} of ${DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS}`,
          ),
          onReceipt: (receipt) =>
            recordMysterySectionReceipt(
              args.draft,
              examinationSectionKey,
              receipt,
            ),
          prompt: {
            section: "room_examinations",
            caseFoundation: foundationCore,
            setup: {
              roomNames: setup.roomNames,
              examinationIds: missingIds,
            },
            outputContract: {
              examinationsById: Object.fromEntries(
                missingIds.map((id) => [id, "sensory, clue-fair text for this exact frozen id"]),
              ),
            },
            qualityRules: [
              "Keep each examination result under 40 words.",
              "Describe only what the prosecutor can fairly perceive or record at that hotspot.",
              ...(caseIncludesHomicide ? [] : [
                `This is a ${args.incidentPlan.primary.title} case, not a homicide. Never mention murder, killing, death, a corpse, a fatal injury, or a murder weapon.`,
              ]),
              "No placeholders, spoilers, deductions on the player's behalf, or copied franchise material.",
            ],
          },
          validate: (value) => assertMysteryIncidentLanguageV2({
            value: authoredExaminationsFromJson({ value, examinationIds: missingIds }),
            incidentPlan: args.incidentPlan,
            section: "Room examination copy",
          }),
        });
        delete args.draft.recoveryBySection[examinationSectionKey];
      } catch (error) {
        if (!mysteryExaminationValidationExhausted(error)) throw error;
        authoredChunk = assertMysteryIncidentLanguageV2({
          value: deterministicAuthoredMysteryExaminationsV2({
            scaffold: args.scaffold,
            examinationIds: missingIds,
          }),
          incidentPlan: args.incidentPlan,
          section: "Deterministic room examination copy",
        });
        deterministicExaminationFallback = true;
        delete args.draft.provenanceBySection[examinationSectionKey];
        args.draft.recoveryBySection[examinationSectionKey] = {
          kind: "deterministic_fallback",
          reason: "invalid_output_exhausted",
          attemptCount: DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS,
          source: "frozen_scaffold",
          sourceHash: factLedger.sourceHash,
        };
      }
      authoredChunk.forEach((entry) => {
        examinationsById[entry.id] = entry.text;
      });
      args.onDraft(
        args.draft,
        deterministicExaminationFallback
          ? `Writing the Case · Room details ${index + 1} of ${examinationChunks.length} complete with deterministic case observations`
          : `Writing the Case · Room details ${index + 1} of ${examinationChunks.length} complete`,
      );
      if (!deterministicExaminationFallback) {
        queueAudit(examinationSectionKey, authoredChunk, missingIds);
        targetedRepairs.set(examinationSectionKey, async (issues) => {
          const repaired = await generateMysteryAuthoringSectionV2({
            runtime: args.runtime,
            label: `Room examination batch ${index + 1} repair`,
            role: "repair",
            maxTokens: 2_500,
            prompt: {
              section: "targeted_section_repair",
              targetSectionKey: examinationSectionKey,
              frozenLedgerSlice: {
                sourceHash: factLedger.sourceHash,
                examinationIds: missingIds,
              },
              existingSection: { examinations: authoredChunk },
              repairDelta: issues,
              outputContract: "Return a complete examinations array for the exact supplied IDs.",
            },
            validate: (value) => assertMysteryIncidentLanguageV2({
              value: authoredExaminationsFromJson({
                value,
                examinationIds: missingIds,
              }),
              incidentPlan: args.incidentPlan,
              section: "Repaired room examination copy",
            }),
            onReceipt: (receipt) =>
              recordMysterySectionReceipt(
                args.draft,
                examinationSectionKey,
                receipt,
              ),
          });
          repaired.forEach((entry) => {
            args.draft.examinationsById[entry.id] = entry.text;
          });
          args.onDraft(args.draft, "Writing the Case · Room details repaired");
        });
      }
    }
    foundation = {
      ...foundationCore,
      examinations: setup.examinationIds.map((id) => ({ id, text: examinationsById[id]! })),
    };
    if (args.eyewitnessSeatId && !foundation.eyewitnessResolution) {
      throw new Error("The eyewitness case omitted its fair statement-level reconciliation.");
    }
    args.draft.foundation = foundation;
    args.onDraft(args.draft, "Writing the Case · Foundation complete");
  }
  if (!foundation) {
    throw new Error("The resumable case draft is missing its foundation.");
  }
  const groundedFoundation = applyMysteryIncidentPlanToFoundationV2({
    foundation,
    incidentPlan: args.incidentPlan,
    scaffold: args.scaffold,
  });
  if (groundedFoundation !== foundation) {
    foundation = groundedFoundation;
    args.draft.foundation = groundedFoundation;
    const {
      examinations: _examinations,
      ...groundedFoundationCore
    } = groundedFoundation;
    args.draft.foundationCore = groundedFoundationCore;
  }
  const validatedFoundation = foundation;

  for (let index = 0; index < suspectRequirements.length; index += 1) {
    const requirement = suspectRequirements[index]!;
    const requiredRecord = args.requiredContradictionBySeat.get(requirement.seatId)!;
    const requiredContradictionRecord: MysteryV2ContradictionRecordV2 | null =
      requiredRecord.kind === "evidence"
        ? (() => {
            const evidence = validatedFoundation.evidence.find(
              (entry) => entry.id === requiredRecord.id,
            );
            return evidence
              ? {
                  reference: requiredRecord,
                  title: evidence.title,
                  text: evidence.description,
                }
              : null;
          })()
        : (() => {
            for (const authoredSuspect of Object.values(
              args.draft.suspectsBySeatId,
            )) {
              const statement = authoredSuspect.testimony.find(
                (entry) => entry.id === requiredRecord.id,
              );
              if (statement) {
                return {
                  reference: requiredRecord,
                  title: null,
                  text: statement.text,
                };
              }
            }
            return null;
          })();
    if (!requiredContradictionRecord) {
      throw new Error(
        `The frozen contradiction record for ${requirement.seatId} is unavailable during sequential authoring.`,
      );
    }
    const requiredPresentationGateRecord = requirement.requiredPresentationGateRecordId
      ? {
          kind: "evidence" as const,
          id: requirement.requiredPresentationGateRecordId.slice("evidence:".length),
        }
      : null;
    const requiredPresentRecords = [
      requiredRecord,
      ...(requiredPresentationGateRecord &&
      mysteryRecordKey(requiredPresentationGateRecord) !== mysteryRecordKey(requiredRecord)
        ? [requiredPresentationGateRecord]
        : []),
    ];
    const relevantEvidenceIds = new Set(
      requiredPresentRecords
        .filter((reference) => reference.kind === "evidence")
        .map((reference) => reference.id),
    );
    const suspectSetupPacket = {
      investigationMode: setup.investigationMode,
      houseStyle: setup.houseStyle,
      difficulty: setup.difficulty,
      trialType: setup.trialType,
      victimId: setup.victimId,
      eyewitnessSeatId: setup.eyewitnessSeatId,
      ...(requirement.temporalRecall === "exact"
        ? { timeline: setup.timeline }
        : {}),
      roomNames: setup.roomNames,
      evidenceIds: setup.evidenceIds,
      examinationIds: setup.examinationIds,
      identityMirrorHolders: setup.identityMirrorHolders,
      prosecutor: setup.prosecutor,
      defenseCounsel: setup.defenseCounsel,
      suspects: setup.suspects,
      frozenLedger: {
        culpritSeatId: factLedger.culpritSeatId,
        accompliceSeatId: factLedger.accompliceSeatId,
        proofRoute: factLedger.proofRoutesBySeat[requirement.seatId],
        statementIds: factLedger.frozenIds.statementIdsBySeat[requirement.seatId],
      },
    };
    const suspectFoundationPacket = {
      title: foundation.title,
      victimName: foundation.victimName,
      victimDescription: foundation.victimDescription,
      motive: foundation.motive,
      method: foundation.method,
      eyewitnessResolution:
        requirement.seatId === args.eyewitnessSeatId
          ? foundation.eyewitnessResolution
          : null,
      evidence: foundation.evidence.filter((evidence) =>
        relevantEvidenceIds.has(evidence.id),
      ),
    };
    const validateSuspect = (value: Record<string, unknown>) => {
      try {
        return assertMysteryIncidentLanguageV2({
          value: authoredSuspectFromJson({
            value,
            seatId: requirement.seatId,
            requiredPresentRecords,
            requiredContradictionRecord,
            requiredPresentationGateRecord,
            recordItems: validatedFoundation.evidence.map((evidence) => ({
              reference: { kind: "evidence" as const, id: evidence.id },
              title: evidence.title,
            })),
            rooms: setup.roomNames.map((room) => ({
              id: room.roomId,
              name: room.name,
            })),
            people: [
              {
                id: args.scaffold.victim.id,
                name: validatedFoundation.victimName,
              },
              ...args.scaffold.suspects.map((suspect) => ({
                id: suspect.seatId,
                name: suspect.name,
              })),
            ],
            knowledge: suspectKnowledgeBySeat[requirement.seatId]!,
            courtOnly: omitInvestigation,
          }),
          incidentPlan: args.incidentPlan,
          section: `Witness chapter ${requirement.ordinal}`,
        });
      } catch (error) {
        throw new MysteryWitnessChapterValidationError(
          error instanceof Error
            ? error.message
            : `Witness chapter ${requirement.ordinal} failed validation.`,
          error,
        );
      }
    };
    const deterministicWitnessChapter = (): AuthoredSuspectV2 => {
      const actorAccount = args.scaffold.actorKnowledge.find(
        (account) => account.seatId === requirement.seatId,
      );
      if (!actorAccount) {
        throw new Error(
          `Witness chapter ${requirement.ordinal} has no frozen actor account.`,
        );
      }
      const recordClaim = groundedMysteryContradictionExcerptV2(
        "",
        requiredContradictionRecord.text,
      );
      const deterministicDenial = "The assigned record's exact claim is false.";
      const statementClaim = groundedMysteryContradictionExcerptV2(
        "",
        deterministicDenial,
      );
      if (!recordClaim || !statementClaim) {
        throw new Error(
          `Witness chapter ${requirement.ordinal} has no groundable frozen contradiction.`,
        );
      }
      const alibi = requirement.temporalRecall === "exact"
        ? actorAccount.alibi
        : requirement.temporalRecall === "approximate"
          ? "I remember the order of my own movements, but not an exact clock time."
          : "I cannot place events by time; I can only describe what I personally did and observed.";
      return validateSuspect({
        suspect: {
          seatId: requirement.seatId,
          relationship: actorAccount.relationshipToVictim,
          alibi,
          presentReactions: requirement.requiredPresentReactionRecordIds.map(
            (recordId) => ({
              recordId,
              response:
                "This Case File record changes what I can safely claim. I will limit my answer to my own account and the facts it establishes.",
            }),
          ),
          testimony: [
            {
              id: requirement.requiredStatementIds[0],
              text: `I knew ${validatedFoundation.victimName} through the household, but I did not know their private plans.`,
              press:
                "I can describe our connection, but I will not guess about choices I did not witness.",
              defenseRebuttal:
                "The witness has limited this statement to firsthand knowledge; speculation is not evidence.",
              defenseObjection:
                "Objection. The prosecution is asking the witness to claim knowledge they do not possess.",
              revision:
                "I knew the affected party through the household, but I cannot speak to anyone else's private decisions.",
            },
            {
              id: requirement.requiredStatementIds[1],
              text: deterministicDenial,
              press:
                "I am denying that exact claim, not a different event or a neighboring detail.",
              defenseRebuttal:
                "That record does not contradict this active sentence unless it proves the exact opposite claim.",
              defenseObjection:
                "Objection. The prosecution must compare the record to the witness's exact words.",
              revision:
                "I withdraw that denial. The assigned record's exact claim is true.",
              contradictionBasis: {
                version: 1,
                recordId: mysteryRecordKey(requiredContradictionRecord.reference),
                statementClaim,
                recordClaim,
                relationship: "cannot_both_be_true",
              },
            },
            {
              id: requirement.requiredStatementIds[2],
              text:
                "I can speak only to my own movements and what I directly observed.",
              press:
                "Anything beyond my own actions and observations would be speculation.",
              defenseRebuttal:
                "The witness has drawn a clear boundary around their firsthand account.",
              defenseObjection:
                "Objection. The question asks this witness to adopt someone else's knowledge.",
              revision:
                "I can confirm my own actions and direct observations; anything beyond that would be speculation.",
            },
          ],
        },
      });
    };
    let deterministicWitnessFallback = false;
    let suspect: AuthoredSuspectV2 | undefined =
      args.draft.suspectsBySeatId[requirement.seatId];
    if (suspect) {
      try {
        suspect = validateSuspect({ suspect });
        args.draft.suspectsBySeatId[requirement.seatId] = suspect;
      } catch {
        const sectionKey = `suspect:${requirement.seatId}`;
        delete args.draft.suspectsBySeatId[requirement.seatId];
        delete args.draft.connectiveAdditions[sectionKey];
        delete args.draft.provenanceBySection[sectionKey];
        suspect = undefined;
      }
    }
    if (!suspect) {
      try {
        suspect = await generateMysteryAuthoringSectionV2({
      runtime: args.runtime,
      label: `Witness chapter ${index + 1}`,
      maxTokens: omitInvestigation ? 3_600 : 5_000,
      onAttempt: (attempt) => args.onDraft(
        args.draft,
        `Writing the Case · Witness chapter ${index + 1} of ${suspectRequirements.length} · attempt ${attempt} of ${DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS}`,
      ),
      onReceipt: (receipt) =>
        recordMysterySectionReceipt(
          args.draft,
          `suspect:${requirement.seatId}`,
          receipt,
        ),
      prompt: {
        section: "suspect_chapter",
        setup: suspectSetupPacket,
        caseFoundation: suspectFoundationPacket,
        suspect: {
          ...requirement,
          voiceCard: voiceCardsByBotId[requirement.botId],
          contradictionContract: {
            version: 1,
            statementId: requirement.requiredStatementIds[1],
            recordId: mysteryRecordKey(requiredContradictionRecord.reference),
            recordKind: requiredContradictionRecord.reference.kind,
            recordTitle: requiredContradictionRecord.title,
            recordText: requiredContradictionRecord.text,
            rule:
              "Under an ordinary literal reading, statement #2 and the supplied record cannot both be true. Do not rely on an unstated inference, a different event, or merely suspicious context.",
          },
        },
        precedingSwornStatements: Object.values(args.draft.suspectsBySeatId).flatMap((entry) =>
          entry.testimony.map((statement) => ({ witnessSeatId: entry.seatId, id: statement.id, text: statement.text }))),
        outputContract: {
          suspect: omitInvestigation ? {
            seatId: requirement.seatId,
            relationship: "complete relationship to the victim",
            alibi: "specific authored alibi",
            testimony: "exactly 3 statements using every required statement ID; each has id, text, press, Defense-Counsel-owned defenseRebuttal, Defense-Counsel-owned defenseObjection, and a materially changed revision. Statement #2 also has contradictionBasis with the exact recordId, a verbatim 3+ word statementClaim excerpt, a verbatim 3+ word recordClaim excerpt, and relationship cannot_both_be_true",
          } : {
            seatId: requirement.seatId,
            relationship: "complete relationship to the victim",
            alibi: "specific authored alibi",
            talkTopics: "1-3 concise non-evidence subjects with only id, short menu label, category (person, general, motive, alibi, or room), subjectId for person/room, an in-character Prosecutor question, and the suspect response. PRISM supplies safe relationship/alibi subjects when fewer than 3 survive. Room subjectId must be an exact setup roomId; person subjectId must be the victim ID or an exact suspect seatId. Never make a Case File evidence/testimony title into a Talk subject.",
            presentationGate: requiredPresentationGateRecord
              ? {
                  unlockTopicId: "optional id of one authored Talk topic to reserve as the evidence follow-up. PRISM binds the frozen record and moves the topic to the final position; omit this field if no authored topic fits",
                }
              : null,
            presentReactions: requirement.requiredPresentReactionRecordIds.map((recordId) => ({
              recordId,
              response: "specific proof-bearing suspect reaction to this exact record; PRISM materializes its public Case File title",
            })),
            testimony: "exactly 3 statements using every required statement ID; each has id, text, press, Defense-Counsel-owned defenseRebuttal, Defense-Counsel-owned defenseObjection, and a materially changed revision. Statement #2 also has contradictionBasis with the exact recordId, a verbatim 3+ word statementClaim excerpt, a verbatim 3+ word recordClaim excerpt, and relationship cannot_both_be_true",
          },
        },
        qualityRules: [
          "The second statement must be plainly contradicted by the assigned record: both texts cannot be true under an ordinary literal reading. Shared subject matter, suspicion, or a possible inconsistency is not enough.",
          "Ground contradictionBasis by copying one short claim verbatim from statement #2 and one short claim verbatim from the supplied record text. The two quoted claims must express the mutually exclusive facts; never quote an ID or invent a fact.",
          "Press answers add context without erasing the proof route.",
          "Revision text materially changes the sworn account.",
          requirement.awareness === "involved"
            ? "This suspect is privately involved in the incident. They may conceal or distort what they know, but their public account must stay coherent with the sealed role."
            : requirement.awareness === "unaware"
              ? "This innocent suspect is an unrelated worker, visitor, or bystander caught in the wrong place at the wrong time. They have no privileged case knowledge or hidden motive; an honest 'I don't know' is valid, and their contradiction must concern only their own routine, sequence, or mistaken impression."
              : "This innocent suspect has only incidental knowledge from their own work, routine, or observations. Do not give them the sealed motive, method, culprit identity, or knowledge of events they could not personally perceive.",
          ...(caseIncludesHomicide ? [] : [
            `The primary charge is ${args.incidentPlan.primary.title}, not homicide. Never mention a murder, killing, death, corpse, fatal injury, murder weapon, killer, or murderer. The affected party is alive.`,
          ]),
          requirement.temporalRecall === "exact"
            ? "This suspect may use an exact clock time only where their role and personal observations plausibly support it."
            : requirement.temporalRecall === "approximate"
              ? "This suspect remembers time only approximately. Never give them an exact clock minute such as 10:13 or 'ten thirteen in the morning'; use natural uncertainty such as 'a little after ten', 'around ten', 'before the alarm', or 'not long after I arrived'."
              : "This suspect has no clock-time recall. Never give them an exact or approximate clock reading; anchor their account only to events they noticed, or let them truthfully say they do not know when something happened.",
          ...(omitInvestigation ? [
            "This compilation omits investigation. Do not write room, mansion, investigation, Talk, or Present dialogue.",
          ] : [
            "Each Talk question is a natural, specific way for the prosecution to ask about its typed person, general, motive, alibi, or room subject and stays under 25 words.",
          "Talk never contains a physical evidence or sworn-testimony record as its subject. A room topic names and references one exact setup roomId.",
          requiredPresentationGateRecord
            ? "You may nominate one authored Talk topic as the pivotal evidence follow-up through presentationGate.unlockTopicId. Do not echo a gate id or record id: PRISM binds the exact frozen record, moves a valid topic to the final position, or supplies a safe follow-up from the required Present response."
            : "Do not invent a presentation gate for this witness.",
          "Do not author repeat responses, stage actions, performance directions, generic Present copy, chapter transitions, or defendant reactions. PRISM owns those presentation-only fallbacks.",
          "The investigation happens before court. In Talk and Present responses, never refer to the Court, a courtroom, the bench, a jury, a witness stand, sworn testimony, or 'Your Honor'. Use the room, house, investigation, Case File, and direct questions instead; courtroom language belongs only to trial dialogue.",
          "Each required Present response addresses only its exact supplied record. PRISM materializes the public Case File title; never name a different record or expose sealed reasoning.",
          "Write Talk questions only in the frozen Prosecutor persona and Defense rebuttals only in the frozen Defense Counsel persona. The accused is never their own attorney.",
          "Keep each Talk response, statement, Press answer, rebuttal, revision, and reaction under 75 words.",
          ]),
          "Write in this suspect's persona with no placeholders.",
        ],
      },
      sourcePrompt: {
        section: "suspect_chapter",
        setup,
        caseFoundation: foundation,
        suspect: requirement,
        precedingSwornStatements: Object.values(
          args.draft.suspectsBySeatId,
        ).flatMap((entry) =>
          entry.testimony.map((statement) => ({
            witnessSeatId: entry.seatId,
            id: statement.id,
            text: statement.text,
          })),
        ),
      },
          validate: validateSuspect,
        });
      } catch (error) {
        if (!mysteryWitnessChapterValidationExhausted(error)) throw error;
        suspect = deterministicWitnessChapter();
        deterministicWitnessFallback = true;
      }
      args.draft.suspectsBySeatId[requirement.seatId] = suspect;
      args.onDraft(
        args.draft,
        deterministicWitnessFallback
          ? `Writing the Case · Witness chapter ${index + 1} of ${suspectRequirements.length} recovered from frozen case facts`
          : `Writing the Case · Witness chapter ${index + 1} of ${suspectRequirements.length} complete`,
      );
    }
    const suspectSectionKey = `suspect:${requirement.seatId}`;
    const suspectFrozenIds = [
      requirement.seatId,
      ...requirement.requiredStatementIds,
      ...requirement.requiredPresentReactionRecordIds,
    ];
    const applyConnectiveAdditions = (
      additions: Record<string, string>,
    ): AuthoredSuspectV2 => {
      const connectedSuspect: AuthoredSuspectV2 = {
        ...args.draft.suspectsBySeatId[requirement.seatId]!,
        talkTopics: args.draft.suspectsBySeatId[
          requirement.seatId
        ]!.talkTopics.map((topic) => {
          const rawAcknowledgment = additions[topic.id] ?? "As I said,";
          const acknowledgment = /[,:;!?]$/u.test(rawAcknowledgment)
            ? rawAcknowledgment
            : `${rawAcknowledgment},`;
          const alternateAcknowledgment = /^as i said/iu.test(acknowledgment)
            ? "I have already answered that:"
            : "As I said,";
          return {
            ...topic,
            repeatResponses: [acknowledgment, alternateAcknowledgment].map(
              (prefix) => ({
                response: `${prefix} ${topic.response}`,
                responseStageAction: null,
                performance: topic.performance,
              }),
            ),
          };
        }),
      };
      args.draft.suspectsBySeatId[requirement.seatId] = connectedSuspect;
      return connectedSuspect;
    };
    if (
      Object.prototype.hasOwnProperty.call(
        args.draft.connectiveAdditions,
        suspectSectionKey,
      )
    ) {
      if (!deterministicWitnessFallback) {
        queueAudit(
          suspectSectionKey,
          args.draft.suspectsBySeatId[requirement.seatId]!,
          suspectFrozenIds,
        );
      }
    } else {
      pendingConnectives.push(
        prepareMysteryConnectiveAdditionsV2({
          runtime: args.runtime,
          sectionKey: suspectSectionKey,
          voiceCard: voiceCardsByBotId[requirement.botId],
          topicIds: suspect.talkTopics.map((topic) => topic.id),
        }).then((additions) => {
          const connectedSuspect = applyConnectiveAdditions(additions);
          args.draft.connectiveAdditions[suspectSectionKey] = additions;
          args.onDraft(
            args.draft,
            `Writing the Case · Witness chapter ${index + 1} connective copy complete`,
          );
          if (!deterministicWitnessFallback) {
            queueAudit(suspectSectionKey, connectedSuspect, suspectFrozenIds);
          }
        }),
      );
    }
    if (!deterministicWitnessFallback) {
      targetedRepairs.set(suspectSectionKey, async (issues) => {
        const repaired = await generateMysteryAuthoringSectionV2({
        runtime: args.runtime,
        label: `Witness chapter ${index + 1} repair`,
        role: "repair",
        maxTokens: omitInvestigation ? 3_600 : 5_000,
        prompt: {
          section: "targeted_section_repair",
          targetSectionKey: suspectSectionKey,
          frozenLedgerSlice: {
            sourceHash: factLedger.sourceHash,
            culpritSeatId: factLedger.culpritSeatId,
            accompliceSeatId: factLedger.accompliceSeatId,
            suspectKnowledge:
              factLedger.suspectKnowledgeBySeat[requirement.seatId],
            proofRoute: factLedger.proofRoutesBySeat[requirement.seatId],
            relevantFrozenIds: suspectFrozenIds,
          },
          contradictionContract: {
            version: 1,
            statementId: requirement.requiredStatementIds[1],
            recordId: mysteryRecordKey(requiredContradictionRecord.reference),
            recordKind: requiredContradictionRecord.reference.kind,
            recordTitle: requiredContradictionRecord.title,
            recordText: requiredContradictionRecord.text,
          },
          existingSection: { suspect: args.draft.suspectsBySeatId[requirement.seatId] },
          repairDelta: issues,
          outputContract: "Return one complete replacement suspect object in the same schema. Change only fields named by the repair delta.",
        },
        validate: validateSuspect,
        onReceipt: (receipt) =>
          recordMysterySectionReceipt(args.draft, suspectSectionKey, receipt),
      });
        args.draft.suspectsBySeatId[requirement.seatId] = repaired;
        const connectiveAdditions =
          args.draft.connectiveAdditions[suspectSectionKey];
        if (connectiveAdditions) {
          applyConnectiveAdditions(connectiveAdditions);
        }
        args.onDraft(
          args.draft,
          `Writing the Case · Witness chapter ${index + 1} repaired`,
        );
      });
    }
  }

  let prosecutionChoices = args.draft.prosecutionChoices;
  if (!prosecutionChoices) {
    let deterministicProsecutionFallback = false;
    try {
      prosecutionChoices = await generateMysteryAuthoringSectionV2({
        runtime: args.runtime,
        label: "The prosecution response section",
        maxTokens: 2_500,
        onAttempt: (attempt) => args.onDraft(
          args.draft,
          `Writing the Case · Prosecution responses · attempt ${attempt} of ${DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS}`,
        ),
        onReceipt: (receipt) =>
          recordMysterySectionReceipt(
            args.draft,
            "prosecution_choices",
            receipt,
          ),
        prompt: {
        section: "prosecution_choices",
        setup: {
          trialType: setup.trialType,
          victimId: setup.victimId,
          eyewitnessSeatId: setup.eyewitnessSeatId,
          roomNames: setup.roomNames,
          evidenceIds: setup.evidenceIds,
          examinationIds: setup.examinationIds,
          identityMirrorHolders: setup.identityMirrorHolders,
          prosecutor: setup.prosecutor,
          defenseCounsel: setup.defenseCounsel,
          suspects: setup.suspects,
        },
        caseFoundation: {
          title: foundation.title,
          victimName: foundation.victimName,
        },
        witnessChapters: Object.values(args.draft.suspectsBySeatId).map((entry) => ({
          seatId: entry.seatId,
          testimony: entry.testimony.map((statement) => ({ id: statement.id, text: statement.text })),
        })),
        outputContract: {
          prosecutionChoices: {
            minimumItems: 1,
            itemShape: {
              id: "stable choice id",
              witnessSeatId: "exact suspect seatId",
              prompt: "court prompt",
              options: {
                minimumItems: automatedSpectator ? 1 : 2,
                maximumItems: automatedSpectator ? 1 : 4,
                itemShape: {
                  id: "stable option id",
                  text: "selected Prosecutor spoken line",
                  stageAction: "short visual-only Prosecutor beat",
                  reaction: "witness spoken reaction",
                  reactionStageAction: "short visual-only witness beat",
                },
              },
            },
          },
        },
        qualityRules: [
          automatedSpectator
            ? "Author exactly one complete response for each automated Spectator prosecution choice."
            : "The player chooses the option. Never choose or recommend an option in authored text.",
          "Write each option in the frozen Prosecutor persona and keep every nonverbal beat out of spoken text.",
          ...(caseIncludesHomicide ? [] : [
            `This is a ${args.incidentPlan.primary.title} prosecution, not a homicide. Never mention murder, killing, death, a corpse, a fatal injury, or a murder weapon.`,
          ]),
        ],
      },
        sourcePrompt: {
        section: "prosecution_choices",
        setup,
        caseFoundation: foundation,
        witnessChapters: Object.values(args.draft.suspectsBySeatId).map(
          (entry) => ({
            seatId: entry.seatId,
            testimony: entry.testimony.map((statement) => ({
              id: statement.id,
              text: statement.text,
            })),
          }),
        ),
      },
        validate: (value) => assertMysteryIncidentLanguageV2({
          value: authoredProsecutionChoicesFromJson(
            value,
            suspectRequirements.map((entry) => entry.seatId),
            automatedSpectator ? 1 : 2,
          ),
          incidentPlan: args.incidentPlan,
          section: "Prosecution choice copy",
        }),
      });
      delete args.draft.recoveryBySection.prosecution_choices;
    } catch (error) {
      if (!mysteryProsecutionChoiceValidationExhausted(error)) throw error;
      prosecutionChoices = assertMysteryIncidentLanguageV2({
        value: deterministicAuthoredMysteryProsecutionChoicesV2({
          suspectSeatIds: suspectRequirements.map((entry) => entry.seatId),
          automatedSpectator,
        }),
        incidentPlan: args.incidentPlan,
        section: "Deterministic prosecution choice copy",
      });
      deterministicProsecutionFallback = true;
      delete args.draft.provenanceBySection.prosecution_choices;
      args.draft.recoveryBySection.prosecution_choices = {
        kind: "deterministic_fallback",
        reason: "invalid_output_exhausted",
        attemptCount: DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS,
        source: "frozen_scaffold",
        sourceHash: factLedger.sourceHash,
      };
    }
    args.draft.prosecutionChoices = prosecutionChoices;
    args.onDraft(
      args.draft,
      deterministicProsecutionFallback
        ? "Writing the Case · Prosecution responses complete with deterministic court copy"
        : "Writing the Case · Prosecution responses complete",
    );
    const prosecutionFrozenIds = [
      ...factLedger.frozenIds.suspectSeatIds,
      ...Object.values(factLedger.frozenIds.statementIdsBySeat).flat(),
    ];
    if (!deterministicProsecutionFallback) {
      queueAudit(
        "prosecution_choices",
        prosecutionChoices,
        prosecutionFrozenIds,
      );
      targetedRepairs.set("prosecution_choices", async (issues) => {
      const repaired = await generateMysteryAuthoringSectionV2({
        runtime: args.runtime,
        label: "The prosecution response repair",
        role: "repair",
        maxTokens: 2_500,
        prompt: {
          section: "targeted_section_repair",
          targetSectionKey: "prosecution_choices",
          frozenLedgerSlice: {
            sourceHash: factLedger.sourceHash,
            relevantFrozenIds: prosecutionFrozenIds,
          },
          existingSection: {
            prosecutionChoices: args.draft.prosecutionChoices,
          },
          repairDelta: issues,
          outputContract: "Return the complete prosecutionChoices array in the same schema. Change only fields named by the repair delta.",
        },
        validate: (value) => assertMysteryIncidentLanguageV2({
          value: authoredProsecutionChoicesFromJson(
            value,
            suspectRequirements.map((entry) => entry.seatId),
            automatedSpectator ? 1 : 2,
          ),
          incidentPlan: args.incidentPlan,
          section: "Repaired prosecution choice copy",
        }),
        onReceipt: (receipt) =>
          recordMysterySectionReceipt(
            args.draft,
            "prosecution_choices",
            receipt,
          ),
      });
        args.draft.prosecutionChoices = repaired;
        args.onDraft(args.draft, "Writing the Case · Prosecution responses repaired");
      });
    }
  }

  await Promise.all(pendingConnectives);
  const auditResults = await Promise.all(pendingAudits);
  for (const auditResult of auditResults) {
    const highIssues = auditResult.issues.filter(
      (issue) => issue.severity === "high",
    );
    const repair = targetedRepairs.get(auditResult.sectionKey);
    if (highIssues.length > 0 && repair) await repair(highIssues);
  }

  const contradictionPairs = (): Array<{
    witnessSeatId: string;
    statement: AuthoredStatementV2;
    record: MysteryV2ContradictionRecordV2;
  }> => suspectRequirements.map((requirement) => {
    const suspect = args.draft.suspectsBySeatId[requirement.seatId];
    const statement = suspect?.testimony.find(
      (entry) => entry.id === requirement.requiredStatementIds[1],
    );
    const reference = args.requiredContradictionBySeat.get(
      requirement.seatId,
    );
    const record = reference
      ? mysteryContradictionRecordV2({
          reference,
          foundation: args.draft.foundation ?? validatedFoundation,
          suspects: Object.values(args.draft.suspectsBySeatId),
        })
      : null;
    if (!suspect || !statement || !record) {
      throw new Error(
        `The frozen contradiction route for ${requirement.seatId} is incomplete before semantic validation.`,
      );
    }
    return { witnessSeatId: requirement.seatId, statement, record };
  });
  const applyGroundedContradictionEvaluations = (
    evaluations: readonly MysteryV2ContradictionEvaluationV2[],
  ): void => {
    for (const evaluation of evaluations) {
      if (evaluation.verdict !== "clear_contradiction") continue;
      const suspect = args.draft.suspectsBySeatId[evaluation.witnessSeatId];
      if (!suspect) continue;
      suspect.testimony = suspect.testimony.map((statement) =>
        statement.id === evaluation.statementId
          ? {
              ...statement,
              contradictionBasis: {
                version: 1,
                recordId: evaluation.recordId,
                statementClaim: evaluation.statementClaim,
                recordClaim: evaluation.recordClaim,
                relationship: "cannot_both_be_true",
              },
            }
          : statement);
    }
  };

  const repairMysteryContradiction = async (
    evaluation: MysteryV2ContradictionEvaluationV2,
    forceDeterministic = false,
  ): Promise<void> => {
    const requirement = suspectRequirements.find(
      (entry) => entry.seatId === evaluation.witnessSeatId,
    );
    const existing = requirement
      ? args.draft.suspectsBySeatId[requirement.seatId]
      : null;
    const requiredRecord = requirement
      ? args.requiredContradictionBySeat.get(requirement.seatId)
      : null;
    const contradictionRecord = requiredRecord
      ? mysteryContradictionRecordV2({
          reference: requiredRecord,
          foundation: args.draft.foundation ?? validatedFoundation,
          suspects: Object.values(args.draft.suspectsBySeatId),
        })
      : null;
    if (!requirement || !existing || !requiredRecord || !contradictionRecord) {
      throw new Error(
        "A frozen witness proof route disappeared during contradiction repair.",
      );
    }
    const requiredPresentationGateRecord =
      requirement.requiredPresentationGateRecordId
        ? {
            kind: "evidence" as const,
            id: requirement.requiredPresentationGateRecordId.slice(
              "evidence:".length,
            ),
          }
        : null;
    const requiredPresentRecords = [
      requiredRecord,
      ...(requiredPresentationGateRecord &&
      mysteryRecordKey(requiredPresentationGateRecord) !==
        mysteryRecordKey(requiredRecord)
        ? [requiredPresentationGateRecord]
        : []),
    ];
    const validateRepairedSuspect = (value: Record<string, unknown>) =>
      authoredSuspectFromJson({
        value,
        seatId: requirement.seatId,
        requiredPresentRecords,
        requiredContradictionRecord: contradictionRecord,
        requiredPresentationGateRecord,
        recordItems: (args.draft.foundation ?? validatedFoundation).evidence.map((evidence) => ({
          reference: { kind: "evidence" as const, id: evidence.id },
          title: evidence.title,
        })),
        rooms: setup.roomNames.map((room) => ({
          id: room.roomId,
          name: room.name,
        })),
        people: [
          {
            id: args.scaffold.victim.id,
            name: (args.draft.foundation ?? validatedFoundation).victimName,
          },
          ...args.scaffold.suspects.map((entry) => ({
            id: entry.seatId,
            name: entry.name,
          })),
        ],
        knowledge: suspectKnowledgeBySeat[requirement.seatId]!,
        courtOnly: omitInvestigation,
      });
    const buildDeterministicRepair = (): AuthoredSuspectV2 => {
      const recordClaim = groundedMysteryContradictionExcerptV2(
        "",
        contradictionRecord.text,
      );
      if (!recordClaim) {
        throw new Error(
          `Witness chapter ${requirement.ordinal} has no groundable contradiction record.`,
        );
      }
      const statementText =
        "The assigned record's exact claim is false.";
      return validateRepairedSuspect({
        suspect: {
          ...existing,
          testimony: existing.testimony.map((statement) =>
            statement.id === requirement.requiredStatementIds[1]
              ? {
                  ...statement,
                  text: statementText,
                  press:
                    "I am denying that exact claim, not a different event or a neighboring detail.",
                  defenseRebuttal:
                    "That record does not contradict this active sentence; the prosecution must prove the exact opposite claim.",
                  defenseObjection:
                    "Objection. The prosecution must compare the record to the witness's exact words.",
                  revision:
                    "I withdraw that denial. The assigned record's exact claim is true.",
                  contradictionBasis: {
                    version: 1,
                    recordId: mysteryRecordKey(contradictionRecord.reference),
                    statementClaim: groundedMysteryContradictionExcerptV2(
                      "",
                      statementText,
                    ),
                    recordClaim,
                    relationship: "cannot_both_be_true",
                  },
                }
              : statement),
        },
      });
    };
    let repaired: AuthoredSuspectV2;
    if (forceDeterministic) {
      repaired = buildDeterministicRepair();
    } else {
      try {
        repaired = await generateMysteryAuthoringSectionV2({
        runtime: args.runtime,
        label: `Witness chapter ${requirement.ordinal} contradiction repair`,
        role: "repair",
        maxTokens: omitInvestigation ? 3_600 : 5_000,
        prompt: {
          section: "targeted_contradiction_repair",
          targetSectionKey: `suspect:${requirement.seatId}`,
          witnessSeatId: requirement.seatId,
          contradictionContract: {
            version: 1,
            statementId: requirement.requiredStatementIds[1],
            recordId: mysteryRecordKey(contradictionRecord.reference),
            recordKind: contradictionRecord.reference.kind,
            recordTitle: contradictionRecord.title,
            recordText: contradictionRecord.text,
            decisionRule:
              "The repaired statement #2 and supplied record must be impossible to reconcile under an ordinary literal reading.",
          },
          existingSection: { suspect: existing },
          semanticFinding: {
            verdict: evaluation.verdict,
            rationale: evaluation.rationale,
            repairInstruction: evaluation.repairInstruction,
          },
          outputContract:
            "Return one complete replacement suspect object in the same schema. Change statement #2, its Press answer, defenseRebuttal, defenseObjection, revision, and contradictionBasis only as needed; preserve every other field and frozen ID.",
        },
        validate: validateRepairedSuspect,
        onReceipt: (receipt) =>
          recordMysterySectionReceipt(
            args.draft,
            `suspect:${requirement.seatId}`,
            receipt,
          ),
        });
      } catch {
        repaired = buildDeterministicRepair();
      }
    }
    const repairedSecondStatement = repaired.testimony.find(
      (statement) => statement.id === requirement.requiredStatementIds[1],
    );
    if (!repairedSecondStatement) {
      throw new Error(
        `Contradiction repair removed statement #2 for ${requirement.seatId}.`,
      );
    }
    // A semantic repair is allowed to change only the proof-bearing beat.
    // Preserve every unrelated authored line so replay does not drift merely
    // because one contradiction needed clarification.
    args.draft.suspectsBySeatId[requirement.seatId] = {
      ...existing,
      testimony: existing.testimony.map((statement) =>
        statement.id === repairedSecondStatement.id
          ? repairedSecondStatement
          : statement),
    };
    args.onDraft(
      args.draft,
      `Testing Contradictions · Witness chapter ${requirement.ordinal} repaired`,
    );
  };

  args.onDraft(args.draft, "Testing Contradictions · Checking statement meaning");
  let unclearEvaluations: MysteryV2ContradictionEvaluationV2[] = [];
  // One repair can change a prior statement that supplies the next witness's
  // proof. Re-evaluate the complete frozen route set after each bounded repair
  // wave so no downstream chapter keeps a stale semantic approval. The final
  // deterministic propagation wave handles a dependent witness discovered
  // only after its source statement stabilizes.
  const finalContradictionRepairWave = 3;
  for (
    let repairWave = 0;
    repairWave <= finalContradictionRepairWave;
    repairWave += 1
  ) {
    const semanticEvaluations = await evaluateMysteryContradictionSemanticsV2({
      runtime: args.runtime,
      pairs: contradictionPairs(),
    });
    applyGroundedContradictionEvaluations(semanticEvaluations);
    unclearEvaluations = semanticEvaluations.filter(
      (evaluation) => evaluation.verdict !== "clear_contradiction",
    );
    if (unclearEvaluations.length === 0) break;
    if (repairWave === finalContradictionRepairWave) break;
    for (const evaluation of unclearEvaluations) {
      await repairMysteryContradiction(evaluation, repairWave > 0);
    }
  }
  if (unclearEvaluations.length > 0) {
    throw new Error(
      `Court contradiction semantics remained unclear after bounded repair for ${unclearEvaluations
        .map((evaluation) => evaluation.witnessSeatId)
        .join(", ")}.`,
    );
  }
  args.onDraft(args.draft, "Testing Contradictions · Meaning verified");

  foundation = args.draft.foundation ?? foundation;
  foundation = applyMysteryIncidentPlanToFoundationV2({
    foundation,
    incidentPlan: args.incidentPlan,
    scaffold: args.scaffold,
  });
  prosecutionChoices = args.draft.prosecutionChoices ?? prosecutionChoices;

  const authored: AuthoredMysteryV2 = {
    ...foundation,
    suspects: suspectRequirements.map((entry) => args.draft.suspectsBySeatId[entry.seatId]!),
    prosecutionChoices: automatedSpectator
      ? prosecutionChoices.map((choice) => ({
          ...choice,
          options: choice.options.slice(0, 1),
        }))
      : prosecutionChoices,
  };
  if (authored.suspects.some((suspect) => !suspect)) {
    throw new Error("The resumable case draft is missing a witness chapter.");
  }
  if (args.eyewitnessSeatId && !authored.eyewitnessResolution) {
    throw new Error("The eyewitness case omitted its fair statement-level reconciliation.");
  }
  return authored;
}

const MYSTERY_FORGE_PERSONA_DIALOGUE_CADENCES_V2 = {
  precise_focus: "Let’s be precise:",
  respectful_formality: "Respectfully,",
  quiet_restraint: "Quietly,",
  measured_clarity: "With measured clarity,",
  guarded_patience: "With guarded patience,",
  theatrical_precision: "With theatrical precision,",
} as const;

function mysteryForgePersonaDialogueCadenceV2(value: unknown): string {
  const cadenceId = compact(value, 80) as keyof typeof MYSTERY_FORGE_PERSONA_DIALOGUE_CADENCES_V2;
  const cadence = MYSTERY_FORGE_PERSONA_DIALOGUE_CADENCES_V2[cadenceId];
  if (!cadence) {
    throw new Error("Persona dialogue polish chose an unsupported cadence.");
  }
  return cadence;
}

const MYSTERY_ROOM_INTRODUCTION_PERSONA_CADENCES_V2 = {
  open_start: "All right,",
  formal_start: "Very well,",
  guarded_start: "If you insist,",
  wry_start: "Fair enough,",
  focused_start: "Listen carefully:",
  gentle_start: "Let us speak plainly:",
} as const;

const MYSTERY_ROOM_INTRODUCTION_DIALOGUE_TEMPLATES_V2 = {
  earnest_resolve:
    "I'm {name}. Go ahead and ask. I'll answer honestly, but I won't turn a hunch into a fact.",
  formal_precision:
    "I am {name}. State your questions precisely. I will separate what I know from what I merely infer.",
  grandiose_impatience:
    "You are addressing {name}. Ask while you have my attention; facts will get an answer, guesses will not.",
  compassionate_truth:
    "I am {name}. Ask in good faith, and I will answer in kind—carefully, truthfully, and never beyond what I know.",
  guarded_boundary:
    "Call me {name}. Ask what you came to ask. I will answer carefully, and I will keep speculation out of it.",
  wry_candor:
    "I'm {name}. Go on, then—ask. You'll get the truth I have, not the version that makes the neatest story.",
  theatrical_challenge:
    "The name is {name}. Ask boldly. I will tell you what I know, but I will not perform certainty for your convenience.",
  quiet_patience:
    "I am {name}. Take your time and ask. I will answer with care, without claiming more than I know.",
} as const;

/**
 * Live room direction is deliberately selection-only. A model can choose a
 * persona-shaped cadence, but it can never author text that might smuggle a
 * new alibi, admission, object, or other case claim into the frozen graph.
 */
export function mysteryRoomIntroductionPersonaCadenceV2(value: unknown): string {
  const cadenceId = compact(value, 80) as keyof typeof MYSTERY_ROOM_INTRODUCTION_PERSONA_CADENCES_V2;
  const cadence = MYSTERY_ROOM_INTRODUCTION_PERSONA_CADENCES_V2[cadenceId];
  if (!cadence) {
    throw new Error("Room-introduction persona direction chose an unsupported cadence.");
  }
  return cadence;
}

export function mysteryRoomIntroductionPersonaDialogueV2(
  value: unknown,
  speakerName: string,
): { dialogueTemplateId: string; text: string } {
  const dialogueTemplateId = compact(value, 80) as keyof typeof MYSTERY_ROOM_INTRODUCTION_DIALOGUE_TEMPLATES_V2;
  const template = MYSTERY_ROOM_INTRODUCTION_DIALOGUE_TEMPLATES_V2[dialogueTemplateId];
  const frozenName = compact(speakerName, 160);
  if (!template || !frozenName) {
    throw new Error("Room-introduction persona direction chose an unsupported dialogue template.");
  }
  return {
    dialogueTemplateId,
    text: template.split("{name}").join(frozenName),
  };
}

function frozenMysteryPersonaVoiceCardsV2(args: {
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  bots: MysteryV2BotRow[];
}): Record<string, MysteryV2VoiceCard> {
  const stored = args.privateCase.personaVoiceCardsByBotId ?? {};
  const botById = new Map(args.bots.map((bot) => [bot.id, bot]));
  const speakerBotIds = [...new Set(args.graph.lines.flatMap((line) =>
    line.speakerBotId ? [line.speakerBotId] : []))];
  return Object.fromEntries(speakerBotIds.map((botId) => {
    const card = stored[botId];
    if (card?.botId === botId && card.cues.length > 0) {
      return [botId, {
        botId,
        sourceHash: card.sourceHash,
        cues: [...card.cues],
      }];
    }
    const bot = botById.get(botId);
    return [botId, bot
      ? deterministicMysteryVoiceCard(bot)
      : {
          botId,
          sourceHash: "legacy-frozen-persona-unavailable",
          cues: ["Keep this speaker's established voice distinct and controlled."],
        }];
  }));
}

/**
 * Preserves the graph's authored claims byte-for-byte while adding a short,
 * persona-selected verbal lead-in to each bot-delivered line. The model never
 * returns a rewritten claim or a graph shape; it can only select fact-free
 * cadence around the immutable canonical text.
 */
async function polishMysteryPersonaDialogueGraphV2(args: {
  runtime: DebateAiRuntime;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  bots: MysteryV2BotRow[];
}): Promise<DebateMysteryDialogueGraphV2> {
  const roomIntroductionLineIds = new Set(
    Object.values(args.graph.roomIntroductionNodeIdsByRoom ?? {}).flatMap((entry) => {
      const node = args.graph.nodes.find((candidate) => candidate.id === entry.personaNodeId);
      return node?.lineId ? [node.lineId] : [];
    }),
  );
  const eligibleLines = args.graph.lines.filter((line) =>
    Boolean(line.speakerBotId) &&
    line.mode === "spoken" &&
    line.visibleText.trim().length >= 12 &&
    line.reusableCalloutKey === null &&
    !roomIntroductionLineIds.has(line.id),
  );
  if (eligibleLines.length === 0) return args.graph;
  const voiceCardsByBotId = frozenMysteryPersonaVoiceCardsV2(args);
  const prompt = {
    section: "persona_dialogue_polish",
    speakers: Object.values(voiceCardsByBotId).map((card) => ({
      botId: card.botId,
      voiceCues: card.cues,
    })),
    lines: eligibleLines.map((line) => ({
      lineId: line.id,
      speakerBotId: line.speakerBotId,
      canonicalText: line.visibleText,
    })),
    cadenceOptions: Object.entries(MYSTERY_FORGE_PERSONA_DIALOGUE_CADENCES_V2).map(
      ([cadenceId, text]) => ({ cadenceId, text }),
    ),
    outputContract: {
      lineFrames: "one entry for every exact lineId with one cadenceId copied from cadenceOptions; no free text",
    },
  };
  const promptText = JSON.stringify(prompt);
  const lanes = args.runtime.lanes?.length
    ? args.runtime.lanes
    : [mysteryV2Lane(args.runtime)];
  try {
    const result = await prismGenerationBroker.runStructured({
      work: {
        workflow: "case_forge",
        operation: "polish_persona_dialogue",
        stage: "directing_performances",
        executionLane: "selected",
        role: "author",
        outputClass: "critical",
        priority: "compilation",
        privacyMode:
          args.runtime.preferredProvider === "local"
            ? "local"
            : args.runtime.modelSelectionKind === "auto"
              ? "auto"
              : "online",
        cacheKey: `case-forge-persona-dialogue-v2:${sha256(promptText)}`,
        sourceTokenEstimate: estimatePrismTextTokens(promptText),
        exportedTokenEstimate: estimatePrismTextTokens(promptText),
      },
      lanes,
      modelSelectionKind: args.runtime.modelSelectionKind ?? "fixed",
      // Cadence is decorative. A slow or invalid response must never prevent
      // the frozen case graph from proceeding to its reachable performances.
      maxFixedAttempts: 1,
      perAttemptTimeoutMs: () => V2_PERSONA_DIALOGUE_POLISH_TIMEOUT_MS,
      run: ({ lane, signal, work }) => lane.provider.generateResponse([
        {
          role: "system",
          content: "You are PRISM's final dialogue director. For every exact lineId, select the cadence option that best fits its frozen speaker cues. The canonical text and graph are immutable. Return JSON only. Each lineFrame must contain the unchanged lineId and one cadenceId copied exactly from cadenceOptions. Never return prose, facts, or a new cadence.",
        },
        { role: "user", content: promptText },
      ], {
        model: lane.model,
        reasoningEffort: lane.reasoningEffort,
        turbo: lane.turbo,
        maxTokens: Math.min(6_000, Math.max(1_500, eligibleLines.length * 40)),
        temperature: 0.45,
        jsonMode: true,
        usagePurpose: "debate_generation",
        allowFinalLocalFallback: lane.providerName === "local",
        generationWork: work,
        signal,
      }),
      validate: (raw) => {
        const parsed = parseJsonObject(raw);
        const frames = Array.isArray(parsed.lineFrames) ? parsed.lineFrames : [];
        const leadInByLineId = new Map<string, string>();
        for (const value of frames) {
          if (!value || typeof value !== "object") {
            throw new Error("Persona dialogue polish returned an invalid line frame.");
          }
          const row = value as Record<string, unknown>;
          const lineId = compact(row.lineId, 180);
          if (!lineId || leadInByLineId.has(lineId)) {
            throw new Error("Persona dialogue polish changed or repeated a line ID.");
          }
          leadInByLineId.set(
            lineId,
            mysteryForgePersonaDialogueCadenceV2(row.cadenceId),
          );
        }
        if (
          leadInByLineId.size !== eligibleLines.length ||
          eligibleLines.some((line) => !leadInByLineId.has(line.id))
        ) {
          throw new Error("Persona dialogue polish did not preserve the complete frozen line set.");
        }
        return {
          ...args.graph,
          lines: args.graph.lines.map((line) => {
            const leadIn = leadInByLineId.get(line.id);
            if (!leadIn) return line;
            return {
              ...line,
              visibleText: `${leadIn} ${line.visibleText}`,
              spokenText: `${leadIn} ${line.spokenText}`,
            };
          }),
        };
      },
    });
    return result.value;
  } catch {
    return args.graph;
  }
}

function buildMysteryV2Graph(args: {
  sessionId: string;
  config: DebateMysteryResolvedConfigV2;
  mansionExterior?: DebateMysterySealedAssetRefV1 | null;
  incidentPlan: MysteryBoundIncidentPlanV1;
  scaffold: ReturnType<typeof compileDeterministicDebateMystery>;
  bots: MysteryV2BotRow[];
  authored: AuthoredMysteryV2;
  eyewitnessSeatId: string | null;
  alibiSupportDiscoveryIds: string[];
  contradictionBySeat: ReadonlyMap<string, DebateMysteryRecordReferenceV2>;
  personaVoiceCardsByBotId?: Record<string, MysteryV2VoiceCard>;
  authoringRecoveryBySection?: Record<string, MysteryV2SectionRecoveryReceipt>;
}): { graph: DebateMysteryDialogueGraphV2; privateCase: PrivateMysteryCaseV2; publicState: DebateWhodunnitFormatStateV2 } {
  const compilationScope = resolveMysteryCompilationScopeV2(args.config);
  const omitInvestigation = mysteryCompilationOmitsInvestigationV2(compilationScope);
  const directToCourt = compilationScope === "court_only";
  const nodes: DebateMysteryDialogueNodeV2[] = [];
  const lines: DebateMysterySpokenLineV2[] = [];
  const interactionRoots: string[] = [];
  const talkTopicNodeIdsBySuspect: Record<string, string[]> = {};
  const roomIntroductionNodeIdsByRoom: NonNullable<
    DebateMysteryDialogueGraphV2["roomIntroductionNodeIdsByRoom"]
  > = {};
  const repeatResponseNodeIdsByTopic: Record<string, string[]> = {};
  const presentNodeIdsBySuspect: Record<string, string[]> = {};
  const presentationGates: DebateMysteryPresentationGateV2[] = [];
  const examineNodeIdByHotspot: Record<string, string> = {};
  const presentNodeIdBySuspectRecord: Record<string, string> = {};
  const defaultPresentNodeIdBySuspect: Record<string, string> = {};
  const botIdBySeat = new Map(args.scaffold.suspects.map((suspect) => [suspect.seatId, suspect.botId]));
  const botById = new Map(args.bots.map((bot) => [bot.id, bot]));
  const nameBySeat = new Map(args.scaffold.suspects.map((suspect) => [suspect.seatId, suspect.name]));
  const nameByBotId = new Map(args.bots.map((bot) => [bot.id, bot.name]));
  const authoredEvidence = new Map(args.authored.evidence.map((entry) => [entry.id, entry]));
  const authoredExaminations = new Map(args.authored.examinations.map((entry) => [entry.id, entry.text]));
  const talkSubjectRooms = args.scaffold.rooms.map((room) => ({
    id: room.id,
    name: DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === room.templateId)?.name ?? room.templateId,
  }));
  const talkSubjectPeople = [
    { id: args.scaffold.victim.id, name: args.authored.victimName },
    ...args.scaffold.suspects.map((suspect) => ({ id: suspect.seatId, name: suspect.name })),
  ];
  const talkRecordItems = args.authored.evidence.map((evidence) => ({
    reference: { kind: "evidence" as const, id: evidence.id },
    title: evidence.title,
  }));
  const casekeeperVoiceBotId = mysteryCasekeeperVoiceBotIdV2(args.config, args.bots);
  const authoredSuspects = args.authored.suspects.map((suspect) => {
    const talkTopics = suspect.talkTopics.map((topic) => ({
      ...topic,
      subject: normalizeDebateMysteryTalkSubjectV2({
        value: (topic as Partial<AuthoredTopicV2>).subject,
        label: topic.label,
        question: topic.question,
        rooms: talkSubjectRooms,
        people: talkSubjectPeople,
      }),
    })).filter((topic) => !debateMysteryTalkTopicMirrorsRecordV2({
      topicId: topic.id,
      label: topic.label,
      question: topic.question,
      subject: topic.subject,
      records: talkRecordItems,
    }));
    if (!omitInvestigation && !talkTopics.length) throw new Error(`The authored chapter for ${suspect.seatId} has no valid Talk subjects.`);
    const candidateGate = (suspect as Partial<AuthoredSuspectV2>).presentationGate;
    const presentationGate = candidateGate &&
      talkTopics.some((topic) => topic.id === candidateGate.unlockTopicId)
      ? candidateGate
      : null;
    return {
      ...suspect,
      talkTopics: omitInvestigation ? [] : talkTopics,
      presentationGate: omitInvestigation ? null : presentationGate,
    };
  });
  const admittedEvidenceIds = new Set(
    directToCourt
      ? args.authored.evidence.map((evidence) => evidence.id)
      : args.scaffold.activeRegions.flatMap((outcome) => outcome.evidenceId ? [outcome.evidenceId] : []),
  );
  const recordReferences: DebateMysteryRecordReferenceV2[] = [
    ...args.authored.evidence
      .filter((evidence) => admittedEvidenceIds.has(evidence.id))
      .map((evidence) => ({ kind: "evidence" as const, id: evidence.id })),
    ...authoredSuspects.flatMap((suspect) =>
      suspect.testimony.map((statement) => ({ kind: "testimony" as const, id: statement.id }))),
  ];
  const presentRecordTitleByKey = new Map<string, string>([
    ...args.authored.evidence
      .filter((evidence) => admittedEvidenceIds.has(evidence.id))
      .map((evidence) => [`evidence:${evidence.id}`, evidence.title] as const),
    ...authoredSuspects.flatMap((suspect) =>
      suspect.testimony.map((statement, statementIndex) => [
        `testimony:${statement.id}`,
        `${nameBySeat.get(suspect.seatId) ?? "Witness"} — sworn statement ${statementIndex + 1}`,
      ] as const)),
  ]);
  const roomIntroductionStageCueV1 = (options: {
    roomId: string;
    roomName: string;
    speakerBotId: string;
    speakerName: string;
  }): DebateMysteryStageCueV1 => {
    const roomFactId = `room:${options.roomId}`;
    const speakerFactId = `speaker:${options.speakerBotId}`;
    return {
      version: 1,
      id: `stage-cue:room-introduction:${options.roomId}`,
      objective:
        "Invite the investigator to question this character without volunteering a clue or changing the case record.",
      emotionalState: "Guarded, observant, and willing to engage without overplaying suspicion.",
      knownFactIds: [roomFactId, speakerFactId],
      allowedFacts: [
        {
          id: roomFactId,
          statement: `The conversation is taking place in ${options.roomName}.`,
          mentionFragments: [options.roomName],
          required: true,
        },
        {
          id: speakerFactId,
          statement: `The speaker is ${options.speakerName}.`,
          mentionFragments: [options.speakerName],
          required: true,
        },
      ],
      requiredBeats: [
        {
          id: "invite-inquiry",
          instruction: "Invite the investigator to look, search, investigate, or ask a question.",
          acceptedTextFragments: ["look", "search", "investigate", "ask"],
        },
        {
          id: "caution-without-clue",
          instruction: "Signal careful attention without implying a hidden fact.",
          acceptedTextFragments: ["careful", "appearances", "mislead", "deceive"],
        },
        {
          id: "epistemic-boundary",
          instruction: "Promise to speak only within what this character knows.",
          acceptedTextFragments: [
            "what i know",
            "only what i know",
            "beyond what i know",
            "cannot tell you more",
          ],
        },
      ],
      // These strings stay sealed and are checked locally after generation.
      // They are deliberately absent from the runtime provider prompt.
      forbiddenDisclosures: [
        "i killed",
        "i murdered",
        "i poisoned",
        "the culprit is",
        "the murderer is",
        "the killer is",
        ...args.scaffold.suspects.flatMap((suspect) => [
          `${suspect.name} is the culprit`,
          `${suspect.name} is the murderer`,
          `${suspect.name} is the killer`,
        ]),
      ],
      contradictionTrigger: null,
      exitCondition: "Return control after one concise invitation to investigate.",
      deterministicFallbackText:
        `I am ${options.speakerName}. Take a careful look around ${options.roomName}. ` +
        "Ask what you came to ask; I will answer only what I know.",
      maxCharacters: 420,
    };
  };
  const addLineNode = (options: {
    id: string;
    kind: DebateMysteryDialogueNodeV2["kind"];
    scene: DebateMysteryDialogueNodeV2["scene"];
    text: string;
    stageAction?: string | null;
    speakerSeatId?: string | null;
    intendedRecipientSeatId?: string | null;
    intendedRecipientBotId?: string | null;
    speakerKind?: DebateMysterySpokenLineV2["speakerKind"];
    speakerBotId?: string | null;
    label?: string | null;
    locationId?: string | null;
    talkSubject?: DebateMysteryTalkSubjectV2 | null;
    mode?: DebateMysterySpokenLineV2["mode"];
    performance?: Partial<DebateMysteryPerformanceDirectionV2>;
    stageCue?: DebateMysteryStageCueV1 | null;
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
      intendedRecipientSeatId: options.intendedRecipientSeatId ?? null,
      ...(options.intendedRecipientBotId
        ? { intendedRecipientBotId: options.intendedRecipientBotId }
        : {}),
      lineId,
      label: options.label ?? null,
      locationId: options.locationId ?? null,
      talkSubject: options.talkSubject ?? null,
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
    const resolvedPerformance = performanceDirection(
      options.performance,
      options.scene === "court" ? "controlled tension" : "watchful",
    );
    const delivery = resolveDebateMysteryLineDeliveryV2({
      value: options.text,
      explicitStageActionText: options.stageAction,
      speakerNames: options.speakerSeatId
        ? nameBySeat.get(options.speakerSeatId) ?? null
        : speakerBotId
          ? nameByBotId.get(speakerBotId) ?? null
          : null,
      stableId: lineId,
      performance: resolvedPerformance,
      materializeFallback: Boolean(
        speakerBotId &&
        (options.mode ?? "spoken") !== "text_only" &&
        (options.mode ?? "spoken") !== "anonymous_babble"
      ),
    });
    const line: DebateMysterySpokenLineV2 = {
      id: lineId,
      nodeId: node.id,
      speakerKind: options.speakerKind ?? (speakerBotId ? "bot" : "narrator"),
      speakerBotId,
      stageActionText: delivery.stageActionText,
      visibleText: delivery.spokenText,
      spokenText: delivery.spokenText,
      performance: resolvedPerformance,
      ...(options.stageCue ? { stageCue: options.stageCue } : {}),
      mode: options.mode ?? "spoken",
      reusableCalloutKey: null,
    };
    nodes.push(node);
    lines.push(line);
    if (options.root !== false) interactionRoots.push(node.id);
    return node;
  };

  const openingNode = omitInvestigation ? null : addLineNode({
    id: "briefing-opening",
    kind: "briefing",
    scene: "investigation",
    text: args.authored.publicOpening,
    speakerKind: "narrator",
    speakerBotId: casekeeperVoiceBotId,
    mode: "anonymous_babble",
    mutations: { discoverIds: ["briefing:complete"] },
    terminal: "return_to_room",
  });
  const initialDiscoveryIds = directToCourt
    ? ["court:ready"]
    : omitInvestigation
      ? []
      : ["briefing:complete"];
  const initialAdmittedRecordIds: string[] = omitInvestigation
    ? [...admittedEvidenceIds].map((id) => `evidence:${id}`)
    : [];
  const publicRecord: DebateWhodunnitFormatStateV2["record"] = directToCourt
    ? args.authored.evidence
      .filter((evidence) => admittedEvidenceIds.has(evidence.id))
      .map((evidence) => ({
        reference: { kind: "evidence" as const, id: evidence.id },
        title: evidence.title,
        description: evidence.description,
        emoji: evidence.emoji,
        admitted: true,
        updatedAt: new Date().toISOString(),
      }))
    : [];
  const openingWeaponEvidenceId = args.scaffold.evidence.find((item) => item.isCanonicalWeapon)?.id ?? null;

  if (!omitInvestigation) for (const room of args.scaffold.rooms) {
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
        mode: "text_only",
        locationId: room.id,
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

  for (const suspect of authoredSuspects) {
    const suspectRoomId = args.scaffold.suspects.find((entry) => entry.seatId === suspect.seatId)?.roomId ?? null;
    if (!omitInvestigation) {
    if (suspectRoomId) {
      const scaffoldRoom = args.scaffold.rooms.find((room) => room.id === suspectRoomId);
      const roomTemplate = scaffoldRoom
        ? DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === scaffoldRoom.templateId)
        : null;
      const suspectBot = botById.get(botIdBySeat.get(suspect.seatId) ?? "") ?? null;
      const suspectBotId = botIdBySeat.get(suspect.seatId) ?? null;
      const suspectName = nameBySeat.get(suspect.seatId) ?? null;
      const casekeeperNarration = mysteryRoomNarrationForBotV2({
        bot: suspectBot,
        fixtureLabels: roomTemplate?.regions.map((region) => region.label) ?? [],
      });
      if (!scaffoldRoom || !roomTemplate || !suspectBotId || !suspectName) {
        throw new Error(`Room introduction ${suspectRoomId} is missing its frozen performance identity.`);
      }
      const stageCue = roomIntroductionStageCueV1({
        roomId: suspectRoomId,
        roomName: roomTemplate.name,
        speakerBotId: suspectBotId,
        speakerName: suspectName,
      });
      const personaNode = addLineNode({
        id: `room-introduction-${suspectRoomId}-persona`,
        kind: "room_introduction",
        scene: "investigation",
        text: stageCue.deterministicFallbackText,
        stageAction: suspect.roomIntroductionStageAction,
        speakerSeatId: suspect.seatId,
        locationId: suspectRoomId,
        performance: suspect.roomIntroductionPerformance,
        stageCue,
        root: false,
        terminal: "return_to_room",
      });
      const casekeeperNode = addLineNode({
        id: `room-introduction-${suspectRoomId}-casekeeper`,
        kind: "room_introduction",
        scene: "investigation",
        text: casekeeperNarration,
        speakerKind: "narrator",
        mode: "text_only",
        locationId: suspectRoomId,
        next: [personaNode.id],
        terminal: "return_to_room",
      });
      roomIntroductionNodeIdsByRoom[suspectRoomId] = {
        casekeeperNodeId: casekeeperNode.id,
        personaNodeId: personaNode.id,
        suspectSeatId: suspect.seatId,
      };
    }
    const gatedTopicId = suspect.presentationGate?.unlockTopicId ?? null;
    const topicNodeIds: string[] = [];
    suspect.talkTopics.forEach((topic, index) => {
      const nodeId = `talk-${suspect.seatId}-${topic.id}`;
      const responseNodeId = `talk-response-${suspect.seatId}-${topic.id}`;
      const nextTopic = suspect.talkTopics[index + 1] ?? null;
      const nextTopicId = nextTopic && nextTopic.id !== gatedTopicId
        ? `talk-${suspect.seatId}-${nextTopic.id}`
        : null;
      addLineNode({
        id: nodeId,
        kind: "talk_topic",
        scene: "investigation",
        text: topic.question,
        stageAction: topic.questionStageAction,
        speakerKind: "player",
        speakerBotId: args.config.prosecutorBotId,
        intendedRecipientSeatId: suspect.seatId,
        label: topic.label,
        locationId: suspectRoomId,
        talkSubject: topic.subject,
        performance: topic.questionPerformance,
        requirements: index === 0 && topic.id !== gatedTopicId
          ? {}
          : { unlockedTopicIds: [nodeId] },
        next: [responseNodeId],
      });
      addLineNode({
        id: responseNodeId,
        kind: "talk_topic",
        scene: "investigation",
        text: topic.response,
        stageAction: topic.responseStageAction,
        speakerSeatId: suspect.seatId,
        intendedRecipientSeatId: null,
        intendedRecipientBotId: args.config.prosecutorBotId,
        locationId: suspectRoomId,
        performance: topic.performance,
        mutations: {
          discoverIds: [`talk:${suspect.seatId}:${topic.id}`],
          unlockTopicIds: nextTopicId ? [nextTopicId] : [],
        },
        next: nextTopicId ? [nextTopicId] : [],
        terminal: "return_to_room",
        root: false,
      });
      repeatResponseNodeIdsByTopic[nodeId] = topic.repeatResponses.map((repeat, repeatIndex) => {
        const repeatNodeId = `talk-repeat-response-${suspect.seatId}-${topic.id}-${repeatIndex + 1}`;
        addLineNode({
          id: repeatNodeId,
          kind: "talk_topic",
          scene: "investigation",
          text: repeat.response,
          stageAction: repeat.responseStageAction,
          speakerSeatId: suspect.seatId,
          intendedRecipientSeatId: null,
          intendedRecipientBotId: args.config.prosecutorBotId,
          locationId: suspectRoomId,
          performance: repeat.performance,
          terminal: "return_to_room",
          root: false,
        });
        return repeatNodeId;
      });
      topicNodeIds.push(nodeId);
    });
    talkTopicNodeIdsBySuspect[suspect.seatId] = topicNodeIds;
    const defaultResponseId = `present-response-${suspect.seatId}-default`;
    const defaultNode = addLineNode({
      id: `present-${suspect.seatId}-default`,
      kind: "present_reaction",
      scene: "investigation",
      text: suspect.defaultPresentProsecutionLine,
      stageAction: suspect.defaultPresentProsecutionStageAction,
      speakerKind: "player",
      speakerBotId: args.config.prosecutorBotId,
      intendedRecipientSeatId: suspect.seatId,
      locationId: suspectRoomId,
      next: [defaultResponseId],
      // Every public record receives its own finite exchange below. Keep this
      // legacy anchor out of the playable graph so generic copy cannot enter
      // the local pack or be selected at runtime.
      root: false,
    });
    addLineNode({
      id: defaultResponseId,
      kind: "present_reaction",
      scene: "investigation",
      text: suspect.defaultPresentReaction,
      stageAction: suspect.defaultPresentReactionStageAction,
      speakerSeatId: suspect.seatId,
      intendedRecipientBotId: args.config.prosecutorBotId,
      locationId: suspectRoomId,
      terminal: "return_to_room",
      root: false,
    });
    defaultPresentNodeIdBySuspect[suspect.seatId] = defaultNode.id;
    const presentIds = [defaultNode.id];
    const reactionByRecord = new Map(suspect.presentReactions.map((reaction) => [reaction.recordId, reaction]));
    for (const reference of recordReferences) {
      const recordId = `${reference.kind}:${reference.id}`;
      const recordTitle = presentRecordTitleByKey.get(recordId);
      if (!recordTitle) throw new Error(`The public Case File title for ${recordId} is unavailable.`);
      const reaction = reactionByRecord.get(recordId);
      const responseNodeId = `present-response-${suspect.seatId}-${reference.kind}-${reference.id}`;
      const node = addLineNode({
        id: `present-${suspect.seatId}-${reference.kind}-${reference.id}`,
        kind: "present_reaction",
        scene: "investigation",
        text: reaction
          ? presentPromptWithRecordTitleV2(reaction.prosecutionLine, recordTitle)
          : presentPromptWithRecordTitleV2(
              suspect.defaultPresentProsecutionLine,
              recordTitle,
            ),
        stageAction: reaction?.prosecutionStageAction ?? suspect.defaultPresentProsecutionStageAction,
        speakerKind: "player",
        speakerBotId: args.config.prosecutorBotId,
        intendedRecipientSeatId: suspect.seatId,
        locationId: suspectRoomId,
        requirements: { admittedRecordIds: [recordId] },
        records: [reference],
        next: [responseNodeId],
      });
      addLineNode({
        id: responseNodeId,
        kind: "present_reaction",
        scene: "investigation",
        text: reaction
          ? presentResponseWithRecordTitleV2(reaction.response, recordTitle)
          : presentResponseWithRecordTitleV2(
              suspect.defaultPresentReaction,
              recordTitle,
            ),
        stageAction: reaction?.responseStageAction ?? suspect.defaultPresentReactionStageAction,
        speakerSeatId: suspect.seatId,
        intendedRecipientBotId: args.config.prosecutorBotId,
        locationId: suspectRoomId,
        requirements: { admittedRecordIds: [recordId] },
        mutations: { discoverIds: [`present:${suspect.seatId}:${recordId}`] },
        records: [reference],
        terminal: "return_to_room",
        root: false,
      });
      presentNodeIdBySuspectRecord[`${suspect.seatId}:${recordId}`] = node.id;
      presentIds.push(node.id);
    }
    presentNodeIdsBySuspect[suspect.seatId] = presentIds;
    if (suspect.presentationGate) {
      const requiredRecordKey = mysteryRecordKey(suspect.presentationGate.requiredRecord);
      const correctPresentNodeId = presentNodeIdBySuspectRecord[`${suspect.seatId}:${requiredRecordKey}`];
      const topicNodeId = `talk-${suspect.seatId}-${suspect.presentationGate.unlockTopicId}`;
      if (!correctPresentNodeId || !topicNodeIds.includes(topicNodeId)) {
        throw new Error(`The authored presentation gate for ${suspect.seatId} is not fully materialized.`);
      }
      presentationGates.push({
        id: `present-gate-${suspect.seatId}-${suspect.presentationGate.requiredRecord.kind}-${suspect.presentationGate.requiredRecord.id}`,
        requiredRecord: suspect.presentationGate.requiredRecord,
        requiredSuspectSeatId: suspect.seatId,
        correctPresentNodeId,
        unlocks: [{ kind: "topic", topicNodeId }],
        requiredForProgression: true,
      });
    }
    }
  }

  const witnessChapters: DebateMysteryWitnessChapterV2[] = [];
  let previousPrimaryStatementId: string | null = null;
  for (const [index, suspectSnapshot] of args.scaffold.suspects.entries()) {
    const suspect = authoredSuspects.find((entry) => entry.seatId === suspectSnapshot.seatId)!;
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
        stageAction: authoredStatement.stageAction,
        speakerSeatId: suspect.seatId,
        performance: authoredStatement.performance,
        requirements: chapterRequirement,
      });
      const press = addLineNode({
        id: `press-${authoredStatement.id}`,
        kind: "press_result",
        scene: "court",
        text: authoredStatement.press,
        stageAction: authoredStatement.pressStageAction,
        speakerSeatId: suspect.seatId,
        requirements: chapterRequirement,
      });
      const rebuttal = addLineNode({
        id: `rebuttal-${authoredStatement.id}`,
        kind: "defense_reaction",
        scene: "court",
        text: authoredStatement.defenseRebuttal,
        stageAction: authoredStatement.defenseRebuttalStageAction,
        speakerBotId: args.config.rivalDefenseBotId,
        requirements: chapterRequirement,
      });
      const objection = addLineNode({
        id: `objection-${authoredStatement.id}`,
        kind: "defense_reaction",
        scene: "court",
        text: authoredStatement.defenseObjection,
        stageAction: authoredStatement.defenseObjectionStageAction,
        speakerBotId: args.config.rivalDefenseBotId,
        requirements: chapterRequirement,
      });
      const isContradiction = statementIndex === 1;
      const revision = addLineNode({
        id: `revision-${authoredStatement.id}`,
        kind: "testimony_revision",
        scene: "court",
        text: authoredStatement.revision,
        stageAction: authoredStatement.revisionStageAction,
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
        objectionNodeId: objection.id,
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
        stageAction: option.reactionStageAction,
        speakerSeatId: choice.witnessSeatId,
        intendedRecipientBotId: args.config.prosecutorBotId,
        requirements: { choices: [{ choiceId: choice.id, optionId: option.id }] },
      });
      const optionLineId = `line-choice-${choice.id}-${option.id}-option`;
      const optionPerformance = performanceDirection({}, "decisive");
      const optionDelivery = resolveDebateMysteryLineDeliveryV2({
        value: option.text,
        explicitStageActionText: option.stageAction,
        speakerNames: nameByBotId.get(args.config.prosecutorBotId) ?? null,
        stableId: optionLineId,
        performance: optionPerformance,
        materializeFallback: true,
      });
      lines.push({
        id: optionLineId,
        nodeId: response.id,
        speakerKind: "player",
        speakerBotId: args.config.prosecutorBotId,
        stageActionText: optionDelivery.stageActionText,
        visibleText: optionDelivery.spokenText,
        spokenText: optionDelivery.spokenText,
        performance: optionPerformance,
        mode: "player_selected",
        reusableCalloutKey: null,
      });
      options.push({ id: option.id, lineId: optionLineId, responseNodeId: response.id });
    }
    prosecutionChoices.push({ id: choice.id, promptLineId: prompt.lineId!, options });
  }

  const prosecutorStrategy = addLineNode({
    id: "prosecutor-strategy-default",
    kind: "prosecutor_strategy",
    scene: omitInvestigation ? "court" : "investigation",
    text: args.authored.prosecutorInternalReasoning,
    speakerKind: "player",
    speakerBotId: args.config.prosecutorBotId,
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
    roomIntroductionNodeIdsByRoom,
    talkTopicNodeIdsBySuspect,
    presentationGates,
    repeatResponseNodeIdsByTopic,
    presentNodeIdsBySuspect,
    prosecutorStrategyNodeId: prosecutorStrategy.id,
    verdictNodeIds: [guiltyNode.id, notGuiltyNode.id],
  };
  const validation = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: args.scaffold.suspects.map((suspect) => suspect.seatId),
    recordReferences,
    playerRole: args.config.playerRole,
    roomIds: omitInvestigation ? [] : args.scaffold.rooms.map((room) => room.id),
    personIds: omitInvestigation ? [] : [args.scaffold.victim.id, ...args.scaffold.suspects.map((suspect) => suspect.seatId)],
    hotspotIdsByRoom: omitInvestigation ? {} : Object.fromEntries(args.scaffold.rooms.map((room) => [
      room.id,
      args.scaffold.activeRegions
        .filter((outcome) => outcome.roomId === room.id)
        .map((outcome) => outcome.regionId),
    ])),
    prosecutorBotId: args.config.prosecutorBotId,
    rivalDefenseBotId: args.config.rivalDefenseBotId,
    eyewitnessSeatId: args.eyewitnessSeatId,
    accusedAlibiSupportDiscoveryIds: args.alibiSupportDiscoveryIds,
  });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const suspectKnowledgeBySeat = resolveMysterySuspectKnowledgeV2({
    caseSeed: args.scaffold.caseSeed,
    difficulty: args.config.difficulty,
    suspects: args.scaffold.suspects,
    culpritSeatId: args.scaffold.culpritSeatId,
    accompliceSeatId: args.scaffold.accompliceSeatId,
    eyewitnessSeatId: args.eyewitnessSeatId,
  });
  const privateCase: PrivateMysteryCaseV2 = {
    version: 2,
    config: args.config,
    incidentPlan: args.incidentPlan,
    publicCharge: mysteryPublicChargeV1(args.incidentPlan),
    sealedResponsibleSeatIds: [...args.incidentPlan.primary.responsibleSeatIds],
    sealedCulpritSeatId: args.scaffold.culpritSeatId,
    sealedAccompliceSeatId: args.scaffold.accompliceSeatId,
    motive: args.authored.motive,
    method: args.authored.method,
    victimDescription: args.authored.victimDescription,
    publicOpening: args.authored.publicOpening,
    eyewitnessSeatId: args.eyewitnessSeatId,
    eyewitnessResolution: args.authored.eyewitnessResolution,
    accusedAlibiSupportDiscoveryIds: args.alibiSupportDiscoveryIds,
    actorAccounts: authoredSuspects.map((suspect) => ({
      seatId: suspect.seatId,
      relationship: suspect.relationship,
      alibi: suspect.alibi,
      ...suspectKnowledgeBySeat[suspect.seatId]!,
    })),
    recordItems: recordReferences.map((reference) => {
      if (reference.kind === "evidence") {
        const evidence = authoredEvidence.get(reference.id)!;
        return { reference, title: evidence.title, description: evidence.description, emoji: evidence.emoji };
      }
      const statement = authoredSuspects.flatMap((suspect) => suspect.testimony).find((entry) => entry.id === reference.id)!;
      return {
        reference,
        title: presentRecordTitleByKey.get(mysteryRecordKey(reference))!,
        description: statement.text,
        emoji: "💬",
      };
    }),
    evidenceRoomIdById: Object.fromEntries(
      args.scaffold.activeRegions.flatMap((outcome) =>
        outcome.evidenceId ? [[outcome.evidenceId, outcome.roomId] as const] : []),
    ),
    examineNodeIdByHotspot,
    presentNodeIdBySuspectRecord,
    defaultPresentNodeIdBySuspect,
    prosecutorStrategyNodeId: prosecutorStrategy.id,
    crimeSceneRoomId: args.scaffold.crimeSceneRoomId,
    investigationRoomIds: omitInvestigation ? [] : args.scaffold.rooms.map((room) => room.id),
    investigationHotspotIdsByRoom: omitInvestigation ? {} : Object.fromEntries(args.scaffold.rooms.map((room) => [
      room.id,
      args.scaffold.activeRegions
        .filter((outcome) => outcome.roomId === room.id)
        .map((outcome) => outcome.regionId),
    ])),
    investigationPersonIds: omitInvestigation ? [] : [
      args.scaffold.victim.id,
      ...args.scaffold.suspects.map((suspect) => suspect.seatId),
    ],
    personaVoiceCardsByBotId: Object.fromEntries(args.bots.map((bot) => {
      const card = args.personaVoiceCardsByBotId?.[bot.id] ?? deterministicMysteryVoiceCard(bot);
      return [bot.id, {
        botId: card.botId,
        sourceHash: card.sourceHash,
        cues: [...card.cues],
      }];
    })),
    authoringRecoveryBySection: Object.fromEntries(
      Object.entries(args.authoringRecoveryBySection ?? {}).map(
        ([sectionKey, receipt]) => [sectionKey, { ...receipt }],
      ),
    ),
    audioVoiceProfilesByBotId: Object.fromEntries(args.bots.map((bot) => [
      bot.id,
      mysteryBotAudioVoiceProfileV2(bot),
    ])),
    audioPreparationMode: "lazy-on-demand-v1",
    graphValidation: validation,
    playerRoleContractVersion: 1,
    investigationProgressionContractVersion: 2,
    contradictionSemanticContractVersion: 1,
  };
  const now = new Date().toISOString();
  const publicState: DebateWhodunnitFormatStateV2 = {
    ...initialV2State(args.config, "pending", now, args.mansionExterior ?? null),
    caseTitle: args.authored.title,
    caseCharge: mysteryPublicChargeV1(args.incidentPlan),
    victim: { id: args.scaffold.victim.id, name: args.authored.victimName },
    suspects: args.scaffold.suspects.map(({ roomId: _roomId, ...suspect }) => ({ ...suspect, roomId: _roomId })),
    rooms: omitInvestigation ? [] : args.scaffold.rooms.map((room) => {
      const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === room.templateId)!;
      const activeRegionIds = new Set(
        args.scaffold.activeRegions.filter((outcome) => outcome.roomId === room.id).map((outcome) => outcome.regionId),
      );
      return {
        id: room.id,
        templateId: room.templateId,
        name: template.name,
        floor: room.floor,
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        neighborIds: [...room.neighborIds],
        emoji: template.emoji,
        imageId: room.imageId,
        bundledAssetPath: template.bundledAssetPath ?? null,
        unlocked: true,
        visited: false,
        accessState: "hidden" as const,
        hotspots: template.regions.filter((region) => activeRegionIds.has(region.id)).map((region) => ({
          id: region.id,
          label: region.label,
          polygon: region.polygon,
          examined: false,
          unlocked: true,
        })),
      };
    }),
    crimeSceneRoomId: omitInvestigation ? null : args.scaffold.crimeSceneRoomId,
    openingSweepComplete: omitInvestigation,
    roomIntroductions: omitInvestigation ? {} : Object.fromEntries(args.scaffold.rooms.map((room) => [
      room.id,
      roomIntroductionNodeIdsByRoom[room.id] ? "unseen" : "complete",
    ])),
    currentRoomId: omitInvestigation ? null : args.scaffold.crimeSceneRoomId,
    discoveryIds: initialDiscoveryIds,
    record: publicRecord,
    topics: omitInvestigation ? [] : authoredSuspects.flatMap((suspect) =>
      suspect.talkTopics.map((topic, index) => ({
        nodeId: `talk-${suspect.seatId}-${topic.id}`,
        suspectSeatId: suspect.seatId,
        label: topic.label,
        subject: topic.subject,
        unlocked: index === 0 && suspect.presentationGate?.unlockTopicId !== topic.id,
        completed: false,
      }))),
    dialogueHistory: openingNode ? [{
      nodeId: openingNode.id,
      lineId: openingNode.lineId,
      delivery: "anonymous_babble",
      stageActionText: null,
      visibleText: args.authored.publicOpening,
      speakerSeatId: null,
      speakerBotId: null,
      speakerKind: "narrator",
      occurredAt: now,
    }] : [],
    identityMirrorTargetSnapshots: Object.fromEntries(
      args.bots.map((bot) => [
        bot.id,
        mysteryIdentityMirrorTargetSnapshotV1(bot),
      ]),
    ),
    activeDialogueNodeId: openingNode?.id ?? null,
  };
  return { graph, privateCase, publicState };
}

function validateMysteryV2CheckpointGraph(
  checkpoint: MysteryV2Checkpoint,
): ReturnType<typeof validateDebateMysteryDialogueGraphV2> {
  return validateDebateMysteryDialogueGraphV2({
    graph: checkpoint.graph,
    suspectSeatIds: checkpoint.privateCase.actorAccounts.map((account) => account.seatId),
    recordReferences: checkpoint.privateCase.recordItems.map((item) => item.reference),
    playerRole: checkpoint.privateCase.config.playerRole,
    roomIds: checkpoint.privateCase.investigationRoomIds,
    personIds: checkpoint.privateCase.investigationPersonIds,
    hotspotIdsByRoom: checkpoint.privateCase.investigationHotspotIdsByRoom,
    prosecutorBotId: checkpoint.privateCase.config.prosecutorBotId,
    rivalDefenseBotId: checkpoint.privateCase.config.rivalDefenseBotId,
    eyewitnessSeatId: checkpoint.privateCase.eyewitnessSeatId,
    accusedAlibiSupportDiscoveryIds: checkpoint.privateCase.accusedAlibiSupportDiscoveryIds,
  });
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
       (session_id, user_id, case_family_id, run_ordinal,
        schema_version, private_case_json,
        dialogue_graph_json, case_hash, graph_hash, validation_json,
        created_at, updated_at)
     VALUES (?, ?, ?, 1, 2, ?, ?, ?, ?, ?, ?, ?)
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
    sessionId,
    privateJson,
    graphJson,
    sha256(privateJson),
    sha256(graphJson),
    JSON.stringify(privateCase.graphValidation),
    now,
    now,
  );
}

function mysteryV2CaseRow(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): MysteryV2CaseRow {
  const row = db.prepare(
    `SELECT session_id, user_id, case_family_id, run_ordinal, schema_version,
            private_case_json, dialogue_graph_json, case_hash, graph_hash,
            validation_json, created_at, updated_at
       FROM debate_mystery_v2_cases
      WHERE user_id = ? AND session_id = ?`,
  ).get(userId, sessionId) as MysteryV2CaseRow | undefined;
  if (!row) throw new HttpError(404, "The compiled Whodunnit V2 case is unavailable.");
  if (sha256(row.private_case_json) !== row.case_hash || sha256(row.dialogue_graph_json) !== row.graph_hash) {
    throw new HttpError(409, "The compiled Whodunnit V2 case failed its integrity check.");
  }
  return row;
}

export function getDebateMysteryCaseV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): { privateCase: PrivateMysteryCaseV2; graph: DebateMysteryDialogueGraphV2 } {
  const row = mysteryV2CaseRow(db, userId, sessionId);
  return {
    privateCase: JSON.parse(row.private_case_json) as PrivateMysteryCaseV2,
    graph: JSON.parse(row.dialogue_graph_json) as DebateMysteryDialogueGraphV2,
  };
}

interface DebateMysteryPlayerRoleMigrationV2 {
  privateCase: PrivateMysteryCaseV2;
  graph: DebateMysteryDialogueGraphV2;
  publicState: DebateWhodunnitFormatStateV2;
  changed: boolean;
}

function uniqueFrozenId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

/** Finite compatibility copy for frozen Talk graphs. It is materialized into
 * a dedicated line before local audio preparation—never prefixed at playback. */
function legacyRepeatTalkTextV2(args: {
  stableId: string;
  spokenText: string;
  performance: DebateMysteryPerformanceDirectionV2;
}): string {
  const mood = args.performance.mood.toLocaleLowerCase();
  const candidates = /guarded|nervous|uneasy|hesitant/u.test(mood)
    ? ["Like I said before, ", "I already told you, ", "I've said this once; "]
    : /defiant|angry|insistent|sharp|tense/u.test(mood)
      ? ["Still going on about that? ", "As I already said, ", "I've answered that before: "]
      : /precise|measured|thoughtful|controlled/u.test(mood)
        ? ["As I said, ", "To repeat myself, ", "My answer has not changed: "]
        : ["Like I said, ", "As I said before, ", "I've already explained it: "];
  const index = Number.parseInt(sha256(`${args.stableId}:${args.performance.mood}`).slice(0, 8), 16) % candidates.length;
  return `${candidates[index]}${args.spokenText}`;
}

function presentRecordTitleMentionedV2(text: string, title: string): boolean {
  return text.toLocaleLowerCase().includes(title.trim().toLocaleLowerCase());
}

function replaceCaseInsensitiveLiteralV2(
  value: string,
  search: string,
  replacement: string,
): string {
  const normalizedSearch = search.toLocaleLowerCase();
  if (!normalizedSearch) return value;
  let result = value;
  let cursor = 0;
  while (cursor < result.length) {
    const index = result.toLocaleLowerCase().indexOf(normalizedSearch, cursor);
    if (index < 0) break;
    result = `${result.slice(0, index)}${replacement}${result.slice(index + search.length)}`;
    cursor = index + replacement.length;
  }
  return result;
}

function repairMismatchedPresentRecordTitlesV2(args: {
  text: string;
  expectedTitle: string;
  recordTitles: readonly string[];
}): string {
  let repaired = args.text;
  for (const title of [...args.recordTitles].sort((left, right) => right.length - left.length)) {
    if (
      title.trim().toLocaleLowerCase() === args.expectedTitle.trim().toLocaleLowerCase() ||
      !presentRecordTitleMentionedV2(repaired, title)
    ) continue;
    repaired = replaceCaseInsensitiveLiteralV2(repaired, title, args.expectedTitle);
  }
  const headings = [
    `Regarding the ${args.expectedTitle}:`,
    `Regarding ${args.expectedTitle}:`,
    `Let's focus on the ${args.expectedTitle}.`,
    `Let's focus on ${args.expectedTitle}.`,
  ];
  const heading = headings.find((candidate) =>
    repaired.toLocaleLowerCase().startsWith(candidate.toLocaleLowerCase()));
  if (!heading) return repaired;
  const body = repaired.slice(heading.length).trimStart();
  return presentRecordTitleMentionedV2(body, args.expectedTitle) ? body : repaired;
}

function replaceGenericPresentReferenceV2(text: string, title: string): string {
  return text
    .replace(
      /\b(?:this|that) (?:item|piece of evidence)(?: in the Case File)?\b/giu,
      `the ${title}`,
    )
    .replace(
      /\bthe (?:item|piece of evidence)\b/giu,
      `the ${title}`,
    );
}

/**
 * Present dialogue is frozen before play, including the public Case File title.
 * An author may provide a genuinely specific reaction without restating its
 * heading; retain that authored line and add the public heading only when it
 * is needed to make the selected record unambiguous.
 */
function presentPromptWithRecordTitleV2(text: string, title: string): string {
  const contextualText = replaceGenericPresentReferenceV2(text, title);
  return presentRecordTitleMentionedV2(contextualText, title)
    ? contextualText
    : `Let's focus on the ${title}. ${contextualText}`;
}

function presentResponseWithRecordTitleV2(text: string, title: string): string {
  const contextualText = replaceGenericPresentReferenceV2(text, title);
  return presentRecordTitleMentionedV2(contextualText, title)
    ? contextualText
    : `Regarding the ${title}: ${contextualText}`;
}

function migrateDebateMysteryPlayerRoleContractV2(args: {
  privateCase: PrivateMysteryCaseV2;
  graph: DebateMysteryDialogueGraphV2;
  publicState: DebateWhodunnitFormatStateV2;
  botRows: MysteryV2BotRow[];
  repairMismatchedPresentRecordTitles: boolean;
}): DebateMysteryPlayerRoleMigrationV2 {
  const privateCase = structuredClone(args.privateCase);
  const graph = structuredClone(args.graph);
  const publicState = structuredClone(args.publicState);
  let changed = false;
  const rawPrivateConfig = privateCase.config as unknown as Record<string, unknown>;
  const rawPublicConfig = publicState.config as unknown as Record<string, unknown>;
  const prosecutorBotId = compact(
    rawPrivateConfig.prosecutorBotId ??
      rawPrivateConfig.prosecutorPartnerBotId ??
      rawPublicConfig.prosecutorBotId ??
      rawPublicConfig.prosecutorPartnerBotId,
    200,
  );
  if (!prosecutorBotId) throw new Error("The frozen V2 case has no Prosecutor role to migrate.");
  const rivalDefenseBotId = compact(rawPrivateConfig.rivalDefenseBotId, 200);
  if (!rivalDefenseBotId) throw new Error("The frozen V2 case has no Defense Counsel role.");
  if (
    rawPrivateConfig.prosecutorBotId !== prosecutorBotId ||
    "prosecutorPartnerBotId" in rawPrivateConfig ||
    rawPublicConfig.prosecutorBotId !== prosecutorBotId ||
    "prosecutorPartnerBotId" in rawPublicConfig
  ) changed = true;
  delete rawPrivateConfig.prosecutorPartnerBotId;
  delete rawPublicConfig.prosecutorPartnerBotId;
  rawPrivateConfig.prosecutorBotId = prosecutorBotId;
  rawPublicConfig.prosecutorBotId = prosecutorBotId;

  const botNameById = new Map(args.botRows.map((bot) => [bot.id, bot.name]));
  const botRowById = new Map(args.botRows.map((bot) => [bot.id, bot]));
  const casekeeperVoiceBotId = mysteryCasekeeperVoiceBotIdV2(
    privateCase.config,
    args.botRows,
  );
  const suspectBySeat = new Map(publicState.suspects.map((suspect) => [suspect.seatId, suspect]));
  const botIdBySeat = new Map(publicState.suspects.map((suspect) => [suspect.seatId, suspect.botId]));
  const subjectRooms = publicState.rooms.map((room) => ({ id: room.id, name: room.name }));
  const subjectPeople = [
    ...(publicState.victim ? [{ id: publicState.victim.id, name: publicState.victim.name }] : []),
    ...publicState.suspects.map((suspect) => ({ id: suspect.seatId, name: suspect.name })),
  ];
  const recordTitles = privateCase.recordItems.map((item) => item.title);
  const repairPresentText = (text: string, expectedTitle: string): string =>
    args.repairMismatchedPresentRecordTitles
      ? repairMismatchedPresentRecordTitlesV2({ text, expectedTitle, recordTitles })
      : text;
  const hotspotIdsByRoom = Object.fromEntries(publicState.rooms.map((room) => [
    room.id,
    room.hotspots.map((hotspot) => hotspot.id),
  ]));
  if (JSON.stringify(privateCase.investigationRoomIds) !== JSON.stringify(subjectRooms.map((room) => room.id))) changed = true;
  if (JSON.stringify(privateCase.investigationHotspotIdsByRoom) !== JSON.stringify(hotspotIdsByRoom)) changed = true;
  if (JSON.stringify(privateCase.investigationPersonIds) !== JSON.stringify(subjectPeople.map((person) => person.id))) changed = true;
  privateCase.investigationRoomIds = subjectRooms.map((room) => room.id);
  privateCase.investigationHotspotIdsByRoom = hotspotIdsByRoom;
  privateCase.investigationPersonIds = subjectPeople.map((person) => person.id);
  const usedNodeIds = new Set(graph.nodes.map((node) => node.id));
  const usedLineIds = new Set(graph.lines.map((line) => line.id));
  const movedLegacyResponseByRoot = new Map<string, string>();
  const inferredGateCandidates: Array<{
    suspectSeatId: string;
    requiredRecord: DebateMysteryRecordReferenceV2;
    unlocks: DebateMysteryPresentationUnlockTargetV2[];
    responseText: string | null;
    responseStageAction: string | null;
    responsePerformance: DebateMysteryPerformanceDirectionV2 | null;
  }> = [];
  const nodeById = (): Map<string, DebateMysteryDialogueNodeV2> =>
    new Map(graph.nodes.map((node) => [node.id, node]));
  const lineById = (): Map<string, DebateMysterySpokenLineV2> =>
    new Map(graph.lines.map((line) => [line.id, line]));
  const casekeeperOpening = graph.lines.find((line) => line.nodeId === "briefing-opening");
  if (
    casekeeperOpening &&
    (
      casekeeperOpening.mode !== "anonymous_babble" ||
      casekeeperOpening.speakerKind !== "narrator" ||
      casekeeperOpening.speakerBotId !== casekeeperVoiceBotId
    )
  ) {
    casekeeperOpening.mode = "anonymous_babble";
    casekeeperOpening.speakerKind = "narrator";
    casekeeperOpening.speakerBotId = casekeeperVoiceBotId;
    changed = true;
  }
  const aliasesFor = (line: DebateMysterySpokenLineV2): string[] => {
    const node = nodeById().get(line.nodeId);
    const seatName = node?.speakerSeatId ? suspectBySeat.get(node.speakerSeatId)?.name : null;
    const botName = line.mode !== "anonymous_babble" && line.speakerBotId
      ? botNameById.get(line.speakerBotId)
      : null;
    return [seatName, botName].filter((name): name is string => Boolean(name));
  };
  const materializeLine = (line: DebateMysterySpokenLineV2): void => {
    const delivery = resolveDebateMysteryLineDeliveryV2({
      value: line.spokenText || line.visibleText,
      explicitStageActionText: line.stageActionText,
      speakerNames: aliasesFor(line),
      stableId: line.id,
      performance: line.performance,
      materializeFallback: Boolean(
        line.speakerBotId &&
        line.mode !== "text_only" &&
        line.mode !== "anonymous_babble"
      ),
    });
    if (
      line.visibleText !== delivery.spokenText ||
      line.spokenText !== delivery.spokenText ||
      line.stageActionText !== delivery.stageActionText
    ) changed = true;
    line.visibleText = delivery.spokenText;
    line.spokenText = delivery.spokenText;
    line.stageActionText = delivery.stageActionText;
  };
  const makeLine = (args: {
    id: string;
    nodeId: string;
    text: string;
    speakerKind: DebateMysterySpokenLineV2["speakerKind"];
    speakerBotId: string;
    mood: string;
    mode?: DebateMysterySpokenLineV2["mode"];
  }): DebateMysterySpokenLineV2 => {
    const performance = performanceDirection(undefined, args.mood);
    const delivery = resolveDebateMysteryLineDeliveryV2({
      value: args.text,
      speakerNames: botNameById.get(args.speakerBotId) ?? null,
      stableId: args.id,
      performance,
      materializeFallback: true,
    });
    return {
      id: args.id,
      nodeId: args.nodeId,
      speakerKind: args.speakerKind,
      speakerBotId: args.speakerBotId,
      stageActionText: delivery.stageActionText,
      visibleText: delivery.spokenText,
      spokenText: delivery.spokenText,
      performance,
      mode: args.mode ?? "spoken",
      reusableCalloutKey: null,
    };
  };
  const makeNode = (args: {
    id: string;
    lineId: string;
    kind: DebateMysteryDialogueNodeV2["kind"];
    scene: DebateMysteryDialogueNodeV2["scene"];
    speakerSeatId?: string | null;
    intendedRecipientSeatId?: string | null;
    locationId?: string | null;
  }): DebateMysteryDialogueNodeV2 => ({
    id: args.id,
    kind: args.kind,
    scene: args.scene,
    speakerSeatId: args.speakerSeatId ?? null,
    intendedRecipientSeatId: args.intendedRecipientSeatId ?? null,
    lineId: args.lineId,
    label: null,
    locationId: args.locationId ?? null,
    talkSubject: null,
    requirements: emptyDebateMysteryRequirementsV2(),
    mutations: emptyDebateMysteryMutationsV2(),
    recordReferences: [],
    nextNodeIds: [],
    terminalOutcome: null,
  });

  const wrapLegacyResponseRoot = (rootId: string, suspectSeatId: string, text: string): void => {
    if (movedLegacyResponseByRoot.has(rootId)) return;
    const root = nodeById().get(rootId);
    const responseLine = root?.lineId ? lineById().get(root.lineId) : null;
    if (!root || !responseLine || root.speakerSeatId !== suspectSeatId) return;
    const responseNodeId = uniqueFrozenId(`${root.id}-legacy-response`, usedNodeIds);
    const responseNode: DebateMysteryDialogueNodeV2 = {
      ...structuredClone(root),
      id: responseNodeId,
      label: null,
    };
    responseLine.nodeId = responseNodeId;
    const prosecutionLineId = uniqueFrozenId(`line-${root.id}-prosecutor`, usedLineIds);
    root.speakerSeatId = null;
    root.intendedRecipientSeatId = suspectSeatId;
    root.lineId = prosecutionLineId;
    root.nextNodeIds = [responseNodeId];
    graph.nodes.push(responseNode);
    graph.lines.push(makeLine({
      id: prosecutionLineId,
      nodeId: root.id,
      text,
      speakerKind: "player",
      speakerBotId: prosecutorBotId,
      mood: "focused inquiry",
    }));
    movedLegacyResponseByRoot.set(rootId, responseNodeId);
    changed = true;
  };

  for (const [hotspotKey, examineNodeId] of Object.entries(privateCase.examineNodeIdByHotspot ?? {})) {
    const room = publicState.rooms.find((candidate) => hotspotKey.startsWith(`${candidate.id}:`));
    const node = nodeById().get(examineNodeId);
    if (node && room && node.locationId !== room.id) {
      node.locationId = room.id;
      changed = true;
    }
  }

  const retiredTalkNodeIds = new Set(graph.retiredTalkNodeIds ?? []);
  for (const [suspectSeatId, frozenTopicNodeIds] of Object.entries(graph.talkTopicNodeIdsBySuspect)) {
    const suspectRoomId = suspectBySeat.get(suspectSeatId)?.roomId ?? null;
    const activeTopicNodeIds: string[] = [];
    for (const topicNodeId of frozenTopicNodeIds) {
      const topic = nodeById().get(topicNodeId);
      if (!topic?.label) continue;
      const existingPublicTopic = publicState.topics.find((entry) => entry.nodeId === topicNodeId);
      const topicLine = topic.lineId ? lineById().get(topic.lineId) : null;
      const legacyRoomSubject =
        !topic.talkSubject &&
        /(?:^|-)room(?:-|$)/iu.test(topicNodeId) &&
        subjectRooms.some((room) => room.id === privateCase.crimeSceneRoomId)
          ? { category: "room" as const, roomId: privateCase.crimeSceneRoomId }
          : null;
      const durablePublicSubject = existingPublicTopic?.subject?.category !== "general"
        ? existingPublicTopic?.subject
        : null;
      const subject = normalizeDebateMysteryTalkSubjectV2({
        value: topic.talkSubject ?? durablePublicSubject ?? legacyRoomSubject,
        label: topic.label,
        question: topicLine?.spokenText,
        rooms: subjectRooms,
        people: subjectPeople,
      });
      if (JSON.stringify(topic.talkSubject) !== JSON.stringify(subject)) changed = true;
      topic.talkSubject = subject;
      if (topic.locationId !== suspectRoomId) {
        topic.locationId = suspectRoomId;
        changed = true;
      }
      const responseNode = topic.speakerSeatId === suspectSeatId
        ? topic
        : topic.nextNodeIds.map((nodeId) => nodeById().get(nodeId)).find((node) =>
            node?.kind === "talk_topic" && node.speakerSeatId === suspectSeatId) ?? null;
      if (responseNode && responseNode.locationId !== suspectRoomId) {
        responseNode.locationId = suspectRoomId;
        changed = true;
      }
      const responseLine = responseNode?.lineId ? lineById().get(responseNode.lineId) : null;
      const matchingRecord = debateMysteryTalkTopicMirrorsRecordV2({
        topicId: topicNodeId,
        label: topic.label,
        question: topicLine?.spokenText,
        subject,
        records: privateCase.recordItems,
      });
      if (!matchingRecord) {
        activeTopicNodeIds.push(topicNodeId);
        continue;
      }

      const retiredIds = [
        topicNodeId,
        ...(responseNode && responseNode.id !== topicNodeId ? [responseNode.id] : []),
        ...(graph.repeatResponseNodeIdsByTopic?.[topicNodeId] ?? []),
      ];
      retiredIds.forEach((nodeId) => retiredTalkNodeIds.add(nodeId));
      const unlocks: DebateMysteryPresentationUnlockTargetV2[] = [];
      for (const unlockedTopicId of responseNode?.mutations.unlockTopicIds ?? []) {
        unlocks.push({ kind: "topic", topicNodeId: unlockedTopicId });
      }
      for (const discoveryId of responseNode?.mutations.discoverIds ?? []) {
        unlocks.push({ kind: "location_discovery", discoveryId });
      }
      for (const admittedRecordId of responseNode?.mutations.admitRecordIds ?? []) {
        const item = privateCase.recordItems.find((candidate) =>
          mysteryRecordKey(candidate.reference) === admittedRecordId);
        if (item && admittedRecordId !== mysteryRecordKey(matchingRecord)) {
          unlocks.push({ kind: "record_discovery", record: item.reference });
        }
      }
      if (!unlocks.some((target) => target.kind === "topic")) {
        const nextTalkTopicId = responseNode?.nextNodeIds.find((nodeId) =>
          frozenTopicNodeIds.includes(nodeId) && nodeId !== topicNodeId);
        if (nextTalkTopicId) unlocks.push({ kind: "topic", topicNodeId: nextTalkTopicId });
      }
      const uniqueUnlocks = [...new Map(unlocks.map((target) => [JSON.stringify(target), target])).values()];
      inferredGateCandidates.push({
        suspectSeatId,
        requiredRecord: matchingRecord,
        unlocks: uniqueUnlocks,
        responseText: responseLine?.spokenText ?? null,
        responseStageAction: responseLine?.stageActionText ?? null,
        responsePerformance: responseLine?.performance ?? null,
      });
      changed = true;
    }
    graph.talkTopicNodeIdsBySuspect[suspectSeatId] = activeTopicNodeIds;
  }
  graph.retiredTalkNodeIds = [...retiredTalkNodeIds];
  if (retiredTalkNodeIds.size) {
    graph.interactionRootNodeIds = graph.interactionRootNodeIds.filter((nodeId) =>
      !retiredTalkNodeIds.has(nodeId));
    publicState.topics = publicState.topics.filter((topic) => !retiredTalkNodeIds.has(topic.nodeId));
  }

  for (const [suspectSeatId, topicNodeIds] of Object.entries(graph.talkTopicNodeIdsBySuspect)) {
    for (const topicNodeId of topicNodeIds) {
      const topic = nodeById().get(topicNodeId);
      wrapLegacyResponseRoot(
        topicNodeId,
        suspectSeatId,
        `Let's talk about ${topic?.label?.trim() || "what happened"}.`,
      );
    }
  }
  for (const [suspectSeatId, presentNodeIds] of Object.entries(graph.presentNodeIdsBySuspect)) {
    const suspectRoomId = suspectBySeat.get(suspectSeatId)?.roomId ?? null;
    for (const presentNodeId of presentNodeIds) {
      const root = nodeById().get(presentNodeId);
      const recordTitle = root?.recordReferences
        .map((reference) => privateCase.recordItems.find((item) =>
          mysteryRecordKey(item.reference) === mysteryRecordKey(reference))?.title)
        .find(Boolean);
      wrapLegacyResponseRoot(
        presentNodeId,
        suspectSeatId,
        `I want your response to ${recordTitle?.trim() || "this item in the Case File"}.`,
      );
      const migratedRoot = nodeById().get(presentNodeId);
      const migratedResponse = migratedRoot?.nextNodeIds[0]
        ? nodeById().get(migratedRoot.nextNodeIds[0]!)
        : null;
      for (const node of [migratedRoot, migratedResponse]) {
        if (node && node.locationId !== suspectRoomId) {
          node.locationId = suspectRoomId;
          changed = true;
        }
      }
    }
  }

  // Old V2 cases only compiled the proof-bearing reaction, then selected a
  // generic default for every other Case File record. Materialize every
  // suspect × public-record exchange here, before readiness and local audio
  // preparation. This is deterministic compatibility work, never authoring or
  // runtime text substitution.
  const presentNodeIdBySuspectRecord = privateCase.presentNodeIdBySuspectRecord ?? {};
  privateCase.presentNodeIdBySuspectRecord = presentNodeIdBySuspectRecord;
  const presentNodeIdsBySuspect = graph.presentNodeIdsBySuspect ?? {};
  graph.presentNodeIdsBySuspect = presentNodeIdsBySuspect;
  for (const suspect of publicState.suspects) {
    const witnessBotId = botIdBySeat.get(suspect.seatId);
    if (!witnessBotId) throw new Error(`Frozen suspect ${suspect.seatId} has no bot identity.`);
    const presentNodeIds = presentNodeIdsBySuspect[suspect.seatId] ?? [];
    const defaultPromptNodeId = privateCase.defaultPresentNodeIdBySuspect?.[suspect.seatId];
    const defaultPromptNode = defaultPromptNodeId ? nodeById().get(defaultPromptNodeId) : null;
    const defaultPromptLine = defaultPromptNode?.lineId ? lineById().get(defaultPromptNode.lineId) : null;
    const defaultResponseNode = defaultPromptNode?.nextNodeIds[0]
      ? nodeById().get(defaultPromptNode.nextNodeIds[0]!)
      : null;
    const defaultResponseLine = defaultResponseNode?.lineId ? lineById().get(defaultResponseNode.lineId) : null;
    for (const recordItem of privateCase.recordItems) {
      const recordKey = mysteryRecordKey(recordItem.reference);
      const mappingKey = `${suspect.seatId}:${recordKey}`;
      const mappedNodeId = presentNodeIdBySuspectRecord[mappingKey];
      const promptNode = mappedNodeId ? nodeById().get(mappedNodeId) : null;
      const promptLine = promptNode?.lineId ? lineById().get(promptNode.lineId) : null;
      const responseNode = promptNode?.nextNodeIds.length === 1
        ? nodeById().get(promptNode.nextNodeIds[0]!)
        : null;
      const responseLine = responseNode?.lineId ? lineById().get(responseNode.lineId) : null;
      const usable = Boolean(
        promptNode?.kind === "present_reaction" &&
        promptNode.speakerSeatId === null &&
        promptNode.intendedRecipientSeatId === suspect.seatId &&
        promptLine?.speakerKind === "player" &&
        promptNode.recordReferences.length === 1 &&
        mysteryRecordKey(promptNode.recordReferences[0]!) === recordKey &&
        responseNode?.kind === "present_reaction" &&
        responseNode.speakerSeatId === suspect.seatId &&
        responseLine?.speakerKind === "bot",
      );
      if (usable && promptNode && promptLine && responseNode && responseLine) {
        if (promptLine.speakerBotId !== prosecutorBotId) {
          promptLine.speakerBotId = prosecutorBotId;
          changed = true;
        }
        if (responseLine.speakerBotId !== witnessBotId) {
          responseLine.speakerBotId = witnessBotId;
          changed = true;
        }
        const promptText = presentPromptWithRecordTitleV2(
          repairPresentText(promptLine.spokenText, recordItem.title),
          recordItem.title,
        );
        const responseText = presentResponseWithRecordTitleV2(
          repairPresentText(responseLine.spokenText, recordItem.title),
          recordItem.title,
        );
        if (promptLine.visibleText !== promptText || promptLine.spokenText !== promptText) {
          promptLine.visibleText = promptText;
          promptLine.spokenText = promptText;
          changed = true;
        }
        if (responseLine.visibleText !== responseText || responseLine.spokenText !== responseText) {
          responseLine.visibleText = responseText;
          responseLine.spokenText = responseText;
          changed = true;
        }
        promptNode.requirements = { ...emptyDebateMysteryRequirementsV2(), admittedRecordIds: [recordKey] };
        promptNode.recordReferences = [recordItem.reference];
        promptNode.locationId = suspect.roomId;
        responseNode.requirements = { ...emptyDebateMysteryRequirementsV2(), admittedRecordIds: [recordKey] };
        responseNode.recordReferences = [recordItem.reference];
        responseNode.locationId = suspect.roomId;
        if (!presentNodeIds.includes(promptNode.id)) presentNodeIds.push(promptNode.id);
        if (presentNodeIdBySuspectRecord[mappingKey] !== promptNode.id) {
          presentNodeIdBySuspectRecord[mappingKey] = promptNode.id;
          changed = true;
        }
        continue;
      }

      const promptNodeId = uniqueFrozenId(
        `present-${suspect.seatId}-${recordItem.reference.kind}-${recordItem.reference.id}-record`,
        usedNodeIds,
      );
      const responseNodeId = uniqueFrozenId(
        `present-response-${suspect.seatId}-${recordItem.reference.kind}-${recordItem.reference.id}-record`,
        usedNodeIds,
      );
      const promptLineId = uniqueFrozenId(`line-${promptNodeId}`, usedLineIds);
      const responseLineId = uniqueFrozenId(`line-${responseNodeId}`, usedLineIds);
      graph.nodes.push({
        ...makeNode({
          id: promptNodeId,
          lineId: promptLineId,
          kind: "present_reaction",
          scene: "investigation",
          intendedRecipientSeatId: suspect.seatId,
          locationId: suspect.roomId,
        }),
        requirements: { ...emptyDebateMysteryRequirementsV2(), admittedRecordIds: [recordKey] },
        recordReferences: [recordItem.reference],
        nextNodeIds: [responseNodeId],
      });
      graph.lines.push(makeLine({
        id: promptLineId,
        nodeId: promptNodeId,
        text: presentPromptWithRecordTitleV2(
          repairPresentText(
            defaultPromptLine?.spokenText || "I want your response to this admitted record.",
            recordItem.title,
          ),
          recordItem.title,
        ),
        speakerKind: "player",
        speakerBotId: prosecutorBotId,
        mood: "focused inquiry",
      }));
      graph.nodes.push({
        ...makeNode({
          id: responseNodeId,
          lineId: responseLineId,
          kind: "present_reaction",
          scene: "investigation",
          speakerSeatId: suspect.seatId,
          locationId: suspect.roomId,
        }),
        requirements: { ...emptyDebateMysteryRequirementsV2(), admittedRecordIds: [recordKey] },
        mutations: { ...emptyDebateMysteryMutationsV2(), discoverIds: [`present:${suspect.seatId}:${recordKey}`] },
        recordReferences: [recordItem.reference],
        terminalOutcome: "return_to_room",
      });
      graph.lines.push(makeLine({
        id: responseLineId,
        nodeId: responseNodeId,
        text: presentResponseWithRecordTitleV2(
          repairPresentText(
            defaultResponseLine?.spokenText || "That record does not change the account I have given you.",
            recordItem.title,
          ),
          recordItem.title,
        ),
        speakerKind: "bot",
        speakerBotId: witnessBotId,
        mood: "guarded",
      }));
      graph.interactionRootNodeIds.push(promptNodeId);
      presentNodeIds.push(promptNodeId);
      presentNodeIdBySuspectRecord[mappingKey] = promptNodeId;
      changed = true;
    }
    presentNodeIdsBySuspect[suspect.seatId] = presentNodeIds;
  }

  const activeTalkTopicIds = new Set(Object.values(graph.talkTopicNodeIdsBySuspect).flat());
  const presentationGates = [...(graph.presentationGates ?? [])];
  for (const candidate of inferredGateCandidates) {
    const requiredRecordKey = mysteryRecordKey(candidate.requiredRecord);
    const mappingKey = `${candidate.suspectSeatId}:${requiredRecordKey}`;
    const correctPresentNodeId = presentNodeIdBySuspectRecord[mappingKey];
    if (!correctPresentNodeId) continue;
    const unlocks = candidate.unlocks.filter((target) => {
      if (target.kind === "topic") return activeTalkTopicIds.has(target.topicNodeId);
      if (target.kind === "record_discovery") {
        const key = mysteryRecordKey(target.record);
        return !graph.nodes.some((node) =>
          !retiredTalkNodeIds.has(node.id) && node.mutations.admitRecordIds.includes(key));
      }
      if (target.kind === "location_discovery") {
        return !graph.nodes.some((node) =>
          !retiredTalkNodeIds.has(node.id) && node.mutations.discoverIds.includes(target.discoveryId));
      }
      return true;
    });
    const promptNode = nodeById().get(correctPresentNodeId);
    const responseNode = promptNode?.nextNodeIds[0]
      ? nodeById().get(promptNode.nextNodeIds[0]!)
      : null;
    const responseLine = responseNode?.lineId ? lineById().get(responseNode.lineId) : null;
    const recordTitle = privateCase.recordItems.find((item) =>
      mysteryRecordKey(item.reference) === requiredRecordKey)?.title;
    if (candidate.responseText && responseLine && recordTitle) {
      const responseText = presentResponseWithRecordTitleV2(
        repairPresentText(candidate.responseText, recordTitle),
        recordTitle,
      );
      responseLine.visibleText = responseText;
      responseLine.spokenText = responseText;
      responseLine.stageActionText = candidate.responseStageAction;
      if (candidate.responsePerformance) responseLine.performance = candidate.responsePerformance;
      changed = true;
    }
    // Even an old evidence topic that unlocked no separate node still owns a
    // useful authored reaction. Move that reaction onto the exact Present
    // exchange, but create a progression gate only when there is a real public
    // target to release.
    if (!unlocks.length) continue;
    const existing = presentationGates.find((gate) =>
      gate.requiredSuspectSeatId === candidate.suspectSeatId &&
      mysteryRecordKey(gate.requiredRecord) === requiredRecordKey);
    if (existing) {
      const merged = [...new Map(
        [...existing.unlocks, ...unlocks].map((target) => [JSON.stringify(target), target]),
      ).values()];
      if (JSON.stringify(existing.unlocks) !== JSON.stringify(merged)) changed = true;
      existing.unlocks = merged;
      continue;
    }
    presentationGates.push({
      id: `present-gate-${candidate.suspectSeatId}-${candidate.requiredRecord.kind}-${candidate.requiredRecord.id}`,
      requiredRecord: candidate.requiredRecord,
      requiredSuspectSeatId: candidate.suspectSeatId,
      correctPresentNodeId,
      unlocks,
      requiredForProgression: true,
    });
    changed = true;
  }
  graph.presentationGates = presentationGates;

  // A case frozen before Present gates existed can still contain a topic that
  // requires its own ID, with no surviving dialogue mutation capable of
  // unlocking it. Keep exact inferred Present targets blocked, but make every
  // other orphaned legacy topic independently reachable instead of leaving the
  // repaired graph in a permanent self-lock.
  const presentationGatedTopicIds = new Set(presentationGates.flatMap((gate) =>
    gate.unlocks.flatMap((target) => target.kind === "topic" ? [target.topicNodeId] : [])));
  for (const topicNodeId of activeTalkTopicIds) {
    if (presentationGatedTopicIds.has(topicNodeId)) continue;
    const topic = nodeById().get(topicNodeId);
    if (
      !topic ||
      topic.requirements.unlockedTopicIds.length !== 1 ||
      topic.requirements.unlockedTopicIds[0] !== topicNodeId
    ) continue;
    const hasAuthoredUnlock = graph.nodes.some((node) =>
      !retiredTalkNodeIds.has(node.id) && node.mutations.unlockTopicIds.includes(topicNodeId));
    if (hasAuthoredUnlock) continue;
    topic.requirements.unlockedTopicIds = [];
    changed = true;
  }

  const repeatResponseNodeIdsByTopic: Record<string, string[]> = {
    ...(graph.repeatResponseNodeIdsByTopic ?? {}),
  };
  for (const [suspectSeatId, topicNodeIds] of Object.entries(graph.talkTopicNodeIdsBySuspect)) {
    for (const topicNodeId of topicNodeIds) {
      const existing = (repeatResponseNodeIdsByTopic[topicNodeId] ?? []).filter((nodeId) => {
        const node = nodeById().get(nodeId);
        const line = node?.lineId ? lineById().get(node.lineId) : null;
        return node?.kind === "talk_topic" && node.speakerSeatId === suspectSeatId && line?.speakerKind === "bot";
      });
      if (existing.length) {
        if (existing.length !== (repeatResponseNodeIdsByTopic[topicNodeId] ?? []).length) changed = true;
        repeatResponseNodeIdsByTopic[topicNodeId] = existing;
        continue;
      }
      const exchange = resolveDebateMysteryTalkExchangeV2(graph, topicNodeId, suspectSeatId);
      const responseNode = exchange ? nodeById().get(exchange.responseNodeId) : null;
      const responseLine = responseNode?.lineId ? lineById().get(responseNode.lineId) : null;
      if (!responseNode || !responseLine) continue;
      const nodeId = uniqueFrozenId(`${responseNode.id}-repeat`, usedNodeIds);
      const lineId = uniqueFrozenId(`line-${nodeId}`, usedLineIds);
      const repeatLine = {
        ...structuredClone(responseLine),
        id: lineId,
        nodeId,
        visibleText: legacyRepeatTalkTextV2({
          stableId: topicNodeId,
          spokenText: responseLine.spokenText,
          performance: responseLine.performance,
        }),
      };
      repeatLine.spokenText = repeatLine.visibleText;
      graph.nodes.push({
        ...structuredClone(responseNode),
        id: nodeId,
        lineId,
        label: null,
        requirements: emptyDebateMysteryRequirementsV2(),
        mutations: emptyDebateMysteryMutationsV2(),
        recordReferences: [],
        nextNodeIds: [],
        terminalOutcome: "return_to_room",
      });
      graph.lines.push(repeatLine);
      repeatResponseNodeIdsByTopic[topicNodeId] = [nodeId];
      changed = true;
    }
  }
  graph.repeatResponseNodeIdsByTopic = repeatResponseNodeIdsByTopic;

  for (const line of graph.lines) {
    if (line.speakerKind === "player" && line.speakerBotId !== prosecutorBotId) {
      line.speakerBotId = prosecutorBotId;
      changed = true;
    }
  }

  const legacyStrategyNodeId = privateCase.prosecutorStrategyNodeId || privateCase.partnerConsultNodeId;
  let strategyNode = legacyStrategyNodeId ? nodeById().get(legacyStrategyNodeId) : null;
  if (!strategyNode) {
    const nodeId = uniqueFrozenId("prosecutor-strategy-migrated", usedNodeIds);
    const lineId = uniqueFrozenId(`line-${nodeId}`, usedLineIds);
    strategyNode = makeNode({ id: nodeId, lineId, kind: "prosecutor_strategy", scene: "investigation" });
    graph.nodes.push(strategyNode);
    graph.lines.push(makeLine({
      id: lineId,
      nodeId,
      text: "Review the established facts, separate inference from proof, and choose the next move deliberately.",
      speakerKind: "player",
      speakerBotId: prosecutorBotId,
      mood: "private concentration",
    }));
    graph.interactionRootNodeIds.push(nodeId);
    changed = true;
  } else {
    if (strategyNode.kind !== "prosecutor_strategy") changed = true;
    strategyNode.kind = "prosecutor_strategy";
    strategyNode.speakerSeatId = null;
    const strategyLine = strategyNode.lineId ? lineById().get(strategyNode.lineId) : null;
    if (strategyLine && (strategyLine.speakerKind !== "player" || strategyLine.speakerBotId !== prosecutorBotId)) {
      strategyLine.speakerKind = "player";
      strategyLine.speakerBotId = prosecutorBotId;
      changed = true;
    }
  }
  privateCase.prosecutorStrategyNodeId = strategyNode.id;
  graph.prosecutorStrategyNodeId = strategyNode.id;
  if (privateCase.partnerConsultNodeId) changed = true;
  delete privateCase.partnerConsultNodeId;

  for (const chapter of graph.witnessChapters) {
    for (const statement of chapter.statementVersions) {
      const rebuttal = nodeById().get(statement.rebuttalNodeId);
      const rebuttalLine = rebuttal?.lineId ? lineById().get(rebuttal.lineId) : null;
      if (rebuttal) {
        if (rebuttal.kind !== "defense_reaction" || rebuttal.speakerSeatId !== null) changed = true;
        rebuttal.kind = "defense_reaction";
        rebuttal.speakerSeatId = null;
      }
      if (rebuttalLine && (rebuttalLine.speakerBotId !== rivalDefenseBotId || rebuttalLine.speakerKind !== "bot")) {
        rebuttalLine.speakerBotId = rivalDefenseBotId;
        rebuttalLine.speakerKind = "bot";
        changed = true;
      }
      let objection = statement.objectionNodeId ? nodeById().get(statement.objectionNodeId) : null;
      if (!objection) {
        const nodeId = uniqueFrozenId(`defense-objection-${statement.id}`, usedNodeIds);
        const lineId = uniqueFrozenId(`line-${nodeId}`, usedLineIds);
        objection = makeNode({ id: nodeId, lineId, kind: "defense_reaction", scene: "court" });
        graph.nodes.push(objection);
        graph.lines.push(makeLine({
          id: lineId,
          nodeId,
          text: "Objection. The prosecution must connect that record to this exact statement.",
          speakerKind: "bot",
          speakerBotId: rivalDefenseBotId,
          mood: "controlled challenge",
        }));
        graph.interactionRootNodeIds.push(nodeId);
        statement.objectionNodeId = nodeId;
        changed = true;
      }
    }
  }

  const existingTopicById = new Map(publicState.topics.map((topic) => [topic.nodeId, topic]));
  const gatedTopicIds = new Set((graph.presentationGates ?? []).flatMap((gate) =>
    gate.unlocks.flatMap((target) => target.kind === "topic" ? [target.topicNodeId] : [])));
  const normalizedPublicTopics = Object.entries(graph.talkTopicNodeIdsBySuspect).flatMap(
    ([suspectSeatId, topicNodeIds]) => topicNodeIds.flatMap((topicNodeId) => {
      const node = nodeById().get(topicNodeId);
      if (!node?.label) return [];
      const existing = existingTopicById.get(topicNodeId);
      const subject = normalizeDebateMysteryTalkSubjectV2({
        value: node.talkSubject ?? existing?.subject,
        label: node.label,
        rooms: subjectRooms,
        people: subjectPeople,
      });
      node.talkSubject = subject;
      const initiallyEligible =
        !gatedTopicIds.has(topicNodeId) &&
        node.requirements.unlockedTopicIds.length === 0 &&
        node.requirements.discoveryIds.every((id) => publicState.discoveryIds.includes(id)) &&
        node.requirements.admittedRecordIds.every((id) =>
          publicState.record.some((item) => item.admitted && mysteryRecordKey(item.reference) === id));
      return [{
        nodeId: topicNodeId,
        suspectSeatId,
        label: node.label,
        subject,
        unlocked: existing?.unlocked === true || existing?.completed === true || initiallyEligible,
        completed: existing?.completed === true,
      }];
    }),
  );
  if (JSON.stringify(publicState.topics) !== JSON.stringify(normalizedPublicTopics)) changed = true;
  publicState.topics = normalizedPublicTopics;

  // Active cases compiled before room introductions gain a finite local reveal
  // without asking an authoring model to recreate their case. Visited rooms are
  // intentionally marked complete so an in-progress investigation never loses
  // access; unvisited suspect rooms receive the deterministic compatibility
  // reveal and its prepared local voice on the next readiness pass.
  const roomIntroductions = graph.roomIntroductionNodeIdsByRoom ?? {};
  const compatibilityAddedRoomIntroductionIds = new Set<string>();
  for (const suspect of publicState.suspects) {
    const roomId = suspect.roomId;
    if (!roomId || roomIntroductions[roomId]) continue;
    const speakerBotId = botIdBySeat.get(suspect.seatId);
    if (!speakerBotId) throw new Error(`Frozen suspect ${suspect.seatId} has no bot identity.`);
    const personaNodeId = uniqueFrozenId(`room-introduction-${roomId}-persona`, usedNodeIds);
    const casekeeperNodeId = uniqueFrozenId(`room-introduction-${roomId}-casekeeper`, usedNodeIds);
    const personaLineId = uniqueFrozenId(`line-${personaNodeId}`, usedLineIds);
    const casekeeperLineId = uniqueFrozenId(`line-${casekeeperNodeId}`, usedLineIds);
    const relationship = privateCase.actorAccounts.find((account) => account.seatId === suspect.seatId)?.relationship;
    graph.nodes.push({
      ...makeNode({
        id: personaNodeId,
        lineId: personaLineId,
        kind: "room_introduction",
        scene: "investigation",
        speakerSeatId: suspect.seatId,
        locationId: roomId,
      }),
      terminalOutcome: "return_to_room",
    });
    graph.lines.push(makeLine({
      id: personaLineId,
      nodeId: personaNodeId,
      text: `${suspect.name} studies you for a moment. "I knew the victim as ${relationship || "an acquaintance"}. Ask what you came to ask; I will give you the time I had."`,
      speakerKind: "bot",
      speakerBotId,
      mood: "guarded arrival",
    }));
    graph.nodes.push({
      ...makeNode({
        id: casekeeperNodeId,
        lineId: casekeeperLineId,
        kind: "room_introduction",
        scene: "investigation",
        locationId: roomId,
      }),
      nextNodeIds: [personaNodeId],
      terminalOutcome: "return_to_room",
    });
    graph.lines.push({
      id: casekeeperLineId,
      nodeId: casekeeperNodeId,
      speakerKind: "narrator",
      speakerBotId: null,
      stageActionText: null,
      visibleText: "...",
      spokenText: "...",
      performance: performanceDirection(undefined, "silent observation"),
      mode: "text_only",
      reusableCalloutKey: null,
    });
    graph.interactionRootNodeIds.push(casekeeperNodeId);
    roomIntroductions[roomId] = { casekeeperNodeId, personaNodeId, suspectSeatId: suspect.seatId };
    compatibilityAddedRoomIntroductionIds.add(roomId);
    changed = true;
  }
  graph.roomIntroductionNodeIdsByRoom = roomIntroductions;
  for (const [roomId, introduction] of Object.entries(roomIntroductions)) {
    const casekeeperNode = nodeById().get(introduction.casekeeperNodeId);
    const casekeeperLine = casekeeperNode?.lineId
      ? lineById().get(casekeeperNode.lineId)
      : null;
    const suspectBotId = botIdBySeat.get(introduction.suspectSeatId) ?? null;
    const suspectBot = suspectBotId ? botRowById.get(suspectBotId) : null;
    const visibleText = casekeeperLine?.visibleText.trim() ?? "";
    const legacyNamedCard = Boolean(
      casekeeperLine && (
        /\b(?:color and sigil|own account comes next|room occupant)\b/iu.test(visibleText) ||
        debateMysteryRoomNarrationNamesPersonaV2(visibleText, suspectBot?.name)
      ),
    );
    if (
      !casekeeperLine ||
      !(
        (visibleText === "..." && casekeeperLine.spokenText.trim() === "...") ||
        legacyNamedCard
      )
    ) continue;
    const room = publicState.rooms.find((candidate) => candidate.id === roomId);
    const narration = mysteryRoomNarrationForBotV2({
      bot: suspectBot,
      fixtureLabels: room?.hotspots.map((hotspot) => hotspot.label) ?? [],
    });
    casekeeperLine.visibleText = narration;
    casekeeperLine.spokenText = narration;
    casekeeperLine.stageActionText = null;
    casekeeperLine.mode = "text_only";
    changed = true;
  }
  const normalizedRoomIntroductionState = Object.fromEntries(publicState.rooms.map((room) => {
    const phase = publicState.roomIntroductions?.[room.id];
    const newlyMigratedUnvisitedRoom = compatibilityAddedRoomIntroductionIds.has(room.id) && !room.visited;
    return [room.id, newlyMigratedUnvisitedRoom
      ? "unseen"
      : phase === "unseen" || phase === "casekeeper" || phase === "persona" || phase === "complete"
      ? phase
      : roomIntroductions[room.id] && !room.visited ? "unseen" : "complete"];
  }));
  if (JSON.stringify(publicState.roomIntroductions) !== JSON.stringify(normalizedRoomIntroductionState)) changed = true;
  publicState.roomIntroductions = normalizedRoomIntroductionState;

  for (const line of graph.lines) materializeLine(line);
  const validation = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: privateCase.actorAccounts.map((account) => account.seatId),
    recordReferences: privateCase.recordItems.map((item) => item.reference),
    playerRole: privateCase.config.playerRole,
    roomIds: privateCase.investigationRoomIds,
    personIds: privateCase.investigationPersonIds,
    hotspotIdsByRoom: privateCase.investigationHotspotIdsByRoom,
    prosecutorBotId,
    rivalDefenseBotId,
    eyewitnessSeatId: privateCase.eyewitnessSeatId,
    accusedAlibiSupportDiscoveryIds: privateCase.accusedAlibiSupportDiscoveryIds,
  });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  privateCase.graphValidation = validation;
  if (privateCase.playerRoleContractVersion !== 1) changed = true;
  privateCase.playerRoleContractVersion = 1;
  if (privateCase.investigationProgressionContractVersion !== 2) changed = true;
  privateCase.investigationProgressionContractVersion = 2;

  const migratedLineById = lineById();
  const migratedNodeById = nodeById();
  publicState.dialogueHistory = publicState.dialogueHistory.map((entry) => {
    const line = entry.lineId ? migratedLineById.get(entry.lineId) : null;
    const node = line ? migratedNodeById.get(line.nodeId) : null;
    return line && node
      ? {
          ...entry,
          nodeId: node.id,
          delivery: publicMysteryLineDeliveryV2(line, node.kind),
          visibleText: line.visibleText,
          stageActionText: line.stageActionText,
          speakerSeatId: node.speakerSeatId,
          speakerBotId: publicMysteryLineSpeakerBotIdV2(line),
          speakerKind: line.speakerKind,
        }
      : entry;
  });
  if (publicState.activeDialogueNodeId && movedLegacyResponseByRoot.has(publicState.activeDialogueNodeId)) {
    const last = publicState.dialogueHistory.at(-1);
    if (last) publicState.activeDialogueNodeId = last.nodeId;
  }
  if (publicState.court) {
    publicState.court.defendantSeatId ??= publicState.theory?.culpritSeatId ?? null;
    publicState.court.statements = publicState.court.statements.map((statement) => {
      const line = migratedLineById.get(statement.lineId);
      return line
        ? { ...statement, visibleText: line.visibleText, stageActionText: line.stageActionText }
        : statement;
    });
  }
  return { privateCase, graph, publicState, changed };
}

function mysteryBotAudioVoiceProfileV2(
  bot: Pick<MysteryV2BotRow, "authored_audio_voice_profile" | "audio_voice_profile_override">,
): BotAudioVoiceProfileV1 {
  return normalizeBotAudioVoiceProfileV1(
    parseStoredBotAudioVoiceProfileV1(
      bot.audio_voice_profile_override ?? bot.authored_audio_voice_profile,
    ) ?? DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  );
}

function frozenSessionAudioVoiceProfilesV2(
  session: DebateSessionV1 | undefined,
  speakerBotId: string | null,
): BotAudioVoiceProfileV1[] {
  if (!session || !speakerBotId) return [];
  return [
    session.moderator,
    session.forAdvocate,
    session.againstAdvocate,
    ...session.jury.jurors,
  ].flatMap((snapshot) =>
    snapshot.id === speakerBotId && snapshot.voiceProfile
      ? [normalizeBotAudioVoiceProfileV1(snapshot.voiceProfile)]
      : []);
}

/**
 * Resolves an actual synthesis profile without allowing a mutable Library
 * edit to alter a frozen performance pack. When a manifest hash exists, every
 * recoverable candidate must match it byte-for-byte; otherwise synthesis is
 * unavailable and callers retain the canonical archived clip.
 */
function frozenAudioProfileForLineV2(args: {
  line: DebateMysterySpokenLineV2;
  privateCase: PrivateMysteryCaseV2;
  botById: ReadonlyMap<string, MysteryV2BotRow>;
  prismVoiceProfile: BotAudioVoiceProfileV1;
  frozenVoiceProfileHash?: string | null;
  session?: DebateSessionV1;
  allowFrozenSnapshotRepair?: boolean;
}): BotAudioVoiceProfileV1 {
  const expectedHash = args.frozenVoiceProfileHash ?? null;
  const frozenPrivateProfile = args.line.speakerBotId
    ? args.privateCase.audioVoiceProfilesByBotId?.[args.line.speakerBotId]
    : null;
  if (frozenPrivateProfile) {
    const profile = normalizeBotAudioVoiceProfileV1(frozenPrivateProfile);
    if (
      expectedHash &&
      sha256(JSON.stringify(profile)) !== expectedHash &&
      !args.allowFrozenSnapshotRepair
    ) {
      throw new Error(`Frozen voice profile for ${args.line.id} no longer matches its verified audio.`);
    }
    return profile;
  }

  const sessionProfiles = frozenSessionAudioVoiceProfilesV2(
    args.session,
    args.line.speakerBotId,
  );
  if (sessionProfiles.length > 0) {
    const profile = sessionProfiles[0]!;
    if (expectedHash && sha256(JSON.stringify(profile)) !== expectedHash) {
      throw new Error(`Frozen session voice for ${args.line.id} no longer matches its verified audio.`);
    }
    return profile;
  }

  const liveBot = args.line.speakerBotId
    ? args.botById.get(args.line.speakerBotId)
    : null;
  const profile = liveBot
    ? mysteryBotAudioVoiceProfileV2(liveBot)
    : args.prismVoiceProfile;
  if (args.line.speakerKind === "player" && args.line.speakerBotId && !liveBot) {
    throw new Error(`Prosecution line ${args.line.id} is missing its selected Prosecutor bot.`);
  }
  if (args.line.speakerBotId && !liveBot) {
    throw new Error(`Frozen speaker ${args.line.speakerBotId} is unavailable for local audio.`);
  }
  if (expectedHash && sha256(JSON.stringify(profile)) !== expectedHash) {
    throw new Error(`Current voice profile for ${args.line.id} does not match its frozen performance.`);
  }
  return profile;
}

function prismVoiceProfileForMysteryV2(
  db: DatabaseSync,
  userId: string,
): BotAudioVoiceProfileV1 {
  const row = db.prepare(
    "SELECT prism_default_bot_audio_voice_profile AS profile FROM users WHERE id = ?",
  ).get(userId) as { profile?: string | null } | undefined;
  return normalizeBotAudioVoiceProfileV1(
    parseStoredBotAudioVoiceProfileV1(row?.profile ?? null) ?? DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
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

function reusableAudioCacheKeyV2(
  db: DatabaseSync,
  userId: string,
  entry: DebateMysteryAudioManifestEntryV1,
): string | null {
  const row = db.prepare(
    `SELECT cache_key
       FROM debate_mystery_audio_cache
      WHERE user_id = ? AND clip_path = ? AND mime_type = ?
        AND sha256 = ? AND byte_size = ? AND duration_ms = ?`,
  ).get(
    userId,
    entry.clipPath,
    entry.mimeType,
    entry.sha256,
    entry.byteSize,
    entry.durationMs,
  ) as { cache_key: string } | undefined;
  return row?.cache_key ?? null;
}

function attachAudioReferenceRows(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  lineId: string,
  cacheKey: string,
): void {
  const now = new Date().toISOString();
  const current = db.prepare(
    `SELECT cache_key
       FROM debate_mystery_audio_refs
      WHERE session_id = ? AND user_id = ? AND line_id = ?`,
  ).get(sessionId, userId, lineId) as { cache_key: string } | undefined;
  if (current?.cache_key !== cacheKey) {
    if (current) {
      db.prepare(
        `DELETE FROM debate_mystery_audio_refs
          WHERE session_id = ? AND user_id = ? AND line_id = ?`,
      ).run(sessionId, userId, lineId);
    }
    db.prepare(
      `INSERT INTO debate_mystery_audio_refs
         (session_id, user_id, line_id, cache_key, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, userId, lineId, cacheKey, now);
    const updated = db.prepare(
      `UPDATE debate_mystery_audio_cache
          SET ref_count = ref_count + 1, last_used_at = ?
        WHERE cache_key = ? AND user_id = ?`,
    ).run(now, cacheKey, userId);
    if (Number(updated.changes) !== 1) {
      throw new Error("The prepared Whodunnit audio clip is unavailable.");
    }
  } else {
    db.prepare(
      `UPDATE debate_mystery_audio_cache
          SET last_used_at = ?
        WHERE cache_key = ? AND user_id = ?`,
    ).run(now, cacheKey, userId);
  }
}

function attachAudioReference(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  lineId: string,
  cacheKey: string,
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    attachAudioReferenceRows(db, userId, sessionId, lineId, cacheKey);
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

function loadCompleteAudioManifestV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysteryAudioManifestV1 | null {
  const row = db.prepare(
    `SELECT status, manifest_json
       FROM debate_mystery_audio_manifests
      WHERE user_id = ? AND session_id = ?`,
  ).get(userId, sessionId) as {
    status: "preparing" | "complete" | "failed" | "silent";
    manifest_json: string;
  } | undefined;
  if (row?.status !== "complete") return null;
  try {
    const manifest = JSON.parse(row.manifest_json) as DebateMysteryAudioManifestV1;
    return manifest.complete ? manifest : null;
  } catch {
    return null;
  }
}

function verifiedFrozenAudioEntryForLineV2(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  line: DebateMysterySpokenLineV2;
  privateCase: PrivateMysteryCaseV2;
  manifest: DebateMysteryAudioManifestV1;
}): DebateMysteryAudioManifestEntryV1 | null {
  const entry = args.manifest.entries.find((candidate) =>
    candidate.lineId === args.line.id);
  if (
    !entry ||
    !audioFileValid(entry) ||
    entry.botId !== args.line.speakerBotId ||
    entry.textHash !== sha256(args.line.spokenText) ||
    (entry.synthesisTextHash ?? entry.textHash) !==
      sha256(mysteryLineSynthesisTextV2(args.line, args.privateCase)) ||
    (entry.voiceTreatment ?? "english") !== mysteryLineVoiceTreatmentV2(args.line) ||
    entry.performanceDirectionHash !== sha256(JSON.stringify(args.line.performance))
  ) return null;

  const reference = args.db.prepare(
    `SELECT reference.cache_key, cache.clip_path, cache.mime_type,
            cache.sha256, cache.byte_size, cache.duration_ms
       FROM debate_mystery_audio_refs AS reference
       JOIN debate_mystery_audio_cache AS cache
         ON cache.user_id = reference.user_id
        AND cache.cache_key = reference.cache_key
      WHERE reference.user_id = ? AND reference.session_id = ?
        AND reference.line_id = ?`,
  ).get(args.userId, args.sessionId, args.line.id) as {
    cache_key: string;
    clip_path: string;
    mime_type: string;
    sha256: string;
    byte_size: number;
    duration_ms: number;
  } | undefined;
  if (
    !reference ||
    reference.clip_path !== entry.clipPath ||
    reference.mime_type !== entry.mimeType ||
    reference.sha256 !== entry.sha256 ||
    reference.byte_size !== entry.byteSize ||
    reference.duration_ms !== entry.durationMs
  ) return null;
  return entry;
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

export interface DebateMysteryPlayAgainResultV2 {
  session: DebateSessionV1;
  reusedExistingOpenRun: boolean;
}

interface MysteryV2ReplayAudioReferenceRow {
  line_id: string;
  cache_key: string;
  clip_path: string;
  mime_type: string;
  sha256: string;
  byte_size: number;
  duration_ms: number;
}

function mysteryV2ReplayAudioUnavailable(): HttpError {
  return new HttpError(
    409,
    "The saved voice pack is unavailable. Play this case again without voices instead.",
    "MYSTERY_REPLAY_AUDIO_UNAVAILABLE",
  );
}

function resetMysteryV2JuryForReplay(
  jury: DebateSessionV1["jury"],
): DebateSessionV1["jury"] {
  return {
    ...structuredClone(jury),
    phase: jury.enabled ? "waiting" : "disabled",
    preparedFinalBallots: [],
    finalBallots: [],
    moderatorBallot: null,
    discussionTurnCount: 0,
    speakerCounts: {},
    majoritySideId: null,
    forVotes: 0,
    againstVotes: 0,
    calledVoteAt: null,
    completedAt: null,
  };
}

function initialMysteryV2ReplayState(args: {
  checkpoint: MysteryV2Checkpoint;
  sourceState: DebateWhodunnitFormatStateV2;
  jobId: string;
  now: string;
  voicesEnabled: boolean;
  preparedAudioCount: number;
}): DebateWhodunnitFormatStateV2 {
  const sourceRecord = new Map(
    args.sourceState.record.map((item) => [
      `${item.reference.kind}:${item.reference.id}`,
      item,
    ]),
  );
  const sourceRooms = new Map(args.sourceState.rooms.map((room) => [room.id, room]));
  const state = structuredClone(args.checkpoint.publicState);
  state.record = state.record.map((item) => {
    const current = sourceRecord.get(`${item.reference.kind}:${item.reference.id}`);
    return current
      ? {
          ...item,
          imageId: current.imageId ?? null,
          visualKind: current.imageId ? current.visualKind ?? "synthesized" : "emoji",
          sealedAsset: current.sealedAsset
            ? { ...current.sealedAsset, revealed: false }
            : item.sealedAsset
              ? { ...item.sealedAsset, revealed: false }
              : null,
        }
      : item;
  });
  state.rooms = state.rooms.map((room) => {
    const current = sourceRooms.get(room.id);
    const sealedAsset = current?.sealedAsset
      ? { ...current.sealedAsset, revealed: false }
      : room.sealedAsset
        ? { ...room.sealedAsset, revealed: false }
        : null;
    return current
      ? {
          ...room,
          imageId: current.imageId ?? null,
          bundledAssetPath: current.bundledAssetPath ?? null,
          sealedAsset,
          accessState: sealedAsset?.status === "pending"
            ? "being_secured"
            : sealedAsset?.status === "ready" || sealedAsset?.status === "fallback"
              ? "ready_to_enter"
              : "hidden",
        }
      : {
          ...room,
          accessState: room.sealedAsset?.status === "pending"
            ? "being_secured"
            : room.sealedAsset?.status === "ready" || room.sealedAsset?.status === "fallback"
              ? "ready_to_enter"
              : "hidden",
        };
  });
  state.dialogueHistory = state.dialogueHistory.map((entry) => ({
    ...entry,
    occurredAt: args.now,
  }));
  state.playPhase = "title_card";
  state.crimeSceneRoomId =
    state.crimeSceneRoomId ?? state.currentRoomId ?? state.rooms[0]?.id ?? null;
  state.openingSweepComplete = state.config.investigationMode === "court_only";
  state.compilation = {
    ...args.sourceState.compilation,
    jobId: args.jobId,
    stage: "complete",
    attempt: 0,
    completedPasses: V2_TOTAL_PASSES,
    totalPasses: V2_TOTAL_PASSES,
    preparedAudioCount: args.preparedAudioCount,
    requiredAudioCount: args.preparedAudioCount,
    retryable: false,
    publicFailureCode: null,
    publicFailureStage: null,
    spoilerSafeMessage: args.voicesEnabled
      ? "Your case is ready"
      : "Your text case is ready",
    startedAt: args.now,
    elapsedMs: 0,
    approximateRemainingMs: null,
    etaBasisPasses: 0,
    updatedAt: args.now,
  };
  state.readiness = {
    ...args.sourceState.readiness,
    status: "ready",
    spoilerSafeMessage: args.voicesEnabled
      ? "The frozen local case pack is ready"
      : "The frozen text case is ready",
    checkedAt: args.now,
  };
  state.audioReady = args.voicesEnabled;
  state.voicesEnabled = args.voicesEnabled;
  state.localAudioFailure = null;
  state.theory = null;
  state.theoryFiledAt = null;
  state.court = null;
  state.verdict = null;
  state.calloutHistory = [];
  state.pendingCallout = null;
  state.pendingProsecutionChoice = null;
  return state;
}

/**
 * Creates a new immutable playthrough entirely from a completed compiled pack.
 * This function intentionally has no runtime/provider parameter: replay can
 * only copy durable JSON and attach existing content-addressed audio bytes.
 */
export function playDebateMysteryV2Again(
  db: DatabaseSync,
  userId: string,
  completedSessionId: string,
  request: DebateMysteryPlayAgainRequestV2,
): DebateMysteryPlayAgainResultV2 {
  if (request?.version !== 2) {
    throw new HttpError(400, "Whodunnit Play Again requires version 2.");
  }
  const idempotencyKey = request.idempotencyKey?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new HttpError(400, "A stable Play Again idempotency key is required.");
  }
  const audioMode = request.audioMode === "silent" ? "silent" : "reuse";

  db.exec("BEGIN IMMEDIATE");
  try {
    const requestedSource = getDebateSession(db, userId, completedSessionId);
    if (
      requestedSource.status !== "completed" ||
      requestedSource.formatState.format !== "whodunnit" ||
      requestedSource.formatState.version !== 2 ||
      requestedSource.formatState.playPhase !== "verdict"
    ) {
      throw new HttpError(409, "Play Again is available only for a completed Whodunnit V2 case.");
    }
    const requestedCase = mysteryV2CaseRow(db, userId, completedSessionId);
    const familyId = requestedCase.case_family_id || requestedCase.session_id;
    const createKey = `mystery-play-again-v2:${familyId}:${idempotencyKey}`;

    const idempotent = db.prepare(
      `SELECT id, status
         FROM debate_sessions
        WHERE user_id = ? AND create_idempotency_key = ?`,
    ).get(userId, createKey) as { id: string; status: DebateSessionV1["status"] } | undefined;
    if (idempotent) {
      const session = getDebateSession(db, userId, idempotent.id);
      db.exec("COMMIT");
      return {
        session,
        reusedExistingOpenRun: idempotent.status !== "completed" && idempotent.status !== "cancelled",
      };
    }

    const existingOpen = db.prepare(
      `SELECT session.id
         FROM debate_mystery_v2_cases AS mystery
         JOIN debate_sessions AS session
           ON session.user_id = mystery.user_id
          AND session.id = mystery.session_id
        WHERE mystery.user_id = ? AND mystery.case_family_id = ?
          AND session.status NOT IN ('completed', 'cancelled')
        ORDER BY mystery.run_ordinal DESC
        LIMIT 1`,
    ).get(userId, familyId) as { id: string } | undefined;
    if (existingOpen) {
      const session = getDebateSession(db, userId, existingOpen.id);
      db.exec("COMMIT");
      return { session, reusedExistingOpenRun: true };
    }

    const sourceIdRow = db.prepare(
      `SELECT mystery.session_id
         FROM debate_mystery_v2_cases AS mystery
         JOIN debate_sessions AS session
           ON session.user_id = mystery.user_id
          AND session.id = mystery.session_id
        WHERE mystery.user_id = ? AND mystery.case_family_id = ?
          AND session.status = 'completed'
        ORDER BY session.updated_at DESC, mystery.run_ordinal DESC
        LIMIT 1`,
    ).get(userId, familyId) as { session_id: string } | undefined;
    if (!sourceIdRow) {
      throw new HttpError(409, "This case family has no completed run to replay.");
    }
    const sourceSession = getDebateSession(db, userId, sourceIdRow.session_id);
    if (
      sourceSession.formatState.format !== "whodunnit" ||
      sourceSession.formatState.version !== 2 ||
      sourceSession.formatState.playPhase !== "verdict"
    ) {
      throw new HttpError(409, "The completed Whodunnit V2 source run is invalid.");
    }
    const sourceCase = mysteryV2CaseRow(db, userId, sourceSession.id);
    const privateCase = JSON.parse(sourceCase.private_case_json) as PrivateMysteryCaseV2;
    const graph = JSON.parse(sourceCase.dialogue_graph_json) as DebateMysteryDialogueGraphV2;
    const graphValidation = validateDebateMysteryDialogueGraphV2({
      graph,
      suspectSeatIds: privateCase.actorAccounts.map((account) => account.seatId),
      recordReferences: privateCase.recordItems.map((item) => item.reference),
      playerRole: privateCase.config.playerRole,
      roomIds: privateCase.investigationRoomIds,
      personIds: privateCase.investigationPersonIds,
      hotspotIdsByRoom: privateCase.investigationHotspotIdsByRoom,
      prosecutorBotId: privateCase.config.prosecutorBotId,
      rivalDefenseBotId: privateCase.config.rivalDefenseBotId,
      eyewitnessSeatId: privateCase.eyewitnessSeatId,
      accusedAlibiSupportDiscoveryIds: privateCase.accusedAlibiSupportDiscoveryIds,
    });
    if (!graphValidation.valid) {
      throw new HttpError(409, "The compiled Whodunnit V2 dialogue graph failed its integrity check.");
    }
    const sourceJob = jobRow(db, userId, sourceSession.id);
    const storedCheckpoint = sourceJob.checkpoint_json
      ? JSON.parse(sourceJob.checkpoint_json) as unknown
      : null;
    if (sourceJob.status !== "complete" || !isMysteryV2CompiledCheckpoint(storedCheckpoint)) {
      throw new HttpError(409, "The compiled Whodunnit V2 checkpoint is unavailable.");
    }

    let voicesEnabled = audioMode === "reuse" && sourceSession.formatState.voicesEnabled;
    let copiedManifest: DebateMysteryAudioManifestV1 | null = null;
    let audioReferences: MysteryV2ReplayAudioReferenceRow[] = [];
    if (voicesEnabled) {
      const sourceManifestRow = db.prepare(
        `SELECT status, manifest_json
           FROM debate_mystery_audio_manifests
          WHERE user_id = ? AND session_id = ?`,
      ).get(userId, sourceSession.id) as {
        status: "preparing" | "complete" | "failed" | "silent";
        manifest_json: string;
      } | undefined;
      if (!sourceManifestRow || sourceManifestRow.status !== "complete") {
        throw mysteryV2ReplayAudioUnavailable();
      }
      try {
        copiedManifest = JSON.parse(sourceManifestRow.manifest_json) as DebateMysteryAudioManifestV1;
      } catch {
        throw mysteryV2ReplayAudioUnavailable();
      }
      const validation = validateDebateMysteryAudioManifestV1({
        graph,
        manifest: copiedManifest,
        reachableSpokenLineIds: privateCase.graphValidation.reachableSpokenLineIds,
      });
      if (!validation.valid) throw mysteryV2ReplayAudioUnavailable();
      audioReferences = db.prepare(
        `SELECT reference.line_id, reference.cache_key, cache.clip_path,
                cache.mime_type, cache.sha256, cache.byte_size, cache.duration_ms
           FROM debate_mystery_audio_refs AS reference
           JOIN debate_mystery_audio_cache AS cache
             ON cache.user_id = reference.user_id
            AND cache.cache_key = reference.cache_key
          WHERE reference.user_id = ? AND reference.session_id = ?`,
      ).all(userId, sourceSession.id) as unknown as MysteryV2ReplayAudioReferenceRow[];
      const referenceByLine = new Map(audioReferences.map((reference) => [reference.line_id, reference]));
      for (const entry of copiedManifest.entries) {
        const reference = referenceByLine.get(entry.lineId);
        if (
          !reference ||
          reference.sha256 !== entry.sha256 ||
          reference.byte_size !== entry.byteSize ||
          reference.clip_path !== entry.clipPath ||
          !audioFileValid({
            clipPath: reference.clip_path,
            sha256: reference.sha256,
            byteSize: reference.byte_size,
          })
        ) {
          throw mysteryV2ReplayAudioUnavailable();
        }
      }
      audioReferences = copiedManifest.entries.map((entry) => referenceByLine.get(entry.lineId)!);
    } else {
      voicesEnabled = false;
    }

    const nextOrdinalRow = db.prepare(
      `SELECT COALESCE(MAX(run_ordinal), 0) + 1 AS next_ordinal
         FROM debate_mystery_v2_cases
        WHERE user_id = ? AND case_family_id = ?`,
    ).get(userId, familyId) as { next_ordinal: number };
    const runOrdinal = nextOrdinalRow.next_ordinal;
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    const jobId = randomUUID();
    const replayState = initialMysteryV2ReplayState({
      checkpoint: {
        privateCase,
        graph,
        publicState: storedCheckpoint.publicState,
      },
      sourceState: sourceSession.formatState,
      jobId,
      now,
      voicesEnabled,
      preparedAudioCount: copiedManifest?.entries.length ?? 0,
    });
    const replaySession: DebateSessionV1 = {
      ...structuredClone(sourceSession),
      id: sessionId,
      revision: 1,
      status: "waiting_for_player",
      phase: "opening",
      stepKey: "mystery_v2_title",
      formatState: replayState,
      jury: resetMysteryV2JuryForReplay(sourceSession.jury),
      caseBoard: [],
      ballots: [],
      playerVerdict: null,
      winnerSideId: null,
      judgeGavel: null,
      judgeGavelCooldownUntil: null,
      objectionRuling: null,
      participantObjection: null,
      participantFloorBreak: null,
      participantFloorBreakPreparation: null,
      pausedPresentationEventId: null,
      preparedResumeEventId: null,
      archiveReturnBuffer: null,
      pausedAt: null,
      pausedDurationMs: 0,
      events: [],
      error: null,
      createdAt: now,
      updatedAt: now,
      endedEarlyAt: null,
      completedAt: null,
      synopsis: null,
      liveBake: null,
    };
    db.prepare(
      `INSERT INTO debate_sessions
         (id, user_id, revision, status, phase, step_key, player_role,
          player_side_id, create_idempotency_key, motion, winner_side_id,
          session_json, error, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL)`,
    ).run(
      replaySession.id,
      userId,
      replaySession.revision,
      replaySession.status,
      replaySession.phase,
      replaySession.stepKey,
      replaySession.playerRole === "spectator" ? "spectator" : "participant",
      replaySession.playerSideId,
      createKey,
      replaySession.motion.motion,
      publicSessionJson(replaySession),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO debate_mystery_v2_cases
         (session_id, user_id, case_family_id, run_ordinal, schema_version,
          private_case_json, dialogue_graph_json, case_hash, graph_hash,
          validation_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sessionId,
      userId,
      familyId,
      runOrdinal,
      sourceCase.private_case_json,
      sourceCase.dialogue_graph_json,
      sourceCase.case_hash,
      sourceCase.graph_hash,
      sourceCase.validation_json,
      now,
      now,
    );
    const replayCheckpoint: MysteryV2Checkpoint = {
      kind: "compiled-v1",
      privateCase,
      graph,
      publicState: replayState,
    };
    db.prepare(
      `INSERT INTO debate_mystery_v2_jobs
         (id, user_id, session_id, status, stage, attempt, completed_passes,
          total_passes, prepared_audio_count, required_audio_count,
          public_message, private_error, input_json, checkpoint_json,
          lease_owner, leased_until, cancellation_requested, created_at, updated_at)
       VALUES (?, ?, ?, 'complete', 'complete', 0, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 0, ?, ?)`,
    ).run(
      jobId,
      userId,
      sessionId,
      V2_TOTAL_PASSES,
      V2_TOTAL_PASSES,
      copiedManifest?.entries.length ?? 0,
      copiedManifest?.entries.length ?? 0,
      voicesEnabled ? "Your case is ready" : "Your text case is ready",
      sourceJob.input_json,
      JSON.stringify(replayCheckpoint),
      now,
      now,
    );
    cloneDebateMysterySealedAssetsForReplayV1(
      db,
      userId,
      sourceSession.id,
      sessionId,
    );

    if (voicesEnabled && copiedManifest) {
      for (const reference of audioReferences) {
        db.prepare(
          `INSERT INTO debate_mystery_audio_refs
             (session_id, user_id, line_id, cache_key, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(sessionId, userId, reference.line_id, reference.cache_key, now);
        const updated = db.prepare(
          `UPDATE debate_mystery_audio_cache
              SET ref_count = ref_count + 1, last_used_at = ?
            WHERE user_id = ? AND cache_key = ?`,
        ).run(now, userId, reference.cache_key);
        if (Number(updated.changes) !== 1) throw mysteryV2ReplayAudioUnavailable();
      }
      storeAudioManifest(
        db,
        userId,
        sessionId,
        { ...structuredClone(copiedManifest), caseId: sessionId },
        "complete",
      );
    } else {
      storeAudioManifest(db, userId, sessionId, {
        version: 1,
        caseId: sessionId,
        caseHash: sourceCase.case_hash,
        scriptHash: sha256("silent"),
        dialogueGraphHash: sourceCase.graph_hash,
        engine: "prism-instant-local",
        model: copiedManifest?.model ?? PRISM_INSTANT_VOICE_MODEL_ID,
        modelVersion: copiedManifest?.modelVersion ?? "q8-pinned-1",
        entries: [],
        complete: false,
        completedAt: null,
        verifiedAt: null,
      }, "silent");
    }

    db.exec("COMMIT");
    return { session: replaySession, reusedExistingOpenRun: false };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function debateMysteryPlayContractHashV2(args: {
  db: DatabaseSync;
  userId: string;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  botRows: MysteryV2BotRow[];
  manifest?: DebateMysteryAudioManifestV1 | null;
  session?: DebateSessionV1;
}): string {
  const lineById = new Map(args.graph.lines.map((line) => [line.id, line]));
  const botById = new Map(args.botRows.map((bot) => [bot.id, bot]));
  const entryByLineId = new Map(
    (args.manifest?.entries ?? []).map((entry) => [entry.lineId, entry]),
  );
  const prismVoiceProfile = prismVoiceProfileForMysteryV2(args.db, args.userId);
  // Lazy cases freeze the whole dialogue graph and immutable voice snapshots,
  // but only bind a concrete synthesis profile when a line is actually
  // spoken. Requiring every reachable branch to resolve a live bot here would
  // recreate the eager-pack dependency and make otherwise valid legacy cases
  // fail readiness when an unspoken Library bot is later removed.
  const voiceContractLineIds = args.privateCase.audioPreparationMode === "lazy-on-demand-v1" ||
      args.manifest?.preparationMode === "lazy-on-demand-v1"
    ? []
    : args.privateCase.graphValidation.reachableSpokenLineIds;
  const lineContracts = [...voiceContractLineIds]
    .sort()
    .map((lineId) => {
      const line = lineById.get(lineId);
      if (!line) throw new Error(`Reachable line ${lineId} is missing from the frozen graph.`);
      const entry = entryByLineId.get(lineId);
      let voiceProfile: BotAudioVoiceProfileV1 | { frozenVoiceProfileHash: string };
      try {
        voiceProfile = frozenAudioProfileForLineV2({
          line,
          privateCase: args.privateCase,
          botById,
          prismVoiceProfile,
          frozenVoiceProfileHash: entry?.voiceProfileHash,
          session: args.session,
        });
      } catch (error) {
        const verifiedEntry = entry && args.session
          ? verifiedFrozenAudioEntryForLineV2({
              db: args.db,
              userId: args.userId,
              sessionId: args.session.id,
              line,
              privateCase: args.privateCase,
              manifest: args.manifest!,
            })
          : null;
        if (!verifiedEntry?.voiceProfileHash) throw error;
        // A verified frozen pack remains a stable contract even when an old
        // case no longer carries enough profile material to synthesize anew.
        voiceProfile = { frozenVoiceProfileHash: verifiedEntry.voiceProfileHash };
      }
      return {
        lineId,
        spokenText: line.spokenText,
        voiceTreatment: mysteryLineVoiceTreatmentV2(line),
        stageActionText: line.stageActionText,
        speakerBotId: line.speakerBotId,
        performance: line.performance,
        voiceProfile,
      };
    });
  return sha256(JSON.stringify({
    readinessVersion: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
    playerRoleContractVersion: args.privateCase.playerRoleContractVersion ?? 0,
    prosecutorBotId: args.privateCase.config.prosecutorBotId,
    rivalDefenseBotId: args.privateCase.config.rivalDefenseBotId,
    graph: args.graph,
    lineContracts,
  }));
}

function audioManifestMatchesCurrentContractV2(args: {
  db: DatabaseSync;
  userId: string;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  botRows: MysteryV2BotRow[];
  manifest: DebateMysteryAudioManifestV1 | null;
  session?: DebateSessionV1;
}): boolean {
  const manifest = args.manifest;
  if (!manifest) return false;
  const validation = validateDebateMysteryAudioManifestV1({
    graph: args.graph,
    manifest,
    reachableSpokenLineIds: args.privateCase.graphValidation.reachableSpokenLineIds,
  });
  if (!validation.valid) return false;
  const entryByLine = new Map(manifest.entries.map((entry) => [entry.lineId, entry]));
  const lineById = new Map(args.graph.lines.map((line) => [line.id, line]));
  const botById = new Map(args.botRows.map((bot) => [bot.id, bot]));
  const prismVoiceProfile = prismVoiceProfileForMysteryV2(args.db, args.userId);
  const contractLineIds = manifest.preparationMode === "lazy-on-demand-v1"
    ? manifest.entries.map((entry) => entry.lineId)
    : args.privateCase.graphValidation.reachableSpokenLineIds;
  return contractLineIds.every((lineId) => {
    const line = lineById.get(lineId);
    const entry = entryByLine.get(lineId);
    if (!line || !entry || !audioFileValid(entry)) return false;
    try {
      frozenAudioProfileForLineV2({
        line,
        privateCase: args.privateCase,
        botById,
        prismVoiceProfile,
        frozenVoiceProfileHash: entry.voiceProfileHash,
        session: args.session,
      });
    } catch {
      // Legacy cases may retain a fully verified clip/reference but not the
      // original profile object. That pack is still current; it is simply not
      // eligible for new synthesis.
      if (
        args.privateCase.audioVoiceProfilesByBotId?.[line.speakerBotId ?? ""] ||
        frozenSessionAudioVoiceProfilesV2(args.session, line.speakerBotId).length > 0
      ) {
        return false;
      }
    }
    const voiceTreatment = mysteryLineVoiceTreatmentV2(line);
    const synthesisTextHash = sha256(mysteryLineSynthesisTextV2(line, args.privateCase));
    return entry.textHash === sha256(line.spokenText) &&
      (entry.synthesisTextHash ?? entry.textHash) === synthesisTextHash &&
      entry.botId === line.speakerBotId &&
      (entry.voiceTreatment ?? "english") === voiceTreatment &&
      entry.performanceDirectionHash === sha256(JSON.stringify(line.performance));
  });
}

function pruneStaleAudioReferencesV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  reachableLineIds: readonly string[],
): void {
  if (!reachableLineIds.length) {
    db.prepare(
      "DELETE FROM debate_mystery_audio_refs WHERE user_id = ? AND session_id = ?",
    ).run(userId, sessionId);
    return;
  }
  db.prepare(
    `DELETE FROM debate_mystery_audio_refs
      WHERE user_id = ? AND session_id = ?
        AND line_id NOT IN (${reachableLineIds.map(() => "?").join(", ")})`,
  ).run(userId, sessionId, ...reachableLineIds);
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
  const lazyOnDemand = args.privateCase.audioPreparationMode === "lazy-on-demand-v1";
  const preparationLineIds = lazyOnDemand
    ? reachableLineIds.filter((lineId) =>
        args.graph.lines.find((line) => line.id === lineId)?.nodeId === "briefing-opening")
    : reachableLineIds;
  pruneStaleAudioReferencesV2(args.db, args.userId, args.sessionId, reachableLineIds);
  const reachableLineIdSet = new Set(reachableLineIds);
  const lineById = new Map(args.graph.lines.map((line) => [line.id, line]));
  const botById = new Map(args.botRows.map((bot) => [bot.id, bot]));
  const prismVoiceProfile = prismVoiceProfileForMysteryV2(args.db, args.userId);
  const graphJson = JSON.stringify(args.graph);
  const privateJson = JSON.stringify(args.privateCase);
  const scriptHash = sha256(
    reachableLineIds.map((id) => {
      const line = lineById.get(id)!;
      return `${line.id}\u0000${mysteryLineVoiceTreatmentV2(line)}\u0000${mysteryLineSynthesisTextV2(line, args.privateCase)}\u0000${JSON.stringify(line.performance)}`;
    }).join("\u0001"),
  );
  const previous = loadAudioManifest(args.db, args.userId, args.sessionId);
  const previousEntryByLineId = new Map(
    (previous?.entries ?? []).map((entry) => [entry.lineId, entry]),
  );
  const reusableEntries = new Map(
    previous?.entries
      .filter((entry) => reachableLineIdSet.has(entry.lineId) && audioFileValid(entry))
      .map((entry) => [entry.lineId, entry]) ?? [],
  );
  const manifest: DebateMysteryAudioManifestV1 = {
    version: 1,
    preparationMode: lazyOnDemand ? "lazy-on-demand-v1" : "eager-v1",
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
    requiredAudioCount: preparationLineIds.length,
    preparedAudioCount: preparationLineIds.filter((lineId) => reusableEntries.has(lineId)).length,
  });
  for (const [index, lineId] of preparationLineIds.entries()) {
    const job = jobRow(args.db, args.userId, args.sessionId);
    if (job.cancellation_requested === 1) throw new DOMException("Cancelled", "AbortError");
    const line = lineById.get(lineId);
    if (!line) throw new Error(`Reachable line ${lineId} disappeared before audio preparation.`);
    const profile = frozenAudioProfileForLineV2({
      line,
      privateCase: args.privateCase,
      botById,
      prismVoiceProfile,
      frozenVoiceProfileHash: previousEntryByLineId.get(lineId)?.voiceProfileHash,
      allowFrozenSnapshotRepair: true,
    });
    const voiceTreatment = mysteryLineVoiceTreatmentV2(line);
    const synthesisText = mysteryLineSynthesisTextV2(line, args.privateCase);
    const textHash = sha256(line.spokenText);
    const synthesisTextHash = sha256(synthesisText);
    const voiceProfileHash = sha256(JSON.stringify(profile));
    const performanceDirectionHash = sha256(JSON.stringify(line.performance));
    const cacheKey = sha256(JSON.stringify({
      textHash,
      synthesisTextHash,
      botId: line.speakerBotId,
      voiceTreatment,
      voiceProfileHash,
      model: PRISM_INSTANT_VOICE_MODEL_ID,
      performanceDirectionHash,
    }));
    const reusable = reusableEntries.get(lineId);
    const reusableCacheKey = reusable
      ? reusableAudioCacheKeyV2(args.db, args.userId, reusable)
      : null;
    if (
      reusable &&
      reusableCacheKey &&
      reusable.textHash === textHash &&
      (reusable.synthesisTextHash ?? reusable.textHash) === synthesisTextHash &&
      reusable.botId === line.speakerBotId &&
      (reusable.voiceTreatment ?? "english") === voiceTreatment &&
      reusable.voiceProfileHash === voiceProfileHash &&
      reusable.performanceDirectionHash === performanceDirectionHash
    ) {
      manifest.entries.push(reusable);
      // Cache-key derivation has evolved over time. A valid authored clip can
      // therefore still live under its legacy key even though every manifest
      // contract field matches. Keep that verified cache row attached instead
      // of inserting a reference to a newly derived key that does not exist.
      attachAudioReference(args.db, args.userId, args.sessionId, lineId, reusableCacheKey);
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
        text: synthesisText,
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
      synthesisTextHash,
      botId: line.speakerBotId,
      voiceTreatment,
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
      requiredAudioCount: preparationLineIds.length,
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

interface StagedMysteryAudioLineV2 {
  entry: DebateMysteryAudioManifestEntryV1;
  cacheKey: string;
}

/**
 * Prepares one replacement clip without touching the active manifest. The
 * cache row is intentionally left unreferenced until the matching dialogue
 * graph and gameplay mutation commit together; an interrupted request is then
 * only an ordinary cleanup candidate, never a caption/audio mismatch.
 */
async function stageMysteryAudioLineV2(args: {
  db: DatabaseSync;
  userId: string;
  line: DebateMysterySpokenLineV2;
  privateCase: PrivateMysteryCaseV2;
  voiceProfile: BotAudioVoiceProfileV1;
  frozenVoiceProfileHash: string;
  generateWave?: typeof generateBuiltinEnglishWave;
}): Promise<StagedMysteryAudioLineV2> {
  const profile = normalizeBotAudioVoiceProfileV1(args.voiceProfile);
  const voiceTreatment = mysteryLineVoiceTreatmentV2(args.line);
  const synthesisText = mysteryLineSynthesisTextV2(args.line, args.privateCase);
  const textHash = sha256(args.line.spokenText);
  const synthesisTextHash = sha256(synthesisText);
  const voiceProfileHash = sha256(JSON.stringify(profile));
  if (voiceProfileHash !== args.frozenVoiceProfileHash) {
    throw new Error("The replacement room performance does not match the frozen voice profile.");
  }
  const performanceDirectionHash = sha256(JSON.stringify(args.line.performance));
  const cacheKey = sha256(JSON.stringify({
    textHash,
    synthesisTextHash,
    botId: args.line.speakerBotId,
    voiceTreatment,
    voiceProfileHash,
    model: PRISM_INSTANT_VOICE_MODEL_ID,
    performanceDirectionHash,
  }));
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
      text: synthesisText,
      profile,
      allowOperatingSystemVoices: false,
      deliveryMood: args.line.performance.mood,
    });
    if (!isPlayablePcmWave(wave)) {
      throw new Error(`Local voice line ${args.line.id} is not playable.`);
    }
    durationMs = pcmWaveDurationMs(wave) ?? 0;
    if (durationMs <= 0) {
      throw new Error(`Local voice line ${args.line.id} has no measurable duration.`);
    }
    clipHash = sha256(wave);
    byteSize = wave.byteLength;
    clipPath = audioCacheRelativePath(args.userId, cacheKey);
    writeAudioAtomically(clipPath, wave);
    if (!audioFileValid({ clipPath, sha256: clipHash, byteSize })) {
      throw new Error(`Local voice line ${args.line.id} failed its post-write integrity check.`);
    }
    const now = new Date().toISOString();
    args.db.prepare(
      `INSERT OR IGNORE INTO debate_mystery_audio_cache
         (cache_key, user_id, clip_path, mime_type, sha256, byte_size,
          duration_ms, ref_count, created_at, last_used_at)
       VALUES (?, ?, ?, 'audio/wav', ?, ?, ?, 0, ?, ?)`,
    ).run(cacheKey, args.userId, clipPath, clipHash, byteSize, durationMs, now, now);
  }
  return {
    cacheKey,
    entry: {
      lineId: args.line.id,
      textHash,
      synthesisTextHash,
      botId: args.line.speakerBotId,
      voiceTreatment,
      voiceProfileHash,
      performanceDirectionHash,
      clipPath,
      mimeType: "audio/wav",
      durationMs,
      byteSize,
      sha256: clipHash,
      alignment: null,
      reusableCalloutKey: args.line.reusableCalloutKey,
      verifiedAt: new Date().toISOString(),
    },
  };
}

function claimCompilationJob(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): { row: MysteryV2JobRow; owner: string } | null {
  const current = jobRow(db, userId, sessionId);
  if (current.status === "complete" || current.status === "cancelled") return null;
  const active = activeDebateMysteryCompilationV2(db, userId);
  if (active && active.sessionId !== sessionId) return null;
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

function finalizeCancelledMysteryV2Compilation(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): MysteryV2JobRow {
  const cancelled = updateJob(db, userId, sessionId, {
    stage: "cancelled",
    status: "cancelled",
    publicMessage: V2_SPOILER_SAFE_MESSAGES.cancelled,
    privateError: null,
    clearLease: true,
  });
  deleteDebateMysterySealedAssetsV1(db, userId, sessionId);
  return cancelled;
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
  options: DebateMysteryCompilationOptionsV2 = {},
): Promise<DebateSessionV1> {
  const claimed = claimCompilationJob(db, userId, sessionId);
  if (!claimed) return getDebateSession(db, userId, sessionId);
  let localAudioStage = false;
  let leaseLost = false;
  const cancellationController = new AbortController();
  const heartbeat = setInterval(() => {
    try {
      if (jobRow(db, userId, sessionId).cancellation_requested === 1) {
        cancellationController.abort();
        return;
      }
      leaseLost = !renewCompilationLease(db, userId, sessionId, claimed.owner);
    } catch {
      leaseLost = true;
    }
  }, Math.floor(V2_JOB_LEASE_MS / 3));
  heartbeat.unref();
  const requireLease = (): void => {
    if (jobRow(db, userId, sessionId).cancellation_requested === 1) {
      cancellationController.abort();
      throw new DOMException("Cancelled", "AbortError");
    }
    if (leaseLost || !renewCompilationLease(db, userId, sessionId, claimed.owner)) {
      leaseLost = true;
      throw new Error("The durable compilation lease moved to another worker.");
    }
  };
  try {
    let currentJob = claimed.row;
    requireLease();
    setPublicCompilationStatus(db, userId, sessionId, currentJob);
    const session = getDebateSession(db, userId, sessionId);
    if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
      throw new Error("The durable V2 job no longer owns a V2 public session.");
    }
    const config = session.formatState.config;
    const castIds = [
      ...config.suspectBotIds,
      config.judgeBotId,
      config.prosecutorBotId,
      config.rivalDefenseBotId,
      ...config.jurorBotIds,
    ];
    const bots = botRows(db, userId, castIds);
    const storedCheckpoint = currentJob.checkpoint_json
      ? JSON.parse(currentJob.checkpoint_json) as unknown
      : null;
    let checkpoint: MysteryV2Checkpoint | null = isMysteryV2CompiledCheckpoint(storedCheckpoint)
      ? storedCheckpoint
      : null;
    if (
      checkpoint &&
      checkpoint.privateCase.contradictionSemanticContractVersion !== 1
    ) {
      // An incomplete pre-contract compile cannot skip directly into the old
      // structural pass after a restart. Re-author from the same frozen config
      // so Retry gains the semantic guarantee; completed playable cases remain
      // immutable because complete jobs are never claimable here.
      db.prepare(
        "DELETE FROM debate_mystery_v2_checkpoints WHERE user_id = ? AND session_id = ?",
      ).run(userId, sessionId);
      currentJob = updateJob(db, userId, sessionId, {
        stage: "writing_case",
        completedPasses: 0,
        preparedAudioCount: 0,
        requiredAudioCount: 0,
        publicMessage: V2_SPOILER_SAFE_MESSAGES.writing_case,
        privateError: null,
        checkpointJson: null,
      });
      checkpoint = null;
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
    }
    const authoringDraft = normalizeMysteryV2AuthoringCheckpoint(
      checkpoint ? storedCheckpoint : currentJob.checkpoint_json
        ? JSON.parse(currentJob.checkpoint_json) as unknown
        : null,
    );
    if (!checkpoint) {
      const suspectRows = config.suspectBotIds.map((id) => {
        const bot = bots.find((entry) => entry.id === id);
        if (!bot) throw new Error("A frozen suspect is no longer available.");
        return bot;
      });
      const incidentPlan = composeMysteryIncidentPlanV1({
        spark: config.spark,
        difficulty: config.difficulty,
        nonce: config.nonce,
      });
      const incidentPlanValidation = validateMysteryIncidentPlanV1({
        plan: incidentPlan,
        difficulty: config.difficulty,
      });
      if (!incidentPlanValidation.valid) {
        throw new Error(incidentPlanValidation.errors.join("\n"));
      }
      const savedMansionRooms = config.mansionBundleId
        ? config.mansionSnapshot?.rooms ?? getDebateMysteryMansionBundleV2(
            db,
            userId,
            config.mansionBundleId,
          ).rooms
        : null;
      const crimeSceneRoom = savedMansionRooms?.find((room) => !room.assignedSuspectSeatId) ?? null;
      const orderedMansionRooms = savedMansionRooms && crimeSceneRoom
        ? [crimeSceneRoom, ...savedMansionRooms.filter((room) => room.id !== crimeSceneRoom.id)]
        : savedMansionRooms;
      const scaffold = compileDeterministicDebateMystery({
        config: v1ScaffoldConfig(config, incidentPlan),
        suspects: suspectRows.map((bot) => ({
          botId: bot.id,
          exportHash: bot.export_hash,
          name: bot.name,
          color: bot.color,
          glyph: bot.glyph,
        })),
        ...(orderedMansionRooms
          ? {
              roomBlueprint: orderedMansionRooms.map((room, index) => ({
                id: room.id,
                floor: room.floor,
                x: room.x,
                y: room.y,
                width: room.width,
                height: room.height,
                neighborIds: [...room.neighborIds],
                templateId: room.templateId,
                imageId: room.imageId,
                kind: room.assignedSuspectSeatId
                  ? "suspect" as const
                  : index === 0
                    ? "crime_scene" as const
                    : "search" as const,
                assignedSuspectSeatId: room.assignedSuspectSeatId,
              })),
            }
          : {}),
      });
      const scaffoldValidation = validateDebateMysteryCaseBible(
        scaffold,
        10_000,
        {
          architecture: config.mansionSnapshot?.layoutV2
            ? "mansion-layout-v2"
            : "legacy-room-grid",
        },
      );
      if (!scaffoldValidation.valid) throw new Error(scaffoldValidation.errors.join("\n"));
      const boundIncidentPlan = bindMysteryIncidentPlanV1({
        plan: incidentPlan,
        principalSeatId: scaffold.culpritSeatId,
        accompliceSeatId: scaffold.accompliceSeatId,
      });
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
      const discoverableEvidenceIds = new Set(
        mysteryCompilationOmitsInvestigationV2(
          resolveMysteryCompilationScopeV2(config),
        )
          ? scaffold.evidence.map((evidence) => evidence.id)
          : scaffold.activeRegions.flatMap((outcome) =>
              outcome.evidenceId ? [outcome.evidenceId] : []),
      );
      const evidenceRefs = scaffold.evidence
        .filter((evidence) => discoverableEvidenceIds.has(evidence.id))
        .map((evidence) => ({ kind: "evidence" as const, id: evidence.id }));
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
      const authored = await authorMysteryV2({
        runtime,
        config,
        incidentPlan: boundIncidentPlan,
        scaffold,
        bots,
        powerPlan: session.powerPlan,
        eyewitnessSeatId,
        examinationIds,
        requiredContradictionBySeat: contradictionBySeat,
        draft: authoringDraft,
        onDraft: (draft, message) => {
          requireLease();
          currentJob = persistAuthoringCheckpoint(
            db,
            userId,
            sessionId,
            draft,
            message,
          );
          setPublicCompilationStatus(db, userId, sessionId, currentJob);
        },
      });
      requireLease();
      checkpoint = buildMysteryV2Graph({
        sessionId,
        config,
        mansionExterior: session.formatState.mansionExterior ?? null,
        incidentPlan: boundIncidentPlan,
        scaffold,
        bots,
        authored,
        eyewitnessSeatId,
        alibiSupportDiscoveryIds,
        contradictionBySeat,
        personaVoiceCardsByBotId: authoringDraft.contextCapsule?.voiceCardsByBotId,
        authoringRecoveryBySection: authoringDraft.recoveryBySection,
      });
      requireLease();
      storeCompiledCaseV2(db, userId, sessionId, checkpoint.privateCase, checkpoint.graph);
      currentJob = completeCompilationPass(db, userId, sessionId, {
        passNumber: 1,
        key: "pass:writing-case",
        stage: "testing_contradictions",
        payload: JSON.stringify(checkpoint),
        checkpointJson: JSON.stringify(checkpoint),
      });
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
    }
    if (currentJob.completed_passes < 2) {
      const revalidated = validateMysteryV2CheckpointGraph(checkpoint);
      if (!revalidated.valid) throw new Error(revalidated.errors.join("\n"));
      currentJob = completeCompilationPass(db, userId, sessionId, {
        passNumber: 2,
        key: "pass:testing-contradictions",
        stage: "directing_performances",
        payload: JSON.stringify(revalidated),
      });
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
    }
    if (currentJob.completed_passes < 3) {
      if (checkpoint.privateCase.personaDialoguePolishVersion !== 1) {
        checkpoint.graph = await polishMysteryPersonaDialogueGraphV2({
          runtime,
          graph: checkpoint.graph,
          privateCase: checkpoint.privateCase,
          bots,
        });
        checkpoint.privateCase.personaDialoguePolishVersion = 1;
        requireLease();
      }
      const revalidated = validateMysteryV2CheckpointGraph(checkpoint);
      if (!revalidated.valid) throw new Error(revalidated.errors.join("\n"));
      checkpoint.privateCase.graphValidation = revalidated;
      for (const line of checkpoint.graph.lines) {
        if (
          !line.performance.mood.trim() ||
          !line.performance.actorNote.trim() ||
          !Number.isInteger(line.performance.intensity)
        ) throw new Error(`Line ${line.id} has incomplete performance direction.`);
      }
      if (!checkpoint.publicState.mansionExterior && options.prepareMansionExteriorAsset) {
        const exterior = await options.prepareMansionExteriorAsset({
          userId,
          sessionId,
          houseStyle: checkpoint.privateCase.config.houseStyle,
          scaleClass: checkpoint.privateCase.config.scaleClass,
          // Case Forge may supply only the bundled fallback. Exterior
          // generation is an explicit Mansion-step decision made before a
          // session exists.
          synthesize: false,
          signal: cancellationController.signal,
        });
        checkpoint = withPreparedMansionExteriorAsset(checkpoint, exterior);
        currentJob = persistCompiledSectionCheckpoint(db, userId, sessionId, {
          key: "section:mansion-exterior",
          stage: "directing_performances",
          checkpoint,
          payload: JSON.stringify({ asset: exterior }),
        });
      }
      if (checkpoint.privateCase.config.assetSynthesis.evidence && options.prepareEvidenceAssets) {
        // Prepare every sealed physical exhibit without leaking undiscovered
        // Case File entries into public state. The image identity is promoted
        // with the evidence only when its authored discovery admits it.
        const prepared = unpreparedMysteryV2EvidenceAssets(session, checkpoint);
        if (prepared.length > 0) {
          const assetByExhibitId = await options.prepareEvidenceAssets({
            userId,
            sessionId,
            exhibits: prepared,
            crimeSceneRoomId: checkpoint.privateCase.crimeSceneRoomId,
            mode: checkpoint.privateCase.config.assetSynthesis.rooms ? "initial" : "all",
            houseStyle: checkpoint.privateCase.config.houseStyle,
            signal: cancellationController.signal,
            onPrepared: (exhibitId, asset) => {
              requireLease();
              checkpoint = withPreparedEvidenceAsset(checkpoint!, exhibitId, asset);
              currentJob = persistCompiledSectionCheckpoint(db, userId, sessionId, {
                key: `section:evidence-asset:${exhibitId}`,
                stage: "directing_performances",
                checkpoint: checkpoint!,
                payload: JSON.stringify({ exhibitId, asset }),
              });
            },
          });
          for (const [exhibitId, asset] of Object.entries(assetByExhibitId)) {
            checkpoint = withPreparedEvidenceAsset(checkpoint, exhibitId, asset);
          }
        }
      }
      if (
        checkpoint.privateCase.config.assetSynthesis.rooms &&
        options.prepareRoomAssets
      ) {
        const pendingRooms = checkpoint.publicState.rooms.filter(
          (room) =>
            room.sealedAsset?.status !== "ready" &&
            room.sealedAsset?.status !== "fallback",
        );
        if (pendingRooms.length > 0) {
          const assetByRoomId = await options.prepareRoomAssets({
            userId,
            sessionId,
            rooms: pendingRooms,
            crimeSceneRoomId: checkpoint.privateCase.crimeSceneRoomId,
            mode: checkpoint.privateCase.config.assetSynthesis.illustratedRooms
              ? "background"
              : "initial",
            houseStyle: checkpoint.privateCase.config.houseStyle,
            signal: cancellationController.signal,
            onPrepared: (roomId, asset) => {
              requireLease();
              checkpoint = withPreparedRoomAsset(checkpoint!, roomId, asset);
              currentJob = persistCompiledSectionCheckpoint(db, userId, sessionId, {
                key: `section:room-asset:${roomId}`,
                stage: "directing_performances",
                checkpoint: checkpoint!,
                payload: JSON.stringify({ roomId, asset }),
              });
            },
          });
          for (const [roomId, asset] of Object.entries(assetByRoomId)) {
            checkpoint = withPreparedRoomAsset(checkpoint, roomId, asset);
          }
        }
      }
      if (
        checkpoint.privateCase.config.assetSynthesis.illustratedRooms &&
        options.prepareIllustratedRooms
      ) {
        currentJob = updateJob(db, userId, sessionId, {
          publicMessage: "Upgrading every room to Illustrated",
        });
        setPublicCompilationStatus(db, userId, sessionId, currentJob, {
          ...checkpoint.publicState,
          playPhase: "case_forge",
        });
        await options.prepareIllustratedRooms({
          userId,
          sessionId,
          signal: cancellationController.signal,
        });
        requireLease();
      }
      requireLease();
      // This is the final authored graph: persona delivery has been applied
      // and any optional evidence artwork is now attached. Persist it before
      // local voice preparation so the audio pack speaks exactly this text.
      storeCompiledCaseV2(db, userId, sessionId, checkpoint.privateCase, checkpoint.graph);
      currentJob = completeCompilationPass(db, userId, sessionId, {
        passNumber: 3,
        key: "pass:directing-performances",
        stage: "preparing_local_voices",
        payload: JSON.stringify({
          graphHash: sha256(JSON.stringify(checkpoint.graph)),
          evidenceAssetSubjects: checkpoint.publicState.record.flatMap((item) =>
            item.reference.kind === "evidence" && item.sealedAsset
              ? [item.reference.id]
              : []),
          roomAssetSubjects: checkpoint.publicState.rooms.flatMap((room) =>
            room.sealedAsset ? [room.id] : []),
        }),
        checkpointJson: JSON.stringify(checkpoint),
      });
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
    }
    localAudioStage = true;
    if (currentJob.completed_passes < 4) {
      const preparedManifest = await prepareLocalAudioPackV2({
        db,
        userId,
        sessionId,
        graph: checkpoint.graph,
        privateCase: checkpoint.privateCase,
        botRows: bots,
        generateWave: options.generateWave,
      });
      requireLease();
      currentJob = completeCompilationPass(db, userId, sessionId, {
        passNumber: 4,
        key: "pass:preparing-local-voices",
        stage: "verifying_case_audio",
        payload: JSON.stringify(preparedManifest),
        preparedAudioCount: preparedManifest.entries.length,
        requiredAudioCount: preparedManifest.entries.length,
      });
      setPublicCompilationStatus(db, userId, sessionId, currentJob);
    }
    const manifest = loadAudioManifest(db, userId, sessionId);
    if (!manifest) throw new Error("The local audio manifest disappeared before final verification.");
    const audioValidation = validateDebateMysteryAudioManifestV1({
      graph: checkpoint.graph,
      manifest,
      reachableSpokenLineIds: checkpoint.privateCase.graphValidation.reachableSpokenLineIds,
    });
    if (!audioValidation.valid) throw new Error(audioValidation.errors.join("\n"));
    requireLease();
    currentJob = completeCompilationPass(db, userId, sessionId, {
      passNumber: 5,
      key: "pass:verifying-case-audio",
      stage: "complete",
      payload: JSON.stringify(audioValidation),
      status: "complete",
      preparedAudioCount: manifest.entries.length,
      requiredAudioCount: manifest.entries.length,
      privateError: null,
      clearLease: true,
    });
    const playContractHash = debateMysteryPlayContractHashV2({
      db,
      userId,
      graph: checkpoint.graph,
      privateCase: checkpoint.privateCase,
      botRows: bots,
      manifest,
    });
    const readySession = setPublicCompilationStatus(db, userId, sessionId, currentJob, {
      ...checkpoint.publicState,
      compilation: compilationStatus(db, currentJob),
      playPhase: "title_card",
      caseTitle: checkpoint.publicState.caseTitle,
      readiness: {
        version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
        status: "ready",
        spoilerSafeMessage: "The finite local case pack is ready",
        contractHash: playContractHash,
        checkedAt: new Date().toISOString(),
      },
      audioReady: true,
      voicesEnabled: true,
      localAudioFailure: null,
    });
    options.onCompilationReady?.(readySession);
    return readySession;
  } catch (error) {
    if (
      (error instanceof DOMException || error instanceof Error) &&
      error.name === "AbortError"
    ) {
      const row = finalizeCancelledMysteryV2Compilation(
        db,
        userId,
        sessionId,
      );
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
    generateWave?: DebateMysteryCompilationOptionsV2["generateWave"];
    prepareEvidenceAssets?: DebateMysteryCompilationOptionsV2["prepareEvidenceAssets"];
    prepareRoomAssets?: DebateMysteryCompilationOptionsV2["prepareRoomAssets"];
    prepareIllustratedRooms?: DebateMysteryCompilationOptionsV2["prepareIllustratedRooms"];
    prepareMansionExteriorAsset?: DebateMysteryCompilationOptionsV2["prepareMansionExteriorAsset"];
    onCompilationReady?: DebateMysteryCompilationOptionsV2["onCompilationReady"];
    deferBackgroundStart?: boolean;
  } = {},
): Promise<DebateSessionV1> {
  const row = jobRow(db, userId, sessionId);
  if (row.status === "complete") return getDebateSession(db, userId, sessionId);
  if (row.status === "cancelled") throw new HttpError(409, "Cancelled case preparation cannot be retried.");
  if (row.status === "queued" || row.status === "running") {
    return getDebateSession(db, userId, sessionId);
  }
  if (activeDebateMysteryCompilationV2(db, userId, sessionId)) {
    throwActiveCaseForgeConflict();
  }
  const storedCheckpoint = row.checkpoint_json ? JSON.parse(row.checkpoint_json) as unknown : null;
  const hasCompiledCheckpoint =
    isMysteryV2CompiledCheckpoint(storedCheckpoint) &&
    storedCheckpoint.privateCase.contradictionSemanticContractVersion === 1;
  const retryStage: DebateMysteryCompilationStageV2 = !hasCompiledCheckpoint
    ? "writing_case"
    : row.completed_passes <= 1
      ? "testing_contradictions"
      : row.completed_passes === 2
        ? "directing_performances"
        : row.completed_passes === 3
          ? "preparing_local_voices"
          : "verifying_case_audio";
  db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET status = 'queued', stage = ?, public_message = ?,
            private_error = NULL, lease_owner = NULL, leased_until = NULL,
            cancellation_requested = 0, updated_at = ?
      WHERE user_id = ? AND session_id = ?`,
  ).run(
    retryStage,
    V2_SPOILER_SAFE_MESSAGES[retryStage],
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
        prepareEvidenceAssets: options.prepareEvidenceAssets,
        prepareRoomAssets: options.prepareRoomAssets,
        prepareIllustratedRooms: options.prepareIllustratedRooms,
        prepareMansionExteriorAsset: options.prepareMansionExteriorAsset,
        onCompilationReady: options.onCompilationReady,
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
  if (row.status === "cancelled") {
    deleteDebateMysterySealedAssetsV1(db, userId, sessionId);
    return compilationStatus(db, row);
  }
  db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET cancellation_requested = 1,
            status = CASE WHEN status = 'running' THEN status ELSE 'cancelled' END,
            stage = CASE WHEN status = 'running' THEN stage ELSE 'cancelled' END,
            public_message = CASE WHEN status = 'running' THEN public_message ELSE ? END,
            updated_at = ?
      WHERE user_id = ? AND session_id = ?`,
  ).run(V2_SPOILER_SAFE_MESSAGES.cancelled, new Date().toISOString(), userId, sessionId);
  let cancelled = jobRow(db, userId, sessionId);
  if (cancelled.status === "cancelled") {
    cancelled = finalizeCancelledMysteryV2Compilation(db, userId, sessionId);
    setPublicCompilationStatus(db, userId, sessionId, cancelled);
  }
  return compilationStatus(db, cancelled);
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
  const storedCheckpoint = JSON.parse(row.checkpoint_json) as unknown;
  if (!isMysteryV2CompiledCheckpoint(storedCheckpoint)) {
    throw new HttpError(409, "The validated text case is not ready.");
  }
  const checkpoint = storedCheckpoint;
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
    compilation: compilationStatus(db, complete),
    playPhase: "title_card",
    readiness: {
      version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
      status: "ready",
      spoilerSafeMessage: "The finite text case is ready",
      contractHash: debateMysteryPlayContractHashV2({
        db,
        userId,
        graph: checkpoint.graph,
        privateCase: checkpoint.privateCase,
        botRows: botRows(db, userId, [
          ...checkpoint.privateCase.config.suspectBotIds,
          checkpoint.privateCase.config.prosecutorBotId,
          checkpoint.privateCase.config.rivalDefenseBotId,
          checkpoint.privateCase.config.judgeBotId,
          ...checkpoint.privateCase.config.jurorBotIds,
        ]),
      }),
      checkedAt: new Date().toISOString(),
    },
    audioReady: false,
    voicesEnabled: false,
    localAudioFailure: null,
  });
}

/**
 * Repairs an active, unarchived case before gameplay resumes. This path is
 * deliberately finite and local: it never invokes the authoring provider and
 * only rebuilds local PCM clips whose text, owner, voice profile, or
 * performance contract changed.
 */
export async function ensureDebateMysteryPlayReadyV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  options: { generateWave?: typeof generateBuiltinEnglishWave } = {},
): Promise<DebateSessionV1> {
  const original = getDebateSession(db, userId, sessionId);
  if (original.formatState.format !== "whodunnit" || original.formatState.version !== 2) {
    throw new HttpError(409, "This session is not a Whodunnit V2 case.");
  }
  // Completed sessions are archival/replay artifacts. Their graph and audio
  // pack are intentionally immutable; legacy render fallbacks keep them usable.
  if (original.status === "completed" || original.formatState.playPhase === "verdict") {
    return original;
  }
  if (original.formatState.compilation.stage !== "complete") {
    throw new HttpError(409, "Finish preparing the case before checking gameplay readiness.");
  }

  try {
    const stored = getDebateMysteryCaseV2(db, userId, sessionId);
    const compiledJob = jobRow(db, userId, sessionId);
    const compiledCheckpoint = compiledJob.checkpoint_json
      ? JSON.parse(compiledJob.checkpoint_json) as unknown
      : null;
    if (
      compiledJob.status !== "complete" ||
      !isMysteryV2CompiledCheckpoint(compiledCheckpoint)
    ) {
      throw new Error("The complete compiled checkpoint is unavailable for local readiness repair.");
    }
    const rawConfig = stored.privateCase.config as unknown as Record<string, unknown>;
    const roleBotIds = [
      ...(Array.isArray(rawConfig.suspectBotIds)
        ? rawConfig.suspectBotIds.filter((id): id is string => typeof id === "string")
        : []),
      compact(rawConfig.prosecutorBotId ?? rawConfig.prosecutorPartnerBotId, 200),
      compact(rawConfig.rivalDefenseBotId, 200),
      compact(rawConfig.judgeBotId, 200),
      ...(Array.isArray(rawConfig.jurorBotIds)
        ? rawConfig.jurorBotIds.filter((id): id is string => typeof id === "string")
        : []),
      ...stored.graph.lines.flatMap((line) => line.speakerBotId ? [line.speakerBotId] : []),
    ];
    const bots = botRows(db, userId, roleBotIds);
    const migrated = migrateDebateMysteryPlayerRoleContractV2({
      privateCase: stored.privateCase,
      graph: stored.graph,
      publicState: original.formatState,
      botRows: bots,
      // Replays promise byte-identical authored performances and zero voice
      // generation. Repair original active compilations only; completed source
      // runs and their replay copies remain immutable historical artifacts.
      repairMismatchedPresentRecordTitles:
        mysteryV2CaseRow(db, userId, sessionId).run_ordinal === 1,
    });
    const migratedCheckpoint = migrateDebateMysteryPlayerRoleContractV2({
      privateCase: migrated.privateCase,
      graph: migrated.graph,
      publicState: compiledCheckpoint.publicState,
      botRows: bots,
      repairMismatchedPresentRecordTitles: false,
    });
    const checkpointChanged =
      JSON.stringify(compiledCheckpoint.privateCase) !== JSON.stringify(migrated.privateCase) ||
      JSON.stringify(compiledCheckpoint.graph) !== JSON.stringify(migrated.graph) ||
      JSON.stringify(compiledCheckpoint.publicState) !==
        JSON.stringify(migratedCheckpoint.publicState);
    const manifest = loadAudioManifest(db, userId, sessionId);
    const contractHash = debateMysteryPlayContractHashV2({
      db,
      userId,
      graph: migrated.graph,
      privateCase: migrated.privateCase,
      botRows: bots,
      manifest,
      session: original,
    });
    const audioCurrent = !migrated.publicState.voicesEnabled ||
      audioManifestMatchesCurrentContractV2({
        db,
        userId,
        graph: migrated.graph,
        privateCase: migrated.privateCase,
        botRows: bots,
        manifest,
        session: original,
      });
    if (
      !migrated.changed &&
      !checkpointChanged &&
      audioCurrent &&
      original.formatState.readiness.status === "ready" &&
      original.formatState.readiness.contractHash === contractHash
    ) return original;

    let current = persistMysteryV2ReadinessMigration(db, userId, original, {
      ...migrated.publicState,
      readiness: {
        version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
        status: "repairing",
        spoilerSafeMessage: "Updating the finite local case pack",
        contractHash: null,
        checkedAt: null,
      },
    }, migratedCheckpoint.publicState,
      migrated.privateCase,
      migrated.graph,
    );
    if (migrated.publicState.voicesEnabled && !audioCurrent) {
      await prepareLocalAudioPackV2({
        db,
        userId,
        sessionId,
        graph: migrated.graph,
        privateCase: migrated.privateCase,
        botRows: bots,
        generateWave: options.generateWave,
      });
    }
    const repairedManifest = loadAudioManifest(db, userId, sessionId);
    if (
      migrated.publicState.voicesEnabled &&
      !audioManifestMatchesCurrentContractV2({
        db,
        userId,
        graph: migrated.graph,
        privateCase: migrated.privateCase,
        botRows: bots,
        manifest: repairedManifest,
        session: original,
      })
    ) throw new Error("The repaired local audio pack did not match the current player-role contract.");
    current = getDebateSession(db, userId, sessionId);
    return persistMysteryV2ReadinessMigration(db, userId, current, {
      ...migrated.publicState,
      readiness: {
        version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
        status: "ready",
        spoilerSafeMessage: "The finite local case pack is ready",
        contractHash,
        checkedAt: new Date().toISOString(),
      },
      audioReady: migrated.publicState.voicesEnabled,
      localAudioFailure: null,
    }, migratedCheckpoint.publicState, migrated.privateCase, migrated.graph);
  } catch (error) {
    const current = getDebateSession(db, userId, sessionId);
    if (
      current.status === "completed" ||
      current.formatState.format !== "whodunnit" ||
      current.formatState.version !== 2 ||
      current.formatState.playPhase === "verdict"
    ) return current;
    return persistV2Session(db, userId, current, {
      ...current.formatState,
      readiness: {
        version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
        status: "failed",
        spoilerSafeMessage: "The local case pack needs attention before play can resume",
        contractHash: null,
        checkedAt: new Date().toISOString(),
      },
      audioReady: false,
      localAudioFailure: error instanceof Error
        ? `Local case repair failed: ${error.message.slice(0, 500)}`
        : "Local case repair failed.",
    });
  }
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

export interface DebateMysteryV2BackupV1 {
  cases: Array<{
    sessionId: string;
    /** Optional for backups created before replayable case families shipped. */
    caseFamilyId?: string;
    /** Optional for backups created before replayable case families shipped. */
    runOrdinal?: number;
    schemaVersion: number;
    privateCaseJson: string;
    dialogueGraphJson: string;
    caseHash: string;
    graphHash: string;
    validationJson: string;
    createdAt: string;
    updatedAt: string;
  }>;
  jobs: Array<{
    id: string;
    sessionId: string;
    status: MysteryV2JobRow["status"];
    stage: DebateMysteryCompilationStageV2;
    attempt: number;
    completedPasses: number;
    totalPasses: number;
    preparedAudioCount: number;
    requiredAudioCount: number;
    publicMessage: string;
    privateError: string | null;
    inputJson: string;
    checkpointJson: string | null;
    cancellationRequested: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  manifests: Array<{
    sessionId: string;
    status: "preparing" | "complete" | "failed" | "silent";
    manifestJson: string;
    createdAt: string;
    updatedAt: string;
  }>;
  clips: Array<{
    cacheKey: string;
    mimeType: string;
    sha256: string;
    byteSize: number;
    durationMs: number;
    audioBase64: string;
    createdAt: string;
    lastUsedAt: string;
  }>;
  references: Array<{
    sessionId: string;
    lineId: string;
    cacheKey: string;
    createdAt: string;
  }>;
}

/**
 * Account backups are encrypted by the caller. V2 deliberately embeds the
 * referenced local WAV bytes so Archive and replay never need regeneration.
 */
export function exportDebateMysteryV2BackupV1(
  db: DatabaseSync,
  userId: string,
): DebateMysteryV2BackupV1 {
  const cases = db.prepare(
    `SELECT mystery.*
       FROM debate_mystery_v2_cases AS mystery
       JOIN debate_sessions AS session ON session.id = mystery.session_id
      WHERE mystery.user_id = ? AND session.status != 'cancelled'
      ORDER BY mystery.created_at`,
  ).all(userId) as Array<Record<string, string | number | null>>;
  const jobs = db.prepare(
    `SELECT job.*
       FROM debate_mystery_v2_jobs AS job
       JOIN debate_sessions AS session ON session.id = job.session_id
      WHERE job.user_id = ? AND session.status != 'cancelled'
      ORDER BY job.created_at`,
  ).all(userId) as Array<Record<string, string | number | null>>;
  const manifests = db.prepare(
    `SELECT manifest.*
       FROM debate_mystery_audio_manifests AS manifest
       JOIN debate_sessions AS session ON session.id = manifest.session_id
      WHERE manifest.user_id = ? AND session.status != 'cancelled'
      ORDER BY manifest.created_at`,
  ).all(userId) as Array<Record<string, string | number | null>>;
  const references = db.prepare(
    `SELECT reference.*
       FROM debate_mystery_audio_refs AS reference
       JOIN debate_sessions AS session ON session.id = reference.session_id
      WHERE reference.user_id = ? AND session.status != 'cancelled'
      ORDER BY reference.session_id, reference.line_id`,
  ).all(userId) as Array<Record<string, string | number | null>>;
  const clips = db.prepare(
    `SELECT DISTINCT cache.cache_key, cache.clip_path, cache.mime_type,
            cache.sha256, cache.byte_size, cache.duration_ms,
            cache.created_at, cache.last_used_at
       FROM debate_mystery_audio_cache AS cache
       JOIN debate_mystery_audio_refs AS reference
         ON reference.cache_key = cache.cache_key
       JOIN debate_sessions AS session ON session.id = reference.session_id
      WHERE cache.user_id = ? AND reference.user_id = ?
        AND session.status != 'cancelled'
      ORDER BY cache.created_at, cache.cache_key`,
  ).all(userId, userId) as Array<Record<string, string | number | null>>;

  return {
    cases: cases.map((row) => ({
      sessionId: String(row.session_id),
      caseFamilyId: String(row.case_family_id || row.session_id),
      runOrdinal: Number(row.run_ordinal || 1),
      schemaVersion: Number(row.schema_version),
      privateCaseJson: String(row.private_case_json),
      dialogueGraphJson: String(row.dialogue_graph_json),
      caseHash: String(row.case_hash),
      graphHash: String(row.graph_hash),
      validationJson: String(row.validation_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    jobs: jobs.map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      status: String(row.status) as MysteryV2JobRow["status"],
      stage: String(row.stage) as DebateMysteryCompilationStageV2,
      attempt: Number(row.attempt),
      completedPasses: Number(row.completed_passes),
      totalPasses: Number(row.total_passes),
      preparedAudioCount: Number(row.prepared_audio_count),
      requiredAudioCount: Number(row.required_audio_count),
      publicMessage: String(row.public_message),
      privateError: typeof row.private_error === "string" ? row.private_error : null,
      inputJson: String(row.input_json),
      checkpointJson: typeof row.checkpoint_json === "string" ? row.checkpoint_json : null,
      cancellationRequested: row.cancellation_requested === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    manifests: manifests.map((row) => ({
      sessionId: String(row.session_id),
      status: String(row.status) as "preparing" | "complete" | "failed" | "silent",
      manifestJson: String(row.manifest_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    clips: clips.map((row) => {
      const entry = {
        clipPath: String(row.clip_path),
        sha256: String(row.sha256),
        byteSize: Number(row.byte_size),
      };
      if (!audioFileValid(entry)) {
        throw new Error("A referenced Whodunnit V2 recording failed backup integrity verification.");
      }
      const bytes = readFileSync(resolveAbsoluteUnderDataRoot(entry.clipPath));
      return {
        cacheKey: String(row.cache_key),
        mimeType: String(row.mime_type),
        sha256: entry.sha256,
        byteSize: entry.byteSize,
        durationMs: Number(row.duration_ms),
        audioBase64: bytes.toString("base64"),
        createdAt: String(row.created_at),
        lastUsedAt: String(row.last_used_at),
      };
    }),
    references: references.map((row) => ({
      sessionId: String(row.session_id),
      lineId: String(row.line_id),
      cacheKey: String(row.cache_key),
      createdAt: String(row.created_at),
    })),
  };
}

export function importDebateMysteryV2BackupV1(
  db: DatabaseSync,
  userId: string,
  backup: DebateMysteryV2BackupV1,
  restoredSessionIds: ReadonlySet<string>,
): void {
  const statuses = new Set<MysteryV2JobRow["status"]>([
    "queued", "running", "needs_attention", "complete", "cancelled",
  ]);
  const stages = new Set<DebateMysteryCompilationStageV2>([
    "writing_case", "testing_contradictions", "directing_performances",
    "preparing_local_voices", "verifying_case_audio", "complete",
    "needs_attention", "cancelled",
  ]);
  const manifestStatuses = new Set(["preparing", "complete", "failed", "silent"]);
  const requireSession = (sessionId: string): void => {
    if (!sessionId?.trim() || !restoredSessionIds.has(sessionId)) {
      throw new Error("Account backup contains orphaned Whodunnit V2 data.");
    }
  };
  const parseJson = (value: string, label: string): unknown => {
    try { return JSON.parse(value); }
    catch { throw new Error(`Account backup contains invalid ${label} JSON.`); }
  };

  const importedFamilyRuns = new Set<string>();
  for (const mystery of backup.cases ?? []) {
    requireSession(mystery.sessionId);
    const caseFamilyId = mystery.caseFamilyId?.trim() || mystery.sessionId;
    const runOrdinal = mystery.runOrdinal ?? 1;
    if (
      mystery.schemaVersion !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
      !Number.isInteger(runOrdinal) || runOrdinal < 1 ||
      sha256(mystery.privateCaseJson) !== mystery.caseHash ||
      sha256(mystery.dialogueGraphJson) !== mystery.graphHash
    ) {
      throw new Error("Account backup contains a corrupted Whodunnit V2 case.");
    }
    const familyRunKey = `${caseFamilyId}\u0000${runOrdinal}`;
    if (importedFamilyRuns.has(familyRunKey)) {
      throw new Error("Account backup contains duplicate Whodunnit V2 Run numbers.");
    }
    importedFamilyRuns.add(familyRunKey);
    const privateCase = parseJson(mystery.privateCaseJson, "Whodunnit V2 private case") as PrivateMysteryCaseV2;
    const graph = parseJson(mystery.dialogueGraphJson, "Whodunnit V2 dialogue graph") as DebateMysteryDialogueGraphV2;
    parseJson(mystery.validationJson, "Whodunnit V2 validation");
    const graphValidation = validateDebateMysteryDialogueGraphV2({
      graph,
      suspectSeatIds: privateCase.actorAccounts.map((account) => account.seatId),
      recordReferences: privateCase.recordItems.map((item) => item.reference),
      playerRole: privateCase.config.playerRole,
      roomIds: privateCase.investigationRoomIds,
      personIds: privateCase.investigationPersonIds,
      hotspotIdsByRoom: privateCase.investigationHotspotIdsByRoom,
      eyewitnessSeatId: privateCase.eyewitnessSeatId,
      accusedAlibiSupportDiscoveryIds: privateCase.accusedAlibiSupportDiscoveryIds,
    });
    if (!graphValidation.valid) {
      throw new Error("Account backup contains an invalid Whodunnit V2 dialogue graph.");
    }
    db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_v2_cases
         (session_id, user_id, case_family_id, run_ordinal, schema_version,
          private_case_json,
          dialogue_graph_json, case_hash, graph_hash, validation_json,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mystery.sessionId, userId, caseFamilyId, runOrdinal, mystery.privateCaseJson,
      mystery.dialogueGraphJson, mystery.caseHash, mystery.graphHash,
      mystery.validationJson, mystery.createdAt, mystery.updatedAt,
    );
  }

  for (const job of backup.jobs ?? []) {
    requireSession(job.sessionId);
    if (
      !job.id?.trim() || !statuses.has(job.status) || !stages.has(job.stage) ||
      !Number.isInteger(job.attempt) || job.attempt < 0 ||
      !Number.isInteger(job.completedPasses) || job.completedPasses < 0 ||
      !Number.isInteger(job.totalPasses) || job.totalPasses < 1 ||
      !Number.isInteger(job.preparedAudioCount) || job.preparedAudioCount < 0 ||
      !Number.isInteger(job.requiredAudioCount) || job.requiredAudioCount < 0
    ) throw new Error("Account backup contains an invalid Whodunnit V2 compilation job.");
    parseJson(job.inputJson, "Whodunnit V2 compilation input");
    if (job.checkpointJson) parseJson(job.checkpointJson, "Whodunnit V2 checkpoint");
    const restoredStatus = job.status === "running" ? "queued" : job.status;
    db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_v2_jobs
         (id, user_id, session_id, status, stage, attempt, completed_passes,
          total_passes, prepared_audio_count, required_audio_count,
          public_message, private_error, input_json, checkpoint_json,
          lease_owner, leased_until, cancellation_requested, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    ).run(
      job.id, userId, job.sessionId, restoredStatus, job.stage, job.attempt,
      job.completedPasses, job.totalPasses, job.preparedAudioCount,
      job.requiredAudioCount, job.publicMessage, job.privateError,
      job.inputJson, job.checkpointJson, job.cancellationRequested ? 1 : 0,
      job.createdAt, job.updatedAt,
    );
  }

  const clipByKey = new Map<string, DebateMysteryV2BackupV1["clips"][number]>();
  for (const clip of backup.clips ?? []) {
    if (!/^[a-f0-9]{64}$/u.test(clip.cacheKey) || !/^[a-f0-9]{64}$/u.test(clip.sha256)) {
      throw new Error("Account backup contains an invalid Whodunnit V2 recording key.");
    }
    const bytes = Buffer.from(clip.audioBase64, "base64");
    if (
      clip.mimeType !== "audio/wav" || bytes.byteLength !== clip.byteSize ||
      sha256(bytes) !== clip.sha256 || !isPlayablePcmWave(bytes) ||
      !Number.isInteger(clip.durationMs) || clip.durationMs <= 0
    ) throw new Error("Account backup contains a corrupted Whodunnit V2 recording.");
    const existing = db.prepare(
      "SELECT user_id FROM debate_mystery_audio_cache WHERE cache_key = ?",
    ).get(clip.cacheKey) as { user_id: string } | undefined;
    if (existing && existing.user_id !== userId) {
      throw new Error("Account backup Whodunnit audio key belongs to another account.");
    }
    const clipPath = audioCacheRelativePath(userId, clip.cacheKey);
    writeAudioAtomically(clipPath, bytes);
    db.prepare(
      `INSERT INTO debate_mystery_audio_cache
         (cache_key, user_id, clip_path, mime_type, sha256, byte_size,
          duration_ms, ref_count, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         clip_path = excluded.clip_path, mime_type = excluded.mime_type,
         sha256 = excluded.sha256, byte_size = excluded.byte_size,
         duration_ms = excluded.duration_ms, last_used_at = excluded.last_used_at
       WHERE debate_mystery_audio_cache.user_id = excluded.user_id`,
    ).run(
      clip.cacheKey, userId, clipPath, clip.mimeType, clip.sha256,
      clip.byteSize, clip.durationMs, clip.createdAt, clip.lastUsedAt,
    );
    clipByKey.set(clip.cacheKey, clip);
  }

  const referenceByLine = new Map<string, DebateMysteryV2BackupV1["references"][number]>();
  for (const reference of backup.references ?? []) {
    requireSession(reference.sessionId);
    if (!reference.lineId?.trim() || !clipByKey.has(reference.cacheKey)) {
      throw new Error("Account backup contains an invalid Whodunnit V2 audio reference.");
    }
    db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_audio_refs
         (session_id, user_id, line_id, cache_key, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(reference.sessionId, userId, reference.lineId, reference.cacheKey, reference.createdAt);
    referenceByLine.set(`${reference.sessionId}:${reference.lineId}`, reference);
  }
  db.prepare(
    `UPDATE debate_mystery_audio_cache
        SET ref_count = (
          SELECT COUNT(*) FROM debate_mystery_audio_refs AS reference
           WHERE reference.user_id = debate_mystery_audio_cache.user_id
             AND reference.cache_key = debate_mystery_audio_cache.cache_key
        )
      WHERE user_id = ?`,
  ).run(userId);

  const caseBySession = new Map(backup.cases.map((item) => [item.sessionId, item]));
  for (const stored of backup.manifests ?? []) {
    requireSession(stored.sessionId);
    if (!manifestStatuses.has(stored.status)) {
      throw new Error("Account backup contains an invalid Whodunnit V2 audio manifest status.");
    }
    const manifest = parseJson(stored.manifestJson, "Whodunnit V2 audio manifest") as DebateMysteryAudioManifestV1;
    manifest.entries = manifest.entries.map((entry) => {
      const reference = referenceByLine.get(`${stored.sessionId}:${entry.lineId}`);
      const clip = reference ? clipByKey.get(reference.cacheKey) : null;
      if (!clip) throw new Error("Account backup is missing a Whodunnit V2 recording referenced by its manifest.");
      return {
        ...entry,
        clipPath: audioCacheRelativePath(userId, reference!.cacheKey),
        mimeType: clip.mimeType,
        sha256: clip.sha256,
        byteSize: clip.byteSize,
        durationMs: clip.durationMs,
      };
    });
    const compiled = caseBySession.get(stored.sessionId);
    if (stored.status === "complete") {
      if (!compiled) throw new Error("Account backup is missing the compiled case for a complete audio pack.");
      const graph = JSON.parse(compiled.dialogueGraphJson) as DebateMysteryDialogueGraphV2;
      const privateCase = JSON.parse(compiled.privateCaseJson) as PrivateMysteryCaseV2;
      const result = validateDebateMysteryAudioManifestV1({
        graph,
        manifest,
        reachableSpokenLineIds: privateCase.graphValidation.reachableSpokenLineIds,
      });
      if (!result.valid || manifest.entries.some((entry) => !audioFileValid(entry))) {
        throw new Error("Account backup contains an incomplete Whodunnit V2 audio pack.");
      }
    }
    db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_audio_manifests
         (session_id, user_id, status, manifest_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      stored.sessionId, userId, stored.status, JSON.stringify(manifest),
      stored.createdAt, stored.updatedAt,
    );
  }
}

function mysteryRecordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
}

export function resolveDebateMysteryTalkExchangeV2(
  graph: DebateMysteryDialogueGraphV2,
  topicNodeId: string,
  suspectSeatId: string,
  repeatOrdinal = 0,
): { questionNodeId: string | null; responseNodeId: string } | null {
  const topicNode = graph.nodes.find((entry) => entry.id === topicNodeId);
  if (topicNode?.kind !== "talk_topic" || !topicNode.lineId) return null;
  let questionNodeId: string | null = null;
  let responseNode: DebateMysteryDialogueNodeV2 | undefined;

  // Cases frozen before prosecution questions became their own authored line
  // store the suspect response directly on the public Talk topic node.
  if (topicNode.speakerSeatId === suspectSeatId) {
    responseNode = topicNode;
  } else if (
    topicNode.speakerSeatId !== null ||
    topicNode.intendedRecipientSeatId !== suspectSeatId ||
    graph.lines.find((line) => line.id === topicNode.lineId)?.speakerKind !== "player"
  ) {
    return null;
  } else {
    questionNodeId = topicNode.id;
    responseNode = topicNode.nextNodeIds
      .map((nodeId) => graph.nodes.find((entry) => entry.id === nodeId))
      .find((node) => {
        if (node?.kind !== "talk_topic" || node.speakerSeatId !== suspectSeatId || !node.lineId) {
          return false;
        }
        return graph.lines.find((line) => line.id === node.lineId)?.speakerKind === "bot";
      });
  }
  if (!responseNode) return null;
  if (repeatOrdinal > 0) {
    const repeatNodeIds = graph.repeatResponseNodeIdsByTopic?.[topicNodeId] ?? [];
    const repeatNode = repeatNodeIds.length
      ? graph.nodes.find((node) => node.id === repeatNodeIds[(repeatOrdinal - 1) % repeatNodeIds.length])
      : null;
    if (
      repeatNode?.kind === "talk_topic" &&
      repeatNode.speakerSeatId === suspectSeatId &&
      repeatNode.lineId &&
      graph.lines.find((line) => line.id === repeatNode.lineId)?.speakerKind === "bot"
    ) return { questionNodeId, responseNodeId: repeatNode.id };
  }
  return { questionNodeId, responseNodeId: responseNode.id };
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
    const existingTopic = topics.find((topic) => topic.nodeId === topicNodeId);
    if (existingTopic) {
      existingTopic.unlocked = true;
      continue;
    }
    const topicNode = args.graph.nodes.find((candidate) => candidate.id === topicNodeId);
    const suspectSeatId = topicNode?.intendedRecipientSeatId ?? topicNode?.speakerSeatId ?? null;
    if (!topicNode?.label || !suspectSeatId) continue;
    topics.push({
      nodeId: topicNode.id,
      suspectSeatId,
      label: topicNode.label,
      subject: topicNode.talkSubject ?? normalizeDebateMysteryTalkSubjectV2({
        value: null,
        label: topicNode.label,
        rooms: args.state.rooms.map((room) => ({ id: room.id, name: room.name })),
        people: [
          ...(args.state.victim ? [{ id: args.state.victim.id, name: args.state.victim.name }] : []),
          ...args.state.suspects.map((suspect) => ({ id: suspect.seatId, name: suspect.name })),
        ],
      }),
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
          // Examination is a written observation, never a performed line. Keep
          // this true for frozen V2 graphs too, without regenerating their packs.
          lineId: node.kind === "examination_result" ? null : line.id,
          delivery: publicMysteryLineDeliveryV2(line, node.kind),
          stageActionText: line.stageActionText,
          visibleText: line.visibleText,
          speakerSeatId: node.speakerSeatId,
          speakerBotId: publicMysteryLineSpeakerBotIdV2(line),
          speakerKind: line.speakerKind,
          ...(node.intendedRecipientSeatId
            ? { intendedRecipientSeatId: node.intendedRecipientSeatId }
            : {}),
          ...(node.intendedRecipientBotId
            ? { intendedRecipientBotId: node.intendedRecipientBotId }
            : {}),
          occurredAt: now,
        }]
      : args.state.dialogueHistory,
  };
}

function applyDebateMysteryPresentationGatesV2(args: {
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  suspectSeatId: string;
  record: DebateMysteryRecordReferenceV2;
  presentNodeId: string;
}): DebateWhodunnitFormatStateV2 {
  const recordKey = mysteryRecordKey(args.record);
  const gates = (args.graph.presentationGates ?? []).filter((gate) =>
    gate.requiredSuspectSeatId === args.suspectSeatId &&
    mysteryRecordKey(gate.requiredRecord) === recordKey &&
    gate.correctPresentNodeId === args.presentNodeId);
  if (!gates.length) return args.state;

  const now = new Date().toISOString();
  const rooms = args.state.rooms.map((room) => ({
    ...room,
    hotspots: room.hotspots.map((hotspot) => ({ ...hotspot })),
  }));
  const topics = args.state.topics.map((topic) => ({ ...topic }));
  const records = args.state.record.map((item) => ({ ...item, reference: { ...item.reference } }));
  const discoveries = new Set(args.state.discoveryIds);
  const subjectRooms = rooms.map((room) => ({ id: room.id, name: room.name }));
  const subjectPeople = [
    ...(args.state.victim ? [{ id: args.state.victim.id, name: args.state.victim.name }] : []),
    ...args.state.suspects.map((suspect) => ({ id: suspect.seatId, name: suspect.name })),
  ];

  for (const gate of gates) {
    for (const target of gate.unlocks) {
      if (target.kind === "topic") {
        const existing = topics.find((topic) => topic.nodeId === target.topicNodeId);
        if (existing) {
          existing.unlocked = true;
          continue;
        }
        const node = args.graph.nodes.find((candidate) => candidate.id === target.topicNodeId);
        const suspectSeatId = node?.intendedRecipientSeatId ?? null;
        if (!node?.label || !suspectSeatId) continue;
        topics.push({
          nodeId: node.id,
          suspectSeatId,
          label: node.label,
          subject: node.talkSubject ?? normalizeDebateMysteryTalkSubjectV2({
            value: null,
            label: node.label,
            rooms: subjectRooms,
            people: subjectPeople,
          }),
          unlocked: true,
          completed: false,
        });
      } else if (target.kind === "room") {
        const room = rooms.find((candidate) => candidate.id === target.roomId);
        if (room) room.unlocked = true;
      } else if (target.kind === "hotspot") {
        const hotspot = rooms
          .find((room) => room.id === target.roomId)
          ?.hotspots.find((candidate) => candidate.id === target.hotspotId);
        if (hotspot) hotspot.unlocked = true;
      } else if (target.kind === "location_discovery") {
        discoveries.add(target.discoveryId);
      } else if (target.kind === "record_discovery" || target.kind === "record_description") {
        const targetKey = mysteryRecordKey(target.record);
        const existing = records.find((item) => mysteryRecordKey(item.reference) === targetKey);
        const frozen = args.privateCase.recordItems.find((item) =>
          mysteryRecordKey(item.reference) === targetKey);
        if (!frozen) throw new HttpError(409, "The authored presentation unlock references a missing Case File item.");
        if (existing) {
          existing.admitted = true;
          existing.updatedAt = now;
          if (target.kind === "record_description") existing.description = target.description;
        } else {
          records.push({
            ...frozen,
            description: target.kind === "record_description" ? target.description : frozen.description,
            admitted: true,
            updatedAt: now,
          });
        }
      }
    }
  }
  return {
    ...args.state,
    rooms,
    topics,
    record: records,
    discoveryIds: [...discoveries],
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
      stageActionText: line.stageActionText,
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
      defendantSeatId:
        debateMysteryTheoryAccusedSeatIdsV2(args.state.theory)[0] ??
        (args.state.config.investigationMode === "court_only"
          ? privateMysteryResponsibleSeatIdsV2(args.privateCase)[0] ?? null
          : null),
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
  const firstStatement = args.chapter.statementVersions.find(
    (statement) => statement.statementId === args.chapter.initialStatementIds[0],
  );
  const firstStatementLine = firstStatement
    ? args.graph.lines.find((line) => line.id === firstStatement.lineId)
    : null;
  if (firstStatementLine) {
    next = executeDialogueNodeV2({
      state: next,
      graph: args.graph,
      privateCase: args.privateCase,
      nodeId: firstStatementLine.nodeId,
    });
  }
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

function privateMysteryResponsibleSeatIdsV2(
  privateCase: PrivateMysteryCaseV2,
): string[] {
  const explicit = privateCase.sealedResponsibleSeatIds?.filter(Boolean) ?? [];
  return [...new Set(explicit.length ? explicit : [privateCase.sealedCulpritSeatId])];
}

function jurorVerdictV2(args: {
  session: DebateSessionV1;
  state: DebateWhodunnitFormatStateV2;
  privateCase: PrivateMysteryCaseV2;
  proofEstablished: boolean;
}): DebateMysteryVerdictV2 {
  const accusedSeatIds = debateMysteryTheoryAccusedSeatIdsV2(args.state.theory);
  const responsibleSeatIds = privateMysteryResponsibleSeatIdsV2(args.privateCase);
  const responsibleSeatIdSet = new Set(responsibleSeatIds);
  const ballots = args.state.config.trialType === "jury"
    ? accusedSeatIds.flatMap((defendantSeatId) => {
      const accused = args.state.suspects.find((suspect) => suspect.seatId === defendantSeatId);
      return args.session.jury.jurors.map((juror) => {
        const predisposition = args.session.voterPredispositions?.find((entry) => entry.voterBotId === juror.id);
        const personaNoise = (Number.parseInt(sha256(`${args.session.id}:${juror.id}:${defendantSeatId}:verdict`).slice(0, 8), 16) / 0xffffffff - 0.5) * 0.35;
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
          defendantSeatId,
          vote,
          reason: powerAffected
            ? "A shared Power overrode this juror's ordinary proof assessment."
            : predisposition?.rationale || (vote === "guilty" ? "The admitted contradictions proved the charge." : "The prosecution did not eliminate reasonable doubt."),
          powerAffected,
        };
      });
    })
    : [];
  const proofSafe = args.proofEstablished && (args.state.theory?.evidenceIds.length ?? 0) > 0;
  const defendantVerdicts = accusedSeatIds.map((seatId) => {
    const guiltyVotes = ballots.filter(
      (ballot) => ballot.defendantSeatId === seatId && ballot.vote === "guilty",
    ).length;
    const legalResult = args.state.config.trialType === "bench"
      ? args.proofEstablished ? "guilty" as const : "not_guilty" as const
      : guiltyVotes >= 3 ? "guilty" as const : "not_guilty" as const;
    const factuallyResponsible = responsibleSeatIdSet.has(seatId);
    return {
      seatId,
      legalResult,
      factuallyResponsible,
      classification: debateMysteryClassifyVerdictV2({
        legalResult,
        accusedIsCulprit: factuallyResponsible,
        proofEstablished: args.proofEstablished,
        proofSafe,
      }),
    };
  });
  const legalResult = defendantVerdicts.some((entry) => entry.legalResult === "guilty")
    ? "guilty" as const
    : "not_guilty" as const;
  const accusationCorrect = debateMysteryAccusationMatchesV2(accusedSeatIds, responsibleSeatIds);
  const classification = defendantVerdicts.find(
    (entry) => entry.classification === "wrongful_conviction",
  )?.classification ?? defendantVerdicts[0]?.classification ?? "failed_prosecution";
  return {
    legalResult,
    classification,
    accusationCorrect,
    defendantVerdicts,
    sealedCulpritCorrect: accusedSeatIds[0] === args.privateCase.sealedCulpritSeatId,
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
  const accusedSeatIds = debateMysteryTheoryAccusedSeatIdsV2(state.theory);
  const responsibleSeatIds = privateMysteryResponsibleSeatIdsV2(privateCase);
  const responsibleSeatIdSet = new Set(responsibleSeatIds);
  const defendantVerdicts = accusedSeatIds.map((seatId) => {
    const factuallyResponsible = responsibleSeatIdSet.has(seatId);
    return {
      seatId,
      legalResult: "not_guilty" as const,
      factuallyResponsible,
      classification: debateMysteryClassifyVerdictV2({
        legalResult: "not_guilty",
        accusedIsCulprit: factuallyResponsible,
        proofEstablished: false,
        proofSafe: false,
      }),
    };
  });
  const verdict: DebateMysteryVerdictV2 = {
    legalResult: "not_guilty",
    classification: defendantVerdicts[0]?.classification ?? "failed_prosecution",
    accusationCorrect: debateMysteryAccusationMatchesV2(accusedSeatIds, responsibleSeatIds),
    defendantVerdicts,
    sealedCulpritCorrect: accusedSeatIds[0] === privateCase.sealedCulpritSeatId,
    proofGrade: "failed",
    jurorBallots: state.config.trialType === "jury"
      ? accusedSeatIds.flatMap((defendantSeatId) => state.config.jurorBotIds.map((jurorBotId) => ({
          jurorBotId,
          defendantSeatId,
          vote: "not_guilty" as const,
          reason: "The prosecution exhausted its credibility before proving the active testimony.",
          powerAffected: false,
        })))
      : [],
    deliveredAt: new Date().toISOString(),
  };
  return addCallouts({ ...state, playPhase: "verdict", verdict }, ["not_guilty"], null);
}

function prepareSpectatorTheoryV2(args: {
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
}): DebateWhodunnitFormatStateV2 {
  const accusedSeatIds = privateMysteryResponsibleSeatIdsV2(args.privateCase);
  const accused = accusedSeatIds.map((seatId) =>
    args.state.suspects.find((suspect) => suspect.seatId === seatId));
  if (accused.some((suspect) => !suspect)) {
    throw new HttpError(409, "The automated Prosecutor could not form a reviewable conclusion.");
  }
  const accusedNames = accused.map((suspect) => suspect!.name).join(" and ");
  const admittedReferences = debateMysterySpectatorEvidenceReferencesV2(args.graph);
  const admittedKeys = new Set(admittedReferences.map(mysteryRecordKey));
  const now = new Date().toISOString();
  const record = args.privateCase.recordItems.flatMap((item) =>
    admittedKeys.has(mysteryRecordKey(item.reference))
      ? [{ ...item, admitted: true, updatedAt: now }]
      : [],
  );
  if (!record.length) {
    throw new HttpError(409, "The automated Prosecutor could not assemble an admissible public record.");
  }
  return {
    ...args.state,
    playPhase: "theory",
    // The spectator never receives the mansion graph or its unused clues.
    rooms: [],
    currentRoomId: null,
    roomView: "mansion",
    topics: [],
    discoveryIds: ["briefing:complete", "prosecutor:investigation-complete"],
    metSuspectSeatIds: args.state.suspects.map((suspect) => suspect.seatId),
    record,
    dialogueHistory: [{
      nodeId: "prosecutor-offstage-investigation",
      lineId: null,
      stageActionText: null,
      visibleText: `The selected Prosecutor investigated the mansion and proposed charges against ${accusedNames}. Review the admitted physical findings and revise the conclusion before filing it.`,
      speakerSeatId: null,
      speakerBotId: args.state.config.prosecutorBotId,
      speakerKind: "bot",
      occurredAt: now,
    }],
    activeDialogueNodeId: "prosecutor-offstage-investigation",
    theoryAvailable: true,
    // This is an editable public hypothesis, not the private incident plan.
    theory: debateMysteryTheoryWithAccusedSeatIdsV2({
      culpritSeatId: null,
      accompliceSeatId: null,
      incidentId: args.state.caseCharge?.incidentId,
      claim: args.state.caseCharge?.accusationPrompt,
      method: args.privateCase.method,
      motive: args.privateCase.motive,
      opportunity: "The admitted timeline and physical record place the accused within the decisive incident window.",
      evidenceIds: admittedReferences.map((reference) => reference.id),
      testimonyIds: [],
    }, accusedSeatIds),
    theoryFiledAt: null,
    court: null,
    pendingProsecutionChoice: null,
  };
}

function prepareCourtOnlyTrialV2(args: {
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
}): DebateWhodunnitFormatStateV2 {
  const accusedSeatIds = privateMysteryResponsibleSeatIdsV2(args.privateCase);
  if (accusedSeatIds.some((seatId) =>
    !args.state.suspects.some((suspect) => suspect.seatId === seatId))) {
    throw new HttpError(409, "The court filing has no valid defendant.");
  }
  const admittedReferences = debateMysterySpectatorEvidenceReferencesV2(args.graph);
  const admittedKeys = new Set(admittedReferences.map(mysteryRecordKey));
  const now = new Date().toISOString();
  const record = args.privateCase.recordItems.flatMap((item) =>
    item.reference.kind === "evidence" && admittedKeys.has(mysteryRecordKey(item.reference))
      ? [{ ...item, admitted: true, updatedAt: now }]
      : [],
  );
  if (!record.length) {
    throw new HttpError(409, "The court-only case has no admissible prosecution record.");
  }
  const firstChapter = [...args.graph.witnessChapters]
    .sort((a, b) => a.ordinal - b.ordinal)[0];
  if (!firstChapter) throw new HttpError(409, "The authored court has no witnesses.");
  let state: DebateWhodunnitFormatStateV2 = {
    ...args.state,
    rooms: [],
    currentRoomId: null,
    roomView: "mansion",
    roomIntroductions: {},
    topics: [],
    discoveryIds: ["court:ready"],
    metSuspectSeatIds: args.state.suspects.map((suspect) => suspect.seatId),
    record,
    theoryAvailable: true,
    theory: debateMysteryTheoryWithAccusedSeatIdsV2({
      culpritSeatId: null,
      accompliceSeatId: null,
      incidentId: args.state.caseCharge?.incidentId,
      claim: args.state.caseCharge?.accusationPrompt,
      method: args.privateCase.method,
      motive: args.privateCase.motive,
      opportunity: "The admitted prosecution record places the defendant within the incident timeline and supplies the statement-level contradictions for trial.",
      evidenceIds: admittedReferences.map((reference) => reference.id),
      testimonyIds: [],
    }, accusedSeatIds),
    theoryFiledAt: now,
    court: null,
    pendingProsecutionChoice: null,
  };
  state = enterWitnessChapterV2({ state, graph: args.graph, privateCase: args.privateCase, chapter: firstChapter });
  return addCallouts(state, ["order"], null);
}

function advanceSpectatorTrialV2(args: {
  session: DebateSessionV1;
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
}): DebateWhodunnitFormatStateV2 {
  const court = args.state.court;
  if (args.state.playPhase !== "trial" || !court?.activeChapterId) {
    throw new HttpError(409, "The spectator trial is not ready to advance.");
  }
  const chapter = args.graph.witnessChapters.find(
    (entry) => entry.id === court.activeChapterId,
  );
  const proofStatement = chapter?.statementVersions.find(
    (statement) => statement.correctPresentations.length > 0,
  );
  if (!chapter || !proofStatement) {
    throw new HttpError(409, "The active witness has no admissible proof route.");
  }
  let state = args.state;
  if (state.activeDialogueNodeId === chapter.checkpointNodeId && court.activeStatementId) {
    const statement = chapter.statementVersions.find(
      (entry) => entry.statementId === court.activeStatementId,
    );
    const line = statement
      ? args.graph.lines.find((entry) => entry.id === statement.lineId)
      : null;
    if (!statement || !line) {
      throw new HttpError(409, "The active witness statement is unavailable.");
    }
    state = {
      ...state,
      activeDialogueNodeId: line.nodeId,
      dialogueHistory: [...state.dialogueHistory, {
        nodeId: line.nodeId,
        lineId: line.id,
        stageActionText: line.stageActionText,
        visibleText: line.visibleText,
        speakerSeatId: chapter.witnessSeatId,
        speakerBotId: line.speakerBotId,
        speakerKind: line.speakerKind,
        occurredAt: new Date().toISOString(),
      }],
    };
    return state;
  }
  const heardLineIds = new Set(state.dialogueHistory.flatMap((entry) =>
    entry.lineId ? [entry.lineId] : [],
  ));
  const unheardStatement = chapter.initialStatementIds
    .map((statementId) => chapter.statementVersions.find(
      (entry) => entry.statementId === statementId && entry.version === 1,
    ))
    .find((statement) => statement && !heardLineIds.has(statement.lineId));
  if (unheardStatement) {
    const line = args.graph.lines.find((entry) => entry.id === unheardStatement.lineId)!;
    state = {
      ...state,
      activeDialogueNodeId: line.nodeId,
      court: { ...court, activeStatementId: unheardStatement.statementId },
      dialogueHistory: [...state.dialogueHistory, {
        nodeId: line.nodeId,
        lineId: line.id,
        stageActionText: line.stageActionText,
        visibleText: line.visibleText,
        speakerSeatId: chapter.witnessSeatId,
        speakerBotId: line.speakerBotId,
        speakerKind: line.speakerKind,
        occurredAt: new Date().toISOString(),
      }],
    };
    return state;
  }
  if (court.activeStatementId !== proofStatement.statementId) {
    state = {
      ...state,
      court: { ...court, activeStatementId: proofStatement.statementId },
    };
    return state;
  }
  if (!court.statements.find((entry) => entry.statementId === proofStatement.statementId)?.pressed) {
    state = executeDialogueNodeV2({
      state,
      graph: args.graph,
      privateCase: args.privateCase,
      nodeId: proofStatement.pressNodeId,
    });
    state.court!.statements = state.court!.statements.map((entry) =>
      entry.statementId === proofStatement.statementId
        ? { ...entry, pressed: true }
        : entry,
    );
    const witness = state.suspects.find((entry) => entry.seatId === chapter.witnessSeatId);
    state = addCallouts(state, ["hold_it"], witness?.color ?? null);
    const choice = args.graph.prosecutionChoices.find((entry) => {
      const promptNode = args.graph.lines.find((line) => line.id === entry.promptLineId)?.nodeId;
      return args.graph.nodes.find((node) => node.id === promptNode)?.speakerSeatId === chapter.witnessSeatId ||
        args.graph.nodes.find((node) => node.id === promptNode)?.speakerSeatId === null;
    });
    if (choice && !state.discoveryIds.includes(`choice:${choice.id}`)) {
      const promptLine = args.graph.lines.find((line) => line.id === choice.promptLineId)!;
      state.pendingProsecutionChoice = {
        id: choice.id,
        prompt: promptLine.visibleText,
        options: choice.options.map((option) => ({
          id: option.id,
          text: args.graph.lines.find((line) => line.id === option.lineId)!.visibleText,
        })),
      };
    }
    return state;
  }
  if (state.pendingProsecutionChoice) {
    const choice = args.graph.prosecutionChoices.find(
      (entry) => entry.id === state.pendingProsecutionChoice!.id,
    );
    const option = choice?.options[0];
    if (!choice || !option) throw new HttpError(409, "The authored prosecution response is unavailable.");
    const optionLine = args.graph.lines.find((line) => line.id === option.lineId)!;
    const responseNode = args.graph.nodes.find((node) => node.id === option.responseNodeId);
    state.dialogueHistory.push({
      nodeId: option.responseNodeId,
      lineId: option.lineId,
      stageActionText: optionLine.stageActionText,
      visibleText: optionLine.visibleText,
      speakerSeatId: null,
      speakerBotId: optionLine.speakerBotId,
      speakerKind: optionLine.speakerKind,
      ...(responseNode?.speakerSeatId
        ? { intendedRecipientSeatId: responseNode.speakerSeatId }
        : {}),
      occurredAt: new Date().toISOString(),
    });
    state = executeDialogueNodeV2({
      state,
      graph: args.graph,
      privateCase: args.privateCase,
      nodeId: option.responseNodeId,
      choices: new Map([[choice.id, option.id]]),
    });
    state.discoveryIds = [...new Set([...state.discoveryIds, `choice:${choice.id}`])];
    state.pendingProsecutionChoice = null;
    return state;
  }
  const proof = proofStatement.correctPresentations[0]!;
  if (!state.record.some((item) => item.admitted && mysteryRecordKey(item.reference) === mysteryRecordKey(proof))) {
    throw new HttpError(409, "The automated Prosecutor's admissible proof is missing from the public record.");
  }
  const witness = state.suspects.find((entry) => entry.seatId === chapter.witnessSeatId);
  if (proofStatement.objectionNodeId) {
    state = executeDialogueNodeV2({
      state,
      graph: args.graph,
      privateCase: args.privateCase,
      nodeId: proofStatement.objectionNodeId,
    });
  }
  state = addCallouts(state, ["objection", "sustained"], args.session.againstAdvocate?.color ?? null);
  if (!proofStatement.revisionNodeId) {
    throw new HttpError(409, "This statement has no authored revision.");
  }
  state = executeDialogueNodeV2({
    state,
    graph: args.graph,
    privateCase: args.privateCase,
    nodeId: proofStatement.revisionNodeId,
  });
  const revisionLine = args.graph.lines.find(
    (line) => line.nodeId === proofStatement.revisionNodeId,
  )!;
  state.court!.statements = state.court!.statements.map((entry) =>
    entry.statementId === proofStatement.statementId
      ? {
          ...entry,
          version: entry.version + 1,
          versionId: `${entry.versionId}-revised`,
          lineId: revisionLine.id,
          visibleText: revisionLine.visibleText,
          stageActionText: revisionLine.stageActionText,
        }
      : entry,
  );
  state = executeDialogueNodeV2({
    state,
    graph: args.graph,
    privateCase: args.privateCase,
    nodeId: chapter.completionNodeId,
  });
  state = addCallouts(state, ["testimony_revised"], witness?.color ?? null);
  state.court!.completedChapterIds = [
    ...new Set([...state.court!.completedChapterIds, chapter.id]),
  ];
  const nextChapter = [...args.graph.witnessChapters]
    .sort((a, b) => a.ordinal - b.ordinal)
    .find((entry) => entry.ordinal === chapter.ordinal + 1);
  return nextChapter
    ? enterWitnessChapterV2({ state, graph: args.graph, privateCase: args.privateCase, chapter: nextChapter })
    : finalizeCourtV2({
        session: args.session,
        state,
        privateCase: args.privateCase,
        proofEstablished: true,
      });
}

type DebateMysteryRestartRequestV2 = {
  expectedRevision: number;
  idempotencyKey: string;
};

function requireMysteryV2Restart(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryRestartRequestV2,
): { session: DebateSessionV1; state: DebateWhodunnitFormatStateV2; key: string } {
  const key = compact(request.idempotencyKey, 200);
  if (!key) throw new HttpError(400, "A stable restart idempotency key is required.");
  const session = getDebateSession(db, userId, sessionId);
  if (session.revision !== request.expectedRevision) {
    throw new HttpError(409, "This case changed in another window. Refresh and try again.");
  }
  if (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
  ) {
    throw new HttpError(409, "Completed, cancelled, and failed cases remain immutable.");
  }
  if (session.formatState.format !== "whodunnit" || session.formatState.version !== 2) {
    throw new HttpError(409, "This session is not a Whodunnit V2 case.");
  }
  if (
    session.formatState.compilation.stage !== "complete" ||
    session.formatState.readiness.status !== "ready"
  ) {
    throw new HttpError(409, "Finish preparing the sealed case before restarting it.");
  }
  return { session, state: session.formatState, key };
}

function mysteryV2RestartedSession(
  session: DebateSessionV1,
  state: DebateWhodunnitFormatStateV2,
  kind: "investigation" | "court",
): DebateSessionV1 {
  return {
    ...session,
    status: "waiting_for_player",
    phase: kind === "court" ? "challenge" : "opening",
    stepKey: kind === "court" ? "mystery_v2_trial" : "mystery_v2_title",
    formatState: state,
    jury: resetMysteryV2JuryForReplay(session.jury),
    caseBoard: [],
    ballots: [],
    playerVerdict: null,
    winnerSideId: null,
    judgeGavel: null,
    judgeGavelCooldownUntil: null,
    objectionRuling: null,
    participantObjection: null,
    participantFloorBreak: null,
    participantFloorBreakPreparation: null,
    preparedResumeEventId: null,
    archiveReturnBuffer: null,
    events: [],
    error: null,
    endedEarlyAt: null,
    completedAt: null,
    synopsis: null,
    liveBake: null,
    pausedAt: null,
    pausedPresentationEventId: null,
    pausedDurationMs: 0,
  };
}

function recordMysteryV2Restart(
  db: DatabaseSync,
  userId: string,
  prior: DebateSessionV1,
  restarted: DebateSessionV1,
  key: string,
): void {
  db.prepare(
    `INSERT INTO debate_mutations
       (user_id, session_id, idempotency_key, expected_revision,
        result_revision, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    prior.id,
    key,
    prior.revision,
    restarted.revision,
    JSON.stringify(restarted),
    new Date().toISOString(),
  );
}

/** Rewind the open Run to its compiled title card without authoring a new case. */
export function restartDebateMysteryInvestigationV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryRestartRequestV2,
): DebateSessionV1 {
  const key = compact(request.idempotencyKey, 200);
  const replay = key ? replayV2Mutation(db, userId, sessionId, key) : null;
  if (replay) return replay;
  const { session, state, key: restartKey } = requireMysteryV2Restart(
    db,
    userId,
    sessionId,
    request,
  );
  if (state.config.investigationMode !== "full") {
    throw new HttpError(409, "This court-only case has no mansion investigation to restart.");
  }
  const row = jobRow(db, userId, sessionId);
  const checkpoint = row.checkpoint_json
    ? JSON.parse(row.checkpoint_json) as unknown
    : null;
  if (row.status !== "complete" || !isMysteryV2CompiledCheckpoint(checkpoint)) {
    throw new HttpError(409, "The compiled Whodunnit checkpoint is unavailable.");
  }
  // Validate the sealed row before trusting the compiled checkpoint.
  getDebateMysteryCaseV2(db, userId, sessionId);
  const now = new Date().toISOString();
  const resetState = initialMysteryV2ReplayState({
    checkpoint,
    sourceState: state,
    jobId: state.compilation.jobId,
    now,
    voicesEnabled: state.voicesEnabled,
    preparedAudioCount: state.compilation.preparedAudioCount,
  });
  const resetSession = mysteryV2RestartedSession(
    session,
    resetState,
    "investigation",
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    resetDebateMysteryAssetRevealsV1(db, userId, sessionId);
    db.prepare("DELETE FROM debate_events WHERE user_id = ? AND session_id = ?")
      .run(userId, sessionId);
    db.prepare("DELETE FROM debate_mutations WHERE user_id = ? AND session_id = ?")
      .run(userId, sessionId);
    db.prepare("DELETE FROM debate_mystery_actions WHERE user_id = ? AND session_id = ?")
      .run(userId, sessionId);
    const restarted = persistV2Session(
      db,
      userId,
      resetSession,
      resetState,
      session.revision,
    );
    recordMysteryV2Restart(db, userId, session, restarted, restartKey);
    appendV2Action(db, userId, sessionId, "restart_investigation", {});
    db.exec("COMMIT");
    return restarted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Rewind only the unlocked courtroom, retaining the filed public case record. */
export function restartDebateMysteryCourtV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryRestartRequestV2,
): DebateSessionV1 {
  const key = compact(request.idempotencyKey, 200);
  const replay = key ? replayV2Mutation(db, userId, sessionId, key) : null;
  if (replay) return replay;
  const { session, state, key: restartKey } = requireMysteryV2Restart(
    db,
    userId,
    sessionId,
    request,
  );
  if (state.playPhase !== "trial" || !state.theory || !state.theoryFiledAt || !state.court) {
    throw new HttpError(409, "Restart court is available only after this case has entered court.");
  }
  const { privateCase, graph } = getDebateMysteryCaseV2(db, userId, sessionId);
  const firstChapter = [...graph.witnessChapters]
    .sort((left, right) => left.ordinal - right.ordinal)[0];
  if (!firstChapter) throw new HttpError(409, "The authored court has no witnesses.");
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const filedAtMs = Date.parse(state.theoryFiledAt);
  const investigationDialogue = state.dialogueHistory.filter((entry) => {
    const node = nodeById.get(entry.nodeId);
    if (node) return node.scene === "investigation";
    const occurredAtMs = Date.parse(entry.occurredAt);
    return Number.isFinite(filedAtMs) && Number.isFinite(occurredAtMs)
      ? occurredAtMs < filedAtMs
      : false;
  });
  let resetState: DebateWhodunnitFormatStateV2 = {
    ...structuredClone(state),
    playPhase: "trial",
    dialogueHistory: investigationDialogue,
    activeDialogueNodeId: investigationDialogue.at(-1)?.nodeId ?? null,
    court: null,
    verdict: null,
    calloutHistory: [],
    pendingCallout: null,
    pendingProsecutionChoice: null,
  };
  resetState = enterWitnessChapterV2({
    state: resetState,
    graph,
    privateCase,
    chapter: firstChapter,
  });
  resetState = addCallouts(resetState, ["order"], null);
  const resetSession = mysteryV2RestartedSession(session, resetState, "court");
  const courtStartAction = state.config.investigationMode === "court_only"
    ? "move"
    : "file_theory";
  const courtStart = db.prepare(
    `SELECT MIN(sequence) AS sequence
       FROM debate_mystery_actions
      WHERE user_id = ? AND session_id = ? AND action_kind = ?`,
  ).get(userId, sessionId, courtStartAction) as { sequence: number | null };
  if (!Number.isInteger(courtStart.sequence)) {
    throw new HttpError(409, "The filed courtroom boundary is unavailable.");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM debate_events WHERE user_id = ? AND session_id = ?")
      .run(userId, sessionId);
    db.prepare("DELETE FROM debate_mutations WHERE user_id = ? AND session_id = ?")
      .run(userId, sessionId);
    db.prepare(
      "DELETE FROM debate_mystery_actions WHERE user_id = ? AND session_id = ? AND sequence > ?",
    ).run(userId, sessionId, courtStart.sequence);
    const restarted = persistV2Session(
      db,
      userId,
      resetSession,
      resetState,
      session.revision,
    );
    recordMysteryV2Restart(db, userId, session, restarted, restartKey);
    appendV2Action(db, userId, sessionId, "restart_court", {});
    db.exec("COMMIT");
    return restarted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

interface PreparedMysteryRoomIntroductionPersonaV2 {
  roomId: string;
  lineId: string;
  sourceGraphHash: string;
  sourceTextHash: string;
  outcome: "polished" | "canonical";
  leadIn: string | null;
  dialogueTemplateId: string | null;
  stageCueVersion: 1 | null;
  polishedLine: DebateMysterySpokenLineV2 | null;
  stagedAudio: StagedMysteryAudioLineV2 | null;
}

interface DebateMysteryPersonaActionOptionsV2 {
  generateWave?: typeof generateBuiltinEnglishWave;
  personaPolishTimeoutMs?: number;
}

async function prepareMysteryRoomIntroductionPersonaV2(args: {
  db: DatabaseSync;
  userId: string;
  session: DebateSessionV1;
  roomId: string;
  runtime: DebateAiRuntime | null;
  options: DebateMysteryPersonaActionOptionsV2;
}): Promise<PreparedMysteryRoomIntroductionPersonaV2 | null> {
  if (
    args.session.formatState.format !== "whodunnit" ||
    args.session.formatState.version !== 2
  ) return null;
  const state = args.session.formatState;
  const { privateCase, graph } = getDebateMysteryCaseV2(
    args.db,
    args.userId,
    args.session.id,
  );
  const existingReceipt =
    privateCase.roomIntroductionPersonaPolishByRoom?.[args.roomId] ?? null;
  const upgradingCadenceOnlyReceipt = Boolean(
    existingReceipt?.outcome === "polished" &&
    !existingReceipt.dialogueTemplateId &&
    !existingReceipt.stageCueVersion,
  );
  if (existingReceipt && !upgradingCadenceOnlyReceipt) {
    return null;
  }
  const introduction = graph.roomIntroductionNodeIdsByRoom?.[args.roomId];
  const personaNode = introduction
    ? graph.nodes.find((node) => node.id === introduction.personaNodeId)
    : null;
  const line = personaNode?.lineId
    ? graph.lines.find((candidate) => candidate.id === personaNode.lineId)
    : null;
  if (
    !introduction ||
    !line ||
    line.mode !== "spoken" ||
    !line.speakerBotId ||
    state.playPhase !== "investigation" ||
    state.roomView !== "room" ||
    state.currentRoomId !== args.roomId ||
    state.roomIntroductions[args.roomId] !== "casekeeper"
  ) return null;

  const sourceTextHash = sha256(JSON.stringify([
    line.visibleText,
    line.spokenText,
  ]));
  // Absent a durable room receipt, the complete archived line is canonical.
  // Punctuation is authored language, never evidence that an earlier worker
  // added a disposable lead-in.
  const canonicalVisibleText = line.visibleText;
  const speakerName = compact(
    state.suspects.find((suspect) =>
      suspect.seatId === introduction.suspectSeatId)?.name,
    160,
  );
  const canonicalResult: PreparedMysteryRoomIntroductionPersonaV2 = {
    roomId: args.roomId,
    lineId: line.id,
    sourceGraphHash: sha256(JSON.stringify(graph)),
    sourceTextHash,
    outcome: "canonical",
    leadIn: null,
    dialogueTemplateId: null,
    stageCueVersion: line.stageCue?.version ?? null,
    polishedLine: null,
    stagedAudio: null,
  };
  const failureResult = upgradingCadenceOnlyReceipt ? null : canonicalResult;
  if (!args.runtime || !speakerName) return failureResult;

  let frozenAudioProfile: BotAudioVoiceProfileV1 | null = null;
  let frozenAudioEntry: DebateMysteryAudioManifestEntryV1 | null = null;
  if (state.voicesEnabled) {
    const manifest = loadCompleteAudioManifestV2(
      args.db,
      args.userId,
      args.session.id,
    );
    if (!manifest) return failureResult;
    const manifestValidation = validateDebateMysteryAudioManifestV1({
      graph,
      manifest,
      reachableSpokenLineIds: privateCase.graphValidation.reachableSpokenLineIds,
    });
    if (!manifestValidation.valid) return failureResult;
    frozenAudioEntry = verifiedFrozenAudioEntryForLineV2({
      db: args.db,
      userId: args.userId,
      sessionId: args.session.id,
      line,
      privateCase,
      manifest,
    });
    if (!frozenAudioEntry && manifest.preparationMode !== "lazy-on-demand-v1") {
      return failureResult;
    }
    try {
      frozenAudioProfile = frozenAudioProfileForLineV2({
        line,
        privateCase,
        botById: new Map(
          botRows(args.db, args.userId, [line.speakerBotId]).map((bot) => [bot.id, bot]),
        ),
        prismVoiceProfile: prismVoiceProfileForMysteryV2(args.db, args.userId),
        frozenVoiceProfileHash: frozenAudioEntry?.voiceProfileHash,
        allowFrozenSnapshotRepair: manifest.preparationMode === "lazy-on-demand-v1",
        session: args.session,
      });
    } catch {
      // The archived line and its existing verified clip remain canonical when
      // an old case cannot recover the exact synthesis profile.
      return failureResult;
    }
  }

  const voiceCard = privateCase.personaVoiceCardsByBotId?.[line.speakerBotId];
  const stageCue = line.stageCue ?? null;
  const personaStyleCues = voiceCard?.cues ?? [
    "Keep this speaker's established voice distinct and controlled.",
  ];
  const prompt = stageCue
    ? {
        section: "room_introduction_stage_cue_performance",
        roomId: args.roomId,
        lineId: line.id,
        speakerBotId: line.speakerBotId,
        personaStyleCues,
        performance: line.performance,
        stageCue: {
          id: stageCue.id,
          objective: stageCue.objective,
          emotionalState: stageCue.emotionalState,
          allowedFacts: stageCue.allowedFacts.map((fact) => ({
            id: fact.id,
            statement: fact.statement,
            required: fact.required,
          })),
          requiredBeats: stageCue.requiredBeats.map((beat) => ({
            id: beat.id,
            instruction: beat.instruction,
          })),
          exitCondition: stageCue.exitCondition,
          maxCharacters: stageCue.maxCharacters,
        },
        outputContract: {
          spokenText:
            "one fresh in-character line using only allowedFacts and satisfying every requiredBeat; no stage directions or extra fields",
        },
      }
    : {
        section: "room_introduction_persona_polish",
        roomId: args.roomId,
        lineId: line.id,
        speakerBotId: line.speakerBotId,
        personaStyleCues,
        performance: line.performance,
        canonicalText: canonicalVisibleText,
        cadenceOptions: Object.entries(MYSTERY_ROOM_INTRODUCTION_PERSONA_CADENCES_V2).map(
          ([cadenceId, text]) => ({ cadenceId, text }),
        ),
        dialogueTemplateOptions: Object.keys(MYSTERY_ROOM_INTRODUCTION_DIALOGUE_TEMPLATES_V2).map(
          (dialogueTemplateId) => mysteryRoomIntroductionPersonaDialogueV2(
            dialogueTemplateId,
            speakerName,
          ),
        ),
        outputContract: {
          cadenceId: "one exact cadenceId from cadenceOptions; no free text",
          dialogueTemplateId:
            "one exact dialogueTemplateId from dialogueTemplateOptions; no free text",
        },
      };
  const promptText = JSON.stringify(prompt);
  const timeoutMs = Math.max(
    1,
    Math.floor(
      args.options.personaPolishTimeoutMs ??
      V2_ROOM_INTRODUCTION_PERSONA_POLISH_TIMEOUT_MS,
    ),
  );
  try {
    const localOnly =
      args.runtime.preferredProvider === "local" ||
      args.runtime.responseMode === "local";
    const lanes = localOnly
      ? [mysteryV2Lane(args.runtime)]
      : args.runtime.lanes?.length
      ? args.runtime.lanes
      : [mysteryV2Lane(args.runtime)];
    const result = await prismGenerationBroker.runStructured({
      work: {
        workflow: "whodunnit_v2",
        operation: stageCue
          ? "perform_room_introduction_stage_cue"
          : "polish_room_introduction_persona",
        stage: "room_introduction",
        executionLane: "selected",
        role: "author",
        outputClass: "connective",
        priority: "interactive",
        privacyMode:
          args.runtime.preferredProvider === "local"
            ? "local"
            : args.runtime.modelSelectionKind === "auto"
              ? "auto"
              : "online",
        timeoutMs,
        cacheKey: stageCue
          ? `whodunnit-room-stage-cue-v1:${args.session.id}:${sha256(promptText)}`
          : `whodunnit-room-introduction-persona-v2:${sha256(promptText)}`,
        sourceTokenEstimate: estimatePrismTextTokens(promptText),
        exportedTokenEstimate: estimatePrismTextTokens(promptText),
      },
      lanes,
      modelSelectionKind: args.runtime.modelSelectionKind ?? "fixed",
      maxAttempts: stageCue && timeoutMs >= 100 ? 2 : 1,
      totalTimeoutMs: timeoutMs,
      perAttemptTimeoutMs: () =>
        stageCue ? Math.max(1, Math.floor(timeoutMs / 2)) : timeoutMs,
      run: ({ lane, signal, work }) => lane.provider.generateResponse([
        {
          role: "system",
          content: stageCue
            ? "You are an actor performing one sealed stage cue, not the author of the mystery. Use only the allowed facts in the cue. Satisfy every required beat and exit condition through the active persona, but never infer, reveal, or invent a clue, culprit, motive, method, timeline, or testimony fact. Return JSON only with spokenText."
            : "You are PRISM's live performance director. Select the conversational cadence and full spoken dialogue template that best fit the frozen persona cues while preserving the canonical introduction's invitation-and-caution meaning. Return JSON only with cadenceId and dialogueTemplateId copied exactly from their option lists. Never return prose, rewrite a template, or add a case fact.",
        },
        { role: "user", content: promptText },
      ], {
        model: lane.model,
        reasoningEffort: lane.reasoningEffort,
        turbo: lane.turbo,
        maxTokens: stageCue ? 220 : 160,
        temperature: stageCue ? 0.7 : 0.55,
        jsonMode: true,
        usagePurpose: "debate_generation",
        allowFinalLocalFallback: lane.providerName === "local",
        generationWork: work,
        signal,
      }),
      validate: (raw) => {
        const parsed = parseJsonObject(raw);
        if (stageCue) {
          const spokenText = typeof parsed.spokenText === "string"
            ? parsed.spokenText
            : "";
          const validation = validateDebateMysteryStageCuePerformanceV1({
            cue: stageCue,
            text: spokenText,
          });
          if (!validation.valid) throw new Error(validation.errors.join(" "));
          return {
            spokenText: validation.normalizedText,
            leadIn: null,
            dialogueTemplateId: null,
          };
        }
        const leadIn = mysteryRoomIntroductionPersonaCadenceV2(parsed.cadenceId);
        const dialogue = mysteryRoomIntroductionPersonaDialogueV2(
          parsed.dialogueTemplateId,
          speakerName,
        );
        return {
          spokenText: `${leadIn} ${dialogue.text}`,
          leadIn,
          dialogueTemplateId: dialogue.dialogueTemplateId,
        };
      },
    });
    const { spokenText: personaText, leadIn, dialogueTemplateId } = result.value;
    const polishedLine: DebateMysterySpokenLineV2 = {
      ...line,
      visibleText: personaText,
      spokenText: personaText,
    };
    const stagedAudio = state.voicesEnabled
      ? await stageMysteryAudioLineV2({
          db: args.db,
          userId: args.userId,
          line: polishedLine,
          privateCase,
          voiceProfile: frozenAudioProfile!,
          frozenVoiceProfileHash:
            frozenAudioEntry?.voiceProfileHash ??
            sha256(JSON.stringify(frozenAudioProfile!)),
          generateWave: args.options.generateWave,
        })
      : null;
    return {
      ...canonicalResult,
      outcome: "polished",
      leadIn,
      dialogueTemplateId,
      stageCueVersion: line.stageCue?.version ?? null,
      polishedLine,
      stagedAudio,
    };
  } catch {
    return failureResult;
  }
}

function mysteryAudioScriptHashV2(
  graph: DebateMysteryDialogueGraphV2,
  privateCase: PrivateMysteryCaseV2,
): string {
  const lineById = new Map(graph.lines.map((line) => [line.id, line]));
  return sha256(
    privateCase.graphValidation.reachableSpokenLineIds.map((id) => {
      const line = lineById.get(id);
      if (!line) throw new Error(`Reachable line ${id} is missing from the frozen graph.`);
      return `${line.id}\u0000${mysteryLineVoiceTreatmentV2(line)}\u0000${mysteryLineSynthesisTextV2(line, privateCase)}\u0000${JSON.stringify(line.performance)}`;
    }).join("\u0001"),
  );
}

function persistMysteryRoomIntroductionPersonaV2(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: PrivateMysteryCaseV2;
  prepared: PreparedMysteryRoomIntroductionPersonaV2;
}): void {
  const privateJson = JSON.stringify(args.privateCase);
  const graphJson = JSON.stringify(args.graph);
  const graphHash = sha256(graphJson);
  const now = new Date().toISOString();
  const updated = args.db.prepare(
    `UPDATE debate_mystery_v2_cases
        SET private_case_json = ?, dialogue_graph_json = ?,
            case_hash = ?, graph_hash = ?, validation_json = ?, updated_at = ?
      WHERE user_id = ? AND session_id = ? AND graph_hash = ?`,
  ).run(
    privateJson,
    graphJson,
    sha256(privateJson),
    graphHash,
    JSON.stringify(args.privateCase.graphValidation),
    now,
    args.userId,
    args.sessionId,
    args.prepared.sourceGraphHash,
  );
  if (Number(updated.changes) !== 1) {
    throw new HttpError(409, "This case changed in another window. Refresh and try again.");
  }

  const job = args.db.prepare(
    `SELECT checkpoint_json
       FROM debate_mystery_v2_jobs
      WHERE user_id = ? AND session_id = ?`,
  ).get(args.userId, args.sessionId) as { checkpoint_json: string | null } | undefined;
  const checkpoint = job?.checkpoint_json
    ? JSON.parse(job.checkpoint_json) as unknown
    : null;
  if (!isMysteryV2CompiledCheckpoint(checkpoint)) {
    throw new HttpError(409, "The compiled Whodunnit checkpoint is unavailable.");
  }
  checkpoint.graph = args.graph;
  checkpoint.privateCase = args.privateCase;
  args.db.prepare(
    `UPDATE debate_mystery_v2_jobs
        SET checkpoint_json = ?, updated_at = ?
      WHERE user_id = ? AND session_id = ?`,
  ).run(JSON.stringify(checkpoint), now, args.userId, args.sessionId);

  const manifestRow = args.db.prepare(
    `SELECT status, manifest_json
       FROM debate_mystery_audio_manifests
      WHERE user_id = ? AND session_id = ?`,
  ).get(args.userId, args.sessionId) as {
    status: "preparing" | "complete" | "failed" | "silent";
    manifest_json: string;
  } | undefined;
  if (!manifestRow) {
    throw new HttpError(409, "The frozen local performance pack is unavailable.");
  }
  const manifest = JSON.parse(manifestRow.manifest_json) as DebateMysteryAudioManifestV1;
  if (args.prepared.outcome === "polished") {
    if (manifestRow.status === "complete" && !args.prepared.stagedAudio) {
      throw new HttpError(409, "The polished local room performance is unavailable.");
    }
    if (args.prepared.stagedAudio) {
      manifest.entries = manifest.entries
        .filter((entry) => entry.lineId !== args.prepared.lineId)
        .concat(args.prepared.stagedAudio.entry);
      attachAudioReferenceRows(
        args.db,
        args.userId,
        args.sessionId,
        args.prepared.lineId,
        args.prepared.stagedAudio.cacheKey,
      );
    }
  }
  manifest.caseHash = sha256(privateJson);
  manifest.dialogueGraphHash = graphHash;
  manifest.scriptHash = manifestRow.status === "silent"
    ? sha256("silent")
    : mysteryAudioScriptHashV2(args.graph, args.privateCase);
  if (manifestRow.status === "complete") {
    const validation = validateDebateMysteryAudioManifestV1({
      graph: args.graph,
      manifest,
      reachableSpokenLineIds: args.privateCase.graphValidation.reachableSpokenLineIds,
    });
    if (!validation.valid) throw new Error(validation.errors.join("\n"));
  }
  storeAudioManifest(
    args.db,
    args.userId,
    args.sessionId,
    manifest,
    manifestRow.status,
  );
}

/** Keeps a sparse lazy manifest aligned with the canonical transcript. Only
 * lines that have actually entered dialogueHistory are synthesized. Failure
 * never rewrites or rolls back the accepted text; the deterministic transcript
 * remains playable without audio and can fill the same cache on a later turn. */
async function prepareLazyMysteryTranscriptAudioV2(args: {
  db: DatabaseSync;
  userId: string;
  session: DebateSessionV1;
  generateWave?: typeof generateBuiltinEnglishWave;
}): Promise<void> {
  if (
    args.session.formatState.format !== "whodunnit" ||
    args.session.formatState.version !== 2 ||
    !args.session.formatState.voicesEnabled
  ) return;
  const { privateCase, graph } = getDebateMysteryCaseV2(
    args.db,
    args.userId,
    args.session.id,
  );
  if (privateCase.audioPreparationMode !== "lazy-on-demand-v1") return;
  const manifest = loadCompleteAudioManifestV2(
    args.db,
    args.userId,
    args.session.id,
  );
  if (!manifest || manifest.preparationMode !== "lazy-on-demand-v1") return;
  const lineById = new Map(graph.lines.map((line) => [line.id, line]));
  const spokenLineIds = [...new Set(
    args.session.formatState.dialogueHistory.flatMap((entry) =>
      entry.lineId && entry.delivery !== "text_only" ? [entry.lineId] : []),
  )];
  const botIds = [...new Set(graph.lines.flatMap((line) =>
    line.speakerBotId ? [line.speakerBotId] : []))];
  const botById = new Map(
    botRows(args.db, args.userId, botIds).map((bot) => [bot.id, bot]),
  );
  const prismVoiceProfile = prismVoiceProfileForMysteryV2(args.db, args.userId);
  let changed = false;
  for (const lineId of spokenLineIds) {
    const line = lineById.get(lineId);
    if (!line || line.mode === "text_only") continue;
    const existing = verifiedFrozenAudioEntryForLineV2({
      db: args.db,
      userId: args.userId,
      sessionId: args.session.id,
      line,
      privateCase,
      manifest,
    });
    if (existing) continue;
    try {
      const profile = frozenAudioProfileForLineV2({
        line,
        privateCase,
        botById,
        prismVoiceProfile,
        session: args.session,
        allowFrozenSnapshotRepair: true,
      });
      const staged = await stageMysteryAudioLineV2({
        db: args.db,
        userId: args.userId,
        line,
        privateCase,
        voiceProfile: profile,
        frozenVoiceProfileHash: sha256(JSON.stringify(profile)),
        generateWave: args.generateWave,
      });
      manifest.entries = manifest.entries
        .filter((entry) => entry.lineId !== line.id)
        .concat(staged.entry);
      attachAudioReferenceRows(
        args.db,
        args.userId,
        args.session.id,
        line.id,
        staged.cacheKey,
      );
      changed = true;
    } catch {
      // Text remains canonical and the same local cache attempt can be retried
      // after a later action. Never route this presentation failure ONLINE.
    }
  }
  if (!changed) return;
  const now = new Date().toISOString();
  manifest.caseHash = sha256(JSON.stringify(privateCase));
  manifest.dialogueGraphHash = sha256(JSON.stringify(graph));
  manifest.scriptHash = mysteryAudioScriptHashV2(graph, privateCase);
  manifest.complete = true;
  manifest.completedAt ??= now;
  manifest.verifiedAt = now;
  const validation = validateDebateMysteryAudioManifestV1({
    graph,
    manifest,
    reachableSpokenLineIds: privateCase.graphValidation.reachableSpokenLineIds,
  });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  storeAudioManifest(
    args.db,
    args.userId,
    args.session.id,
    manifest,
    "complete",
  );
}

const mysteryV2ActionQueues = new Map<string, Promise<unknown>>();

/**
 * Server-facing V2 action path. Every session action is serialized so the
 * interactive persona call cannot race a second window between generation,
 * local clip staging, and the normal revision-checked action commit.
 */
export async function applyDebateMysteryActionWithPersonaV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryActionRequestV2,
  runtime: DebateAiRuntime | null,
  options: DebateMysteryPersonaActionOptionsV2 = {},
): Promise<DebateSessionV1> {
  const queueKey = `${userId}:${sessionId}`;
  const prior = mysteryV2ActionQueues.get(queueKey) ?? Promise.resolve();
  const pending = prior.catch(() => undefined).then(async () => {
    const key = compact(request.idempotencyKey, 200);
    const replay = key ? replayV2Mutation(db, userId, sessionId, key) : null;
    if (replay) {
      await prepareLazyMysteryTranscriptAudioV2({
        db,
        userId,
        session: replay,
        generateWave: options.generateWave,
      });
      return replay;
    }
    if (request.action !== "advance_room_introduction") {
      const applied = applyDebateMysteryActionV2(db, userId, sessionId, request);
      await prepareLazyMysteryTranscriptAudioV2({
        db,
        userId,
        session: applied,
        generateWave: options.generateWave,
      });
      return applied;
    }
    const session = getDebateSession(db, userId, sessionId);
    if (request.expectedRevision !== session.revision) {
      const applied = applyDebateMysteryActionV2(db, userId, sessionId, request);
      await prepareLazyMysteryTranscriptAudioV2({
        db,
        userId,
        session: applied,
        generateWave: options.generateWave,
      });
      return applied;
    }
    const prepared = await prepareMysteryRoomIntroductionPersonaV2({
      db,
      userId,
      session,
      roomId: request.roomId,
      runtime,
      options,
    });
    const applied = applyDebateMysteryActionV2(
      db,
      userId,
      sessionId,
      request,
      prepared ? { roomIntroductionPersona: prepared } : {},
    );
    await prepareLazyMysteryTranscriptAudioV2({
      db,
      userId,
      session: applied,
      generateWave: options.generateWave,
    });
    return applied;
  });
  mysteryV2ActionQueues.set(queueKey, pending);
  try {
    return await pending;
  } finally {
    if (mysteryV2ActionQueues.get(queueKey) === pending) {
      mysteryV2ActionQueues.delete(queueKey);
    }
  }
}

export function applyDebateMysteryActionV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryActionRequestV2,
  options: {
    roomIntroductionPersona?: PreparedMysteryRoomIntroductionPersonaV2;
  } = {},
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
  if (session.formatState.readiness.status !== "ready") {
    throw new HttpError(409, "Finish the spoiler-free local case check before gameplay resumes.");
  }
  let { privateCase, graph } = getDebateMysteryCaseV2(db, userId, sessionId);
  const preparedRoomIntroductionPersona =
    request.action === "advance_room_introduction"
      ? options.roomIntroductionPersona
      : undefined;
  if (preparedRoomIntroductionPersona) {
    if (request.action !== "advance_room_introduction") {
      throw new HttpError(409, "That room introduction is no longer awaiting performance.");
    }
    const introduction = graph.roomIntroductionNodeIdsByRoom?.[
      preparedRoomIntroductionPersona.roomId
    ];
    const personaNode = introduction
      ? graph.nodes.find((node) => node.id === introduction.personaNodeId)
      : null;
    const sourceLine = personaNode?.lineId
      ? graph.lines.find((line) => line.id === personaNode.lineId)
      : null;
    if (
      preparedRoomIntroductionPersona.roomId !== request.roomId ||
      !sourceLine ||
      sourceLine.id !== preparedRoomIntroductionPersona.lineId ||
      sha256(JSON.stringify([sourceLine.visibleText, sourceLine.spokenText])) !==
        preparedRoomIntroductionPersona.sourceTextHash ||
      sha256(JSON.stringify(graph)) !== preparedRoomIntroductionPersona.sourceGraphHash
    ) {
      throw new HttpError(409, "This case changed in another window. Refresh and try again.");
    }
    graph = structuredClone(graph);
    privateCase = structuredClone(privateCase);
    if (
      preparedRoomIntroductionPersona.outcome === "polished" &&
      preparedRoomIntroductionPersona.polishedLine
    ) {
      graph.lines = graph.lines.map((line) =>
        line.id === preparedRoomIntroductionPersona.lineId
          ? preparedRoomIntroductionPersona.polishedLine!
          : line);
    }
    const appliedLine = graph.lines.find(
      (line) => line.id === preparedRoomIntroductionPersona.lineId,
    )!;
    privateCase.roomIntroductionPersonaPolishByRoom = {
      ...(privateCase.roomIntroductionPersonaPolishByRoom ?? {}),
      [preparedRoomIntroductionPersona.roomId]: {
        version: 1,
        lineId: preparedRoomIntroductionPersona.lineId,
        sourceTextHash: preparedRoomIntroductionPersona.sourceTextHash,
        appliedTextHash: sha256(JSON.stringify([
          appliedLine.visibleText,
          appliedLine.spokenText,
        ])),
        outcome: preparedRoomIntroductionPersona.outcome,
        leadIn: preparedRoomIntroductionPersona.leadIn,
        dialogueTemplateId: preparedRoomIntroductionPersona.dialogueTemplateId,
        ...(preparedRoomIntroductionPersona.stageCueVersion
          ? { stageCueVersion: preparedRoomIntroductionPersona.stageCueVersion }
          : {}),
      },
    };
  }
  let state = structuredClone(session.formatState);
  if (preparedRoomIntroductionPersona?.outcome === "polished") {
    state.readiness = {
      ...state.readiness,
      contractHash: debateMysteryPlayContractHashV2({
        db,
        userId,
        graph,
        privateCase,
        manifest: loadCompleteAudioManifestV2(db, userId, sessionId),
        session,
        botRows: botRows(db, userId, [
          ...privateCase.config.suspectBotIds,
          privateCase.config.prosecutorBotId,
          privateCase.config.rivalDefenseBotId,
          privateCase.config.judgeBotId,
          ...privateCase.config.jurorBotIds,
        ]),
      }),
      checkedAt: new Date().toISOString(),
    };
  }
  const assetRevealRequests: Array<{
    kind: "evidence" | "room";
    subjectId: string;
  }> = [];
  const authorizeAsset = (
    kind: "evidence" | "room",
    subjectId: string,
  ): void => {
    assetRevealRequests.push({ kind, subjectId });
    if (kind === "room") {
      if (state.rooms.some((room) => room.id === subjectId)) {
        assetRevealRequests.push({
          kind: "room",
          subjectId: debateMysteryIllustratedRoomSubjectIdV1(subjectId),
        });
      }
      state.rooms = state.rooms.map((room) =>
        room.id === subjectId && room.sealedAsset
          ? { ...room, sealedAsset: { ...room.sealedAsset, revealed: true } }
          : room);
    } else {
      state.record = state.record.map((item) =>
        item.reference.kind === "evidence" &&
        item.reference.id === subjectId &&
        item.sealedAsset
          ? { ...item, sealedAsset: { ...item.sealedAsset, revealed: true } }
          : item);
    }
  };
  const spectator = state.config.playerRole === "spectator";
  const courtOnly = state.config.investigationMode === "court_only";
  if (
    spectator &&
    !(
      (request.action === "move" && state.playPhase === "title_card" && !request.roomId) ||
      (!courtOnly && request.action === "file_theory" && state.playPhase === "theory") ||
      (request.action === "advance_spectator_trial" && state.playPhase === "trial")
    )
  ) {
    throw new HttpError(409, "This Spectator case only allows reviewing and filing the automated Prosecutor theory before watch-only court.");
  }
  if (!spectator && request.action === "advance_spectator_trial") {
    throw new HttpError(409, "Only a Spectator case advances automatically.");
  }
  const publicPayload: Record<string, unknown> = { action: request.action };
  if (request.action === "enter_mansion") {
    if (spectator || courtOnly || state.playPhase !== "title_card") {
      throw new HttpError(409, "The mansion door is not available right now.");
    }
    const foyer = state.rooms.find((room) => room.templateId === "foyer")
      ?? state.rooms.find((room) => room.id === state.currentRoomId)
      ?? state.rooms[0];
    if (!foyer) throw new HttpError(409, "The mansion foyer is unavailable.");
    // A fresh Run crosses this one threshold before normal discovery rules.
    // Legacy malformed layouts retain their compiled opening-room fallback.
    foyer.visited = true;
    foyer.accessState = "visited";
    state.playPhase = "case_opening";
    state.currentRoomId = foyer.id;
    state.roomView = "room";
    authorizeAsset("room", foyer.id);
  } else if (request.action === "move") {
    if (state.playPhase === "title_card" && courtOnly) {
      state = prepareCourtOnlyTrialV2({ state, graph, privateCase });
    } else if (state.playPhase === "title_card" && spectator) {
      state = prepareSpectatorTheoryV2({ state, graph, privateCase });
    } else if (state.playPhase === "title_card") {
      if (request.roomId) {
        throw new HttpError(409, "Dismiss the Casekeeper briefing before entering a room.");
      }
      state.playPhase = "case_opening";
      const crimeScene = state.rooms.find(
        (room) => room.id === (state.crimeSceneRoomId ?? privateCase.crimeSceneRoomId),
      );
      if (!crimeScene) throw new HttpError(409, "The authored incident scene is unavailable.");
      if (crimeScene.sealedAsset?.status === "pending") {
        throw new HttpError(
          409,
          "The Casekeeper is still securing this room. Try again shortly.",
          "MYSTERY_ROOM_BEING_SECURED",
        );
      }
      crimeScene.visited = true;
      crimeScene.accessState = "visited";
      state.currentRoomId = crimeScene.id;
      state.roomView = "room";
      if (crimeScene.sealedAsset) authorizeAsset("room", crimeScene.id);
    } else if (state.playPhase === "case_opening") {
      throw new HttpError(409, "Dismiss the Casekeeper briefing before moving through the mansion.");
    }
    if (!spectator && !courtOnly) {
      if (state.playPhase === "case_opening") {
        // The first title-card move intentionally stops at the briefing stage.
      } else {
        if (state.playPhase !== "investigation") {
          throw new HttpError(409, "Mansion movement is unavailable right now.");
        }
        if (!request.roomId) {
          if (
            !state.openingSweepComplete &&
            state.currentRoomId === (state.crimeSceneRoomId ?? privateCase.crimeSceneRoomId)
          ) {
            throw new HttpError(
              409,
              "Finish the finite visible sweep before opening the mansion map.",
              "MYSTERY_OPENING_SWEEP_INCOMPLETE",
            );
          }
          state.roomView = "mansion";
        } else {
          const room = state.rooms.find((entry) => entry.id === request.roomId);
          if (!room?.unlocked) throw new HttpError(409, "That location has not unlocked.");
          if (room.sealedAsset?.status === "pending") {
            throw new HttpError(
              409,
              "The Casekeeper is still securing this room. Try again shortly.",
              "MYSTERY_ROOM_BEING_SECURED",
            );
          }
          if (
            !state.openingSweepComplete &&
            state.currentRoomId === (state.crimeSceneRoomId ?? privateCase.crimeSceneRoomId) &&
            room.id !== state.currentRoomId
          ) {
            throw new HttpError(
              409,
              "Finish the finite visible sweep before leaving the incident scene.",
              "MYSTERY_OPENING_SWEEP_INCOMPLETE",
            );
          }
          const currentRoom = state.rooms.find((entry) => entry.id === state.currentRoomId);
          if (
            currentRoom &&
            currentRoom.id !== room.id &&
            !room.visited &&
            !(currentRoom.neighborIds ?? []).includes(room.id) &&
            !(room.neighborIds ?? []).includes(currentRoom.id)
          ) {
            throw new HttpError(
              409,
              "Move through one adjacent doorway at a time.",
              "MYSTERY_ROOM_NOT_ADJACENT",
            );
          }
          room.visited = true;
          room.accessState = "visited";
          state.currentRoomId = room.id;
          state.roomView = "room";
          if (room.sealedAsset) authorizeAsset("room", room.id);
          const introduction = graph.roomIntroductionNodeIdsByRoom?.[room.id];
          if (introduction && state.roomIntroductions[room.id] === "unseen") {
            state = executeDialogueNodeV2({
              state,
              graph,
              privateCase,
              nodeId: introduction.casekeeperNodeId,
            });
            state.roomIntroductions = { ...state.roomIntroductions, [room.id]: "casekeeper" };
          }
        }
      }
    }
  } else if (request.action === "dismiss_case_opening") {
    if (spectator || courtOnly || state.playPhase !== "case_opening") {
      throw new HttpError(409, "The Casekeeper briefing is not awaiting dismissal.");
    }
    state.playPhase = "investigation";
    state.roomView = "room";
    // Retain the immutable briefing in history, but prevent it from becoming
    // ambient dialogue once the crime-scene sweep begins.
    state.activeDialogueNodeId = null;
    const crimeSceneId = state.currentRoomId;
    const introduction = crimeSceneId
      ? graph.roomIntroductionNodeIdsByRoom?.[crimeSceneId]
      : null;
    if (
      crimeSceneId &&
      introduction &&
      state.roomIntroductions[crimeSceneId] === "unseen"
    ) {
      state = executeDialogueNodeV2({
        state,
        graph,
        privateCase,
        nodeId: introduction.casekeeperNodeId,
      });
      state.roomIntroductions = {
        ...state.roomIntroductions,
        [crimeSceneId]: "casekeeper",
      };
    }
  } else if (request.action === "advance_room_introduction") {
    if (state.playPhase !== "investigation" || state.roomView !== "room" || state.currentRoomId !== request.roomId) {
      throw new HttpError(409, "Enter this room before continuing its introduction.");
    }
    const introduction = graph.roomIntroductionNodeIdsByRoom?.[request.roomId];
    if (!introduction || state.roomIntroductions[request.roomId] !== "casekeeper") {
      throw new HttpError(409, "That room introduction is not waiting for the Casekeeper beat.");
    }
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: introduction.personaNodeId });
    state.roomIntroductions = { ...state.roomIntroductions, [request.roomId]: "persona" };
  } else if (request.action === "complete_room_introduction") {
    if (state.playPhase !== "investigation" || state.roomView !== "room" || state.currentRoomId !== request.roomId) {
      throw new HttpError(409, "Enter this room before completing its introduction.");
    }
    if (state.roomIntroductions[request.roomId] !== "persona") {
      throw new HttpError(409, "That room introduction is not currently performing.");
    }
    state.roomIntroductions = { ...state.roomIntroductions, [request.roomId]: "complete" };
  } else if (request.action === "examine") {
    if (state.playPhase !== "investigation" || state.currentRoomId !== request.roomId || state.roomView !== "room") {
      throw new HttpError(409, "Enter this room before examining it.");
    }
    const room = state.rooms.find((entry) => entry.id === request.roomId);
    if (!room) throw new HttpError(404, "That room is not authored for this case.");
    if (state.roomIntroductions[request.roomId] && state.roomIntroductions[request.roomId] !== "complete") {
      throw new HttpError(409, "Let the room introduction finish before examining it.");
    }
    const hotspot = room.hotspots.find((entry) => entry.id === request.hotspotId);
    if (!hotspot?.unlocked) throw new HttpError(409, "That examination point is locked.");
    if (hotspot.examined) throw new HttpError(409, "That examination point is already in the record.");
    const nodeId = privateCase.examineNodeIdByHotspot[`${request.roomId}:${request.hotspotId}`];
    if (!nodeId) throw new HttpError(404, "That examination point is not authored for this case.");
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId });
    hotspot.examined = true;
    if (room.id === (state.crimeSceneRoomId ?? privateCase.crimeSceneRoomId)) {
      state.openingSweepComplete = room.hotspots.every((entry) => entry.examined);
    }
  } else if (request.action === "talk") {
    if (state.playPhase !== "investigation" || state.roomView !== "room") {
      throw new HttpError(409, "Enter the suspect's room before choosing a Talk topic.");
    }
    const suspect = state.suspects.find((entry) => entry.seatId === request.suspectSeatId);
    if (!suspect || suspect.roomId !== state.currentRoomId) throw new HttpError(409, "That suspect is not in this room.");
    if (state.currentRoomId && state.roomIntroductions[state.currentRoomId] && state.roomIntroductions[state.currentRoomId] !== "complete") {
      throw new HttpError(409, "Let the room introduction finish before questioning the suspect.");
    }
    const topic = state.topics.find((entry) => entry.nodeId === request.topicNodeId && entry.suspectSeatId === suspect.seatId);
    if (!topic?.unlocked) throw new HttpError(409, "That Talk topic has not unlocked.");
    const repeatOrdinal = topic.completed
      ? Math.max(1, state.dialogueHistory.filter((entry) => entry.nodeId === topic.nodeId).length)
      : 0;
    const exchange = resolveDebateMysteryTalkExchangeV2(
      graph,
      topic.nodeId,
      suspect.seatId,
      repeatOrdinal,
    );
    if (!exchange) {
      throw new HttpError(409, "That authored Talk response is unavailable.");
    }
    if (exchange.questionNodeId) {
      state = executeDialogueNodeV2({
        state,
        graph,
        privateCase,
        nodeId: exchange.questionNodeId,
      });
    }
    state = executeDialogueNodeV2({
      state,
      graph,
      privateCase,
      nodeId: exchange.responseNodeId,
    });
    state.topics = state.topics.map((entry) => entry.nodeId === topic.nodeId ? { ...entry, completed: true } : entry);
    state.metSuspectSeatIds = [...new Set([...state.metSuspectSeatIds, suspect.seatId])];
  } else if (request.action === "present_to_suspect") {
    if (state.playPhase !== "investigation" || state.roomView !== "room") {
      throw new HttpError(409, "Enter the suspect's room before presenting the Case File.");
    }
    const suspect = state.suspects.find((entry) => entry.seatId === request.suspectSeatId);
    if (!suspect || suspect.roomId !== state.currentRoomId) throw new HttpError(409, "That suspect is not in this room.");
    if (state.currentRoomId && state.roomIntroductions[state.currentRoomId] && state.roomIntroductions[state.currentRoomId] !== "complete") {
      throw new HttpError(409, "Let the room introduction finish before presenting the Case File.");
    }
    const recordKey = mysteryRecordKey(request.record);
    if (!state.record.some((item) => item.admitted && mysteryRecordKey(item.reference) === recordKey)) {
      throw new HttpError(409, "That item is not admitted to the Case File.");
    }
    const nodeId = privateCase.presentNodeIdBySuspectRecord[`${suspect.seatId}:${recordKey}`];
    if (!nodeId) throw new HttpError(409, "That admitted record has no matching finite Present exchange.");
    state = executeDialogueNodeV2({ state, graph, privateCase, nodeId });
    const responseNodeId = graph.nodes.find((node) => node.id === nodeId)?.nextNodeIds[0];
    if (responseNodeId) {
      state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: responseNodeId });
    }
    state = applyDebateMysteryPresentationGatesV2({
      state,
      graph,
      privateCase,
      suspectSeatId: suspect.seatId,
      record: request.record,
      presentNodeId: nodeId,
    });
  } else if (request.action === "review_strategy") {
    if (spectator) throw new HttpError(409, "Spectator mode uses the automated Prosecutor route.");
    if (state.playPhase !== "investigation" && state.playPhase !== "trial") {
      throw new HttpError(409, "Strategy review is available during investigation and court.");
    }
    state = executeDialogueNodeV2({
      state,
      graph,
      privateCase,
      nodeId: privateCase.prosecutorStrategyNodeId,
    });
  } else if (request.action === "file_theory") {
    if (state.playPhase !== "investigation" && state.playPhase !== "theory") {
      throw new HttpError(409, "Charges can only be filed from the investigation.");
    }
    if (!state.theoryAvailable) throw new HttpError(409, "Complete the crime-scene briefing, meet one suspect, and admit one record item first.");
    const suspectSeatIds = new Set(state.suspects.map((suspect) => suspect.seatId));
    const accusedSeatIds = debateMysteryTheoryAccusedSeatIdsV2(request.theory)
      .filter((seatId) => suspectSeatIds.has(seatId))
      .slice(0, 2);
    if (!accusedSeatIds.length) {
      throw new HttpError(400, "Accuse at least one person before filing the charge.");
    }
    if (spectator) {
      const admittedEvidenceIds = new Set(state.record.flatMap((item) =>
        item.admitted && item.reference.kind === "evidence" ? [item.reference.id] : [],
      ));
      state.theory = debateMysteryTheoryWithAccusedSeatIdsV2({
        culpritSeatId: null,
        accompliceSeatId: null,
        incidentId: state.caseCharge?.incidentId,
        claim: compact(request.theory.claim, 500) || state.caseCharge?.accusationPrompt,
        method: compact(request.theory.method, 2_000),
        motive: compact(request.theory.motive, 2_000),
        opportunity: compact(request.theory.opportunity, 2_000),
        evidenceIds: [...new Set(request.theory.evidenceIds.filter((id) => admittedEvidenceIds.has(id)))],
        testimonyIds: [],
      }, accusedSeatIds);
    } else {
      state.theory = debateMysteryTheoryWithAccusedSeatIdsV2({
        ...structuredClone(request.theory),
        incidentId: state.caseCharge?.incidentId,
        claim: compact(request.theory.claim, 500) || state.caseCharge?.accusationPrompt,
      }, accusedSeatIds);
    }
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
    const responseNode = graph.nodes.find((node) => node.id === option.responseNodeId);
    state.dialogueHistory.push({
      nodeId: option.responseNodeId,
      lineId: option.lineId,
      stageActionText: optionLine.stageActionText,
      visibleText: optionLine.visibleText,
      speakerSeatId: null,
      speakerBotId: optionLine.speakerBotId,
      speakerKind: optionLine.speakerKind,
      ...(responseNode?.speakerSeatId
        ? { intendedRecipientSeatId: responseNode.speakerSeatId }
        : {}),
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
  } else if (request.action === "present_record" || request.action === "object_statement") {
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
    const defenseColor = session.againstAdvocate?.color ?? null;
    const correct = version.correctPresentations.some((reference) => mysteryRecordKey(reference) === key);
    if (!correct) {
      state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: version.rebuttalNodeId });
      state.court!.credibilityRemaining -= 1;
      state = addCallouts(state, ["objection", "overruled"], defenseColor);
      if (state.court!.credibilityRemaining <= 0) {
        state = failCourtForCredibilityV2(state, privateCase);
      }
    } else {
      if (version.objectionNodeId) {
        state = executeDialogueNodeV2({
          state,
          graph,
          privateCase,
          nodeId: version.objectionNodeId,
        });
      }
      state = addCallouts(state, ["objection", "sustained"], defenseColor);
      if (!version.revisionNodeId) throw new HttpError(409, "This statement has no authored revision.");
      state = executeDialogueNodeV2({ state, graph, privateCase, nodeId: version.revisionNodeId });
      const revisionLine = graph.lines.find((line) => line.nodeId === version.revisionNodeId)!;
      state.court!.statements = state.court!.statements.map((entry) => entry.statementId === request.statementId
        ? { ...entry, version: entry.version + 1, versionId: `${entry.versionId}-revised`, lineId: revisionLine.id, visibleText: revisionLine.visibleText, stageActionText: revisionLine.stageActionText }
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
  } else if (request.action === "advance_spectator_trial") {
    state = advanceSpectatorTrialV2({ session, state, graph, privateCase });
  } else if (request.action === "retry_witness_checkpoint") {
    const checkpoint = state.court?.checkpoint;
    if (!checkpoint || state.playPhase !== "verdict" || state.verdict?.legalResult !== "not_guilty") {
      throw new HttpError(409, "No failed witness checkpoint is available.");
    }
    const restored = JSON.parse(checkpoint.publicStateJson) as DebateWhodunnitFormatStateV2;
    state = {
      ...restored,
      court: restored.court ? {
        ...restored.court,
        // Keep the authored chapter checkpoint available after a retry. The
        // serialized snapshot intentionally omits its own recursive copy, but
        // dropping the live token made a second failed attempt permanently
        // seal the Run with no way to practice the same witness again.
        checkpoint,
      } : restored.court,
      compilation: state.compilation,
      audioReady: state.audioReady,
      voicesEnabled: state.voicesEnabled,
      localAudioFailure: state.localAudioFailure,
      readiness: state.readiness,
      verdict: null,
      playPhase: "trial",
      pendingCallout: null,
      pendingProsecutionChoice: null,
    };
  }
  state.theoryAvailable = spectator
    ? state.playPhase === "theory"
    : state.discoveryIds.includes("briefing:complete") &&
      state.metSuspectSeatIds.length > 0 &&
      state.record.some((item) => item.admitted);
  for (const item of state.record) {
    if (
      item.admitted &&
      item.reference.kind === "evidence" &&
      item.sealedAsset &&
      !item.sealedAsset.revealed &&
      item.sealedAsset.status !== "pending"
    ) {
      authorizeAsset("evidence", item.reference.id);
    }
  }
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
    if (preparedRoomIntroductionPersona) {
      persistMysteryRoomIntroductionPersonaV2({
        db,
        userId,
        sessionId,
        graph,
        privateCase,
        prepared: preparedRoomIntroductionPersona,
      });
    }
    for (const reveal of assetRevealRequests) {
      revealDebateMysteryAssetV1(
        db,
        userId,
        sessionId,
        reveal.kind,
        reveal.subjectId,
      );
    }
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
