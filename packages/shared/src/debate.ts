import type { BotAudioVoiceProfileV1 } from "./audioVoice.js";
import type {
  AutoFallbackModelRef,
  AutoRecoveryTraceV1,
  ResponseMode,
} from "./autoFallback.js";
import type { BotAvatarDetailsV1 } from "./botAvatarDetails.js";
import type { BotFaceStyle } from "./botAvatar.js";
import type { BotVoicePreset } from "./botProfile.js";
import {
  botPowerCopiesAddressedSpeechV1,
  botPowerIntendedSpeechLooksGibberishV1,
  botPowerResponseIsSilentV1,
  type BotPowerEffectV1,
  type BotPowerMutePerformanceV1,
  type BotPowerResolvedThemeV1,
  type BotPowerV1,
} from "./botPower.ts";
import type { LlmProviderName } from "./index.js";
import type { BotPowerTrollPresentationV1 } from "./trollPower.ts";
import type { AutoRouteDecisionV1 } from "./modelRouting.js";
import type { LiveBakeArtifactV1 } from "./liveBake.js";
import {
  defaultDebateMysteryFormatStateV1,
  normalizeDebateMysteryFormatStateV1,
  type DebateMysteryPlayPhase,
  type DebateMysteryRouteGrade,
  type DebateMysteryVerdictV1,
  type DebateWhodunnitCreateConfigV1,
  type DebateWhodunnitFormatStateV1,
} from "./debateMystery.ts";
import {
  debateMysteryMansionBundleEligibleV2,
  normalizeDebateMysteryFormatStateV2,
  type DebateMysteryInvestigationModeV2,
  type DebateMysteryPlayPhaseV2,
  type DebateMysteryVerdictClassificationV2,
  type DebateWhodunnitCreateConfigV2,
  type DebateWhodunnitFormatStateV2,
} from "./debateMysteryV2.ts";
import {
  normalizeReasoningEffort,
  normalizeProviderReasoningEffort,
  type ProviderReasoningEffort,
  type ReasoningEffort,
} from "./reasoningEffort.ts";

export const DEBATE_SCHEMA_VERSION = 1 as const;
export const DEBATE_FORMAT_SCHEMA_VERSION = 1 as const;
export const DEBATE_PLAYER_JUDGE_BOT_ID = "prism:player-judge" as const;
export const DEBATE_PLAYER_PARTICIPANT_BOT_ID =
  "prism:player-participant" as const;
export const DEBATE_JUDGE_GAVEL_COOLDOWN_MS = 8_000;
/** Graceful Pause re-arm after Resume — shorter than Judge intervention cooldown. */
export const DEBATE_PAUSE_COOLDOWN_MS = 2_500;
export const DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH = 600;
export const DEBATE_OBJECTION_RULING_TIMEOUT_MS = 8_000;
export const DEBATE_MODERATOR_TITLE_MAX_LENGTH = 72;
/** Public display name for the presiding seat; never changes bot identity. */
export const DEBATE_MODERATOR_NAME_MAX_LENGTH = 72;
export const DEBATE_TITLE_MAX_LENGTH = 120;
export const DEBATE_MOTION_MAX_LENGTH = 320;
export const DEBATE_SIDE_LABEL_MAX_LENGTH = 32;
export const DEBATE_SIDE_BRIEF_MAX_LENGTH = 1_200;
export const DEBATE_EVIDENCE_NOTES_MAX_LENGTH = 8_000;
export const DEBATE_EVIDENCE_SOURCE_MAX_COUNT = 12;
/** One source search stays reviewable while later searches remain additive. */
export const DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT = 3;
/** Sources and exhibits share one bounded frozen packet. */
export const DEBATE_EVIDENCE_ITEM_MAX_COUNT = 12;
export const DEBATE_EVIDENCE_EXHIBIT_ADJECTIVE_MAX_LENGTH = 48;
export const DEBATE_EVIDENCE_EXHIBIT_OBJECT_MAX_LENGTH = 96;
export const DEBATE_EVIDENCE_EXHIBIT_OBSERVATION_MAX_LENGTH = 800;
/** New Duel generate always stages a small prop pack. */
export const DEBATE_SETUP_SUGGESTION_EXHIBIT_MIN = 2;
export const DEBATE_SETUP_SUGGESTION_EXHIBIT_MAX = 4;
/** Cap auto research so exhibits still fit under DEBATE_EVIDENCE_ITEM_MAX_COUNT. */
export const DEBATE_SETUP_SUGGESTION_WEB_SOURCE_MAX = 2;
export const DEBATE_SETUP_SUGGESTION_SCHOLAR_SOURCE_MAX = 2;
export const DEBATE_PLAYER_TURN_MAX_LENGTH = 4_000;
export const DEBATE_PARTICIPATION_SCHEMA_VERSION = 1 as const;
export const DEBATE_PARTICIPANT_TIME_SCALE = 8 as const;
export const DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS = 30_000;
export const DEBATE_PARTICIPANT_RECESS_MAX_USES = 3 as const;
export const DEBATE_CASE_CARDS_PER_SIDE = 4;
export const DEBATE_TURNABOUT_STATEMENTS_PER_SIDE = 2;
/** Canonical live Jury: four jurors, then the Moderator's final ballot. */
export const DEBATE_JURY_SIZE = 4;
/** Read-only compatibility ceiling for proceedings created before the new rule. */
export const DEBATE_LEGACY_JURY_SIZE = 5;
export const DEBATE_JURY_DISCUSSION_TURNS = 5;
export const DEBATE_JURY_EARLY_DISCUSSION_TURNS = 3;
export const DEBATE_FORUM_MIN_REBUTTAL_ROUNDS = 1;
export const DEBATE_FORUM_MAX_REBUTTAL_ROUNDS = 3;

export type DebateFormatId = "forum" | "turnabout" | "whodunnit";
export type DebateFormatCatalogId = DebateFormatId | "flyting" | "cypher";

export interface DebateFormatVisualThemeV1 {
  accentDark: string;
  accentLight: string;
  archiveNoun: string;
  archiveNounPlural: string;
}

/**
 * One exhaustive visual identity contract for every current and announced
 * Debate production. Adding a catalog id requires choosing its theme here,
 * so shared surfaces such as Studio and Archive cannot silently fall back to
 * another production's identity.
 */
export const DEBATE_FORMAT_VISUAL_THEMES: Readonly<
  Record<DebateFormatCatalogId, DebateFormatVisualThemeV1>
> = {
  forum: {
    accentDark: "#ad9cff",
    accentLight: "#705bc4",
    archiveNoun: "proceeding",
    archiveNounPlural: "proceedings",
  },
  turnabout: {
    accentDark: "#d7894f",
    accentLight: "#a65425",
    archiveNoun: "trial",
    archiveNounPlural: "trials",
  },
  whodunnit: {
    accentDark: "#66e5ea",
    accentLight: "#147e88",
    archiveNoun: "case",
    archiveNounPlural: "cases",
  },
  flyting: {
    accentDark: "#e3bd71",
    accentLight: "#926b19",
    archiveNoun: "contest",
    archiveNounPlural: "contests",
  },
  cypher: {
    accentDark: "#ec68c8",
    accentLight: "#a73383",
    archiveNoun: "battle",
    archiveNounPlural: "battles",
  },
};
export type DebatePlayerRole = "judge" | "participant" | "spectator" | "investigator";
/** Versioned now so future assisted-play levels can migrate without ambiguity. */
export type DebateParticipantDifficulty = "coach" | "standard" | "immersive";
export type DebateParticipantWindowKind =
  | "opening"
  | "challenge"
  | "rebuttal"
  | "closing"
  | "objection"
  | "interjection";
export type DebateParticipantFloorBreakKind = "objection" | "interjection";
export type DebateParticipantChoiceTier = "great" | "okay" | "bad";
export type DebateParticipantGambitKind =
  | "ad_hominem"
  | "non_sequitur"
  | "straw_man"
  | "false_dilemma"
  | "bandwagon"
  | "appeal_to_authority"
  | "slippery_slope"
  | "red_herring"
  | "tu_quoque"
  | "appeal_to_emotion";
/** Private execution quality. It is never a claim that the argument is true. */
export type DebateParticipantGambitTier =
  | "well_executed"
  | "shaky"
  | "exposed";
export type DebateParticipantSteeringFidelity =
  | "verbatim"
  | "near_verbatim"
  | "steered"
  | "confused";
export type DebateParticipantSocialReception =
  | "receptive"
  | "uncertain"
  | "hostile";
export type DebateParticipantFavorabilityReason =
  | "argument_strength"
  | "humor"
  | "confidence"
  | "opponent_pressure"
  | "subject_knowledge"
  | "evidence_use"
  | "irrelevant"
  | "absurd"
  | "unsupported_evidence"
  | "overtime"
  | "floor_break_timeout"
  | "rhetorical_gambit"
  | "moderator_bias_callout"
  | "clarification_failure"
  | "recess_denied"
  | "rage_rush";
export type DebateParticipantFavorabilityFacet =
  | "argumentStrength"
  | "humor"
  | "confidence"
  | "opponentPressure"
  | "subjectKnowledge";
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
/** `natural-five` is retained solely for saved five-juror proceedings. */
export type DebateJuryCadence = "four-plus-moderator" | "natural-five";
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
  availability: "available" | "disabled";
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
    id: "whodunnit",
    name: "Whodunnit?",
    productionName: "A Murder Mystery",
    summary:
      "Investigate a seeded mansion mystery, assemble a theory, and prove it in a mandatory trial.",
    cadence: "Investigate · Connect · Accuse · Prove",
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
      "A televised verbal free-for-all with personal jabs, cut-ins, moderator warnings, four jurors, and the moderator's final ballot.",
    format: "forum",
    formality: "free_for_all",
    playerRole: "spectator",
    juryEnabled: true,
    juryCadence: "four-plus-moderator",
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
    juryCadence: "four-plus-moderator",
  },
  {
    id: "public-forum",
    name: "Town Hall",
    summary:
      "Watch a plainspoken Forum as four jurors deliberate before the moderator's final ballot.",
    format: "forum",
    formality: "plainspoken",
    playerRole: "spectator",
    juryEnabled: true,
    juryCadence: "four-plus-moderator",
  },
  {
    id: "jury-trial",
    name: "Bench Trial",
    summary: "Preside over a structured Turnabout and make the final ruling.",
    format: "turnabout",
    formality: "structured",
    playerRole: "judge",
    juryEnabled: false,
    juryCadence: "four-plus-moderator",
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
    juryCadence: "four-plus-moderator",
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
  /** Public Whodunnit testimony projected into this statement, when present. */
  recordTestimonyId?: string | null;
  /**
   * Public, source-bound witness identity for a filed Whodunnit trial. This is
   * presentation metadata only; it never carries Case Bible facts or creates a
   * new interactive Debate seat.
   */
  mysteryWitness?: DebateTurnaboutMysteryWitnessV1 | null;
}

export interface DebateTurnaboutCourtFigureV1 {
  version: 1;
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  avatarDetails: DebateBotSnapshotV1["avatarDetails"];
  voiceProfile: DebateBotSnapshotV1["voiceProfile"];
  replayVisualSnapshot?: DebateBotSnapshotV1["replayVisualSnapshot"];
  revision: string;
}

export interface DebateTurnaboutMysteryWitnessV1 {
  version: 1;
  kind: "submitted_interview" | "defendant_denial";
  seatId: string;
  botId: string;
  name: string;
  /** Frozen Turnabout source id. The courtroom denial has no source item. */
  sourceId: string | null;
  /** One-based position within the player-paced testimony chain. */
  ordinal: number;
  statementCount: number;
}

export interface DebateTurnaboutMysteryCourtroomCompositionV1 {
  version: 1;
  prosecutionCoCounsel: DebateTurnaboutCourtFigureV1;
  defenseClient: DebateTurnaboutCourtFigureV1;
  /** Only witnesses whose submitted interview testimony entered the packet. */
  eligibleWitnesses: Array<{
    seatId: string;
    figure: DebateTurnaboutCourtFigureV1;
  }>;
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
  /**
   * Public-only bridge for a filed Whodunnit accusation. The sealed Case Bible
   * remains in server-private mystery storage under the same session ID.
   */
  mysteryTrial?: {
    version: 1;
    frozenInvestigation: DebateWhodunnitFormatStateV1;
    credibilityRemaining: number;
    failedActions: number;
    sustainedTestimonyIds: string[];
    sustainedEvidenceIds: string[];
    evidenceSourceMap: Record<string, string>;
    testimonySourceMap: Record<string, string>;
    courtroomComposition: DebateTurnaboutMysteryCourtroomCompositionV1;
    verdict: DebateMysteryVerdictV1 | null;
  } | null;
}

export type DebateFormatStateV1 =
  | DebateForumFormatStateV1
  | DebateTurnaboutFormatStateV1
  | DebateWhodunnitFormatStateV1
  | DebateWhodunnitFormatStateV2;

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
  /** Frozen provenance for the concise quick-reference excerpt. */
  excerptSource?: "provider" | "crossref" | "page" | "player" | "metadata";
  excerptSelection?:
    | "model"
    | "sentence-fallback"
    | "metadata-only"
    | "player";
  excerptMaterialHash?: string;
  excerptModel?: { provider: string; model: string } | null;
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

export type DebateSetupSuggestionSourcesSkippedReason =
  | "local"
  | "missing_brave_key"
  | "research_unavailable"
  | null;

export interface DebateSetupSuggestionResearchMetaV1 {
  webQuery: string;
  scholarQuery: string;
  sourcesSkippedReason: DebateSetupSuggestionSourcesSkippedReason;
}

/**
 * Full Debate Studio draft from Wield Prism → New Duel.
 * Room role, Jury, and moderator may vary with the chosen preset.
 */
export interface DebateSetupSuggestionV1 {
  topic: string;
  motion: DebateMotionSlateV1;
  format: DebateFormatId;
  formality: DebateFormalityId;
  forumRoundMode: DebateForumRoundMode;
  forumRoundCount: number;
  juryEnabled: boolean;
  setupPresetId: DebateSetupPresetId | null;
  playerRole: DebatePlayerRole;
  participantDifficulty?: DebateParticipantDifficulty;
  /** Defaults on for new Participant sessions; ignored for other roles. */
  rhetoricalGambitsEnabled?: boolean;
  /** Required when playerRole is participant; otherwise null. */
  playerSideId: DebateSideId | null;
  /** Empty when the player occupies the Judge seat (Prism). */
  moderatorBotId: string | null;
  /** Evocative public title for the presiding voice; topic-flavored. */
  moderatorTitle: string;
  forAdvocateBotId: string;
  againstAdvocateBotId: string;
  notes: string;
  exhibits: DebateEvidenceExhibitV1[];
  sources: DebateEvidenceSourceV1[];
  researchMeta: DebateSetupSuggestionResearchMetaV1;
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
  /** Concrete semantic route selected when consent was requested. */
  routingProvider?: LlmProviderName;
  routingModel?: string;
  routingResponseMode?: ResponseMode;
  modelSelectionKind?: "auto" | "fixed";
  /** Deliberation depth selected when consent was requested. Turbo is excluded. */
  reasoningEffort?: ProviderReasoningEffort;
  autoRoute?: AutoRouteDecisionV1;
  autoRecovery?: AutoRecoveryTraceV1;
}

export interface DebateConsentRoutingV1 {
  provider: LlmProviderName;
  model: string;
  reasoningEffort: ProviderReasoningEffort;
  responseMode: ResponseMode;
  modelSelectionKind: "auto" | "fixed";
}

/**
 * Consent is configuration-bound. Refusals are intentionally handled by the
 * caller as sticky authored boundaries, while affirmative consent must match
 * the exact semantic route that requested it. Turbo is not part of this
 * fingerprint because it changes processing priority rather than deliberation.
 */
export function debateAdvocacyConsentMatchesRouting(
  consent: DebateAdvocacyConsent,
  routing: DebateConsentRoutingV1,
): boolean {
  return (
    consent.routingProvider === routing.provider &&
    consent.routingModel === routing.model &&
    consent.routingResponseMode === routing.responseMode &&
    consent.modelSelectionKind === routing.modelSelectionKind &&
    normalizeProviderReasoningEffort(consent.reasoningEffort) ===
      normalizeProviderReasoningEffort(routing.reasoningEffort)
  );
}

/**
 * The setup UI can compare fixed selections exactly. Auto's concrete route is
 * server-owned and contextual, so the UI compares its stable Auto + lane
 * selection while launch validation still checks the exact resolved route.
 */
export function debateAdvocacyConsentMatchesSelection(
  consent: DebateAdvocacyConsent,
  routing: DebateConsentRoutingV1,
): boolean {
  if (
    consent.routingResponseMode !== routing.responseMode ||
    consent.modelSelectionKind !== routing.modelSelectionKind
  ) {
    return false;
  }
  return routing.modelSelectionKind === "auto"
    ? true
    : debateAdvocacyConsentMatchesRouting(consent, routing);
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
  /** Frozen public chassis/face materials for replay-safe identity Powers. */
  replayVisualSnapshot?: {
    v: 1;
    faceStyle: BotFaceStyle;
    avatarDetails: BotAvatarDetailsV1 | null;
    voicePreset: BotVoicePreset;
    screenMaterialSeed: string;
    frameMaterialSeed: string;
  } | null;
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

/**
 * Bounded ElevenLabs v3 direction attached to heard delivery, never canonical
 * transcript text. The verbose review transcript may expose it for diagnosis.
 */
export const DEBATE_VOICE_PERFORMANCE_CUES = [
  "angry",
  "excited",
  "laughs",
  "nervous",
  "sarcastic",
  "shouts",
  "sighs",
  "solemn",
  "whispers",
] as const;
export type DebateVoicePerformanceCue =
  (typeof DEBATE_VOICE_PERFORMANCE_CUES)[number];

export function normalizeDebateVoicePerformanceCue(
  value: unknown,
): DebateVoicePerformanceCue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase();
  return DEBATE_VOICE_PERFORMANCE_CUES.find((cue) => cue === normalized) ?? null;
}

export type DebateTurnTimingStatus = "within_limit" | "overtime";
export type DebateAudienceReactionKind =
  | "none"
  | "laugh"
  | "gasp"
  | "impressed";
export type DebateAudienceReactionSource = "director" | "fallback";

/**
 * Saved presentation-only gallery direction. It never enters Proceedings,
 * case-board reasoning, evidence, ballots, or the verdict.
 */
export interface DebateAudienceReactionV1 {
  kind: DebateAudienceReactionKind;
  /** 0 means silence; audible reactions use the explicit 1-3 mix scale. */
  intensity: 0 | 1 | 2 | 3;
  source: DebateAudienceReactionSource;
}

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
  /** Private clear speech retained only so a Power-immune bot can understand an obfuscated speaker. */
  powerIntendedContent?: string;
  /** Text-free public provenance for an owner-only primary-utterance reveal. */
  speechIntentRevealAvailable?: true;
  /** Public replay-stable timed-silence presentation; contains no intended speech. */
  mutePerformance?: BotPowerMutePerformanceV1;
  /** Public, replay-safe Troll delivery projection. */
  botPowerTrollPresentation?: BotPowerTrollPresentationV1;
  sourceIds: string[];
  parentEventId?: string | null;
  interrupted?: boolean;
  interruptedBy?: "player" | "bot" | null;
  provider?: LlmProviderName;
  model?: string;
  /** Resolved contextual route when this event came from Auto. */
  autoRoute?: AutoRouteDecisionV1;
  /** Whether this event's resolved generation lane used Turbo. */
  turbo?: boolean;
  autoRecovery?: AutoRecoveryTraceV1;
  voicePerformanceCue?: DebateVoicePerformanceCue;
  audienceReaction?: DebateAudienceReactionV1;
  statementId?: string | null;
  evidenceSourceId?: string | null;
  ruling?: DebateTurnaboutRuling | null;
  gavelReason?: DebateJudgeGavelReason;
  gavelStrikeCount?: number;
  gavelDemeanor?: DebateJudgeGavelDemeanor;
  /** Public-content offset for a non-interrupting saved audience-order cue. */
  gavelHeardCharacterCount?: number;
  timing?: DebateTurnTimingV1;
  participantResponseKind?: "guided" | "custom" | "pass";
  participantChoiceId?: string | null;
  createdAt: string;
}

export function debateEventIsTranscriptHousekeeping(
  event: Pick<DebateEventV1, "stepKey">,
): boolean {
  return (
    event.stepKey === "audience_order" ||
    event.stepKey === "pause" ||
    event.stepKey === "resume" ||
    event.stepKey === "participant_recess_request" ||
    event.stepKey === "participant_recess_denied" ||
    event.stepKey === "participant_interjection_withdrawal"
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

export interface DebateParticipantWindowV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  kind: DebateParticipantWindowKind;
  status: "open" | "paused";
  /** Spoken floor allowance; the Moderator announces this value. */
  announcedLimitMs: number;
  /** Wall allowance. Ordinary turns are announcedLimitMs * 8. */
  wallLimitMs: number;
  timeScale: typeof DEBATE_PARTICIPANT_TIME_SCALE;
  openedAt: string;
  deadlineAt: string;
  elapsedWallMs: number;
  overtimeMs: number;
  /** Present only while a recess has frozen the wall deadline. */
  remainingMs?: number;
}

/** Public choice text. The quality tier is intentionally not exposed here. */
export interface DebateParticipantChoiceV1 {
  id: string;
  label: string;
  content: string;
  evidenceSourceIds: string[];
}

export interface DebateParticipantChoiceSetV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  phase: Exclude<DebatePhase, "verdict">;
  promptEventId: string | null;
  choices: DebateParticipantChoiceV1[];
  createdAt: string;
}

export interface DebateParticipantGambitChoiceV1 {
  id: string;
  kind: DebateParticipantGambitKind;
  label: string;
  intent: string;
}

/** Public, replay-stable offer. Private grades live beside it server-side. */
export interface DebateParticipantGambitOfferV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  eventId: string;
  kind: DebateParticipantFloorBreakKind;
  choices: DebateParticipantGambitChoiceV1[];
  createdAt: string;
}

/** Server-private. Player projections must remove this while the Debate is live. */
export interface DebateParticipantGambitGradeV1 {
  choiceId: string;
  tier: DebateParticipantGambitTier;
}

export interface DebateParticipantGambitImpressionV1 {
  botId: string;
  role: "moderator" | "opponent" | "juror";
  socialScore: number;
  reception: DebateParticipantSocialReception;
  /** Bounded vote adjustment; opponent impressions always use zero. */
  ballotAdjustment: number;
}

export interface DebateParticipantProceduralMeritV1 {
  ruling: "sustained" | "overruled" | "not_applicable";
  confidence: number;
  rationale: string;
}

export interface DebateParticipantModeratorBiasOverrideV1 {
  applied: boolean;
  direction: "participant" | "opponent" | "none";
  chance: number;
  roll: number;
  justification: string | null;
}

/**
 * Server-owned line preparation. Stable event ids let the client prepare voice
 * before the audience-heard opponent cutoff is committed.
 */
export interface DebateParticipantFloorBreakPreparationV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  id: string;
  status: "drafting" | "ready";
  kind: DebateParticipantFloorBreakKind;
  interruptedEventId: string;
  initialHeardCharacterCount: number;
  selectionMode: "gambit" | "steering";
  selectedGambitId: string | null;
  selectedEvidenceSourceIds: string[];
  fixedCall: "Objection!" | "Hold on—";
  callEventId: string;
  responseEventId: string;
  reactionEventId: string;
  counterEventId: string | null;
  rulingEventId: string | null;
  continuationEventId: string | null;
  performedText: string | null;
  counterText: string | null;
  rulingText: string | null;
  continuationText: string | null;
  roomReaction: DebateAudienceReactionV1;
  createdAt: string;
  expiresAt: string;
  /** Private until completed review. */
  producerCue?: string;
  steeringFidelity?: DebateParticipantSteeringFidelity;
  gambitTier?: DebateParticipantGambitTier;
  evidenceIntegrated?: boolean;
  evidenceMisused?: boolean;
  impressions?: DebateParticipantGambitImpressionV1[];
  roomReception?: DebateParticipantSocialReception;
  favorabilityDelta?: number;
  proceduralMerit?: DebateParticipantProceduralMeritV1;
  moderatorBiasOverride?: DebateParticipantModeratorBiasOverrideV1;
  clarificationRequired?: boolean;
}

export interface DebateParticipantGambitRecordV1
  extends Omit<DebateParticipantFloorBreakPreparationV1, "status"> {
  finalHeardCharacterCount: number;
  committedAt: string;
}

/** Server-private grading metadata. Player projections must always remove it. */
export interface DebateParticipantChoiceGradeV1 {
  choiceId: string;
  tier: DebateParticipantChoiceTier;
  baseImpact: number;
  /** Private authoring assessment; only substantive integration doubles impact. */
  evidenceIntegrated: boolean;
}

export interface DebateParticipantFavorabilityEntryV1 {
  id: string;
  eventId: string | null;
  phase: Exclude<DebatePhase, "verdict"> | "procedural";
  /** Each assessed facet is -1..1. Missing facets are neutral. */
  facets: Partial<Record<DebateParticipantFavorabilityFacet, number>>;
  baseImpact: number;
  phaseWeight: number;
  delta: number;
  reasons: DebateParticipantFavorabilityReason[];
  evidenceMultiplier: 1 | 2;
  createdAt: string;
}

export interface DebateParticipantFavorabilityLedgerV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  /** Signed Participant advantage, clamped to -100..100. */
  total: number;
  entries: DebateParticipantFavorabilityEntryV1[];
}

export interface DebateParticipantRowdinessV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  patienceBudget: number;
  patienceRemaining: number;
  /** Persona bias modifier applied to future drain. */
  drainModifier: number;
  moderatorDisposition: {
    temperament: "strict" | "balanced" | "patient";
    /** 0.75 patient, 1 balanced, 1.25 strict. */
    drainModifier: number;
    confidence: number;
    rationale: string;
  };
  outcomes: Array<{
    eventId: string | null;
    baseDrain: number;
    appliedDrain: number;
    patienceRemaining: number;
    kind:
      | "gavel"
      | "opponent_taunt"
      | "awkward_silence"
      | "recess_denial";
    action: "tolerated" | "warned" | "interrupted";
    /** Opponent taunts grant this wall-time grace before a harsher outcome. */
    tauntGraceDeadlineAt?: string;
    createdAt: string;
  }>;
}

export interface DebateParticipantRecessV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  used: number;
  max: typeof DEBATE_PARTICIPANT_RECESS_MAX_USES;
  denials: number;
  /**
   * Durable recovery bookmark captured when the final available recess is
   * accepted. The canonical snapshot itself stays server-private.
   */
  checkpoint?: DebateParticipantRecessCheckpointV1;
  /** Set once when repeated denied requests consume the Moderator's reserve. */
  rageRush?: DebateParticipantRageRushV1;
}

export interface DebateParticipantRageRushV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  eventId: string;
  triggeredAt: string;
  denialCount: number;
  /** Severe conduct penalty applied identically to each authoritative ballot. */
  ballotInfluence: number;
}

export interface DebateParticipantRecessCheckpointV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  createdAt: string;
  revision: number;
  phase: DebatePhase;
  stepKey: string;
  pausedPresentationEventId: string | null;
}

export interface DebateParticipationStateV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  difficulty: DebateParticipantDifficulty;
  participantWindow: DebateParticipantWindowV1 | null;
  choiceSet: DebateParticipantChoiceSetV1 | null;
  /** Absent/false on legacy sessions; new Participant sessions default true. */
  rhetoricalGambitsEnabled: boolean;
  gambitOffer: DebateParticipantGambitOfferV1 | null;
  /** Never present in live player projections. */
  gambitGrades?: DebateParticipantGambitGradeV1[];
  gambitRecords: DebateParticipantGambitRecordV1[];
  /** Persona-shaped response to credible accusations of Moderator partiality. */
  moderatorConductAdjustment: number;
  /** Public custom-input fallback status; private quality tiers remain sealed. */
  choiceError?: string;
  /** Never present in debateSessionForPlayer output. */
  choiceGrades?: DebateParticipantChoiceGradeV1[];
  favorability: DebateParticipantFavorabilityLedgerV1;
  rowdiness: DebateParticipantRowdinessV1;
  recess: DebateParticipantRecessV1;
  turns: DebateParticipantTurnRecordV1[];
  /** Coach-only anonymous live Jury lean; never carries juror identity/reason. */
  juryLeaningPips?: Array<"participant" | "opponent" | "neutral">;
  /**
   * Post-verdict Jury math projected without voter ids, Persona rationales, or
   * sealed deliberation. This is presentation-only and is never persisted.
   */
  finalJuryBallotInfluences?: Array<{
    sideId: DebateSideId;
    participantInfluence: DebateParticipantBallotInfluenceV1 | null;
  }>;
}

export interface DebateParticipantTurnRecordV1 {
  eventId: string;
  phase: Exclude<DebatePhase, "verdict">;
  opportunityIndex: number;
  authoredMode: "guided" | "custom" | "pass";
  choiceId: string | null;
  /** Private during live play; available to post-Debate review. */
  choiceTier?: DebateParticipantChoiceTier;
  announcedLimitMs: number;
  wallLimitMs: number;
  elapsedWallMs: number;
  overtimeMs: number;
  authoredCharacterCount: number;
  heardCharacterCount: number;
  cutoffReason: "length" | "irrelevant" | "absurd" | "unsupported_evidence" | null;
  facets: Partial<Record<DebateParticipantFavorabilityFacet, number>>;
  baseImpact: number;
  phaseWeight: number;
  evidenceMultiplier: 1 | 2;
  favorabilityDelta: number;
  createdAt: string;
}

export interface DebateParticipantFloorBreakStateV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  kind: DebateParticipantFloorBreakKind;
  status: "awaiting_response";
  interruptedEventId: string;
  heardCharacterCount: number;
  callEventId: string;
  fixedCall: "Objection!" | "Hold on—";
  interruptedBotId: string;
  resumeStatus: DebateStatus;
  resumePhase: DebatePhase;
  resumeStepKey: string;
  openedAt: string;
  deadlineAt: string;
  /** Set once when the fixed call finishes; repeat activation never extends it. */
  activatedAt?: string;
}

export interface DebateVoterPredispositionV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  voterBotId: string;
  direction: "participant" | "opponent" | "neutral";
  strength?: number;
  confidence?: number;
  rationale?: string;
  /** -1 favors the Participant's opponent; +1 favors the Participant. */
  participantBias?: number;
}

export interface DebateParticipantBallotInfluenceV1 {
  version: typeof DEBATE_PARTICIPATION_SCHEMA_VERSION;
  /** Model's record-only vote before Participant influence. */
  recordSideId: DebateSideId;
  recordScore: number;
  participantBias: number;
  predispositionInfluence: number;
  favorabilityInfluence: number;
  /** Sum of this juror's sealed gambit impressions, capped across the Debate. */
  gambitInfluence?: number;
  /** Severe conduct penalty after the Moderator rage-rushes the proceeding. */
  rageRushInfluence?: number;
  adjustedScore: number;
}

export interface DebateBallotV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  voterBotId: string;
  sideId: DebateSideId;
  participantInfluence?: DebateParticipantBallotInfluenceV1;
  reason: string | null;
  privateReason: boolean;
  provider?: LlmProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
  voicePerformanceCue?: DebateVoicePerformanceCue;
  createdAt: string;
}

export interface DebateJuryBallotV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  jurorBotId: string;
  stage: "initial" | "final";
  sideId: DebateSideId;
  participantInfluence?: DebateParticipantBallotInfluenceV1;
  confidence: number;
  personaInstinct: string;
  reason: string;
  /** Private clear rationale retained when a Power transforms the public delivery. */
  powerIntendedReason?: string;
  provider?: LlmProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
  voicePerformanceCue?: DebateVoicePerformanceCue;
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
  /** Legacy bake-ahead ballots retained for resumable pre-discussion sessions. */
  preparedFinalBallots: DebateJuryBallotV1[];
  finalBallots: DebateJuryBallotV1[];
  /** The bot Moderator's distinct, always-last ballot. Never generated for a human Judge. */
  moderatorBallot: DebateBallotV1 | null;
  discussionTurnTarget: number;
  discussionTurnCount: number;
  speakerCounts: Record<string, number>;
  majoritySideId: DebateSideId | null;
  forVotes: number;
  againstVotes: number;
  calledVoteAt: string | null;
  completedAt: string | null;
}

export type DebateArchiveReturnBufferPhaseV1 =
  | "preparing"
  | "ready_buffering"
  | "fully_buffered";

export type DebateArchiveReturnBufferBoundaryV1 =
  | "buffering_ahead"
  | "cap"
  | "player"
  | "procedure"
  | "completion"
  | "not_applicable";

/** Durable, revision-owned runway prepared while an Archive title card holds. */
export interface DebateArchiveReturnBufferStateV1 {
  version: 1;
  originalPresentationEventId: string | null;
  bufferedAdvanceCount: number;
  advanceCap: number;
  boundary: DebateArchiveReturnBufferBoundaryV1;
}

export interface DebateSessionV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  id: string;
  revision: number;
  status: DebateStatus;
  phase: DebatePhase;
  stepKey: string;
  /** Most recently resolved primary generation lane. */
  provider: LlmProviderName;
  model: string;
  responseMode: ResponseMode;
  /** Auto resolves per work item; fixed remains explicitly pinned. */
  modelSelectionKind?: "auto" | "fixed";
  /** Candidate snapshot retained for provenance; Auto uses the live catalog. */
  autoCandidateAllowlist?: AutoFallbackModelRef[];
  /** Routing policy version recorded when the session starts. */
  routingPolicyVersion?: number;
  /** Most recent concrete route selected while Auto remains active. */
  latestAutoRoute?: AutoRouteDecisionV1;
  /**
   * Last applied effort for archive chrome. Auto updates this alongside
   * `latestAutoRoute`; fixed lanes freeze the preference used at create /
   * generation time.
   */
  lastReasoningEffort?: Exclude<ProviderReasoningEffort, "auto"> | null;
  /** Whether the most recently resolved generation lane used Turbo. */
  lastTurbo?: boolean;
  /** Initial Auto escalation plan or the fixed model's ordered fallback lanes. */
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
  /** Frozen public name displayed for the presiding seat. */
  moderatorName: string;
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
  /** Versioned assisted-play state. Present on new Participant sessions. */
  participation?: DebateParticipationStateV1 | null;
  /** Unified objection/interjection wait state; legacy objection remains readable. */
  participantFloorBreak?: DebateParticipantFloorBreakStateV1 | null;
  /** Ready line awaiting audio preparation and the final heard-prefix commit. */
  participantFloorBreakPreparation?: DebateParticipantFloorBreakPreparationV1 | null;
  /** Private persona predispositions used as a bounded ballot input. */
  voterPredispositions?: DebateVoterPredispositionV1[];
  /**
   * Public event whose playback was interrupted by an explicit pause. The
   * presentation client replays this exact saved line from its beginning after
   * resume. Off-record lifecycle announcements may be stored as housekeeping
   * events, but never enter Proceedings or copied transcripts.
   */
  pausedPresentationEventId?: string | null;
  /**
   * Persisted, pre-generated return-to-order line. Archive preload may prepare
   * and voice this event while the room is still recessed; Resume reveals it
   * only after the user's gavel cut, then clears this pointer.
   */
  preparedResumeEventId?: string | null;
  /** Safe canonical lookahead accumulated for the current Archive return. */
  archiveReturnBuffer?: DebateArchiveReturnBufferStateV1 | null;
  /** Silent lifecycle bookkeeping for the visible overall Debate timer. */
  pausedAt?: string | null;
  /** Accumulated paused wall time; never represented as transcript events. */
  pausedDurationMs?: number;
  events: DebateEventV1[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  endedEarlyAt: string | null;
  completedAt: string | null;
  /** Coffee-style end-of-session overview; present once generated after completion. */
  synopsis?: DebateSessionSynopsisV1 | null;
  /**
   * Spectator full-bake artifact (liveBake). Present after gallery preload;
   * play without further LLM advances while status === ready.
   */
  liveBake?: LiveBakeArtifactV1 | null;
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
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
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
  whodunnit?: DebateWhodunnitCreateConfigV1 | DebateWhodunnitCreateConfigV2;
  formality?: DebateFormalityId;
  presetId?: DebateSetupPresetId | "custom";
  jury?: {
    enabled?: boolean;
    cadence?: DebateJuryCadence;
    /**
     * Optional preferred library bot ids in seat order. Null/omitted seats
     * Surprise-fill at Start/Save. Max DEBATE_JURY_SIZE entries.
     */
    jurorBotIds?: Array<string | null>;
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
  /** Defaults to Standard for Participant sessions and is ignored otherwise. */
  participationDifficulty?: DebateParticipantDifficulty;
  /** @deprecated Compatibility alias for pre-v1 setup clients. */
  participantDifficulty?: DebateParticipantDifficulty;
  /** Defaults on for newly created Participant sessions. */
  rhetoricalGambitsEnabled?: boolean;
  advocacyConsent: DebateAdvocacyConsent[];
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
  responseMode?: ResponseMode;
  /** Frozen with the session when Start succeeds, including Max overdrive. */
  reasoningEffort?: ProviderReasoningEffort;
  /** Frozen speed/service-tier choice for every later generation. */
  turbo?: boolean;
  theme?: BotPowerResolvedThemeV1;
  /**
   * Save for later: create a paused Archive Open proceeding without opening
   * the chamber. Exhibit imageIds stay protected via session_json references.
   */
  deferStart?: boolean;
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
  /** Selects one public guided answer; content remains the open-ended path. */
  choiceId?: string;
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

export interface DebateParticipantFloorBreakRaiseRequest
  extends DebateMutationRequest {
  eventId: string;
  heardCharacterCount: number;
  kind: DebateParticipantFloorBreakKind;
}

export interface DebateParticipantFloorBreakResolveRequest
  extends DebateMutationRequest {
  content?: string;
  choiceId?: string;
  withdraw?: boolean;
}

export interface DebateParticipantFloorBreakActivateRequest
  extends DebateMutationRequest {
  callEventId: string;
}

export interface DebateParticipantFloorBreakPrepareRequest
  extends DebateMutationRequest {
  /** Continues a server-owned Steer my debater draft without changing event ids. */
  preparationId?: string;
  eventId: string;
  heardCharacterCount: number;
  kind: DebateParticipantFloorBreakKind;
  gambitId?: string;
  producerCue?: string;
  evidenceSourceIds?: string[];
}

export interface DebateParticipantFloorBreakCommitRequest
  extends DebateMutationRequest {
  preparationId: string;
  heardCharacterCount: number;
}

export interface DebateParticipantFloorBreakCancelRequest
  extends DebateMutationRequest {
  preparationId: string;
}

export interface DebateParticipantFloorBreakClarifyRequest
  extends DebateMutationRequest {
  content?: string;
  evidenceSourceIds?: string[];
  timedOut?: boolean;
}

export interface DebateParticipantWindowExpireRequest
  extends DebateMutationRequest {
  /** Identifies the exact server window so stale timers cannot end a new turn. */
  windowOpenedAt: string;
  stage?: "deadline" | "taunt_grace";
  /** Preserve and assess a draft that was present when the clock called time. */
  authoredContent?: string;
}

export interface DebateParticipantChoicesRetryRequest
  extends DebateMutationRequest {
  windowOpenedAt: string;
}

export interface DebateParticipantPredispositionPreviewRequest {
  motion: DebateMotionSlateV1;
  playerSideId: DebateSideId;
  participationDifficulty?: DebateParticipantDifficulty;
  /** @deprecated Compatibility alias for pre-v1 setup clients. */
  participantDifficulty?: DebateParticipantDifficulty;
  moderatorBotId?: string | null;
  opponentBotId?: string | null;
  jurorBotIds?: Array<string | null>;
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
  responseMode?: ResponseMode;
}

export interface DebateParticipantPredispositionPreviewSeatV1 {
  seat: "moderator" | "opponent" | "juror";
  seatIndex?: number;
  status: "known" | "surprise";
  direction?: "participant" | "opponent" | "neutral";
  strength?: number;
  confidence?: number;
  rationale?: string;
}

export interface DebateParticipantPredispositionPreviewV1 {
  predispositions: DebateParticipantPredispositionPreviewSeatV1[];
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

export type DebateTurnaboutAction =
  | "focus_statement"
  | "press"
  | "present_evidence"
  | "pass";

export interface DebateTurnaboutActionRequest extends DebateMutationRequest {
  action: DebateTurnaboutAction;
  statementId: string;
  evidenceSourceId?: string | null;
}

export interface DebateSessionAdvocateVisualV1 {
  sideId: DebateSideId;
  name: string;
  color: string | null;
  glyph: string | null;
}

export interface DebateSessionListItemV1 {
  id: string;
  format: DebateFormatId;
  status: DebateStatus;
  phase: DebatePhase;
  title: string;
  motion: string;
  moderatorTitle: string;
  /** Legacy-compatible display name, derived from the frozen presiding identity. */
  moderatorName?: string;
  /** Frozen public side labels used by Archive status and matchup copy. */
  forTeamName?: string;
  againstTeamName?: string;
  setupPresetId: DebateSetupPresetId | "custom";
  formality: DebateFormalityId;
  juryEnabled: boolean;
  playerRole: DebatePlayerRole;
  /** Present on new Participant records; legacy archives remain unspecified. */
  participationDifficulty?: DebateParticipantDifficulty;
  /** @deprecated Compatibility alias for pre-v1 archive consumers. */
  participantDifficulty?: DebateParticipantDifficulty;
  rhetoricalGambitsEnabled?: boolean;
  winnerSideId: DebateSideId | null;
  updatedAt: string;
  completedAt: string | null;
  /** Canonical presentation runtime; excludes recesses and generation waits. */
  activeDurationMs: number | null;
  synopsisText?: string | null;
  /** True when Archive Open holds a Save Debate setup that has never started. */
  awaitingDeferredStart?: boolean;
  /** Frozen primary generation lane for archive chrome. */
  provider?: LlmProviderName;
  model?: string;
  modelSelectionKind?: "auto" | "fixed";
  /** Last applied effort (Auto route or frozen fixed preference). */
  reasoningEffort?: Exclude<ProviderReasoningEffort, "auto"> | null;
  /** Resolved Turbo state for the model shown on this archive row. */
  turbo?: boolean;
  /** A future turn is already being generated or held for this archive row. */
  preparing?: boolean;
  /** A Spectator run is currently baking ahead. */
  baking?: boolean;
  /** Moderator + advocate cast colors for Coffee-style archive chips. */
  castColors?: string[];
  /** Frozen advocate identities for the Archive card matchup crest. */
  advocateVisuals?: DebateSessionAdvocateVisualV1[];
  /** Frozen object exhibits available for Archive Assets polish. */
  exhibitCount: number;
  /** Whodunnit Archive metadata; absent for Forum and Turnabout. */
  mysteryProgress?: DebateMysteryPlayPhase | DebateMysteryPlayPhaseV2;
  mysteryRouteGrade?: DebateMysteryRouteGrade | DebateMysteryVerdictClassificationV2 | null;
  mysteryFictionLabel?: "Fictional, non-canonical case";
  mysterySpoilersRevealed?: boolean;
  /** Whodunnit schema metadata used only for safe Archive/setup actions. */
  mysteryVersion?: 1 | 2;
  /** Spoiler-safe Case Forge status for background Archive presentation. */
  mysteryForge?: {
    state: "active" | "attention" | "complete";
    completedPasses: number;
    totalPasses: number;
    progressPercent: number;
    message: string;
  };
  /** Whether this V2 run includes the mansion or begins directly in court. */
  mysteryInvestigationMode?: DebateMysteryInvestigationModeV2;
  /** Stable identity shared by every immutable playthrough of one V2 case. */
  mysteryCaseFamilyId?: string;
  /** One-based playthrough number within a V2 case family. */
  mysteryRunOrdinal?: number;
  mysteryMissingEvidenceAssetCount?: number;
  mysteryMansionSaveEligible?: boolean;
  mysteryMansionBundleId?: string | null;
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

function normalizeDebateTurnaboutCourtFigureV1(
  value: unknown,
): DebateTurnaboutCourtFigureV1 | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!source) return null;
  const id = normalizedText(source.id, 200);
  const name = normalizedText(source.name, 160);
  if (!id || !name) return null;
  const replayVisualSnapshot =
    source.replayVisualSnapshot &&
    typeof source.replayVisualSnapshot === "object" &&
    !Array.isArray(source.replayVisualSnapshot)
      ? (source.replayVisualSnapshot as DebateBotSnapshotV1["replayVisualSnapshot"])
      : undefined;
  return {
    version: 1,
    id,
    name,
    color:
      typeof source.color === "string"
        ? normalizedText(source.color, 80) || null
        : null,
    glyph:
      typeof source.glyph === "string"
        ? normalizedText(source.glyph, 160) || null
        : null,
    avatarDetails:
      source.avatarDetails &&
      typeof source.avatarDetails === "object" &&
      !Array.isArray(source.avatarDetails)
        ? (source.avatarDetails as DebateBotSnapshotV1["avatarDetails"])
        : null,
    voiceProfile:
      source.voiceProfile &&
      typeof source.voiceProfile === "object" &&
      !Array.isArray(source.voiceProfile)
        ? (source.voiceProfile as DebateBotSnapshotV1["voiceProfile"])
        : null,
    ...(replayVisualSnapshot ? { replayVisualSnapshot } : {}),
    revision: normalizedText(source.revision, 200) || `court:${id}`,
  };
}

function normalizeDebateTurnaboutMysteryWitnessV1(
  value: unknown,
): DebateTurnaboutMysteryWitnessV1 | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!source) return null;
  const kind =
    source.kind === "defendant_denial"
      ? "defendant_denial"
      : source.kind === "submitted_interview"
        ? "submitted_interview"
        : null;
  const seatId = normalizedText(source.seatId, 120);
  const botId = normalizedText(source.botId, 200);
  const name = normalizedText(source.name, 160);
  const sourceId =
    typeof source.sourceId === "string"
      ? normalizedText(source.sourceId, 48).toLowerCase()
      : "";
  if (
    !kind ||
    !seatId ||
    !botId ||
    !name ||
    (kind === "submitted_interview" && !isValidDebateSourceId(sourceId))
  ) {
    return null;
  }
  const statementCount =
    typeof source.statementCount === "number" &&
    Number.isInteger(source.statementCount)
      ? Math.max(1, Math.min(64, source.statementCount))
      : 1;
  const ordinal =
    typeof source.ordinal === "number" && Number.isInteger(source.ordinal)
      ? Math.max(1, Math.min(statementCount, source.ordinal))
      : 1;
  return {
    version: 1,
    kind,
    seatId,
    botId,
    name,
    sourceId: kind === "submitted_interview" ? sourceId : null,
    ordinal,
    statementCount,
  };
}

function normalizeDebateTurnaboutMysteryCourtroomCompositionV1(
  value: unknown,
): DebateTurnaboutMysteryCourtroomCompositionV1 | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!source) return null;
  const prosecutionCoCounsel = normalizeDebateTurnaboutCourtFigureV1(
    source.prosecutionCoCounsel,
  );
  const defenseClient = normalizeDebateTurnaboutCourtFigureV1(
    source.defenseClient,
  );
  if (!prosecutionCoCounsel || !defenseClient) return null;
  const eligibleWitnesses = Array.isArray(source.eligibleWitnesses)
    ? source.eligibleWitnesses.flatMap((value) => {
        const witness =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
        const seatId = normalizedText(witness?.seatId, 120);
        const figure = normalizeDebateTurnaboutCourtFigureV1(witness?.figure);
        return seatId && figure ? [{ seatId, figure }] : [];
      })
    : [];
  return {
    version: 1,
    prosecutionCoCounsel,
    defenseClient,
    eligibleWitnesses: [
      ...new Map(
        eligibleWitnesses.map((witness) => [witness.seatId, witness]),
      ).values(),
    ],
  };
}

export function normalizeDebateModeratorTitle(value: unknown): string {
  return (
    normalizedText(value, DEBATE_MODERATOR_TITLE_MAX_LENGTH) || "Moderator"
  );
}

export function normalizeDebateModeratorName(value: unknown, fallback = "PRISM"): string {
  return normalizedText(value, DEBATE_MODERATOR_NAME_MAX_LENGTH) || fallback;
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

export function normalizeDebateEvidenceEmoji(value: unknown): string {
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
          const excerptSource =
            row.excerptSource === "provider" ||
            row.excerptSource === "crossref" ||
            row.excerptSource === "page" ||
            row.excerptSource === "player" ||
            row.excerptSource === "metadata"
              ? row.excerptSource
              : undefined;
          const excerptSelection =
            row.excerptSelection === "model" ||
            row.excerptSelection === "sentence-fallback" ||
            row.excerptSelection === "metadata-only" ||
            row.excerptSelection === "player"
              ? row.excerptSelection
              : undefined;
          const excerptModelRow =
            row.excerptModel &&
            typeof row.excerptModel === "object" &&
            !Array.isArray(row.excerptModel)
              ? (row.excerptModel as Record<string, unknown>)
              : null;
          const excerptProvider = normalizedText(
            excerptModelRow?.provider,
            80,
          );
          const excerptModel = normalizedText(excerptModelRow?.model, 200);
          return {
            id,
            title: normalizedText(row.title, 240) || parsedHost(url),
            url,
            snippet: normalizedMultilineText(row.snippet, 800),
            publishedAt:
              typeof row.publishedAt === "string" && row.publishedAt.trim()
                ? row.publishedAt.trim().slice(0, 64)
                : null,
            ...(excerptSource ? { excerptSource } : {}),
            ...(excerptSelection ? { excerptSelection } : {}),
            ...(typeof row.excerptMaterialHash === "string" &&
            /^[a-f0-9]{16,128}$/iu.test(row.excerptMaterialHash.trim())
              ? { excerptMaterialHash: row.excerptMaterialHash.trim().toLowerCase() }
              : {}),
            ...(row.excerptModel === null
              ? { excerptModel: null }
              : excerptProvider && excerptModel
                ? { excerptModel: { provider: excerptProvider, model: excerptModel } }
                : {}),
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

function normalizeDebateSetupSuggestionSourcesSkippedReason(
  value: unknown,
): DebateSetupSuggestionSourcesSkippedReason {
  if (
    value === "local" ||
    value === "missing_brave_key" ||
    value === "research_unavailable"
  ) {
    return value;
  }
  return null;
}

function normalizeDebateForumRoundMode(value: unknown): DebateForumRoundMode {
  return value === "fixed" ? "fixed" : "auto";
}

function normalizeDebateForumRoundCount(value: unknown): number {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(raw)) return DEBATE_FORUM_MIN_REBUTTAL_ROUNDS;
  return Math.max(
    DEBATE_FORUM_MIN_REBUTTAL_ROUNDS,
    Math.min(DEBATE_FORUM_MAX_REBUTTAL_ROUNDS, Math.trunc(raw)),
  );
}

/**
 * Strict New Duel draft normalizer. Rejects unknown bot ids and incomplete
 * motions; forces emoji-only exhibits; caps Brave/Crossref sources so the
 * shared evidence packet still has room for props.
 */
export function normalizeDebateSetupSuggestionV1(
  value: unknown,
  allowedBotIds: readonly string[],
  formatConstraint?: DebateFormatId,
): DebateSetupSuggestionV1 | null {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const allowed = new Set(
    allowedBotIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean),
  );
  const motion = normalizeDebateMotionSlateV1(source.motion, "setup-slate");
  if (
    !motion.motion ||
    !motion.forSide.label ||
    !motion.forSide.brief ||
    !motion.againstSide.label ||
    !motion.againstSide.brief
  ) {
    return null;
  }
  const forAdvocateBotId =
    typeof source.forAdvocateBotId === "string"
      ? source.forAdvocateBotId.trim()
      : "";
  const againstAdvocateBotId =
    typeof source.againstAdvocateBotId === "string"
      ? source.againstAdvocateBotId.trim()
      : "";
  if (
    !forAdvocateBotId ||
    !againstAdvocateBotId ||
    forAdvocateBotId === againstAdvocateBotId ||
    !allowed.has(forAdvocateBotId) ||
    !allowed.has(againstAdvocateBotId)
  ) {
    return null;
  }

  const researchMetaSource =
    source.researchMeta && typeof source.researchMeta === "object"
      ? (source.researchMeta as Record<string, unknown>)
      : {};
  const researchMeta: DebateSetupSuggestionResearchMetaV1 = {
    webQuery: normalizedText(researchMetaSource.webQuery ?? source.webQuery, 500),
    scholarQuery: normalizedText(
      researchMetaSource.scholarQuery ?? source.scholarQuery,
      500,
    ),
    sourcesSkippedReason: normalizeDebateSetupSuggestionSourcesSkippedReason(
      researchMetaSource.sourcesSkippedReason,
    ),
  };

  const packet = normalizeDebateEvidencePacketV1({
    notes: source.notes,
    sources: Array.isArray(source.sources) ? source.sources : [],
    exhibits: Array.isArray(source.exhibits)
      ? source.exhibits.map((item, index) => {
          const row =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {};
          const adjective = normalizeDebateEvidenceExhibitAdjective(
            row.adjective,
          );
          const object = normalizeDebateEvidenceExhibitObject(row.object);
          return {
            id: `exhibit-${index + 1}`,
            adjective,
            object,
            title: debateEvidenceExhibitTitle({ adjective, object }),
            observation: row.observation,
            emoji: row.emoji,
            visualKind: "emoji",
            imageId: null,
            createdBy: "prism",
          };
        })
      : [],
  });

  const sources = packet.sources.slice(
    0,
    DEBATE_SETUP_SUGGESTION_WEB_SOURCE_MAX +
      DEBATE_SETUP_SUGGESTION_SCHOLAR_SOURCE_MAX,
  );
  const exhibits = (packet.exhibits ?? [])
    .filter((exhibit) => exhibit.adjective && exhibit.object && exhibit.title)
    .slice(0, DEBATE_SETUP_SUGGESTION_EXHIBIT_MAX)
    .map((exhibit, index) => ({
      ...exhibit,
      id: `exhibit-${index + 1}`,
      visualKind: "emoji" as const,
      imageId: null,
      createdBy: "prism" as const,
    }));
  if (exhibits.length < DEBATE_SETUP_SUGGESTION_EXHIBIT_MIN) {
    return null;
  }

  const remainingSlots = Math.max(
    0,
    DEBATE_EVIDENCE_ITEM_MAX_COUNT - exhibits.length,
  );
  const cappedSources = sources.slice(0, remainingSlots);

  const setupPresetRaw = source.setupPresetId;
  const setupPresetId = isDebateSetupPresetId(setupPresetRaw)
    ? setupPresetRaw
    : null;
  const matchedPreset = setupPresetId
    ? (DEBATE_SETUP_PRESETS.find(
        (preset) =>
          preset.id === setupPresetId &&
          (!formatConstraint || preset.format === formatConstraint),
      ) ?? null)
    : null;

  const requestedPlayerRole = isDebatePlayerRole(source.playerRole)
    ? source.playerRole
    : null;
  const playerRole =
    matchedPreset?.playerRole ??
    (formatConstraint === "whodunnit" && requestedPlayerRole === "judge"
      ? "participant"
      : requestedPlayerRole) ??
    (formatConstraint === "whodunnit" ? "participant" : "judge");
  const juryEnabled = matchedPreset
    ? matchedPreset.juryEnabled
    : source.juryEnabled === true;
  const format = matchedPreset
    ? matchedPreset.format
    : (formatConstraint ?? normalizeDebateFormatId(source.format));
  const formality = matchedPreset
    ? matchedPreset.formality
    : (() => {
        const normalized = normalizeDebateFormalityId(source.formality);
        return format === "whodunnit" && normalized === "plainspoken"
          ? "structured"
          : normalized;
      })();

  const playerSideId =
    playerRole === "participant"
      ? isDebateSideId(source.playerSideId)
        ? source.playerSideId
        : "for"
      : null;

  const moderatorBotIdRaw =
    typeof source.moderatorBotId === "string"
      ? source.moderatorBotId.trim()
      : "";
  const moderatorBotId =
    playerRole === "judge"
      ? null
      : moderatorBotIdRaw &&
          allowed.has(moderatorBotIdRaw) &&
          moderatorBotIdRaw !== forAdvocateBotId &&
          moderatorBotIdRaw !== againstAdvocateBotId
        ? moderatorBotIdRaw
        : null;
  const moderatorTitle = normalizeDebateModeratorTitle(source.moderatorTitle);

  return {
    topic: normalizedText(source.topic, 1_000) || motion.motion.slice(0, 120),
    motion,
    format,
    formality,
    forumRoundMode: normalizeDebateForumRoundMode(source.forumRoundMode),
    forumRoundCount: normalizeDebateForumRoundCount(source.forumRoundCount),
    juryEnabled,
    setupPresetId: matchedPreset?.id ?? null,
    playerRole,
    participantDifficulty:
      source.participantDifficulty === "coach" ||
      source.participantDifficulty === "immersive"
        ? source.participantDifficulty
        : "standard",
    rhetoricalGambitsEnabled:
      source.rhetoricalGambitsEnabled !== false,
    playerSideId,
    moderatorBotId,
    moderatorTitle,
    forAdvocateBotId,
    againstAdvocateBotId,
    notes: packet.notes,
    exhibits,
    sources: cappedSources,
    researchMeta,
  };
}

/**
 * Fill a missing moderator seat for Spectator/Crossfire drafts from unused roster bots.
 */
export function completeDebateSetupSuggestionCastV1(
  suggestion: DebateSetupSuggestionV1,
  allowedBotIds: readonly string[],
  pickIndex: (exclusiveMax: number) => number = (max) =>
    Math.floor(Math.random() * max),
): DebateSetupSuggestionV1 {
  if (suggestion.playerRole === "judge") {
    return { ...suggestion, moderatorBotId: null };
  }
  if (suggestion.moderatorBotId) return suggestion;
  const reserved = new Set([
    suggestion.forAdvocateBotId,
    suggestion.againstAdvocateBotId,
  ]);
  const candidates = allowedBotIds
    .map((id) => id.trim())
    .filter((id) => id && !reserved.has(id));
  if (candidates.length === 0) return suggestion;
  const index = Math.max(
    0,
    Math.min(candidates.length - 1, Math.floor(pickIndex(candidates.length))),
  );
  return {
    ...suggestion,
    moderatorBotId: candidates[index] ?? null,
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

/**
 * Fit an evidence title into surrounding prose: capitalize at a sentence
 * start, lowercase the lead letter mid-sentence.
 */
export function debateEvidenceTitleCasedForProse(
  title: string,
  precedingText: string,
): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  const before = precedingText
    .replace(/[\s\u00a0]+$/u, "")
    // Markdown emphasis often wraps the period: **Claim.** → treat as sentence end.
    .replace(/[*_~`]+$/u, "")
    .replace(/[\s\u00a0]+$/u, "");
  const atSentenceStart =
    before.length === 0 || /[.!?]["'”’)\]]*$/u.test(before);
  if (atSentenceStart) {
    return trimmed.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
  }
  return trimmed.replace(/^\p{Lu}/u, (letter) => letter.toLowerCase());
}

/**
 * Replace validated [[source:id]] / [[exhibit:id]] markers with human titles
 * for plain-text surfaces (Jury hover, ballot reasons, exported record).
 * Title casing follows sentence position in the surrounding prose.
 */
export function debateResolvedEvidenceText(
  content: string,
  evidence: DebateEvidencePacketV1,
): string {
  const titles = new Map(
    debateEvidenceItems(evidence).map((item) => [
      item.value.id,
      item.value.title,
    ]),
  );
  return content
    .replace(
      /\[\[(?:source|exhibit):([a-z0-9][a-z0-9_-]{0,47})\]\]/giu,
      (marker, rawId: string, offset: number, full: string) => {
        const title = titles.get(rawId.toLowerCase());
        if (!title) return "";
        return debateEvidenceTitleCasedForProse(title, full.slice(0, offset));
      },
    )
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/ \n/gu, "\n")
    .trim();
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
    // Unwrap Markdown emphasis so captions/TTS never speak "**twelve seconds**".
    // Leave single * markers for voiceSpokenText stage-direction handling.
    .replace(/(\*{2,3}|_{2,3}|~{2})([^*_~\r\n]+?)\1/gu, "$2")
    // Models sometimes emit a script label; it is never part of the spoken floor.
    .replace(/^\s*(?:Moderator|Judge|Chair(?:person)?)\s*:\s*/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Debate persists what was argued, not actor directions. Hidden voice
 * performance remains available through voicePerformanceCue metadata.
 */
export function sanitizeDebateDebaterText(content: string): string {
  return content
    .replace(
      /(?:\*{1,3}|\[)\s*(?:(?:angry|excited|nervous|sarcastic|solemn|whispers?)|(?:shouts?|yells?|screams?|speaks?\s+loudly|raises?\s+(?:(?:his|her|their|its|the)\s+)?voice|projects?\s+(?:(?:his|her|their|its|the)\s+)?voice)(?:\s+over\s+(?:(?:the)\s+)?(?:audience|crowd|gallery))?)\s*(?:\*{1,3}|\])/giu,
      " ",
    )
    .replace(/[ \t]+/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .trim();
}

const DEBATE_PROMPT_LEAK_ANYWHERE_PATTERNS = [
  /return json only/iu,
  /evidence participation assignment/iu,
  /never mention these production instructions/iu,
  /an audible floor clock gives you/iu,
  /public debate so far:/iu,
  /choose deliverycue/iu,
  /\{\s*"content"\s*:\s*"your public statement"/iu,
  /give the .{0,80} opening argument/iu,
] as const;

/**
 * True when public Debate speech is director notes or the JSON contract
 * instead of an in-character floor line.
 */
export function debateSpeechLooksLikePromptLeak(raw: string): boolean {
  const normalized = raw.replace(/\s+/gu, " ").trim();
  if (!normalized) return false;
  return DEBATE_PROMPT_LEAK_ANYWHERE_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

/**
 * True when a case-board sentence is a floor grant, time call, or leaked
 * production instruction rather than an argued claim.
 */
export function debateClaimSentenceIsProceduralFloorGrant(
  sentence: string,
): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return true;
  if (debateSpeechLooksLikePromptLeak(trimmed)) return true;
  return (
    /,\s*(?:rebuttal|closing)\.?$/iu.test(trimmed) ||
    /\byou have the scheduled\b/iu.test(trimmed) ||
    /\bhas the scheduled (?:rebuttal|closing|opening)\b/iu.test(trimmed) ||
    /\byou(?:'re| are) up first\b/iu.test(trimmed)
  );
}

const DEBATE_ADDRESSED_SPEECH_KINDS = new Set<string>([
  "speech",
  "moderator_ruling",
  "phase",
  "ballot",
  "jury_verdict",
]);

function escapeDebateNamePattern(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function debateEffectsIncludeSpeechCopy(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(
    (effect) =>
      Boolean(
        effect &&
          typeof effect === "object" &&
          "type" in effect &&
          effect.type === "speech_copy",
      ),
  );
}

/**
 * Frozen Echo/Copycat Powers, including marketplace compiles that kept the
 * self-cue but dropped `speech_copy` from `effects`.
 */
export function debatePowerCopiesAddressedSpeech(args: {
  planEffects?: unknown;
  powers?: readonly BotPowerV1[] | null;
}): boolean {
  if (botPowerCopiesAddressedSpeechV1(args.powers)) return true;
  if (debateEffectsIncludeSpeechCopy(args.planEffects)) return true;
  for (const power of args.powers ?? []) {
    const compiled = power.compiled;
    if (!compiled) continue;
    if (debateEffectsIncludeSpeechCopy(compiled.effects)) return true;
    if (
      /repeat the latest speech addressed to you verbatim/iu.test(
        compiled.selfCue,
      )
    ) {
      return true;
    }
    if (
      compiled.ruleLabels.some((label) =>
        /echoes addressed speech|copies addressed speech/iu.test(label),
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Latest public line from another speaker that names this bot. Never returns
 * leaked production instructions.
 */
export function debateLatestAddressedPublicSpeech(
  events: readonly Pick<
    DebateEventV1,
    "kind" | "content" | "speakerBotId" | "stepKey"
  >[],
  holder: { id: string; name: string },
): string | null {
  const name = holder.name.trim();
  if (!name) return null;
  const namePattern = new RegExp(`\\b${escapeDebateNamePattern(name)}\\b`, "iu");
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.speakerBotId === holder.id) continue;
    if (debateEventIsTranscriptHousekeeping(event)) continue;
    if (debateEventIsAtmosphericVocalFoley(event)) continue;
    if (event.kind === "case_board" || event.kind === "silence") continue;
    if (!DEBATE_ADDRESSED_SPEECH_KINDS.has(event.kind)) continue;
    if (!event.content || debateSpeechLooksLikePromptLeak(event.content)) {
      continue;
    }
    if (!namePattern.test(event.content)) continue;
    return event.content;
  }
  return null;
}

const DEBATE_COPYCAT_SOURCE_KINDS = new Set<string>([
  "speech",
  "player_turn",
  "silence",
]);

/**
 * Latest heard public floor from the opposing side, including canonical mute
 * silence and brief attributed vocal Foley. Debate Copycat uses this whenever
 * the other side has spoken, so a second-chair Copycat does not invent an
 * opening.
 */
export function debateLatestCopycatSourceSpeech(
  events: readonly Pick<
    DebateEventV1,
    "kind" | "content" | "speakerBotId" | "sideId" | "stepKey"
  >[],
  holder: { id: string; sideId: DebateSideId | null },
): string | null {
  if (!holder.sideId) return null;
  const opposingSideId: DebateSideId =
    holder.sideId === "for" ? "against" : "for";
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.speakerBotId === holder.id) continue;
    if (event.sideId !== opposingSideId) continue;
    if (
      !DEBATE_COPYCAT_SOURCE_KINDS.has(event.kind) &&
      !debateEventIsAtmosphericVocalFoley(event)
    ) {
      continue;
    }
    if (debateEventIsTranscriptHousekeeping(event)) continue;
    if (!event.content) continue;
    if (debateSpeechLooksLikePromptLeak(event.content)) continue;
    if (debateClaimSentenceIsProceduralFloorGrant(event.content)) continue;
    return event.content;
  }
  return null;
}

/** Saved step for a bot-chair cutoff after an unintelligible public floor. */
export const DEBATE_UNINTELLIGIBLE_FLOOR_STEP_KEY = "unintelligible_floor" as const;

/**
 * True when heard public Debate speech is garbled rather than a recognizable
 * argument. Canonical mute silence is a different Power and is not nonsense.
 */
export function debatePublicSpeechLooksUnintelligible(content: string): boolean {
  if (!content.trim() || botPowerResponseIsSilentV1(content)) return false;
  if (debateSpeechLooksLikePromptLeak(content)) return false;
  return botPowerIntendedSpeechLooksGibberishV1(content);
}

function debateEffectsIncludeSpeechObfuscation(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const effect =
      entry &&
      typeof entry === "object" &&
      "effect" in entry &&
      entry.effect &&
      typeof entry.effect === "object"
        ? entry.effect
        : entry;
    return Boolean(
      effect &&
        typeof effect === "object" &&
        "type" in effect &&
        effect.type === "speech_obfuscation",
    );
  });
}

/**
 * True when a landed advocate/participant floor should draw a chair cutoff:
 * public obfuscation, or content that is itself unintelligible.
 */
export function debateFloorSpeechWarrantsUnintelligibleCutoff(args: {
  kind: string;
  content: string;
  speakerKind: string;
  interrupted?: boolean;
  speakerEffects?: unknown;
}): boolean {
  if (args.interrupted === true) return false;
  if (args.speakerKind !== "advocate" && args.speakerKind !== "player") {
    return false;
  }
  if (
    args.kind !== "speech" &&
    args.kind !== "player_turn" &&
    args.kind !== "testimony"
  ) {
    return false;
  }
  if (!args.content.trim() || botPowerResponseIsSilentV1(args.content)) {
    return false;
  }
  if (debateEffectsIncludeSpeechObfuscation(args.speakerEffects)) return true;
  return debatePublicSpeechLooksUnintelligible(args.content);
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

/** Minimum cinematic hold when a hard-mute beat has no richer timing metadata. */
export const DEBATE_MUTE_SILENCE_MIN_HOLD_MS = 1_400;
/** Legacy fixed hold used before mute beats carried intended-speech timing. */
export const DEBATE_MUTE_SILENCE_FALLBACK_HOLD_MS = 900;

/**
 * True when the public floor is canonical mute silence (`...`), including
 * silence-kind events and muted ballot / verdict lines that kept kind≠silence.
 */
export function debateEventIsCanonicalSilence(
  event: Pick<DebateEventV1, "kind" | "content">,
): boolean {
  return event.kind === "silence" || botPowerResponseIsSilentV1(event.content);
}

/**
 * Camera / clock hold for a mute silence beat: prefer saved turn timing, then
 * the private intended draft duration, then the floor limit, then a short
 * fallback. Intended drafts never become audible — they only size the pause.
 */
export function debateSilenceHoldDurationMs(
  event: Pick<
    DebateEventV1,
    "kind" | "content" | "timing" | "powerIntendedContent" | "mutePerformance"
  >,
): number {
  if (event.mutePerformance?.durationMs) {
    return Math.max(
      DEBATE_MUTE_SILENCE_MIN_HOLD_MS,
      Math.round(event.mutePerformance.durationMs),
    );
  }
  const fromTiming = event.timing?.estimatedDurationMs;
  if (typeof fromTiming === "number" && fromTiming > 0) {
    return Math.max(DEBATE_MUTE_SILENCE_MIN_HOLD_MS, Math.round(fromTiming));
  }
  const intended = event.powerIntendedContent?.trim() ?? "";
  if (intended && !botPowerResponseIsSilentV1(intended)) {
    return Math.max(
      DEBATE_MUTE_SILENCE_MIN_HOLD_MS,
      debateEstimatedSpeechDurationMs(intended),
    );
  }
  const fromLimit = event.timing?.limitMs;
  if (typeof fromLimit === "number" && fromLimit > 0) {
    return Math.max(DEBATE_MUTE_SILENCE_MIN_HOLD_MS, Math.round(fromLimit));
  }
  return DEBATE_MUTE_SILENCE_FALLBACK_HOLD_MS;
}

const DEBATE_ACTIVE_PRESENTATION_EVENT_KINDS = new Set<DebateEventKind>([
  "intro",
  "phase",
  "speech",
  "silence",
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
 * Legacy Spectator records created before terminal completion moved into the
 * reducer can still await a presentation seal. New records complete with their
 * durable closing event instead of relying on a browser callback.
 */
export function debateSessionAwaitsPresentationSeal(
  session: Pick<
    DebateSessionV1,
    "playerRole" | "stepKey" | "status" | "completedAt"
  >,
): boolean {
  return (
    session.playerRole === "spectator" &&
    session.stepKey === "completed" &&
    session.completedAt === null &&
    (session.status === "live" || session.status === "paused")
  );
}

/**
 * Spectator galleries hold paused with no interrupted line until the player
 * presses Start — both after a full bake settles and after progressive unlock
 * while the baker is still ahead. Resume would only present *new* deltas and
 * skip the already-baked opening, so this gate forces Start-from-beginning.
 */
export function debateSpectatorAwaitingFirstWatch(
  session: Pick<
    DebateSessionV1,
    | "playerRole"
    | "status"
    | "pausedPresentationEventId"
    | "events"
    | "stepKey"
    | "completedAt"
  >,
): boolean {
  return (
    session.playerRole === "spectator" &&
    debateSessionAwaitingFirstPresentation(session)
  );
}

/**
 * A prepared opening that has never been shown. Unlike a normal recess, this
 * checkpoint has no heard presentation event, so every player role may use the
 * title card as a Start gate while the opening is prepared ahead of time.
 */
export function debateSessionAwaitingFirstPresentation(
  session: Pick<
    DebateSessionV1,
    "status" | "pausedPresentationEventId" | "completedAt"
  > & { events: readonly unknown[] },
): boolean {
  if (session.status !== "paused") return false;
  if (session.pausedPresentationEventId) return false;
  if (session.events.length === 0) return false;
  if (session.completedAt != null) return false;
  return true;
}

/**
 * Saved-for-later Studio setups: Archive Open, paused, never opened the floor.
 * Resume/Start begins the intro (and Spectator bake) as a fresh launch.
 */
export function debateSessionAwaitingDeferredStart(
  session: Pick<
    DebateSessionV1,
    "status" | "pausedPresentationEventId" | "completedAt" | "stepKey"
  > & { events: readonly unknown[] },
): boolean {
  if (session.status !== "paused") return false;
  if (session.completedAt != null) return false;
  if (session.pausedPresentationEventId) return false;
  if (session.events.length > 0) return false;
  return (
    session.stepKey === "intro" || session.stepKey === "turnabout_intro"
  );
}

/**
 * True once the Debate floor has produced its closing beat (or already sealed).
 * Spectator sessions may still be watchable after this becomes true.
 */
export function debateSessionFloorIsSettled(
  session: Pick<DebateSessionV1, "stepKey" | "status">,
): boolean {
  return (
    session.stepKey === "completed" ||
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
  );
}

const DEBATE_RECESS_RESUME_FILLERS = {
  free_for_all: [
    "As I was saying…",
    "Before the break, I wanted to say…",
    "Now that we are back from the recess…",
    "Alright — picking that back up…",
  ],
  heated: [
    "As I was saying…",
    "Before we got interrupted, I was saying…",
    "Now that we are back from the recess…",
    "Back to it — as I was saying…",
  ],
  plainspoken: [
    "As I was saying…",
    "Before the intermission, I wanted to say…",
    "Now that we are back from the recess…",
    "To continue where I left off…",
  ],
  structured: [
    "As I was saying…",
    "Before the recess, I wished to say…",
    "Now that we are back from the recess…",
    "Returning to the held point…",
  ],
  parliamentary: [
    "As I was saying…",
    "Before the chamber stood in recess, I wished to say…",
    "Now that we are back from the recess…",
    "With the floor restored, as I was saying…",
  ],
} as const satisfies Record<DebateFormalityId, readonly string[]>;

function debateRecessResumeFillerIndex(seed: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return length === 0 ? 0 : hash % length;
}

/**
 * Presentation-only lead-in when a held speaker resumes after recess.
 * Does not rewrite the saved Proceedings line.
 */
export function debateRecessResumeFiller(args: {
  formality: DebateFormalityId;
  sessionId: string;
  eventId: string;
  revision?: number;
}): string {
  const formality = normalizeDebateFormalityId(args.formality);
  const pool = DEBATE_RECESS_RESUME_FILLERS[formality];
  const index = debateRecessResumeFillerIndex(
    `${args.sessionId}:${args.eventId}:${args.revision ?? 0}:recess-filler-v1`,
    pool.length,
  );
  return pool[index]!;
}

/**
 * Prepend a recess filler to spoken/caption content for a single replay pass.
 */
export function debateRecessResumePresentationContent(
  content: string,
  filler: string,
): string {
  const body = content.trim();
  const lead = filler.trim();
  if (!lead) return body;
  if (!body) return lead;
  return `${lead} ${body}`;
}

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
    if (debateEventIsCanonicalSilence(event)) {
      return durationMs + debateSilenceHoldDurationMs(event);
    }
    return durationMs + debateEstimatedSpeechDurationMs(event.content);
  }, 0);
}

export function isDebatePlayerRole(value: unknown): value is DebatePlayerRole {
  return value === "judge" || value === "participant" || value === "spectator" || value === "investigator";
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
  return value === "forum" || value === "turnabout" || value === "whodunnit";
}

export function normalizeDebateFormatId(value: unknown): DebateFormatId {
  return value === "turnabout" || value === "whodunnit" ? value : "forum";
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
    cadence: "four-plus-moderator",
    phase: "disabled",
    jurors: [],
    forepersonBotId: null,
    initialBallots: [],
    preparedFinalBallots: [],
    finalBallots: [],
    moderatorBallot: null,
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

/** Saved natural-five proceedings keep their original roster and replay shape. */
export function debateJurySeatCount(
  jury: Pick<DebateJuryStateV1, "cadence">,
): number {
  return jury.cadence === "natural-five"
    ? DEBATE_LEGACY_JURY_SIZE
    : DEBATE_JURY_SIZE;
}

export function debateJuryUsesModeratorBallot(
  jury: Pick<DebateJuryStateV1, "cadence">,
): boolean {
  return jury.cadence === "four-plus-moderator";
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
  // The original persisted shape predates the cadence tag. Preserve a
  // complete five-seat record when it is reopened for archive or replay;
  // new sessions always write the explicit four-plus-moderator cadence.
  const legacyFiveJurorRecord =
    source.cadence === "natural-five" ||
    (source.cadence === undefined &&
      (jurors.length >= DEBATE_LEGACY_JURY_SIZE ||
        (Array.isArray(source.finalBallots) &&
          source.finalBallots.length >= DEBATE_LEGACY_JURY_SIZE)));
  const jurorLimit = legacyFiveJurorRecord
    ? DEBATE_LEGACY_JURY_SIZE
    : DEBATE_JURY_SIZE;
  const selectedJurors = jurors.slice(0, jurorLimit);
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
        .slice(0, jurorLimit)
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
        .slice(0, jurorLimit)
    : [];
  const revealedJurorIds = new Set(
    finalBallots.map((ballot) => ballot.jurorBotId),
  );
  const preparedFinalBallots = Array.isArray(source.preparedFinalBallots)
    ? source.preparedFinalBallots
        .filter((ballot): ballot is DebateJuryBallotV1 =>
          Boolean(
            ballot &&
            typeof ballot === "object" &&
            (ballot as DebateJuryBallotV1).stage === "final" &&
            selectedJurorIds.has((ballot as DebateJuryBallotV1).jurorBotId) &&
            !revealedJurorIds.has(
              (ballot as DebateJuryBallotV1).jurorBotId,
            ) &&
            isDebateSideId((ballot as DebateJuryBallotV1).sideId),
          ),
        )
        .slice(0, jurorLimit)
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
  const moderatorBallot =
    !legacyFiveJurorRecord &&
    source.moderatorBallot &&
    typeof source.moderatorBallot === "object" &&
    typeof (source.moderatorBallot as DebateBallotV1).voterBotId ===
      "string" &&
    isDebateSideId((source.moderatorBallot as DebateBallotV1).sideId)
      ? (source.moderatorBallot as DebateBallotV1)
      : null;
  const jurorForVotes = finalBallots.filter(
    (ballot) => ballot.sideId === "for",
  ).length;
  const jurorAgainstVotes = finalBallots.filter(
    (ballot) => ballot.sideId === "against",
  ).length;
  const forVotes =
    jurorForVotes + (moderatorBallot?.sideId === "for" ? 1 : 0);
  const againstVotes =
    jurorAgainstVotes + (moderatorBallot?.sideId === "against" ? 1 : 0);
  const outcomeComplete = legacyFiveJurorRecord
    ? finalBallots.length === jurorLimit
    : finalBallots.length === jurorLimit && moderatorBallot !== null;
  return {
    version: DEBATE_SCHEMA_VERSION,
    enabled: true,
    cadence: legacyFiveJurorRecord ? "natural-five" : "four-plus-moderator",
    phase,
    jurors: selectedJurors,
    forepersonBotId:
      typeof source.forepersonBotId === "string" &&
      selectedJurorIds.has(source.forepersonBotId)
        ? source.forepersonBotId
        : (selectedJurors[0]?.id ?? null),
    initialBallots,
    preparedFinalBallots,
    finalBallots,
    moderatorBallot,
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
      : outcomeComplete && forVotes !== againstVotes
        ? forVotes > againstVotes ? "for" : "against"
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
  if (format === "whodunnit") return defaultDebateMysteryFormatStateV1();
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
  if (format === "whodunnit") {
    const mysteryV2 = normalizeDebateMysteryFormatStateV2(value);
    if (mysteryV2) return mysteryV2;
    return normalizeDebateMysteryFormatStateV1(value);
  }
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
        const mysteryWitness = normalizeDebateTurnaboutMysteryWitnessV1(
          row.mysteryWitness,
        );
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
            recordTestimonyId:
              typeof row.recordTestimonyId === "string" &&
              row.recordTestimonyId.trim()
                ? row.recordTestimonyId.trim().slice(0, 120)
                : null,
            ...(mysteryWitness ? { mysteryWitness } : {}),
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
  const mysteryTrialSource =
    source.mysteryTrial && typeof source.mysteryTrial === "object"
      ? (source.mysteryTrial as Record<string, unknown>)
      : null;
  const frozenInvestigation = mysteryTrialSource
    ? normalizeDebateMysteryFormatStateV1(
        mysteryTrialSource.frozenInvestigation,
      )
    : null;
  const mysteryTrial =
    frozenInvestigation &&
    frozenInvestigation.theory &&
    frozenInvestigation.theoryFiledAt
      ? {
          version: 1 as const,
          frozenInvestigation,
          credibilityRemaining:
            typeof mysteryTrialSource?.credibilityRemaining === "number" &&
            Number.isFinite(mysteryTrialSource.credibilityRemaining)
              ? Math.max(
                  0,
                  Math.min(3, Math.floor(mysteryTrialSource.credibilityRemaining)),
                )
              : 3,
          failedActions:
            typeof mysteryTrialSource?.failedActions === "number" &&
            Number.isFinite(mysteryTrialSource.failedActions)
              ? Math.max(0, Math.floor(mysteryTrialSource.failedActions))
              : 0,
          sustainedTestimonyIds: Array.isArray(
            mysteryTrialSource?.sustainedTestimonyIds,
          )
            ? [
                ...new Set(
                  mysteryTrialSource.sustainedTestimonyIds
                    .map((value) => normalizedText(value, 120))
                    .filter(Boolean),
                ),
              ]
            : [],
          sustainedEvidenceIds: Array.isArray(
            mysteryTrialSource?.sustainedEvidenceIds,
          )
            ? [
                ...new Set(
                  mysteryTrialSource.sustainedEvidenceIds
                    .map((value) => normalizedText(value, 120))
                    .filter(Boolean),
                ),
              ]
            : [],
          evidenceSourceMap:
            mysteryTrialSource?.evidenceSourceMap &&
            typeof mysteryTrialSource.evidenceSourceMap === "object"
              ? Object.fromEntries(
                  Object.entries(
                    mysteryTrialSource.evidenceSourceMap as Record<
                      string,
                      unknown
                    >,
                  ).flatMap(([sourceId, evidenceId]) => {
                    const normalizedSourceId = normalizedText(sourceId, 48)
                      .toLowerCase();
                    const normalizedEvidenceId = normalizedText(
                      evidenceId,
                      120,
                    );
                    return isValidDebateSourceId(normalizedSourceId) &&
                      normalizedEvidenceId
                      ? [[normalizedSourceId, normalizedEvidenceId] as const]
                      : [];
                  }),
                )
              : {},
          testimonySourceMap:
            mysteryTrialSource?.testimonySourceMap &&
            typeof mysteryTrialSource.testimonySourceMap === "object"
              ? Object.fromEntries(
                  Object.entries(
                    mysteryTrialSource.testimonySourceMap as Record<
                      string,
                      unknown
                    >,
                  ).flatMap(([sourceId, testimonyId]) => {
                    const normalizedSourceId = normalizedText(sourceId, 48)
                      .toLowerCase();
                    const normalizedTestimonyId = normalizedText(
                      testimonyId,
                      120,
                    );
                    return isValidDebateSourceId(normalizedSourceId) &&
                      normalizedTestimonyId
                      ? [[normalizedSourceId, normalizedTestimonyId] as const]
                      : [];
                  }),
                )
              : {},
          courtroomComposition:
            normalizeDebateTurnaboutMysteryCourtroomCompositionV1(
              mysteryTrialSource?.courtroomComposition,
            ) ?? {
              version: 1 as const,
              prosecutionCoCounsel: {
                version: 1 as const,
                id: frozenInvestigation.config.prosecutorPartnerBotId,
                name: "Co-counsel",
                color: null,
                glyph: null,
                avatarDetails: null,
                voiceProfile: null,
                revision: `legacy:${frozenInvestigation.config.prosecutorPartnerBotId}`,
              },
              defenseClient: {
                version: 1 as const,
                id:
                  frozenInvestigation.suspects.find(
                    (suspect) =>
                      suspect.seatId === frozenInvestigation.theory?.culpritSeatId,
                  )?.botId ?? "mystery:defendant",
                name:
                  frozenInvestigation.suspects.find(
                    (suspect) =>
                      suspect.seatId === frozenInvestigation.theory?.culpritSeatId,
                  )?.name ?? "Defendant",
                color:
                  frozenInvestigation.suspects.find(
                    (suspect) =>
                      suspect.seatId === frozenInvestigation.theory?.culpritSeatId,
                  )?.color ?? null,
                glyph:
                  frozenInvestigation.suspects.find(
                    (suspect) =>
                      suspect.seatId === frozenInvestigation.theory?.culpritSeatId,
                  )?.glyph ?? null,
                avatarDetails: null,
                voiceProfile: null,
                revision: "legacy:mystery:defendant",
              },
              eligibleWitnesses: [],
            },
          verdict:
            mysteryTrialSource?.verdict &&
            typeof mysteryTrialSource.verdict === "object"
              ? (mysteryTrialSource.verdict as DebateMysteryVerdictV1)
              : null,
        }
      : null;
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
    mysteryTrial,
  };
}

export function normalizeDebateIdempotencyKey(value: unknown): string {
  const key = normalizedText(value, 120);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(key) ? key : "";
}
