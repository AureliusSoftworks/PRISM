export const AUTO_FALLBACK_CHAIN_VERSION = 1 as const;
export const AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT = 1 as const;
export const AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT = 5 as const;
export const AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT = 6 as const;
/** @deprecated Use AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT. */
export const AUTO_FALLBACK_CHAIN_FALLBACK_COUNT =
  AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT;
export const AUTO_FALLBACK_MODEL_ID_MAX_LENGTH = 240;

export type AutoFallbackProvider = "local" | "openai" | "anthropic";
export type ResponseMode = "local" | "auto" | "online";

export type AutoFallbackFailureReason =
  | "timeout"
  | "provider_error"
  | "unavailable"
  | "empty"
  | "refusal"
  | "invalid_output";

export interface AutoFallbackModelRef {
  provider: AutoFallbackProvider;
  model: string;
}

export interface AutoFallbackChainV1 {
  v: typeof AUTO_FALLBACK_CHAIN_VERSION;
  fallbacks: AutoFallbackModelRef[];
}

export interface AutoFallbackAttemptTraceV1 extends AutoFallbackModelRef {
  durationMs: number;
  outcome: "failed" | "succeeded";
  reason?: AutoFallbackFailureReason;
}

export interface AutoRecoveryTraceV1 {
  v: typeof AUTO_FALLBACK_CHAIN_VERSION;
  attempts: AutoFallbackAttemptTraceV1[];
  finalProvider: AutoFallbackProvider;
  finalModel: string;
  crossedOnline: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isAutoFallbackProvider(value: unknown): value is AutoFallbackProvider {
  return value === "local" || value === "openai" || value === "anthropic";
}

export function normalizeResponseMode(
  value: unknown,
  fallback: ResponseMode = "local"
): ResponseMode {
  return value === "local" || value === "auto" || value === "online"
    ? value
    : fallback;
}

export function autoFallbackModelKey(ref: AutoFallbackModelRef): string {
  return `${ref.provider}:${ref.model.trim().toLowerCase()}`;
}

export function normalizeAutoFallbackModelRef(
  value: unknown
): AutoFallbackModelRef | null {
  if (!isRecord(value) || !isAutoFallbackProvider(value.provider)) return null;
  const model = typeof value.model === "string"
    ? value.model.trim().slice(0, AUTO_FALLBACK_MODEL_ID_MAX_LENGTH)
    : "";
  if (!model || model.toLowerCase() === "auto") return null;
  return { provider: value.provider, model };
}

export function normalizeAutoFallbackChain(
  value: unknown
): AutoFallbackChainV1 | null {
  if (!isRecord(value) || value.v !== AUTO_FALLBACK_CHAIN_VERSION) return null;
  if (
    !Array.isArray(value.fallbacks) ||
    value.fallbacks.length < AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT ||
    value.fallbacks.length > AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT
  ) {
    return null;
  }
  const fallbacks = value.fallbacks.map(normalizeAutoFallbackModelRef);
  if (fallbacks.some((fallback) => fallback === null)) return null;
  const normalized = fallbacks as AutoFallbackModelRef[];
  if (new Set(normalized.map(autoFallbackModelKey)).size !== normalized.length) {
    return null;
  }
  return { v: AUTO_FALLBACK_CHAIN_VERSION, fallbacks: normalized };
}

export function parseStoredAutoFallbackChain(
  raw: string | null | undefined
): AutoFallbackChainV1 | null {
  if (!raw?.trim()) return null;
  try {
    return normalizeAutoFallbackChain(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function serializeAutoFallbackChain(
  value: AutoFallbackChainV1 | null | undefined
): string | null {
  const normalized = normalizeAutoFallbackChain(value);
  return normalized ? JSON.stringify(normalized) : null;
}

export function autoFallbackResolvedChain(
  primary: AutoFallbackModelRef,
  chain: AutoFallbackChainV1 | null | undefined
): AutoFallbackModelRef[] | null {
  const normalizedPrimary = normalizeAutoFallbackModelRef(primary);
  const normalizedChain = normalizeAutoFallbackChain(chain);
  if (!normalizedPrimary || !normalizedChain) return null;
  const primaryKey = autoFallbackModelKey(normalizedPrimary);
  const remainingFallbacks = normalizedChain.fallbacks.filter(
    (fallback) => autoFallbackModelKey(fallback) !== primaryKey,
  );
  return remainingFallbacks.length > 0
    ? [normalizedPrimary, ...remainingFallbacks]
    : null;
}

export function normalizeAutoRecoveryTrace(
  value: unknown
): AutoRecoveryTraceV1 | undefined {
  if (!isRecord(value) || value.v !== AUTO_FALLBACK_CHAIN_VERSION) return undefined;
  if (!isAutoFallbackProvider(value.finalProvider)) return undefined;
  const finalModel = typeof value.finalModel === "string"
    ? value.finalModel.trim().slice(0, AUTO_FALLBACK_MODEL_ID_MAX_LENGTH)
    : "";
  if (!finalModel || !Array.isArray(value.attempts)) return undefined;
  const attempts = value.attempts
    .slice(0, AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT)
    .map((attempt): AutoFallbackAttemptTraceV1 | null => {
      const ref = normalizeAutoFallbackModelRef(attempt);
      if (!ref || !isRecord(attempt)) return null;
      const outcome = attempt.outcome === "succeeded" || attempt.outcome === "failed"
        ? attempt.outcome
        : null;
      if (!outcome) return null;
      const reason =
        attempt.reason === "timeout" ||
        attempt.reason === "provider_error" ||
        attempt.reason === "unavailable" ||
        attempt.reason === "empty" ||
        attempt.reason === "refusal" ||
        attempt.reason === "invalid_output"
          ? attempt.reason
          : undefined;
      if (outcome === "failed" && !reason) return null;
      const durationMs = typeof attempt.durationMs === "number" && Number.isFinite(attempt.durationMs)
        ? Math.max(0, Math.round(attempt.durationMs))
        : 0;
      return { ...ref, durationMs, outcome, ...(reason ? { reason } : {}) };
    })
    .filter((attempt): attempt is AutoFallbackAttemptTraceV1 => attempt !== null);
  if (attempts.length === 0 || attempts.at(-1)?.outcome !== "succeeded") return undefined;
  return {
    v: AUTO_FALLBACK_CHAIN_VERSION,
    attempts,
    finalProvider: value.finalProvider,
    finalModel,
    crossedOnline: value.crossedOnline === true,
  };
}
