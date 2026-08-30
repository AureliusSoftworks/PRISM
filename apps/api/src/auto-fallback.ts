import type {
  AutoFallbackAttemptTraceV1,
  AutoFallbackFailureReason,
  AutoFallbackModelRef,
  AutoRecoveryTraceV1,
  ProviderReasoningEffort,
  ReasoningEffort,
} from "@localai/shared";
import {
  AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT,
  AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT,
} from "@localai/shared";

export type AutoFallbackValidationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: Extract<AutoFallbackFailureReason, "empty" | "refusal" | "invalid_output">;
      /** Slug naming the contract clause that rejected the draft. */
      clause?: string;
    };

export interface AutoFallbackAttempt extends AutoFallbackModelRef {
  available?: boolean;
  run(signal: AbortSignal): Promise<string>;
}

export interface AutoFallbackRunResult<T> {
  value: T;
  provider: AutoFallbackModelRef["provider"];
  model: string;
  attempts: AutoFallbackAttemptTraceV1[];
  recovery?: AutoRecoveryTraceV1;
}

/** Auto may inspect the whole eligible lane, but one request stays bounded. */
export const AUTO_FALLBACK_TOTAL_TIMEOUT_MAX_MS = 600_000;

/** Keep exhaustion diagnostics useful without turning them into output logs. */
export const AUTO_FALLBACK_VALIDATION_CLAUSE_MAX_CHARS = 160;
export const AUTO_FALLBACK_EXHAUSTED_MESSAGE_MAX_CHARS = 1_024;

const AUTO_FALLBACK_EXHAUSTED_BASE_MESSAGE =
  "All Auto models failed. Retry when a model is available.";
const AUTO_FALLBACK_VALIDATION_DIAGNOSTICS_PREFIX = " Validation clauses: ";
const AUTO_FALLBACK_SAFE_MODEL_LABEL_RE =
  /^[a-z0-9][a-z0-9._:/+-]{0,79}$/iu;

/** Auto plans may supply a per-route effort; fixed fallbacks retain legacy None. */
export function autoFallbackReasoningEffort<
  T extends ProviderReasoningEffort | undefined,
>(
  attemptIndex: number,
  primaryEffort: T,
  routedEffort?: ProviderReasoningEffort,
): T | "none";
export function autoFallbackReasoningEffort<
  T extends ProviderReasoningEffort | undefined,
>(
  attemptIndex: number,
  primaryEffort: T,
  routedEffort?: ProviderReasoningEffort,
): T | "none" {
  return (routedEffort ?? (attemptIndex === 0 ? primaryEffort : "none")) as
    T | "none";
}

function safeAutoFallbackAttemptLabel(
  attempt: AutoFallbackAttemptTraceV1,
): string {
  const model = attempt.model.trim();
  return AUTO_FALLBACK_SAFE_MODEL_LABEL_RE.test(model)
    ? `${attempt.provider}/${model}`
    : attempt.provider;
}

function autoFallbackValidationDiagnostics(
  attempts: readonly AutoFallbackAttemptTraceV1[],
): string | undefined {
  const entries: string[] = [];
  const seenClauses = new Set<string>();
  for (const attempt of attempts) {
    if (attempt?.reason !== "invalid_output" || !attempt.clause?.trim()) {
      continue;
    }
    const clause = attempt.clause
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, AUTO_FALLBACK_VALIDATION_CLAUSE_MAX_CHARS);
    const key = clause.toLocaleLowerCase();
    if (!clause || seenClauses.has(key)) continue;
    seenClauses.add(key);
    entries.push(`[${safeAutoFallbackAttemptLabel(attempt)}] ${clause}`);
  }
  if (entries.length === 0) return undefined;

  const maxDiagnosticChars =
    AUTO_FALLBACK_EXHAUSTED_MESSAGE_MAX_CHARS -
    AUTO_FALLBACK_EXHAUSTED_BASE_MESSAGE.length -
    AUTO_FALLBACK_VALIDATION_DIAGNOSTICS_PREFIX.length;
  const rendered: string[] = [];
  let omittedCount = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const remainingCount = entries.length - index - 1;
    const candidate = [...rendered, entry].join(" | ");
    const remainingSuffix = remainingCount > 0
      ? ` | +${remainingCount} more`
      : "";
    if ((candidate + remainingSuffix).length > maxDiagnosticChars) {
      omittedCount = entries.length - index;
      break;
    }
    rendered.push(entry);
  }
  if (omittedCount > 0) rendered.push(`+${omittedCount} more`);
  return rendered.join(" | ").slice(0, maxDiagnosticChars);
}

export class AutoFallbackExhaustedError extends Error {
  public readonly attempts: AutoFallbackAttemptTraceV1[];

  public constructor(attempts: AutoFallbackAttemptTraceV1[]) {
    const diagnostics = autoFallbackValidationDiagnostics(attempts);
    super(
      AUTO_FALLBACK_EXHAUSTED_BASE_MESSAGE +
        (diagnostics
          ? AUTO_FALLBACK_VALIDATION_DIAGNOSTICS_PREFIX + diagnostics
          : ""),
    );
    this.name = "AutoFallbackExhaustedError";
    this.attempts = attempts;
  }
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function rethrowOuterCancellation(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw abortError("Auto model fallback cancelled.");
}

const AUTO_REFUSAL_PATTERNS = [
  /\bi can(?:no|['’])t\b/i,
  /\bi cannot\b/i,
  /\bi won[’']?t\b/i,
  /\bi(?:['’]m| am) unable\b/i,
  /\bi must (?:decline|refuse)\b/i,
  /\bi (?:have|need) to decline\b/i,
  /\brequest (?:was )?(?:blocked|denied|refused)\b/i,
  /\bnot permitted\b/i,
] as const;

export function autoFallbackTextFailureReason(
  raw: string
): "empty" | "refusal" | null {
  const normalized = raw.trim();
  if (!normalized) return "empty";
  return AUTO_REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized))
    ? "refusal"
    : null;
}

export function validateAutoFallbackText(
  raw: string
): AutoFallbackValidationResult<string> {
  const reason = autoFallbackTextFailureReason(raw);
  return reason ? { ok: false, reason } : { ok: true, value: raw.trim() };
}

export async function runAutoFallbackChain<T = string>(args: {
  attempts: readonly AutoFallbackAttempt[];
  perAttemptTimeoutMs:
    | number
    | ((attempt: AutoFallbackModelRef, index: number) => number);
  totalTimeoutMs: number;
  signal?: AbortSignal;
  validate?: (raw: string, attempt: AutoFallbackModelRef) => AutoFallbackValidationResult<T>;
  /** Errors such as stale-turn sentinels that must escape without advancing. */
  isTerminalError?: (error: unknown) => boolean;
  now?: () => number;
}): Promise<AutoFallbackRunResult<T>> {
  const minimumAttemptCount = 1 + AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT;
  if (
    args.attempts.length < minimumAttemptCount ||
    args.attempts.length > AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT
  ) {
    throw new Error(
      `Auto requires one primary model and between one and ${AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT - 1} recovery routes.`,
    );
  }
  const now = args.now ?? Date.now;
  const startedAt = now();
  const totalTimeoutMs = Math.min(
    AUTO_FALLBACK_TOTAL_TIMEOUT_MAX_MS,
    Math.max(1, Math.floor(args.totalTimeoutMs)),
  );
  const deadline = startedAt + totalTimeoutMs;
  const validate = args.validate ?? (validateAutoFallbackText as (raw: string) => AutoFallbackValidationResult<T>);
  const traces: AutoFallbackAttemptTraceV1[] = [];
  const finalAttemptIndex = args.attempts.length - 1;
  const finalAttempt = args.attempts[finalAttemptIndex];
  const reservesFinalLocalRecovery =
    args.attempts[0]?.provider !== "local" && finalAttempt?.provider === "local";
  const finalLocalRecoveryReserveMs = reservesFinalLocalRecovery
    ? Math.min(60_000, Math.max(1, Math.floor(totalTimeoutMs / 3)))
    : 0;

  for (const [attemptIndex, attempt] of args.attempts.entries()) {
    rethrowOuterCancellation(args.signal);
    const attemptStartedAt = now();
    const remainingMs = deadline - attemptStartedAt;
    if (remainingMs <= 0) break;
    const finalLocalRecoveryPending =
      reservesFinalLocalRecovery && attemptIndex < finalAttemptIndex;
    const availableAttemptMs = finalLocalRecoveryPending
      ? remainingMs - finalLocalRecoveryReserveMs
      : remainingMs;
    if (availableAttemptMs <= 0) continue;

    if (attempt.available === false) {
      traces.push({
        provider: attempt.provider,
        model: attempt.model,
        ...(attempt.reasoningEffort
          ? { reasoningEffort: attempt.reasoningEffort }
          : {}),
        durationMs: 0,
        outcome: "failed",
        reason: "unavailable",
      });
      continue;
    }

    const configuredAttemptTimeoutMs =
      typeof args.perAttemptTimeoutMs === "function"
        ? args.perAttemptTimeoutMs(attempt, attemptIndex)
        : args.perAttemptTimeoutMs;
    const perAttemptTimeoutMs = Math.max(
      1,
      Math.floor(
        Number.isFinite(configuredAttemptTimeoutMs)
          ? configuredAttemptTimeoutMs
          : remainingMs,
      ),
    );
    const controller = new AbortController();
    const attemptBudgetMs = Math.min(perAttemptTimeoutMs, availableAttemptMs);
    const exhaustsAvailableBudget = attemptBudgetMs >= availableAttemptMs;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(abortError("Auto model attempt timed out."));
    }, attemptBudgetMs);
    const signal = args.signal
      ? AbortSignal.any([args.signal, controller.signal])
      : controller.signal;
    let removeAbortListener = (): void => undefined;
    const abortPromise = new Promise<never>((_, reject) => {
      const rejectForAbort = () => {
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : abortError("Auto model attempt cancelled."),
        );
      };
      if (signal.aborted) {
        rejectForAbort();
        return;
      }
      signal.addEventListener("abort", rejectForAbort, { once: true });
      removeAbortListener = () =>
        signal.removeEventListener("abort", rejectForAbort);
    });

    try {
      // Providers should honor AbortSignal, but a third-party client that does
      // not must never turn a configured timeout into an infinite wait.
      const raw = await Promise.race([
        Promise.resolve().then(() => attempt.run(signal)),
        abortPromise,
      ]);
      rethrowOuterCancellation(args.signal);
      const validated = validate(raw, attempt);
      const durationMs = Math.max(0, Math.round(now() - attemptStartedAt));
      if (!validated.ok) {
        traces.push({
          provider: attempt.provider,
          model: attempt.model,
          ...(attempt.reasoningEffort
            ? { reasoningEffort: attempt.reasoningEffort }
            : {}),
          durationMs,
          outcome: "failed",
          reason: validated.reason,
          ...(validated.clause ? { clause: validated.clause } : {}),
        });
        continue;
      }
      const success: AutoFallbackAttemptTraceV1 = {
        provider: attempt.provider,
        model: attempt.model,
        ...(attempt.reasoningEffort
          ? { reasoningEffort: attempt.reasoningEffort }
          : {}),
        durationMs,
        outcome: "succeeded",
      };
      traces.push(success);
      const recovery = traces.length > 1
        ? {
            v: 1 as const,
            attempts: traces,
            finalProvider: attempt.provider,
            finalModel: attempt.model,
            crossedOnline:
              traces[0]?.provider === "local" && attempt.provider !== "local",
          }
        : undefined;
      return {
        value: validated.value,
        provider: attempt.provider,
        model: attempt.model,
        attempts: traces,
        ...(recovery ? { recovery } : {}),
      };
    } catch (error) {
      rethrowOuterCancellation(args.signal);
      if (args.isTerminalError?.(error)) throw error;
      traces.push({
        provider: attempt.provider,
        model: attempt.model,
        ...(attempt.reasoningEffort
          ? { reasoningEffort: attempt.reasoningEffort }
          : {}),
        durationMs: Math.max(0, Math.round(now() - attemptStartedAt)),
        outcome: "failed",
        reason: timedOut ? "timeout" : "provider_error",
      });
      if (timedOut && exhaustsAvailableBudget && !finalLocalRecoveryPending) break;
      if (now() >= deadline) break;
      void error;
    } finally {
      clearTimeout(timeout);
      removeAbortListener();
    }
  }

  rethrowOuterCancellation(args.signal);
  throw new AutoFallbackExhaustedError(traces);
}
