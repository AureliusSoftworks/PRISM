import type { ResponseMode } from "./autoFallback.js";
import type { EphemeralChatResolvedProvider } from "./ephemeralChat.js";
import {
  normalizeModelReasoningEffortPreference,
  normalizeProviderReasoningEffort,
  type ModelReasoningEffortPreference,
  type ProviderReasoningEffort,
} from "./reasoningEffort.ts";
import {
  normalizePrismCompanionSurfaceReference,
  normalizePrismCompanionDebateDraft,
  type PrismCompanionSurfaceReference,
  type PrismCompanionDebateDraft,
} from "./prismCompanion.ts";

export const PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT = 8;
export const PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT = 12;
export const PRISM_REFRACT_DIRECTION_MAX_LENGTH = 500;
export const PRISM_REFRACT_REFERENCE_ID_MAX_LENGTH = 160;
export const PRISM_REFRACT_INPUT_CONTEXT_MAX_LENGTH = 800;
export const PRISM_REFRACT_INPUT_LABEL_MAX_LENGTH = 120;
export const PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH = 4_000;
export const PRISM_REFRACT_INPUT_TEXT_TARGET_KIND = "prism.input.text" as const;

export const PRISM_REFRACT_SIGNAL_TEXT_TARGET_KINDS = [
  "signal.create.premise",
  "signal.show.name",
  "signal.show.premise",
  "signal.booking.topic",
  "signal.booking.producerBrief",
  "signal.booking.producerGuestDirection",
] as const;

export type PrismRefractSignalTextTargetKind =
  (typeof PRISM_REFRACT_SIGNAL_TEXT_TARGET_KINDS)[number];

export type PrismRefractSignalTextTarget =
  | { kind: "signal.create.premise"; hostBotId: string }
  | { kind: "signal.show.name"; showId: string }
  | { kind: "signal.show.premise"; showId: string }
  | {
      kind: "signal.booking.topic";
      showId: string;
      guestBotId: string;
    }
  | {
      kind: "signal.booking.producerBrief";
      showId: string;
      guestBotId: string;
    }
  | {
      kind: "signal.booking.producerGuestDirection";
      showId: string;
    };

export const PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS = [
  "debate.setup.topic",
  "debate.setup.moderatorTitle",
  "debate.setup.motion",
  "debate.setup.forLabel",
  "debate.setup.forBrief",
  "debate.setup.againstLabel",
  "debate.setup.againstBrief",
  "debate.setup.playerNotes",
  "debate.setup.researchQuery",
  "debate.setup.scholarQuery",
  "debate.setup.exhibitDraft",
  "debate.setup.exhibitPair",
  "debate.setup.exhibitAdjective",
  "debate.setup.exhibitObject",
  "debate.setup.exhibitObservation",
] as const;

export type PrismRefractDebateTextTargetKind =
  (typeof PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS)[number];

export interface PrismRefractDebateTextTarget {
  kind: PrismRefractDebateTextTargetKind;
  context: PrismCompanionDebateDraft;
  botIds: string[];
}

export interface PrismRefractInputTextTarget {
  kind: typeof PRISM_REFRACT_INPUT_TEXT_TARGET_KIND;
  surface: PrismCompanionSurfaceReference;
  label: string;
  context: string;
  multiline: boolean;
  maxLength: number;
}

export type PrismRefractTextTarget =
  | PrismRefractSignalTextTarget
  | PrismRefractDebateTextTarget
  | PrismRefractInputTextTarget;

export interface PrismRefractRequest {
  target: PrismRefractTextTarget;
  currentValue: string;
  rejectedValues: string[];
  /**
   * Legacy client routing hints. Refract's server route intentionally ignores
   * them and resolves its saved model inside the account's global privacy lane.
   */
  preferredProvider?: EphemeralChatResolvedProvider;
  responseMode?: ResponseMode;
  modelOverride?: string | null;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
}

export interface PrismRefractResponse {
  ok: true;
  value: string;
  provider: EphemeralChatResolvedProvider;
  model: string | null;
}

export function normalizePrismRefractDirection(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, PRISM_REFRACT_DIRECTION_MAX_LENGTH)
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedId(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > PRISM_REFRACT_REFERENCE_ID_MAX_LENGTH
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function valueLimitForTarget(target: PrismRefractTextTarget): number {
  const kind = target.kind;
  if (kind === PRISM_REFRACT_INPUT_TEXT_TARGET_KIND) {
    return target.maxLength;
  }
  if (kind === "signal.show.name") return 120;
  if (kind === "signal.booking.topic") return 60;
  if (kind === "signal.create.premise") return 360;
  if (kind === "signal.show.premise") return 600;
  if (kind === "debate.setup.moderatorTitle") return 72;
  if (kind === "debate.setup.motion") return 320;
  if (
    kind === "debate.setup.forLabel" ||
    kind === "debate.setup.againstLabel"
  ) {
    return 32;
  }
  if (kind === "debate.setup.playerNotes") return 2_000;
  if (
    kind === "debate.setup.researchQuery" ||
    kind === "debate.setup.scholarQuery"
  ) {
    return 240;
  }
  if (kind === "debate.setup.exhibitDraft") return 1_100;
  if (kind === "debate.setup.exhibitPair") return 145;
  if (kind === "debate.setup.exhibitAdjective") return 48;
  if (kind === "debate.setup.exhibitObject") return 96;
  if (kind === "debate.setup.exhibitObservation") return 800;
  return 1_000;
}

export function isPrismRefractDebateTextTarget(
  target: PrismRefractTextTarget,
): target is PrismRefractDebateTextTarget {
  return PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS.some(
    (kind) => kind === target.kind,
  );
}

export function isPrismRefractInputTextTarget(
  target: PrismRefractTextTarget,
): target is PrismRefractInputTextTarget {
  return target.kind === PRISM_REFRACT_INPUT_TEXT_TARGET_KIND;
}

function boundedText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/gu, " ").trim();
  const clipped = normalized.slice(0, limit);
  if (clipped.length === limit && /\s$/u.test(clipped) && normalized.length > limit) {
    return normalized.slice(0, limit + 1).trim().slice(0, limit);
  }
  return clipped.trim();
}

function normalizeTarget(value: unknown): PrismRefractTextTarget {
  if (
    isRecord(value) &&
    value.kind === PRISM_REFRACT_INPUT_TEXT_TARGET_KIND
  ) {
    const requestedMaxLength =
      typeof value.maxLength === "number" && Number.isFinite(value.maxLength)
        ? Math.trunc(value.maxLength)
        : PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH;
    return {
      kind: PRISM_REFRACT_INPUT_TEXT_TARGET_KIND,
      surface: normalizePrismCompanionSurfaceReference(value.surface),
      label:
        boundedText(value.label, PRISM_REFRACT_INPUT_LABEL_MAX_LENGTH) ||
        "field",
      context: boundedText(value.context, PRISM_REFRACT_INPUT_CONTEXT_MAX_LENGTH),
      multiline: value.multiline === true,
      maxLength: Math.max(
        1,
        Math.min(PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH, requestedMaxLength),
      ),
    };
  }
  if (
    isRecord(value) &&
    PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS.some(
      (kind) => kind === value.kind,
    )
  ) {
    const context = normalizePrismCompanionDebateDraft(value.context);
    if (!context) {
      throw new Error("Debate setup context is required.");
    }
    const botIds = Array.isArray(value.botIds)
      ? Array.from(
          new Set(
            value.botIds
              .map((candidate) => {
                try {
                  return boundedId(candidate, "Debate cast member");
                } catch {
                  return null;
                }
              })
              .filter((candidate): candidate is string => Boolean(candidate)),
          ),
        ).slice(0, 5)
      : [];
    return {
      kind: value.kind as PrismRefractDebateTextTargetKind,
      context,
      botIds,
    };
  }
  if (
    !isRecord(value) ||
    !PRISM_REFRACT_SIGNAL_TEXT_TARGET_KINDS.some(
      (kind) => kind === value.kind,
    )
  ) {
    throw new Error("A registered Prism Refract target is required.");
  }
  const kind = value.kind as PrismRefractSignalTextTargetKind;
  if (kind === "signal.create.premise") {
    return { kind, hostBotId: boundedId(value.hostBotId, "Signal host") };
  }
  const showId = boundedId(value.showId, "Signal show");
  if (
    kind === "signal.booking.topic" ||
    kind === "signal.booking.producerBrief"
  ) {
    return {
      kind,
      showId,
      guestBotId: boundedId(value.guestBotId, "Signal guest"),
    };
  }
  return { kind, showId };
}

export function normalizePrismRefractRequest(
  value: unknown,
): PrismRefractRequest {
  if (!isRecord(value)) {
    throw new Error("A Prism Refract request is required.");
  }
  const target = normalizeTarget(value.target);
  const limit = valueLimitForTarget(target);
  const rejectedCandidateLimit =
    target.kind === "debate.setup.exhibitDraft" ||
    target.kind === "debate.setup.exhibitPair"
      ? PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT
      : PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT;
  const currentValue =
    typeof value.currentValue === "string"
      ? value.currentValue.trim().slice(0, limit)
      : "";
  const rejectedValues = Array.isArray(value.rejectedValues)
    ? Array.from(
        new Set(
          value.rejectedValues
            .filter((candidate): candidate is string =>
              Boolean(typeof candidate === "string" && candidate.trim()),
            )
            .map((candidate) => candidate.trim().slice(0, limit)),
        ),
      ).slice(-rejectedCandidateLimit)
    : [];
  const preferredProvider =
    value.preferredProvider === "local" ||
    value.preferredProvider === "openai" ||
    value.preferredProvider === "anthropic"
      ? value.preferredProvider
      : undefined;
  const responseMode =
    value.responseMode === "local" ||
    value.responseMode === "online" ||
    value.responseMode === "auto"
      ? value.responseMode
      : undefined;
  const hasModelOverride = Object.prototype.hasOwnProperty.call(
    value,
    "modelOverride",
  );
  const modelOverride =
    typeof value.modelOverride === "string"
      ? value.modelOverride.trim().slice(0, 200) || null
      : null;
  const normalizedProviderReasoningEffort =
    normalizeProviderReasoningEffort(value.reasoningEffort);
  const reasoningEffort =
    normalizedProviderReasoningEffort === "max"
      ? normalizedProviderReasoningEffort
      : normalizeModelReasoningEffortPreference(value.reasoningEffort);
  const turbo = typeof value.turbo === "boolean" ? value.turbo : undefined;
  return {
    target,
    currentValue,
    rejectedValues,
    ...(preferredProvider ? { preferredProvider } : {}),
    ...(responseMode ? { responseMode } : {}),
    ...(hasModelOverride ? { modelOverride } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(turbo !== undefined ? { turbo } : {}),
  };
}
