import type { ModelReasoningEffortPreference } from "./reasoningEffort.ts";

export const AUTO_FALLBACK_CHAIN_VERSION = 1 as const;
export const FALLBACK_CHAINS_VERSION = 2 as const;
export const AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT = 1 as const;
export const AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT = 5 as const;
/**
 * Runtime Auto plans may include the complete visible model catalog in addition
 * to the five user-authored priorities stored per lane. Keep a defensive bound
 * without treating the Settings priority list as the exhaustive route list.
 */
export const AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT = 64 as const;
export const AUTO_FALLBACK_CHAIN_MAX_TOTAL_FALLBACK_COUNT = 10 as const;
/** @deprecated Use AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT. */
export const AUTO_FALLBACK_CHAIN_FALLBACK_COUNT =
  AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT;
export const AUTO_FALLBACK_MODEL_ID_MAX_LENGTH = 240;

export type AutoFallbackProvider =
  | "local"
  | "ollama_cloud"
  | "openai"
  | "anthropic";
export type ResponseMode = "local" | "auto" | "online";
export type ResponseLane = "local" | "online";

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
  /** Runtime-only per-attempt Auto effort. Settings serialization strips it. */
  reasoningEffort?: ModelReasoningEffortPreference;
}

export interface AutoFallbackChainV1 {
  v: typeof AUTO_FALLBACK_CHAIN_VERSION;
  /** User-authored ordering hints. Persisted Settings keep at most five per lane. */
  fallbacks: AutoFallbackModelRef[];
  /**
   * Runtime-only eligible routes appended after the authored priorities.
   * Serialization deliberately strips this field.
   */
  eligibleCandidates?: AutoFallbackModelRef[];
  /**
   * Legacy runtime-only last-resort recovery. Global Auto no longer crosses
   * privacy lanes; normalization remains for older saved traces and packages.
   */
  finalLocalRecovery?: AutoFallbackModelRef;
}

export interface FallbackChainsV2 {
  v: typeof FALLBACK_CHAINS_VERSION;
  local: AutoFallbackModelRef[];
  online: AutoFallbackModelRef[];
}

export interface AutoFallbackAttemptTraceV1 extends AutoFallbackModelRef {
  durationMs: number;
  outcome: "failed" | "succeeded";
  reason?: AutoFallbackFailureReason;
  /**
   * Which validation clause rejected the draft. `reason: "invalid_output"`
   * alone cannot be acted on when a whole episode retries; the clause slug
   * names the contract that failed so a session review can go straight to it.
   */
  clause?: string;
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
  return (
    value === "local" ||
    value === "ollama_cloud" ||
    value === "openai" ||
    value === "anthropic"
  );
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
  const reasoningEffort =
    typeof value.reasoningEffort === "string" &&
    ["none", "minimal", "low", "medium", "high", "xhigh"].includes(
      value.reasoningEffort,
    )
      ? (value.reasoningEffort as ModelReasoningEffortPreference)
      : undefined;
  return {
    provider: value.provider,
    model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

export function normalizeAutoFallbackChain(
  value: unknown
): AutoFallbackChainV1 | null {
  if (!isRecord(value) || value.v !== AUTO_FALLBACK_CHAIN_VERSION) return null;
  if (
    !Array.isArray(value.fallbacks) ||
    value.fallbacks.length < AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT ||
    value.fallbacks.length > AUTO_FALLBACK_CHAIN_MAX_TOTAL_FALLBACK_COUNT
  ) {
    return null;
  }
  const fallbacks = value.fallbacks.map(normalizeAutoFallbackModelRef);
  if (fallbacks.some((fallback) => fallback === null)) return null;
  const normalized = fallbacks as AutoFallbackModelRef[];
  const localCount = normalized.filter((entry) => entry.provider === "local").length;
  const onlineCount = normalized.length - localCount;
  if (
    localCount > AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT ||
    onlineCount > AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT
  ) {
    return null;
  }
  if (new Set(normalized.map(autoFallbackModelKey)).size !== normalized.length) {
    return null;
  }
  return { v: AUTO_FALLBACK_CHAIN_VERSION, fallbacks: normalized };
}

export function normalizeFallbackChainsV2(
  value: unknown,
): FallbackChainsV2 | null {
  const legacy = normalizeAutoFallbackChain(value);
  const record = isRecord(value) ? value : null;
  const rawLocal = legacy
    ? legacy.fallbacks.filter((entry) => entry.provider === "local")
    : record?.v === FALLBACK_CHAINS_VERSION && Array.isArray(record.local)
      ? record.local.map(normalizeAutoFallbackModelRef)
      : null;
  const rawOnline = legacy
    ? legacy.fallbacks.filter((entry) => entry.provider !== "local")
    : record?.v === FALLBACK_CHAINS_VERSION && Array.isArray(record.online)
      ? record.online.map(normalizeAutoFallbackModelRef)
      : null;
  if (!rawLocal || !rawOnline) return null;
  if (rawLocal.some((entry) => entry === null) || rawOnline.some((entry) => entry === null)) {
    return null;
  }
  const local = (rawLocal as AutoFallbackModelRef[]).filter(
    (entry) => entry.provider === "local",
  );
  // Cloud is a background-helper provider. Older saved global foreground
  // chains may still contain it, so migrate those entries away while parsing
  // instead of letting them re-enter an ONLINE recovery route.
  const online = (rawOnline as AutoFallbackModelRef[]).filter(
    (entry) => entry.provider !== "local" && entry.provider !== "ollama_cloud",
  );
  if (
    local.length > AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT ||
    online.length > AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT
  ) {
    return null;
  }
  if (
    new Set(local.map(autoFallbackModelKey)).size !== local.length ||
    new Set(online.map(autoFallbackModelKey)).size !== online.length
  ) {
    return null;
  }
  if (local.length === 0 && online.length === 0) return null;
  return { v: FALLBACK_CHAINS_VERSION, local, online };
}

export function fallbackChainForLane(
  value: AutoFallbackChainV1 | FallbackChainsV2 | null | undefined,
  lane: ResponseLane,
): AutoFallbackChainV1 | null {
  const chains = normalizeFallbackChainsV2(value);
  const fallbacks = chains?.[lane] ?? [];
  return fallbacks.length > 0
    ? { v: AUTO_FALLBACK_CHAIN_VERSION, fallbacks }
    : null;
}

export function parseStoredAutoFallbackChain(
  raw: string | null | undefined
): AutoFallbackChainV1 | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const chains = normalizeFallbackChainsV2(parsed);
    if (!chains) return null;
    return {
      v: AUTO_FALLBACK_CHAIN_VERSION,
      fallbacks: [...chains.local, ...chains.online],
    };
  } catch {
    return null;
  }
}

export function serializeAutoFallbackChain(
  value: AutoFallbackChainV1 | null | undefined
): string | null {
  const normalized = normalizeFallbackChainsV2(value);
  return normalized
    ? JSON.stringify({
        ...normalized,
        local: normalized.local.map(({ provider, model }) => ({
          provider,
          model,
        })),
        online: normalized.online.map(({ provider, model }) => ({
          provider,
          model,
        })),
      })
    : null;
}

export function autoFallbackResolvedChain(
  primary: AutoFallbackModelRef,
  chain: AutoFallbackChainV1 | null | undefined
): AutoFallbackModelRef[] | null {
  const normalizedPrimary = normalizeAutoFallbackModelRef(primary);
  const lane = normalizedPrimary?.provider === "local" ? "local" : "online";
  if (!normalizedPrimary || !chain) return null;

  const authoredPriorities = fallbackChainForLane(chain, lane)?.fallbacks ?? [];
  const eligibleCandidates = Array.isArray(chain.eligibleCandidates)
    ? chain.eligibleCandidates
        .map(normalizeAutoFallbackModelRef)
        .filter((entry): entry is AutoFallbackModelRef => entry !== null)
        .filter(
          (entry) => (entry.provider === "local" ? "local" : "online") === lane,
        )
    : [];
  const finalLocalRecovery =
    lane === "online"
      ? normalizeAutoFallbackModelRef(chain.finalLocalRecovery)
      : null;
  const ordered = [
    normalizedPrimary,
    ...authoredPriorities,
    ...eligibleCandidates,
  ].filter(
    (entry) => lane !== "online" || entry.provider !== "ollama_cloud",
  );
  const seen = new Set<string>();
  const reservesFinalLocalSlot = finalLocalRecovery?.provider === "local";
  const resolved = ordered
    .filter((entry) => {
      const key = autoFallbackModelKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(
      0,
      AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT -
        (reservesFinalLocalSlot ? 1 : 0),
    );
  if (finalLocalRecovery?.provider === "local") {
    resolved.push(finalLocalRecovery);
  }
  return resolved.length > 1 ? resolved : null;
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
      const clause =
        typeof attempt.clause === "string" &&
        /^[a-z][a-z0-9_]{0,31}$/u.test(attempt.clause)
          ? attempt.clause
          : undefined;
      return {
        ...ref,
        durationMs,
        outcome,
        ...(reason ? { reason } : {}),
        ...(clause ? { clause } : {}),
      };
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
