import type { BotAudioVoiceProfileV1 } from "./audioVoice.js";
import type {
  AutoFallbackModelRef,
  AutoRecoveryTraceV1,
  ResponseMode,
} from "./autoFallback.js";
import type { BotAvatarDetailsV1 } from "./botAvatarDetails.js";
import type {
  BotPowerEffectV1,
  BotPowerResolvedThemeV1,
  BotPowerV1,
} from "./botPower.js";
import type { LlmProviderName } from "./index.js";

export const DEBATE_SCHEMA_VERSION = 1 as const;
export const DEBATE_FORMAT_SCHEMA_VERSION = 1 as const;
export const DEBATE_PLAYER_JUDGE_BOT_ID = "prism:player-judge" as const;
export const DEBATE_PLAYER_PARTICIPANT_BOT_ID =
  "prism:player-participant" as const;
export const DEBATE_JUDGE_GAVEL_COOLDOWN_MS = 8_000;
export const DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH = 600;
export const DEBATE_OBJECTION_RULING_TIMEOUT_MS = 8_000;
export const DEBATE_MODERATOR_TITLE_MAX_LENGTH = 72;
export const DEBATE_TITLE_MAX_LENGTH = 120;
export const DEBATE_MOTION_MAX_LENGTH = 320;
export const DEBATE_SIDE_LABEL_MAX_LENGTH = 32;
export const DEBATE_SIDE_BRIEF_MAX_LENGTH = 1_200;
export const DEBATE_EVIDENCE_NOTES_MAX_LENGTH = 8_000;
export const DEBATE_EVIDENCE_SOURCE_MAX_COUNT = 12;
/** Sources and exhibits share one bounded frozen packet. */
export const DEBATE_EVIDENCE_ITEM_MAX_COUNT = 12;
export const DEBATE_EVIDENCE_EXHIBIT_ADJECTIVE_MAX_LENGTH = 48;
export const DEBATE_EVIDENCE_EXHIBIT_OBJECT_MAX_LENGTH = 96;
export const DEBATE_EVIDENCE_EXHIBIT_OBSERVATION_MAX_LENGTH = 800;
export const DEBATE_PLAYER_TURN_MAX_LENGTH = 4_000;
export const DEBATE_CASE_CARDS_PER_SIDE = 4;
export const DEBATE_TURNABOUT_STATEMENTS_PER_SIDE = 2;
export const DEBATE_JURY_SIZE = 5;
export const DEBATE_JURY_DISCUSSION_TURNS = 5;
export const DEBATE_JURY_EARLY_DISCUSSION_TURNS = 3;
export const DEBATE_FORUM_MIN_REBUTTAL_ROUNDS = 1;
export const DEBATE_FORUM_MAX_REBUTTAL_ROUNDS = 3;

export type DebateFormatId = "forum" | "turnabout";
export type DebateFormatCatalogId = DebateFormatId | "flyting" | "cypher";
export type DebatePlayerRole = "judge" | "participant" | "spectator";
export type DebateForumRoundMode = "auto" | "fixed";
export type DebateSideId = "for" | "against";
/** Frozen social register for one Debate proceeding, from chaotic to formal. */
export type DebateFormalityId =
  "free_for_all" | "heated" | "plainspoken" | "structured" | "parliamentary";
export type DebateSetupPresetId =
  | "classic-duel"
  | "daytime-showdown"
  | "jury-trial"
  | "public-forum"
  | "take-the-floor";
export type DebateJuryCadence = "natural-five";
export type DebateJuryPhase =
  | "disabled"
  | "waiting"
  | "initial_ballots"
  | "deliberating"
  | "final_ballots"
  | "complete";
export type DebateJurorSource = "library" | "generic";
export type DebatePhase =
  "opening" | "challenge" | "rebuttal" | "closing" | "verdict";
export type DebateStatus =
  | "live"
  | "waiting_for_player"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";
export type DebateAdvocacyConsentStatus =
  "accept" | "devils_advocate" | "decline";
export type DebateCaseCardStatus =
  "active" | "challenged" | "conceded" | "unanswered";
export type DebateBotRole = "moderator" | "advocate" | "juror";

export interface DebateFormalityDescriptorV1 {
  id: DebateFormalityId;
  title: string;
  summary: string;
  vocabulary: string;
  tone: string;
  aggression: string;
  prohibitedRegister: string;
}

/**
 * The single formality contract for Debate UI and generation. Persona diction
 * remains the higher-priority voice constraint when this guidance is applied.
 */
export const DEBATE_FORMALITY_SPECTRUM: readonly DebateFormalityDescriptorV1[] =
  [
    {
      id: "free_for_all",
      title: "Free-for-all",
      summary:
        "Theatrical daytime-chaos energy; spar freely without inventing facts.",
      vocabulary: "vivid everyday language, playful jabs, and fast reactions",
      tone: "theatrical, messy, high-energy, and openly combative",
      aggression:
        "ad hominem sparring is permitted within safety boundaries; challenge motives or credibility without inventing facts",
      prohibitedRegister:
        "Do not default to House, record, parliamentary procedure, court language, or ceremonial rulings.",
    },
    {
      id: "heated",
      title: "Heated",
      summary: "Sharp, interruptive confrontation with the facts kept intact.",
      vocabulary:
        "plain sharp language, direct accusations, and quick rebuttals",
      tone: "confrontational, urgent, and interruptive",
      aggression:
        "may challenge motives or credibility without inventing facts; keep attacks within safety boundaries",
      prohibitedRegister:
        "Avoid canned parliamentary, court, and ceremonial debate phrasing unless the persona naturally uses it.",
    },
    {
      id: "plainspoken",
      title: "Plainspoken",
      summary: "Ordinary conversational debate: clear, direct, and human.",
      vocabulary: "ordinary conversational language and concrete examples",
      tone: "direct, grounded, and candid",
      aggression: "firm disagreement without theatrical escalation",
      prohibitedRegister:
        "Avoid canned parliamentary or court phrasing, including House, record, proceedings, objections, and ceremonial address.",
    },
    {
      id: "structured",
      title: "Structured",
      summary: "Formal, direct rounds with clear claims and clean responses.",
      vocabulary: "clear claims, orderly rebuttals, and concise transitions",
      tone: "formal, direct, and disciplined",
      aggression: "controlled adversarial pressure focused on the argument",
      prohibitedRegister:
        "Avoid ornate parliamentary ritual and courtroom theatrics unless the format specifically requires them.",
    },
    {
      id: "parliamentary",
      title: "Parliamentary",
      summary:
        "Disciplined institutional debate with the most formal register.",
      vocabulary:
        "House, record, proceedings, points, and disciplined institutional language when natural",
      tone: "measured, public-minded, and procedurally crisp",
      aggression: "firm but decorous challenge centered on the public case",
      prohibitedRegister:
        "Do not flatten a persona into generic official prose or use courtroom rulings outside Turnabout.",
    },
  ] as const;

export function isDebateFormalityId(
  value: unknown,
): value is DebateFormalityId {
  return DEBATE_FORMALITY_SPECTRUM.some((level) => level.id === value);
}

/** Legacy proceedings used the existing most-formal parliamentary delivery. */
export function normalizeDebateFormalityId(value: unknown): DebateFormalityId {
  return isDebateFormalityId(value) ? value : "parliamentary";
}

export function debateFormalityDescriptor(
  value: unknown,
): DebateFormalityDescriptorV1 {
  const id = normalizeDebateFormalityId(value);
  return DEBATE_FORMALITY_SPECTRUM.find((level) => level.id === id)!;
}

/** Canonical prompt-ready register guidance for every Debate generation path. */
export function debateFormalityGuidance(value: unknown): string {
  const level = debateFormalityDescriptor(value);
  return [
    `Frozen formality — ${level.title}: use ${level.vocabulary}.`,
    `Tone: ${level.tone}. Aggression: ${level.aggression}.`,
    `Register guardrail: ${level.prohibitedRegister}`,
    "Persona-specific diction, cadence, limitations, and identity outrank this generic register. Never polish or flatten a persona to satisfy the formality level.",
  ].join("\n");
}

export interface DebateFormatDescriptorV1 {
  id: DebateFormatId;
  name: string;
  productionName: string;
  summary: string;
  cadence: string;
  availability: "available";
}

export interface DebateFormatPreviewDescriptorV1 {
  id: Exclude<DebateFormatCatalogId, DebateFormatId>;
  name: string;
  productionName: string;
  summary: string;
  cadence: string;
  availability: "coming_soon";
}

export type DebateFormatCatalogEntryV1 =
  DebateFormatDescriptorV1 | DebateFormatPreviewDescriptorV1;

export const DEBATE_FORMAT_CATALOG: readonly DebateFormatCatalogEntryV1[] = [
  {
    id: "forum",
    name: "Forum",
    productionName: "Assembly Chamber",
    summary:
      "A parliamentary forum of opening addresses, direct challenges, rebuttals, and a motion carried or defeated.",
    cadence: "Opening address · Challenge · Rebuttal · Closing",
    availability: "available",
  },
  {
    id: "turnabout",
    name: "Turnabout",
    productionName: "Court of Record",
    summary:
      "An original theatrical courtroom examination built around pressable testimony and frozen-evidence objections.",
    cadence: "Testimony · Press · Object · Ruling",
    availability: "available",
  },
  {
    id: "flyting",
    name: "Flyting",
    productionName: "Mead Hall",
    summary:
      "A ritual contest of boast, insult, answering verse, and crowd acclamation.",
    cadence: "Boast · Flyte · Rejoinder · Acclamation",
    availability: "coming_soon",
  },
  {
    id: "cypher",
    name: "Cypher",
    productionName: "The Cypher",
    summary:
      "A beat-led rap battle shaped by verses, rebuttal bars, and the room's response.",
    cadence: "Verse · Rebuttal · Counter · Final bar",
    availability: "coming_soon",
  },
] as const;

export const DEBATE_FORMATS: readonly DebateFormatDescriptorV1[] =
  DEBATE_FORMAT_CATALOG.filter(
    (entry): entry is DebateFormatDescriptorV1 =>
      entry.availability === "available",
  );

export interface DebateSetupPresetDescriptorV1 {
  id: DebateSetupPresetId;
  name: string;
  summary: string;
  format: DebateFormatId;
  formality: DebateFormalityId;
  playerRole: DebatePlayerRole;
  juryEnabled: boolean;
  juryCadence: DebateJuryCadence;
}

export const DEBATE_SETUP_PRESETS: readonly DebateSetupPresetDescriptorV1[] = [
  {
    id: "daytime-showdown",
    name: "Daytime Showdown",
    summary:
      "A televised verbal free-for-all with personal jabs, cut-ins, moderator warnings, and a five-seat Jury verdict.",
    format: "forum",
    formality: "free_for_all",
    playerRole: "spectator",
    juryEnabled: true,
    juryCadence: "natural-five",
  },
  {
    id: "take-the-floor",
    name: "Crossfire",
    summary:
      "Take one side in a heated Forum with no Jury between you and the room.",
    format: "forum",
    formality: "heated",
    playerRole: "participant",
    juryEnabled: false,
    juryCadence: "natural-five",
  },
  {
    id: "public-forum",
    name: "Town Hall",
    summary:
      "Watch a plainspoken Forum and let the five-seat Jury carry the verdict.",
    format: "forum",
    formality: "plainspoken",
    playerRole: "spectator",
    juryEnabled: true,
    juryCadence: "natural-five",
  },
  {
    id: "jury-trial",
    name: "Bench Trial",
    summary: "Preside over a structured Turnabout and make the final ruling.",
    format: "turnabout",
    formality: "structured",
    playerRole: "judge",
    juryEnabled: false,
    juryCadence: "natural-five",
  },
  {
    id: "classic-duel",
    name: "University Union",
    summary:
      "A parliamentary Forum where you preside over the classic direct duel.",
    format: "forum",
    formality: "parliamentary",
    playerRole: "judge",
    juryEnabled: false,
    juryCadence: "natural-five",
  },
] as const;

export type DebateTurnaboutPhase =
  "testimony" | "examination" | "reversal" | "resolution";
export type DebateTurnaboutStatementStatus =
  "ready" | "pressed" | "contradicted" | "resolved";
export type DebateTurnaboutRuling = "sustained" | "overruled";

export interface DebateForumFormatStateV1 {
  version: typeof DEBATE_FORMAT_SCHEMA_VERSION;
  format: "forum";
  /** One-based rebuttal exchange currently on the floor. */
  rebuttalRound: number;
  /** Frozen number of rebuttal exchanges before closing arguments. */
  rebuttalRoundTarget: number;
  /** Records whether setup selected the target automatically or explicitly. */
  rebuttalRoundMode: DebateForumRoundMode;
  /** Short player-facing explanation frozen with an automatic target. */
  rebuttalRoundRationale: string;
}

export interface DebateTurnaboutStatementV1 {
  id: string;
  sideId: DebateSideId;
  speakerBotId: string;
  content: string;
  sourceIds: string[];
  status: DebateTurnaboutStatementStatus;
  createdEventId: string;
}

export interface DebateTurnaboutContradictionV1 {
  id: string;
  statementId: string;
  evidenceSourceId: string;
  statementQuote: string;
  evidenceQuote: string;
  reason: string;
  grounded: boolean;
  ruling: DebateTurnaboutRuling;
  createdAt: string;
}

export interface DebateTurnaboutFormatStateV1 {
  version: typeof DEBATE_FORMAT_SCHEMA_VERSION;
  format: "turnabout";
  phase: DebateTurnaboutPhase;
  round: number;
  activeStatementId: string | null;
  floorOwnerBotId: string | null;
  statements: DebateTurnaboutStatementV1[];
  contradictions: DebateTurnaboutContradictionV1[];
}

export type DebateFormatStateV1 =
  DebateForumFormatStateV1 | DebateTurnaboutFormatStateV1;

export interface DebateMotionSideV1 {
  label: string;
  brief: string;
}

export interface DebateMotionSlateV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  id: string;
  /** Public program title; the exact motion remains the canonical question. */
  title?: string;
  motion: string;
  forSide: DebateMotionSideV1;
  againstSide: DebateMotionSideV1;
}

export interface DebateEvidenceSourceV1 {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

export type DebateEvidenceExhibitVisualKind =
  "emoji" | "upload" | "synthesized";

/**
 * A player-approved physical or fictional object in the frozen record.
 * The image is presentation only; title and observation are the canonical
 * text anchors used for model grounding and Turnabout validation.
 */
export interface DebateEvidenceExhibitV1 {
  id: string;
  adjective: string;
  object: string;
  title: string;
  observation: string;
  emoji: string;
  visualKind: DebateEvidenceExhibitVisualKind;
  imageId: string | null;
  createdBy: "player" | "prism";
}

export type DebateEvidenceItemV1 =
  | Readonly<{ kind: "source"; value: DebateEvidenceSourceV1 }>
  | Readonly<{ kind: "exhibit"; value: DebateEvidenceExhibitV1 }>;

export interface DebateEvidencePacketV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  notes: string;
  sources: DebateEvidenceSourceV1[];
  /** Optional on legacy source-only sessions; normalization always supplies it. */
  exhibits?: DebateEvidenceExhibitV1[];
  frozenAt: string | null;
}

export interface DebateAdvocacyConsent {
  version: typeof DEBATE_SCHEMA_VERSION;
  format?: DebateFormatId;
  /** The accepted delivery register; legacy consent normalizes to parliamentary. */
  formality?: DebateFormalityId;
  botId: string;
  sideId: DebateSideId;
  status: DebateAdvocacyConsentStatus;
  /** Persona comment on the assignment. Nullable only for legacy saved consent. */
  reason: string | null;
  motionHash: string;
  botRevision: string;
  checkedAt: string;
  provider?: LlmProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
}

export interface DebateBotSnapshotV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  id: string;
  name: string;
  systemPrompt: string;
  role: DebateBotRole;
  sideId: DebateSideId | null;
  color: string | null;
  glyph: string | null;
  avatarDetails: BotAvatarDetailsV1 | null;
  voiceProfile: BotAudioVoiceProfileV1 | null;
  powers: BotPowerV1[];
  provider: LlmProviderName;
  model: string;
  revision: string;
}

export interface DebateJurorSnapshotV1 extends DebateBotSnapshotV1 {
  role: "juror";
  sideId: null;
  source: DebateJurorSource;
}

export type DebatePowerPolicyV1 = "enforced" | "direct" | "adapted";

export interface DebatePowerEffectPlanV1 {
  powerId: string;
  powerName: string;
  policy: DebatePowerPolicyV1;
  effect: BotPowerEffectV1;
}

export interface DebateBotPowerPlanV1 {
  botId: string;
  effects: DebatePowerEffectPlanV1[];
  hardMuted: boolean;
  visibleToBotIds: string[] | null;
  speechAudienceBotIds: string[] | null;
  warnings: string[];
}

export interface DebatePowerPlanV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  resolvedAt: string;
  theme: BotPowerResolvedThemeV1;
  bots: Record<string, DebateBotPowerPlanV1>;
}

export interface DebateCaseCardV1 {
  id: string;
  sideId: DebateSideId;
  summary: string;
  status: DebateCaseCardStatus;
  sourceIds: string[];
  createdEventId: string;
  updatedAt: string;
}

export type DebateEventKind =
  | "intro"
  | "phase"
  | "speech"
  | "silence"
  | "testimony"
  | "press"
  | "objection"
  | "evidence"
  | "revelation"
  | "player_turn"
  | "reaction"
  | "interjection"
  | "judge_gavel"
  | "moderator_ruling"
  | "case_board"
  | "ballot"
  | "jury_deliberation"
  | "jury_verdict"
  | "verdict"
  | "error";

export type DebateSpeakerKind =
  "moderator" | "advocate" | "juror" | "player" | "system";

export type DebateTurnTimingStatus = "within_limit" | "overtime";
export type DebateJudgeGavelReason =
  | "audience_order"
  | "intervention"
  | "overtime"
  | "resume";
export type DebateJudgeGavelDemeanor = "measured" | "firm" | "aggravated";

export interface DebateTurnTimingV1 {
  limitMs: number;
  estimatedDurationMs: number;
  overtimeMs: number;
  status: DebateTurnTimingStatus;
}

export interface DebateEventV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  id: string;
  sequence: number;
  phase: DebatePhase;
  stepKey: string;
  kind: DebateEventKind;
  speakerKind: DebateSpeakerKind;
  speakerBotId: string | null;
  sideId: DebateSideId | null;
  content: string;
  sourceIds: string[];
  parentEventId?: string | null;
  interrupted?: boolean;
  interruptedBy?: "player" | "bot" | null;
  provider?: LlmProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
  statementId?: string | null;
  evidenceSourceId?: string | null;
  ruling?: DebateTurnaboutRuling | null;
  gavelReason?: DebateJudgeGavelReason;
  gavelStrikeCount?: number;
  gavelDemeanor?: DebateJudgeGavelDemeanor;
  /** Public-content offset for a non-interrupting saved audience-order cue. */
  gavelHeardCharacterCount?: number;
  timing?: DebateTurnTimingV1;
  createdAt: string;
}

export function debateEventIsTranscriptHousekeeping(
  event: Pick<DebateEventV1, "stepKey">,
): boolean {
  return (
    event.stepKey === "audience_order" ||
    event.stepKey === "pause" ||
    event.stepKey === "resume"
  );
}

/** Sparse Persona surprise Foley — spoken, tagged, never Proceedings text. */
export const DEBATE_PERSONA_SURPRISE_STEP_PREFIX = "persona_reaction_" as const;

export function debateEventIsAtmosphericVocalFoley(
  event: Pick<DebateEventV1, "kind" | "stepKey">,
): boolean {
  return (
    event.kind === "reaction" &&
    event.stepKey.startsWith(DEBATE_PERSONA_SURPRISE_STEP_PREFIX)
  );
}

export interface DebateJudgeGavelStateV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  status: "awaiting_message";
  gavelEventId: string;
  sourceEventId: string | null;
  invokedAt: string;
  resumeStatus: DebateStatus;
  resumePhase: DebatePhase;
  resumeStepKey: string;
}

export interface DebateObjectionRulingStateV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  status: "awaiting_ruling";
  interruptedEventId: string;
  objectionEventId: string;
  interruptedBotId: string;
  objectingBotId: string;
  resumeStatus: DebateStatus;
  resumePhase: DebatePhase;
  resumeStepKey: string;
}

export interface DebateParticipantObjectionStateV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  status: "awaiting_reason";
  interruptedEventId: string;
  objectionEventId: string;
  interruptedBotId: string;
  resumeStatus: DebateStatus;
  resumePhase: DebatePhase;
  resumeStepKey: string;
}

export interface DebateBallotV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  voterBotId: string;
  sideId: DebateSideId;
  reason: string | null;
  privateReason: boolean;
  provider?: LlmProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
  createdAt: string;
}

export interface DebateJuryBallotV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  jurorBotId: string;
  stage: "initial" | "final";
  sideId: DebateSideId;
  confidence: number;
  personaInstinct: string;
  reason: string;
  provider?: LlmProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
  createdAt: string;
}

export interface DebateJuryStateV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  enabled: boolean;
  cadence: DebateJuryCadence;
  phase: DebateJuryPhase;
  jurors: DebateJurorSnapshotV1[];
  forepersonBotId: string | null;
  initialBallots: DebateJuryBallotV1[];
  finalBallots: DebateJuryBallotV1[];
  discussionTurnTarget: number;
  discussionTurnCount: number;
  speakerCounts: Record<string, number>;
  majoritySideId: DebateSideId | null;
  forVotes: number;
  againstVotes: number;
  calledVoteAt: string | null;
  completedAt: string | null;
}

export interface DebateSessionV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  id: string;
  revision: number;
  status: DebateStatus;
  phase: DebatePhase;
  stepKey: string;
  /** Primary generation lane, frozen when Start succeeds. */
  provider: LlmProviderName;
  model: string;
  responseMode: ResponseMode;
  /** Ordered primary + fallback lanes. One entry for LOCAL/ONLINE. */
  generationChain: AutoFallbackModelRef[];
  format: DebateFormatId;
  formatVersion: typeof DEBATE_FORMAT_SCHEMA_VERSION;
  formatState: DebateFormatStateV1;
  /** Frozen at creation; legacy records normalize to parliamentary. */
  formality: DebateFormalityId;
  setupPresetId: DebateSetupPresetId | "custom";
  playerRole: DebatePlayerRole;
  playerSideId: DebateSideId | null;
  motion: DebateMotionSlateV1;
  evidence: DebateEvidencePacketV1;
  /** Frozen public authority label; the moderator bot ID remains canonical. */
  moderatorTitle: string;
  moderator: DebateBotSnapshotV1;
  forAdvocate: DebateBotSnapshotV1;
  againstAdvocate: DebateBotSnapshotV1;
  advocacyConsent: DebateAdvocacyConsent[];
  powerPlan: DebatePowerPlanV1;
  caseBoard: DebateCaseCardV1[];
  ballots: DebateBallotV1[];
  jury: DebateJuryStateV1;
  playerVerdict: DebateSideId | null;
  winnerSideId: DebateSideId | null;
  /** Active only after an unscheduled player-Judge gavel strike. */
  judgeGavel?: DebateJudgeGavelStateV1 | null;
  judgeGavelCooldownUntil?: string | null;
  /** Active after a bot objection until the human Judge rules. */
  objectionRuling?: DebateObjectionRulingStateV1 | null;
  /** Active after a Participant shouts Objection and before they state why. */
  participantObjection?: DebateParticipantObjectionStateV1 | null;
  events: DebateEventV1[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  endedEarlyAt: string | null;
  completedAt: string | null;
  /** Coffee-style end-of-session overview; present once generated after completion. */
  synopsis?: DebateSessionSynopsisV1 | null;
}

export interface DebateSessionSynopsisV1 {
  text: string;
  generatedAt: string;
}

export const DEBATE_SESSION_SYNOPSIS_MAX_LENGTH = 750;

export function normalizeDebateSessionSynopsis(
  value: unknown,
): DebateSessionSynopsisV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const text =
    typeof record.text === "string"
      ? record.text.replace(/\s+/gu, " ").trim().slice(0, DEBATE_SESSION_SYNOPSIS_MAX_LENGTH)
      : "";
  const generatedAt =
    typeof record.generatedAt === "string" ? record.generatedAt.trim() : "";
  if (!text || !generatedAt) return null;
  return { text, generatedAt };
}

export interface DebateSynthesizeRequest {
  topic: string;
  formality?: DebateFormalityId;
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
  responseMode?: ResponseMode;
}

export interface DebateSynthesizeResponse {
  slates: DebateMotionSlateV1[];
}

export interface DebateResearchRequest {
  query: string;
  preferredProvider?: LlmProviderName;
  responseMode?: ResponseMode;
}

export interface DebateResearchResponse {
  sources: DebateEvidenceSourceV1[];
}

export interface DebateRoleChecksRequest {
  format?: DebateFormatId;
  formality?: DebateFormalityId;
  motion: DebateMotionSlateV1;
  /** Optional on the human-owned side in Participant mode. */
  forAdvocateBotId?: string;
  /** Optional on the human-owned side in Participant mode. */
  againstAdvocateBotId?: string;
  playerRole?: DebatePlayerRole;
  playerSideId?: DebateSideId | null;
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
  responseMode?: ResponseMode;
}

export interface DebateRoleChecksResponse {
  checks: DebateAdvocacyConsent[];
}

export interface DebateForumRoundPlanV1 {
  mode: DebateForumRoundMode;
  count: number;
  rationale: string;
}

/**
 * Resolve Forum length without another model call. Auto remains available in
 * LOCAL mode and is explainable from setup inputs before the proceeding starts.
 */
export function resolveDebateForumRoundPlan(args: {
  mode?: DebateForumRoundMode;
  count?: number;
  motion: DebateMotionSlateV1;
  evidence: DebateEvidencePacketV1;
}): DebateForumRoundPlanV1 {
  if (args.mode === "fixed") {
    const count = Math.max(
      DEBATE_FORUM_MIN_REBUTTAL_ROUNDS,
      Math.min(
        DEBATE_FORUM_MAX_REBUTTAL_ROUNDS,
        Number.isInteger(args.count) ? args.count! : 1,
      ),
    );
    return {
      mode: "fixed",
      count,
      rationale: `${count} rebuttal ${count === 1 ? "exchange" : "exchanges"}, chosen in setup.`,
    };
  }

  const motionText = [
    args.motion.motion,
    args.motion.forSide.label,
    args.motion.againstSide.label,
  ]
    .join(" ")
    .toLowerCase();
  const briefWordCount = [
    args.motion.forSide.brief,
    args.motion.againstSide.brief,
  ]
    .join(" ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
  const motionWordCount = motionText.split(/\s+/u).filter(Boolean).length;
  const evidenceCount =
    args.evidence.sources.length + (args.evidence.exhibits?.length ?? 0);
  const scopeSignals = new Set(
    motionText.match(
      /\b(?:ban|cause|community|economic|education|environment|ethical|government|health|law|moral|policy|privacy|public|require|rights?|safety|society|technology|trade-?off)\b/gu,
    ) ?? [],
  ).size;

  let complexity = 0;
  if (evidenceCount >= 1) complexity += 1;
  if (evidenceCount >= 4) complexity += 1;
  if (briefWordCount >= 160) complexity += 1;
  if (briefWordCount >= 320) complexity += 1;
  if (motionWordCount >= 18) complexity += 1;
  if (scopeSignals >= 3) complexity += 1;
  if (scopeSignals >= 6) complexity += 1;

  const count = complexity >= 5 ? 3 : complexity >= 2 ? 2 : 1;
  const reasons = [
    scopeSignals >= 3 ? "a multi-factor motion" : "a focused motion",
    briefWordCount >= 160 ? "detailed side briefs" : null,
    evidenceCount > 0
      ? `${evidenceCount} frozen evidence ${evidenceCount === 1 ? "item" : "items"}`
      : null,
  ].filter((reason): reason is string => reason !== null);
  return {
    mode: "auto",
    count,
    rationale: `Auto chose ${count} rebuttal ${count === 1 ? "exchange" : "exchanges"} for ${reasons.join(" and ")}.`,
  };
}

export interface DebateSessionCreateRequest {
  format?: DebateFormatId;
  formality?: DebateFormalityId;
  presetId?: DebateSetupPresetId | "custom";
  jury?: {
    enabled?: boolean;
    cadence?: DebateJuryCadence;
  };
  forumRounds?: {
    mode?: DebateForumRoundMode;
    count?: number;
  };
  motion: DebateMotionSlateV1;
  evidence: DebateEvidencePacketV1;
  moderatorTitle?: string;
  moderatorBotId: string;
  playerJudgeUsesPrism?: boolean;
  /** Optional on the human-owned side in Participant mode. */
  forAdvocateBotId?: string;
  /** Optional on the human-owned side in Participant mode. */
  againstAdvocateBotId?: string;
  playerRole: DebatePlayerRole;
  playerSideId?: DebateSideId | null;
  advocacyConsent: DebateAdvocacyConsent[];
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
  responseMode?: ResponseMode;
  theme?: BotPowerResolvedThemeV1;
  idempotencyKey: string;
}

export interface DebateMutationRequest {
  expectedRevision: number;
  idempotencyKey: string;
}

export interface DebateAdvanceRequest extends DebateMutationRequest {
  skip?: boolean;
}

export interface DebatePlayerTurnRequest extends DebateMutationRequest {
  content?: string;
  pass?: boolean;
  targetSideId?: DebateSideId;
}

export interface DebateVerdictRequest extends DebateMutationRequest {
  sideId: DebateSideId;
  reason?: string;
}

export interface DebateInterjectionRequest extends DebateMutationRequest {
  eventId: string;
  heardCharacterCount: number;
  content: string;
}

export interface DebateParticipantObjectionRaiseRequest extends DebateMutationRequest {
  eventId: string;
  heardCharacterCount: number;
}

export interface DebateParticipantObjectionResolveRequest extends DebateMutationRequest {
  content?: string;
  withdraw?: boolean;
}

export interface DebateJudgeGavelRequest extends DebateMutationRequest {
  eventId?: string | null;
  heardCharacterCount?: number;
  overtime?: boolean;
  strikeCount?: number;
}

export interface DebateJudgeAudienceOrderRequest
  extends DebateMutationRequest {
  eventId?: string | null;
  heardCharacterCount?: number;
}

export interface DebateJudgeGavelMessageRequest extends DebateMutationRequest {
  content?: string;
  pass?: boolean;
}

export interface DebateObjectionRulingRequest extends DebateMutationRequest {
  ruling: DebateTurnaboutRuling;
}

export type DebateTurnaboutAction = "press" | "present_evidence" | "pass";

export interface DebateTurnaboutActionRequest extends DebateMutationRequest {
  action: DebateTurnaboutAction;
  statementId: string;
  evidenceSourceId?: string | null;
}

export interface DebateSessionListItemV1 {
  id: string;
  format: DebateFormatId;
  status: DebateStatus;
  phase: DebatePhase;
  title: string;
  motion: string;
  moderatorTitle: string;
  setupPresetId: DebateSetupPresetId | "custom";
  formality: DebateFormalityId;
  juryEnabled: boolean;
  playerRole: DebatePlayerRole;
  winnerSideId: DebateSideId | null;
  updatedAt: string;
  completedAt: string | null;
  /** Canonical presentation runtime; excludes recesses and generation waits. */
  activeDurationMs: number | null;
  synopsisText?: string | null;
}

export interface DebateDebriefChatMessageV1 {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  createdAt: string;
}

export interface DebateDebriefEligibleBotV1 {
  id: string;
  name: string;
  role: "moderator" | "advocate" | "juror";
  sideId: DebateSideId | null;
}

/**
 * Cast eligible for post-session inquiry chat. Participant-sealed Jury stays
 * anonymous — those juror identities are not addressable.
 */
export function debateDebriefEligibleBots(
  session: Pick<
    DebateSessionV1,
    | "moderator"
    | "forAdvocate"
    | "againstAdvocate"
    | "jury"
    | "playerRole"
  >,
): DebateDebriefEligibleBotV1[] {
  const cast: DebateDebriefEligibleBotV1[] = [];
  if (
    session.moderator.id !== DEBATE_PLAYER_JUDGE_BOT_ID &&
    session.moderator.id !== DEBATE_PLAYER_PARTICIPANT_BOT_ID
  ) {
    cast.push({
      id: session.moderator.id,
      name: session.moderator.name,
      role: "moderator",
      sideId: null,
    });
  }
  if (session.forAdvocate.id !== DEBATE_PLAYER_PARTICIPANT_BOT_ID) {
    cast.push({
      id: session.forAdvocate.id,
      name: session.forAdvocate.name,
      role: "advocate",
      sideId: "for",
    });
  }
  if (session.againstAdvocate.id !== DEBATE_PLAYER_PARTICIPANT_BOT_ID) {
    cast.push({
      id: session.againstAdvocate.id,
      name: session.againstAdvocate.name,
      role: "advocate",
      sideId: "against",
    });
  }
  if (session.jury.enabled && session.playerRole !== "participant") {
    for (const juror of session.jury.jurors) {
      cast.push({
        id: juror.id,
        name: juror.name,
        role: "juror",
        sideId: null,
      });
    }
  }
  return cast;
}

function normalizedText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : "";
}

function normalizedMultilineText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\r\n?/gu, "\n").trim().slice(0, maxLength)
    : "";
}

export function normalizeDebateModeratorTitle(value: unknown): string {
  return (
    normalizedText(value, DEBATE_MODERATOR_TITLE_MAX_LENGTH) || "Moderator"
  );
}

export function normalizeDebateSideLabel(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length <= DEBATE_SIDE_LABEL_MAX_LENGTH) return normalized;

  const clipped = normalized.slice(0, DEBATE_SIDE_LABEL_MAX_LENGTH);
  const lastBoundary = clipped.lastIndexOf(" ");
  const shortened =
    lastBoundary >= Math.floor(DEBATE_SIDE_LABEL_MAX_LENGTH / 2)
      ? clipped.slice(0, lastBoundary)
      : clipped;
  return shortened.replace(/[\s&,:;–—-]+$/gu, "").trim() || fallback;
}

export function normalizeDebateTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= DEBATE_TITLE_MAX_LENGTH) return normalized;
  const clipped = normalized.slice(0, DEBATE_TITLE_MAX_LENGTH);
  const lastBoundary = clipped.lastIndexOf(" ");
  return (
    (lastBoundary >= Math.floor(DEBATE_TITLE_MAX_LENGTH / 2)
      ? clipped.slice(0, lastBoundary)
      : clipped
    ).replace(/[\s&,:;–—-]+$/gu, "") || "Debate"
  );
}

/** A safe title for legacy records or an unavailable title-generation lane. */
export function debateTitleForMotion(
  motion: Pick<
    DebateMotionSlateV1,
    "title" | "motion" | "forSide" | "againstSide"
  >,
  formality: DebateFormalityId,
): string {
  const saved = normalizeDebateTitle(motion.title);
  if (saved) return saved;
  const forLabel = normalizeDebateSideLabel(motion.forSide.label, "For");
  const againstLabel = normalizeDebateSideLabel(
    motion.againstSide.label,
    "Against",
  );
  if (forLabel === "For" && againstLabel === "Against") {
    const exactMotion = normalizeDebateTitle(motion.motion) || "Debate";
    return normalizeDebateTitle(
      formality === "free_for_all"
        ? `No Holding Back: ${exactMotion}`
        : formality === "heated"
          ? `The Showdown: ${exactMotion}`
          : formality === "structured"
            ? `The Case: ${exactMotion}`
            : formality === "parliamentary"
              ? `The Motion: ${exactMotion}`
              : exactMotion,
    );
  }
  const clash = `${forLabel} vs. ${againstLabel}`;
  return normalizeDebateTitle(
    formality === "free_for_all"
      ? `${clash}: No Holding Back`
      : formality === "heated"
        ? `${clash}: The Showdown`
        : formality === "plainspoken"
          ? `${forLabel} or ${againstLabel}?`
          : formality === "structured"
            ? `${clash}: The Case`
            : `${forLabel} and ${againstLabel}: The Motion`,
  );
}

export function normalizeDebateMotionSlateV1(
  value: unknown,
  fallbackId = "slate-1",
): DebateMotionSlateV1 {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const forSide =
    source.forSide && typeof source.forSide === "object"
      ? (source.forSide as Record<string, unknown>)
      : {};
  const againstSide =
    source.againstSide && typeof source.againstSide === "object"
      ? (source.againstSide as Record<string, unknown>)
      : {};
  const title = normalizeDebateTitle(source.title);
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: normalizedText(source.id, 80) || fallbackId,
    ...(title ? { title } : {}),
    motion: normalizedText(source.motion, DEBATE_MOTION_MAX_LENGTH),
    forSide: {
      label: normalizeDebateSideLabel(forSide.label, "For"),
      brief: normalizedMultilineText(
        forSide.brief,
        DEBATE_SIDE_BRIEF_MAX_LENGTH,
      ),
    },
    againstSide: {
      label: normalizeDebateSideLabel(againstSide.label, "Against"),
      brief: normalizedMultilineText(
        againstSide.brief,
        DEBATE_SIDE_BRIEF_MAX_LENGTH,
      ),
    },
  };
}

export function isValidDebateSourceId(value: unknown): value is string {
  return (
    typeof value === "string" && /^[a-z0-9](?:[a-z0-9_-]{0,47})$/u.test(value)
  );
}

export function normalizeDebateEvidenceExhibitAdjective(
  value: unknown,
): string {
  return (
    normalizedText(value, DEBATE_EVIDENCE_EXHIBIT_ADJECTIVE_MAX_LENGTH)
      .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
      .trim()
      .split(/\s+/u)[0]
      ?.slice(0, DEBATE_EVIDENCE_EXHIBIT_ADJECTIVE_MAX_LENGTH) ?? ""
  );
}

export function normalizeDebateEvidenceExhibitObject(value: unknown): string {
  return normalizedText(value, DEBATE_EVIDENCE_EXHIBIT_OBJECT_MAX_LENGTH)
    .replace(/[^\p{L}\p{N}'’()&+.,/-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function debateEvidenceExhibitTitle(args: {
  adjective: unknown;
  object: unknown;
}): string {
  const adjective = normalizeDebateEvidenceExhibitAdjective(args.adjective);
  const object = normalizeDebateEvidenceExhibitObject(args.object);
  if (!adjective || !object) return "";
  return `${adjective[0]!.toLocaleUpperCase()}${adjective.slice(1)} ${object}`;
}

function normalizeDebateEvidenceEmoji(value: unknown): string {
  const emoji = normalizedText(value, 16);
  return emoji || "📦";
}

export function normalizeDebateEvidencePacketV1(
  value: unknown,
): DebateEvidencePacketV1 {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const seen = new Set<string>();
  const sources = Array.isArray(source.sources)
    ? source.sources
        .map((item): DebateEvidenceSourceV1 | null => {
          const row =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {};
          const id = normalizedText(row.id, 48).toLowerCase();
          const url = normalizedText(row.url, 2_048);
          if (!isValidDebateSourceId(id) || seen.has(id) || !url) return null;
          try {
            const parsed = new URL(url);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              return null;
            }
          } catch {
            return null;
          }
          seen.add(id);
          return {
            id,
            title: normalizedText(row.title, 240) || parsedHost(url),
            url,
            snippet: normalizedMultilineText(row.snippet, 800),
            publishedAt:
              typeof row.publishedAt === "string" && row.publishedAt.trim()
                ? row.publishedAt.trim().slice(0, 64)
                : null,
          };
        })
        .filter((item): item is DebateEvidenceSourceV1 => item !== null)
        .slice(0, DEBATE_EVIDENCE_ITEM_MAX_COUNT)
    : [];
  const exhibitCapacity = Math.max(
    0,
    DEBATE_EVIDENCE_ITEM_MAX_COUNT - sources.length,
  );
  const exhibits = Array.isArray(source.exhibits)
    ? source.exhibits
        .map((item): DebateEvidenceExhibitV1 | null => {
          const row =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {};
          const id = normalizedText(row.id, 48).toLowerCase();
          const adjective = normalizeDebateEvidenceExhibitAdjective(
            row.adjective,
          );
          const object = normalizeDebateEvidenceExhibitObject(row.object);
          const title = debateEvidenceExhibitTitle({ adjective, object });
          if (
            !isValidDebateSourceId(id) ||
            seen.has(id) ||
            !adjective ||
            !object ||
            !title
          ) {
            return null;
          }
          seen.add(id);
          const requestedVisualKind = row.visualKind;
          const imageId = normalizedText(row.imageId, 160) || null;
          const visualKind: DebateEvidenceExhibitVisualKind =
            (requestedVisualKind === "upload" ||
              requestedVisualKind === "synthesized") &&
            imageId
              ? requestedVisualKind
              : "emoji";
          return {
            id,
            adjective,
            object,
            title,
            observation:
              normalizedMultilineText(
                row.observation,
                DEBATE_EVIDENCE_EXHIBIT_OBSERVATION_MAX_LENGTH,
              ) || `${title}.`,
            emoji: normalizeDebateEvidenceEmoji(row.emoji),
            visualKind,
            imageId: visualKind === "emoji" ? null : imageId,
            createdBy: row.createdBy === "prism" ? "prism" : "player",
          };
        })
        .filter((item): item is DebateEvidenceExhibitV1 => item !== null)
        .slice(0, exhibitCapacity)
    : [];
  return {
    version: DEBATE_SCHEMA_VERSION,
    notes: normalizedMultilineText(
      source.notes,
      DEBATE_EVIDENCE_NOTES_MAX_LENGTH,
    ),
    sources,
    exhibits,
    frozenAt:
      typeof source.frozenAt === "string" && source.frozenAt.trim()
        ? source.frozenAt.trim().slice(0, 64)
        : null,
  };
}

export function debateEvidenceItems(
  evidence: DebateEvidencePacketV1,
): DebateEvidenceItemV1[] {
  return [
    ...evidence.sources.map((value): DebateEvidenceItemV1 => ({
      kind: "source",
      value,
    })),
    ...(evidence.exhibits ?? []).map((value): DebateEvidenceItemV1 => ({
      kind: "exhibit",
      value,
    })),
  ];
}

export function debateEvidenceItemById(
  evidence: DebateEvidencePacketV1,
  id: string,
): DebateEvidenceItemV1 | null {
  const normalizedId = id.trim().toLowerCase();
  return (
    debateEvidenceItems(evidence).find(
      (item) => item.value.id === normalizedId,
    ) ?? null
  );
}

export function debateEvidenceItemRecord(item: DebateEvidenceItemV1): string {
  return item.kind === "source"
    ? `${item.value.title}. ${item.value.snippet}`.trim()
    : `${item.value.title}. ${item.value.observation}`.trim();
}

export function debateEvidenceItemCount(
  evidence: DebateEvidencePacketV1,
): number {
  return evidence.sources.length + (evidence.exhibits?.length ?? 0);
}

function parsedHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Source";
  }
}

export function debateSourceIdsFromText(
  content: string,
  evidence: DebateEvidencePacketV1,
): string[] {
  const allowed = new Set(
    debateEvidenceItems(evidence).map((item) => item.value.id),
  );
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(
    /\[\[(?:source|exhibit):([a-z0-9][a-z0-9_-]{0,47})\]\]/giu,
  )) {
    const id = match[1]?.toLowerCase();
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function sanitizeDebateStatementSources(
  content: string,
  evidence: DebateEvidencePacketV1,
): { content: string; sourceIds: string[] } {
  const allowed = new Map(
    debateEvidenceItems(evidence).map((item) => [item.value.id, item.kind]),
  );
  const sourceIds: string[] = [];
  const seen = new Set<string>();
  const sanitized = content.replace(
    /\s*\[\[(?:source|exhibit):([^\]]+)\]\]/giu,
    (_marker, rawId: string) => {
      const id = rawId.trim().toLowerCase();
      const kind = allowed.get(id);
      if (!isValidDebateSourceId(id) || !kind) return "";
      if (!seen.has(id)) {
        seen.add(id);
        sourceIds.push(id);
      }
      return ` [[${kind}:${id}]]`;
    },
  );
  return {
    content: normalizedMultilineText(sanitized, 12_000),
    sourceIds,
  };
}

export function debateSpokenText(content: string): string {
  return content
    .replace(/\s*\[\[(?:source|exhibit):[^\]]+\]\]/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function debateEstimatedSpeechDurationMs(content: string): number {
  const normalized = debateSpokenText(content);
  if (!normalized) return 0;
  const wordCount = normalized.split(" ").length;
  const pauseCount = normalized.match(/[,.!?;:—]/gu)?.length ?? 0;
  return Math.min(
    60_000,
    Math.max(1_400, Math.round(wordCount * 330 + pauseCount * 75)),
  );
}

const DEBATE_ACTIVE_PRESENTATION_EVENT_KINDS = new Set<DebateEventKind>([
  "intro",
  "phase",
  "speech",
  "testimony",
  "press",
  "objection",
  "evidence",
  "revelation",
  "player_turn",
  "reaction",
  "interjection",
  "judge_gavel",
  "moderator_ruling",
  "ballot",
  "jury_deliberation",
  "jury_verdict",
  "verdict",
]);

/**
 * Deterministic active runtime for a saved Debate record. This mirrors the
 * presentation timeline instead of wall-clock time, so model generation,
 * explicit recesses, and time spent away from the proceeding do not count.
 */
export function debateActivePresentationDurationMs(
  events: readonly DebateEventV1[],
  playerRole: DebatePlayerRole,
): number {
  return events.reduce((durationMs, event) => {
    if (
      debateEventIsTranscriptHousekeeping(event) ||
      !DEBATE_ACTIVE_PRESENTATION_EVENT_KINDS.has(event.kind) ||
      event.kind === "silence" ||
      (event.kind === "verdict" && event.speakerKind !== "player") ||
      (playerRole === "participant" &&
        (event.kind === "jury_deliberation" ||
          (event.kind === "ballot" && event.speakerKind === "juror") ||
          event.kind === "jury_verdict"))
    ) {
      return durationMs;
    }
    if (
      event.kind === "judge_gavel" &&
      event.gavelReason === "intervention"
    ) {
      return durationMs + 260;
    }
    return durationMs + debateEstimatedSpeechDurationMs(event.content);
  }, 0);
}

export function isDebatePlayerRole(value: unknown): value is DebatePlayerRole {
  return value === "judge" || value === "participant" || value === "spectator";
}

export function isDebateSideId(value: unknown): value is DebateSideId {
  return value === "for" || value === "against";
}

const DEBATE_BALLOT_FOR_ALIASES = new Set([
  "for",
  "pro",
  "affirmative",
  "proposition",
  "government",
  "aye",
  "yes",
  "support",
  "supporting",
]);

const DEBATE_BALLOT_AGAINST_ALIASES = new Set([
  "against",
  "con",
  "negative",
  "opposition",
  "opp",
  "nay",
  "no",
  "oppose",
  "opposing",
]);

/**
 * Coerce model ballot output into a Debate side id.
 * Models often return side labels ("Choosing Selves"), title case ("Against"),
 * or nested `{ ballot: { sideId } }` instead of exact `"for"` / `"against"`.
 */
export function coerceDebateBallotSideId(
  value: unknown,
  motion?: Pick<DebateMotionSlateV1, "forSide" | "againstSide"> | null,
): DebateSideId | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (isDebateSideId(lower)) return lower;
    if (DEBATE_BALLOT_FOR_ALIASES.has(lower)) return "for";
    if (DEBATE_BALLOT_AGAINST_ALIASES.has(lower)) return "against";
    if (motion) {
      const forLabel = motion.forSide.label.trim().toLowerCase();
      const againstLabel = motion.againstSide.label.trim().toLowerCase();
      const matchesFor =
        Boolean(forLabel) &&
        (lower === forLabel ||
          lower.includes(forLabel) ||
          (forLabel.length >= 4 && forLabel.includes(lower)));
      const matchesAgainst =
        Boolean(againstLabel) &&
        (lower === againstLabel ||
          lower.includes(againstLabel) ||
          (againstLabel.length >= 4 && againstLabel.includes(lower)));
      if (matchesFor && matchesAgainst) {
        if (lower === forLabel) return "for";
        if (lower === againstLabel) return "against";
        return null;
      }
      if (matchesFor) return "for";
      if (matchesAgainst) return "against";
    }
    return null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return (
      coerceDebateBallotSideId(record.sideId, motion) ??
      coerceDebateBallotSideId(record.side, motion) ??
      coerceDebateBallotSideId(record.winnerSideId, motion) ??
      coerceDebateBallotSideId(record.winner, motion) ??
      coerceDebateBallotSideId(record.verdict, motion) ??
      coerceDebateBallotSideId(record.vote, motion) ??
      coerceDebateBallotSideId(record.ballot, motion)
    );
  }
  return null;
}

export function isDebateFormatId(value: unknown): value is DebateFormatId {
  return value === "forum" || value === "turnabout";
}

export function normalizeDebateFormatId(value: unknown): DebateFormatId {
  return value === "turnabout" ? "turnabout" : "forum";
}

export function isDebateSetupPresetId(
  value: unknown,
): value is DebateSetupPresetId {
  return DEBATE_SETUP_PRESETS.some((preset) => preset.id === value);
}

export function normalizeDebateSetupPresetId(
  value: unknown,
): DebateSetupPresetId | "custom" {
  return isDebateSetupPresetId(value) ? value : "custom";
}

export function defaultDebateJuryStateV1(): DebateJuryStateV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    enabled: false,
    cadence: "natural-five",
    phase: "disabled",
    jurors: [],
    forepersonBotId: null,
    initialBallots: [],
    finalBallots: [],
    discussionTurnTarget: DEBATE_JURY_DISCUSSION_TURNS,
    discussionTurnCount: 0,
    speakerCounts: {},
    majoritySideId: null,
    forVotes: 0,
    againstVotes: 0,
    calledVoteAt: null,
    completedAt: null,
  };
}

export function normalizeDebateJuryStateV1(value: unknown): DebateJuryStateV1 {
  const fallback = defaultDebateJuryStateV1();
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (source.enabled !== true) return fallback;

  const jurors = Array.isArray(source.jurors)
    ? source.jurors.filter((juror): juror is DebateJurorSnapshotV1 => {
        if (!juror || typeof juror !== "object") return false;
        const row = juror as Partial<DebateJurorSnapshotV1>;
        return (
          row.role === "juror" &&
          row.sideId === null &&
          typeof row.id === "string" &&
          row.id.trim().length > 0 &&
          typeof row.name === "string" &&
          row.name.trim().length > 0 &&
          (row.source === "library" || row.source === "generic")
        );
      })
    : [];
  const selectedJurors = jurors.slice(0, DEBATE_JURY_SIZE);
  const selectedJurorIds = new Set(selectedJurors.map((juror) => juror.id));
  const initialBallots = Array.isArray(source.initialBallots)
    ? source.initialBallots
        .filter((ballot): ballot is DebateJuryBallotV1 =>
          Boolean(
            ballot &&
            typeof ballot === "object" &&
            (ballot as DebateJuryBallotV1).stage === "initial" &&
            selectedJurorIds.has((ballot as DebateJuryBallotV1).jurorBotId) &&
            isDebateSideId((ballot as DebateJuryBallotV1).sideId),
          ),
        )
        .slice(0, DEBATE_JURY_SIZE)
    : [];
  const finalBallots = Array.isArray(source.finalBallots)
    ? source.finalBallots
        .filter((ballot): ballot is DebateJuryBallotV1 =>
          Boolean(
            ballot &&
            typeof ballot === "object" &&
            (ballot as DebateJuryBallotV1).stage === "final" &&
            selectedJurorIds.has((ballot as DebateJuryBallotV1).jurorBotId) &&
            isDebateSideId((ballot as DebateJuryBallotV1).sideId),
          ),
        )
        .slice(0, DEBATE_JURY_SIZE)
    : [];
  const phase: DebateJuryPhase =
    source.phase === "waiting" ||
    source.phase === "initial_ballots" ||
    source.phase === "deliberating" ||
    source.phase === "final_ballots" ||
    source.phase === "complete"
      ? source.phase
      : "waiting";
  const speakerCounts =
    source.speakerCounts &&
    typeof source.speakerCounts === "object" &&
    !Array.isArray(source.speakerCounts)
      ? Object.fromEntries(
          Object.entries(source.speakerCounts as Record<string, unknown>)
            .filter(
              ([id, count]) =>
                selectedJurorIds.has(id) &&
                typeof count === "number" &&
                count >= 0,
            )
            .map(([id, count]) => [id, Math.floor(count as number)]),
        )
      : {};
  const forVotes = finalBallots.filter(
    (ballot) => ballot.sideId === "for",
  ).length;
  const againstVotes = finalBallots.filter(
    (ballot) => ballot.sideId === "against",
  ).length;
  return {
    version: DEBATE_SCHEMA_VERSION,
    enabled: true,
    cadence: "natural-five",
    phase,
    jurors: selectedJurors,
    forepersonBotId:
      typeof source.forepersonBotId === "string" &&
      selectedJurorIds.has(source.forepersonBotId)
        ? source.forepersonBotId
        : (selectedJurors[0]?.id ?? null),
    initialBallots,
    finalBallots,
    discussionTurnTarget:
      typeof source.discussionTurnTarget === "number"
        ? Math.max(
            0,
            Math.min(
              DEBATE_JURY_DISCUSSION_TURNS,
              Math.floor(source.discussionTurnTarget),
            ),
          )
        : DEBATE_JURY_DISCUSSION_TURNS,
    discussionTurnCount:
      typeof source.discussionTurnCount === "number"
        ? Math.max(0, Math.floor(source.discussionTurnCount))
        : 0,
    speakerCounts,
    majoritySideId: isDebateSideId(source.majoritySideId)
      ? source.majoritySideId
      : finalBallots.length === DEBATE_JURY_SIZE
        ? forVotes > againstVotes
          ? "for"
          : "against"
        : null,
    forVotes,
    againstVotes,
    calledVoteAt:
      typeof source.calledVoteAt === "string" ? source.calledVoteAt : null,
    completedAt:
      typeof source.completedAt === "string" ? source.completedAt : null,
  };
}

export function defaultDebateFormatStateV1(
  format: DebateFormatId,
): DebateFormatStateV1 {
  return format === "turnabout"
    ? {
        version: DEBATE_FORMAT_SCHEMA_VERSION,
        format: "turnabout",
        phase: "testimony",
        round: 1,
        activeStatementId: null,
        floorOwnerBotId: null,
        statements: [],
        contradictions: [],
      }
    : {
        version: DEBATE_FORMAT_SCHEMA_VERSION,
        format: "forum",
        rebuttalRound: 1,
        rebuttalRoundTarget: 1,
        rebuttalRoundMode: "fixed",
        rebuttalRoundRationale: "One rebuttal exchange.",
      };
}

export function normalizeDebateFormatStateV1(
  value: unknown,
  requestedFormat?: unknown,
): DebateFormatStateV1 {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const format = isDebateFormatId(requestedFormat)
    ? requestedFormat
    : normalizeDebateFormatId(source.format);
  if (format === "forum") {
    const target =
      typeof source.rebuttalRoundTarget === "number" &&
      Number.isInteger(source.rebuttalRoundTarget)
        ? Math.max(
            DEBATE_FORUM_MIN_REBUTTAL_ROUNDS,
            Math.min(DEBATE_FORUM_MAX_REBUTTAL_ROUNDS, source.rebuttalRoundTarget),
          )
        : 1;
    const round =
      typeof source.rebuttalRound === "number" &&
      Number.isInteger(source.rebuttalRound)
        ? Math.max(1, Math.min(target, source.rebuttalRound))
        : 1;
    return {
      version: DEBATE_FORMAT_SCHEMA_VERSION,
      format: "forum",
      rebuttalRound: round,
      rebuttalRoundTarget: target,
      rebuttalRoundMode: source.rebuttalRoundMode === "auto" ? "auto" : "fixed",
      rebuttalRoundRationale: normalizedText(
        source.rebuttalRoundRationale,
        180,
      ) ||
        (target === 1
          ? "One rebuttal exchange."
          : `${target} rebuttal exchanges.`),
    };
  }

  const statements = Array.isArray(source.statements)
    ? source.statements.flatMap((item): DebateTurnaboutStatementV1[] => {
        const row =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        const id = normalizedText(row.id, 120);
        const speakerBotId = normalizedText(row.speakerBotId, 200);
        const content = normalizedMultilineText(row.content, 6_000);
        if (!id || !speakerBotId || !content || !isDebateSideId(row.sideId)) {
          return [];
        }
        const status: DebateTurnaboutStatementStatus =
          row.status === "pressed" ||
          row.status === "contradicted" ||
          row.status === "resolved"
            ? row.status
            : "ready";
        return [
          {
            id,
            sideId: row.sideId,
            speakerBotId,
            content,
            sourceIds: Array.isArray(row.sourceIds)
              ? [
                  ...new Set(
                    row.sourceIds.filter(isValidDebateSourceId).map(String),
                  ),
                ]
              : [],
            status,
            createdEventId: normalizedText(row.createdEventId, 120),
          },
        ];
      })
    : [];
  const contradictions = Array.isArray(source.contradictions)
    ? source.contradictions.flatMap(
        (item): DebateTurnaboutContradictionV1[] => {
          const row =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {};
          const id = normalizedText(row.id, 120);
          const statementId = normalizedText(row.statementId, 120);
          const evidenceSourceId = normalizedText(
            row.evidenceSourceId,
            48,
          ).toLowerCase();
          if (!id || !statementId || !isValidDebateSourceId(evidenceSourceId)) {
            return [];
          }
          return [
            {
              id,
              statementId,
              evidenceSourceId,
              statementQuote: normalizedText(row.statementQuote, 600),
              evidenceQuote: normalizedText(row.evidenceQuote, 600),
              reason: normalizedText(row.reason, 1_000),
              grounded: row.grounded === true,
              ruling: row.ruling === "sustained" ? "sustained" : "overruled",
              createdAt: normalizedText(row.createdAt, 64),
            },
          ];
        },
      )
    : [];
  const phase: DebateTurnaboutPhase =
    source.phase === "examination" ||
    source.phase === "reversal" ||
    source.phase === "resolution"
      ? source.phase
      : "testimony";
  return {
    version: DEBATE_FORMAT_SCHEMA_VERSION,
    format: "turnabout",
    phase,
    round:
      typeof source.round === "number" &&
      Number.isInteger(source.round) &&
      source.round > 0
        ? Math.min(source.round, 99)
        : 1,
    activeStatementId:
      typeof source.activeStatementId === "string" &&
      source.activeStatementId.trim()
        ? source.activeStatementId.trim().slice(0, 120)
        : null,
    floorOwnerBotId:
      typeof source.floorOwnerBotId === "string" &&
      source.floorOwnerBotId.trim()
        ? source.floorOwnerBotId.trim().slice(0, 200)
        : null,
    statements,
    contradictions,
  };
}

export function normalizeDebateIdempotencyKey(value: unknown): string {
  const key = normalizedText(value, 120);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(key) ? key : "";
}
