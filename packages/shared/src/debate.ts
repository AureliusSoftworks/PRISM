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
export const DEBATE_MOTION_MAX_LENGTH = 320;
export const DEBATE_SIDE_LABEL_MAX_LENGTH = 32;
export const DEBATE_SIDE_BRIEF_MAX_LENGTH = 1_200;
export const DEBATE_EVIDENCE_NOTES_MAX_LENGTH = 8_000;
export const DEBATE_EVIDENCE_SOURCE_MAX_COUNT = 12;
export const DEBATE_PLAYER_TURN_MAX_LENGTH = 4_000;
export const DEBATE_CASE_CARDS_PER_SIDE = 4;
export const DEBATE_TURNABOUT_STATEMENTS_PER_SIDE = 2;
export const DEBATE_JURY_SIZE = 5;
export const DEBATE_JURY_DISCUSSION_TURNS = 5;
export const DEBATE_JURY_EARLY_DISCUSSION_TURNS = 3;

export type DebateFormatId = "forum" | "turnabout";
export type DebateFormatCatalogId =
  | DebateFormatId
  | "flyting"
  | "cypher";
export type DebatePlayerRole = "judge" | "participant" | "spectator";
export type DebateSideId = "for" | "against";
/** Frozen social register for one Debate proceeding, from chaotic to formal. */
export type DebateFormalityId =
  | "free_for_all"
  | "heated"
  | "plainspoken"
  | "structured"
  | "parliamentary";
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
  | "opening"
  | "challenge"
  | "rebuttal"
  | "closing"
  | "verdict";
export type DebateStatus =
  | "live"
  | "waiting_for_player"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";
export type DebateAdvocacyConsentStatus =
  | "accept"
  | "devils_advocate"
  | "decline";
export type DebateCaseCardStatus =
  | "active"
  | "challenged"
  | "conceded"
  | "unanswered";
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
export const DEBATE_FORMALITY_SPECTRUM: readonly DebateFormalityDescriptorV1[] = [
  {
    id: "free_for_all",
    title: "Free-for-all",
    summary: "Theatrical daytime-chaos energy; spar freely without inventing facts.",
    vocabulary: "vivid everyday language, playful jabs, and fast reactions",
    tone: "theatrical, messy, high-energy, and openly combative",
    aggression: "ad hominem sparring is permitted within safety boundaries; challenge motives or credibility without inventing facts",
    prohibitedRegister: "Do not default to House, record, parliamentary procedure, court language, or ceremonial rulings.",
  },
  {
    id: "heated",
    title: "Heated",
    summary: "Sharp, interruptive confrontation with the facts kept intact.",
    vocabulary: "plain sharp language, direct accusations, and quick rebuttals",
    tone: "confrontational, urgent, and interruptive",
    aggression: "may challenge motives or credibility without inventing facts; keep attacks within safety boundaries",
    prohibitedRegister: "Avoid canned parliamentary, court, and ceremonial debate phrasing unless the persona naturally uses it.",
  },
  {
    id: "plainspoken",
    title: "Plainspoken",
    summary: "Ordinary conversational debate: clear, direct, and human.",
    vocabulary: "ordinary conversational language and concrete examples",
    tone: "direct, grounded, and candid",
    aggression: "firm disagreement without theatrical escalation",
    prohibitedRegister: "Avoid canned parliamentary or court phrasing, including House, record, proceedings, objections, and ceremonial address.",
  },
  {
    id: "structured",
    title: "Structured",
    summary: "Formal, direct rounds with clear claims and clean responses.",
    vocabulary: "clear claims, orderly rebuttals, and concise transitions",
    tone: "formal, direct, and disciplined",
    aggression: "controlled adversarial pressure focused on the argument",
    prohibitedRegister: "Avoid ornate parliamentary ritual and courtroom theatrics unless the format specifically requires them.",
  },
  {
    id: "parliamentary",
    title: "Parliamentary",
    summary: "Disciplined institutional debate with the most formal register.",
    vocabulary: "House, record, proceedings, points, and disciplined institutional language when natural",
    tone: "measured, public-minded, and procedurally crisp",
    aggression: "firm but decorous challenge centered on the public case",
    prohibitedRegister: "Do not flatten a persona into generic official prose or use courtroom rulings outside Turnabout.",
  },
] as const;

export function isDebateFormalityId(value: unknown): value is DebateFormalityId {
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
  | DebateFormatDescriptorV1
  | DebateFormatPreviewDescriptorV1;

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
    summary: "Watch a free-for-all Forum and let the five-seat Jury carry the verdict.",
    format: "forum",
    formality: "free_for_all",
    playerRole: "spectator",
    juryEnabled: true,
    juryCadence: "natural-five",
  },
  {
    id: "take-the-floor",
    name: "Crossfire",
    summary: "Take one side in a heated Forum with no Jury between you and the room.",
    format: "forum",
    formality: "heated",
    playerRole: "participant",
    juryEnabled: false,
    juryCadence: "natural-five",
  },
  {
    id: "public-forum",
    name: "Town Hall",
    summary: "Watch a plainspoken Forum and let the five-seat Jury carry the verdict.",
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
    summary: "A parliamentary Forum where you preside over the classic direct duel.",
    format: "forum",
    formality: "parliamentary",
    playerRole: "judge",
    juryEnabled: false,
    juryCadence: "natural-five",
  },
] as const;

export type DebateTurnaboutPhase =
  | "testimony"
  | "examination"
  | "reversal"
  | "resolution";
export type DebateTurnaboutStatementStatus =
  | "ready"
  | "pressed"
  | "contradicted"
  | "resolved";
export type DebateTurnaboutRuling = "sustained" | "overruled";

export interface DebateForumFormatStateV1 {
  version: typeof DEBATE_FORMAT_SCHEMA_VERSION;
  format: "forum";
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
  | DebateForumFormatStateV1
  | DebateTurnaboutFormatStateV1;

export interface DebateMotionSideV1 {
  label: string;
  brief: string;
}

export interface DebateMotionSlateV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  id: string;
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

export interface DebateEvidencePacketV1 {
  version: typeof DEBATE_SCHEMA_VERSION;
  notes: string;
  sources: DebateEvidenceSourceV1[];
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
  | "moderator_ruling"
  | "case_board"
  | "ballot"
  | "jury_deliberation"
  | "jury_verdict"
  | "verdict"
  | "error";

export type DebateSpeakerKind =
  | "moderator"
  | "advocate"
  | "juror"
  | "player"
  | "system";

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
  createdAt: string;
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
  events: DebateEventV1[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  endedEarlyAt: string | null;
  completedAt: string | null;
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
  forAdvocateBotId: string;
  againstAdvocateBotId: string;
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
  responseMode?: ResponseMode;
}

export interface DebateRoleChecksResponse {
  checks: DebateAdvocacyConsent[];
}

export interface DebateSessionCreateRequest {
  format?: DebateFormatId;
  formality?: DebateFormalityId;
  presetId?: DebateSetupPresetId | "custom";
  jury?: {
    enabled?: boolean;
    cadence?: DebateJuryCadence;
  };
  motion: DebateMotionSlateV1;
  evidence: DebateEvidencePacketV1;
  moderatorBotId: string;
  forAdvocateBotId: string;
  againstAdvocateBotId: string;
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

export type DebateTurnaboutAction =
  | "press"
  | "present_evidence"
  | "pass";

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
  motion: string;
  setupPresetId: DebateSetupPresetId | "custom";
  formality: DebateFormalityId;
  juryEnabled: boolean;
  playerRole: DebatePlayerRole;
  winnerSideId: DebateSideId | null;
  updatedAt: string;
  completedAt: string | null;
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

export function normalizeDebateSideLabel(value: unknown, fallback: string): string {
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
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: normalizedText(source.id, 80) || fallbackId,
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
    typeof value === "string" &&
    /^[a-z0-9](?:[a-z0-9_-]{0,47})$/u.test(value)
  );
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
        .slice(0, DEBATE_EVIDENCE_SOURCE_MAX_COUNT)
    : [];
  return {
    version: DEBATE_SCHEMA_VERSION,
    notes: normalizedMultilineText(
      source.notes,
      DEBATE_EVIDENCE_NOTES_MAX_LENGTH,
    ),
    sources,
    frozenAt:
      typeof source.frozenAt === "string" && source.frozenAt.trim()
        ? source.frozenAt.trim().slice(0, 64)
        : null,
  };
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
  const allowed = new Set(evidence.sources.map((source) => source.id));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/\[\[source:([a-z0-9][a-z0-9_-]{0,47})\]\]/giu)) {
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
  const allowed = new Set(evidence.sources.map((source) => source.id));
  const sourceIds: string[] = [];
  const seen = new Set<string>();
  const sanitized = content.replace(
    /\s*\[\[source:([^\]]+)\]\]/giu,
    (_marker, rawId: string) => {
      const id = rawId.trim().toLowerCase();
      if (!isValidDebateSourceId(id) || !allowed.has(id)) return "";
      if (!seen.has(id)) {
        seen.add(id);
        sourceIds.push(id);
      }
      return ` [[source:${id}]]`;
    },
  );
  return {
    content: normalizedMultilineText(sanitized, 12_000),
    sourceIds,
  };
}

export function debateSpokenText(content: string): string {
  return content
    .replace(/\s*\[\[source:[^\]]+\]\]/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isDebatePlayerRole(value: unknown): value is DebatePlayerRole {
  return value === "judge" || value === "participant" || value === "spectator";
}

export function isDebateSideId(value: unknown): value is DebateSideId {
  return value === "for" || value === "against";
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

export function normalizeDebateJuryStateV1(
  value: unknown,
): DebateJuryStateV1 {
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
    ? source.initialBallots.filter(
        (ballot): ballot is DebateJuryBallotV1 =>
          Boolean(
            ballot &&
              typeof ballot === "object" &&
              (ballot as DebateJuryBallotV1).stage === "initial" &&
              selectedJurorIds.has(
                (ballot as DebateJuryBallotV1).jurorBotId,
              ) &&
              isDebateSideId((ballot as DebateJuryBallotV1).sideId),
          ),
      ).slice(0, DEBATE_JURY_SIZE)
    : [];
  const finalBallots = Array.isArray(source.finalBallots)
    ? source.finalBallots.filter(
        (ballot): ballot is DebateJuryBallotV1 =>
          Boolean(
            ballot &&
              typeof ballot === "object" &&
              (ballot as DebateJuryBallotV1).stage === "final" &&
              selectedJurorIds.has(
                (ballot as DebateJuryBallotV1).jurorBotId,
              ) &&
              isDebateSideId((ballot as DebateJuryBallotV1).sideId),
          ),
      ).slice(0, DEBATE_JURY_SIZE)
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
    majoritySideId:
      isDebateSideId(source.majoritySideId)
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
  if (format === "forum") return defaultDebateFormatStateV1("forum");

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
          if (
            !id ||
            !statementId ||
            !isValidDebateSourceId(evidenceSourceId)
          ) {
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
              ruling:
                row.ruling === "sustained" ? "sustained" : "overruled",
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
