import type { ResponseMode } from "./autoFallback.js";
import type { EphemeralChatResolvedProvider } from "./ephemeralChat.js";

export const PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT = 8;
export const PRISM_REFRACT_DIRECTION_MAX_LENGTH = 500;
export const PRISM_REFRACT_REFERENCE_ID_MAX_LENGTH = 160;

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

export interface PrismRefractRequest {
  target: PrismRefractSignalTextTarget;
  currentValue: string;
  rejectedValues: string[];
  preferredProvider?: EphemeralChatResolvedProvider;
  responseMode?: ResponseMode;
  modelOverride?: string | null;
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

function valueLimitForTarget(kind: PrismRefractSignalTextTargetKind): number {
  if (kind === "signal.show.name") return 120;
  if (kind === "signal.booking.topic") return 60;
  if (kind === "signal.create.premise") return 360;
  if (kind === "signal.show.premise") return 600;
  return 1_000;
}

function normalizeTarget(value: unknown): PrismRefractSignalTextTarget {
  if (
    !isRecord(value) ||
    !PRISM_REFRACT_SIGNAL_TEXT_TARGET_KINDS.some(
      (kind) => kind === value.kind,
    )
  ) {
    throw new Error("A registered Signal Refract target is required.");
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
  const limit = valueLimitForTarget(target.kind);
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
      ).slice(-PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT)
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
  const modelOverride =
    typeof value.modelOverride === "string"
      ? value.modelOverride.trim().slice(0, 200) || null
      : null;
  return {
    target,
    currentValue,
    rejectedValues,
    ...(preferredProvider ? { preferredProvider } : {}),
    ...(responseMode ? { responseMode } : {}),
    ...(modelOverride ? { modelOverride } : {}),
  };
}
