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
export const DEBATE_MOTION_MAX_LENGTH = 320;
export const DEBATE_SIDE_LABEL_MAX_LENGTH = 32;
export const DEBATE_SIDE_BRIEF_MAX_LENGTH = 1_200;
export const DEBATE_EVIDENCE_NOTES_MAX_LENGTH = 8_000;
export const DEBATE_EVIDENCE_SOURCE_MAX_COUNT = 12;
export const DEBATE_PLAYER_TURN_MAX_LENGTH = 4_000;
export const DEBATE_CASE_CARDS_PER_SIDE = 4;

export type DebatePlayerRole = "judge" | "participant" | "spectator";
export type DebateSideId = "for" | "against";
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
export type DebateBotRole = "moderator" | "advocate";

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
  | "player_turn"
  | "reaction"
  | "interjection"
  | "moderator_ruling"
  | "case_board"
  | "ballot"
  | "verdict"
  | "error";

export type DebateSpeakerKind = "moderator" | "advocate" | "player" | "system";

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
  playerVerdict: DebateSideId | null;
  winnerSideId: DebateSideId | null;
  events: DebateEventV1[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DebateSynthesizeRequest {
  topic: string;
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

export interface DebateSessionListItemV1 {
  id: string;
  status: DebateStatus;
  phase: DebatePhase;
  motion: string;
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

export function normalizeDebateIdempotencyKey(value: unknown): string {
  const key = normalizedText(value, 120);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(key) ? key : "";
}
