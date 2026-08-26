import {
  REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS,
  reasoningGenerationBudgetMs,
  type ProviderReasoningEffort,
} from "@localai/shared";
import {
  runAutoFallbackChain,
  validateAutoFallbackText,
} from "./auto-fallback.ts";
import {
  normalizePrismGenerationWorkContext,
  runWithPrismGenerationWorkContext,
  type PrismGenerationWorkContext,
  type PrismGenerationWorkReceipt,
} from "./generation-work.ts";
import type {
  LlmProvider,
  ProviderMessage,
  ProviderName,
} from "./providers.ts";

export interface PrismGenerationLane {
  provider: LlmProvider;
  providerName: ProviderName;
  model: string;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  available?: boolean;
}

export interface PrismStructuredGenerationResult<T> {
  value: T;
  receipt: PrismGenerationWorkReceipt;
  attempts: Array<{
    provider: ProviderName;
    model: string;
    outcome: "succeeded" | "failed";
    reason?: string;
    durationMs: number;
  }>;
}

export interface PrismStructuredGenerationRequest<T> {
  work: Partial<PrismGenerationWorkContext> &
    Pick<PrismGenerationWorkContext, "workflow" | "operation" | "stage">;
  lanes: readonly PrismGenerationLane[];
  modelSelectionKind: "auto" | "fixed";
  maxFixedAttempts?: number;
  totalTimeoutMs?: number;
  perAttemptTimeoutMs?: (
    lane: PrismGenerationLane,
    index: number,
  ) => number;
  signal?: AbortSignal;
  run: (args: {
    lane: PrismGenerationLane;
    attempt: number;
    priorError: string | null;
    signal: AbortSignal;
    work: PrismGenerationWorkContext;
  }) => Promise<string>;
  validate: (raw: string) => T;
}

export function estimatePrismTextTokens(value: string): number {
  return value.trim() ? Math.max(1, Math.ceil(value.length / 4)) : 0;
}

export function estimatePrismMessageTokens(
  messages: readonly ProviderMessage[],
): number {
  return messages.reduce(
    (total, message) => total + estimatePrismTextTokens(message.content) + 4,
    0,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 320)
    : "The generation result was not usable.";
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

async function runBoundedAttempt<T>(args: {
  timeoutMs: number;
  signal?: AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        abortError("Generation did not finish within its bounded attempt."),
      ),
    Math.max(1, Math.floor(args.timeoutMs)),
  );
  const signal = args.signal
    ? AbortSignal.any([args.signal, controller.signal])
    : controller.signal;
  let removeAbortListener = (): void => undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const rejectForAbort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : abortError("Generation work cancelled."),
      );
    if (signal.aborted) {
      rejectForAbort();
      return;
    }
    signal.addEventListener("abort", rejectForAbort, { once: true });
    removeAbortListener = () =>
      signal.removeEventListener("abort", rejectForAbort);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => args.run(signal)),
      abortPromise,
    ]);
  } finally {
    clearTimeout(timer);
    removeAbortListener();
  }
}

function eligibleLanes(
  work: PrismGenerationWorkContext,
  lanes: readonly PrismGenerationLane[],
): PrismGenerationLane[] {
  const unique = new Set<string>();
  return lanes.filter((lane) => {
    if (work.privacyMode === "local" && lane.providerName !== "local") {
      return false;
    }
    if (work.executionLane === "auxiliary" && lane.providerName !== "local") {
      return false;
    }
    const key = `${lane.providerName}:${lane.model.trim().toLowerCase()}`;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });
}

function workForAttempt(
  base: PrismGenerationWorkContext,
  attempt: number,
  priorError: string | null,
): PrismGenerationWorkContext {
  return normalizePrismGenerationWorkContext({
    ...base,
    fallbackReason:
      attempt > 1
        ? priorError || `recovery_attempt_${attempt}`
        : base.fallbackReason,
  });
}

function receipt(args: {
  work: PrismGenerationWorkContext;
  provider: PrismGenerationWorkReceipt["provider"];
  model: string;
  durationMs: number;
  outputTokens: number | null;
  fallbackReason: string | null;
}): PrismGenerationWorkReceipt {
  return {
    workflow: args.work.workflow,
    operation: args.work.operation,
    stage: args.work.stage,
    executionLane: args.work.executionLane,
    role: args.work.role,
    outputClass: args.work.outputClass,
    provider: args.provider,
    model: args.model,
    durationMs: Math.max(0, Math.round(args.durationMs)),
    inputTokens: args.work.exportedTokenEstimate ?? null,
    outputTokens: args.outputTokens,
    tokenCountSource:
      args.work.exportedTokenEstimate !== undefined || args.outputTokens !== null
        ? "estimated"
        : "unavailable",
    cacheHit: false,
    fallbackReason: args.fallbackReason,
    validation: "accepted",
  };
}

/** Execute deterministic work through the same receipt contract as model work. */
export async function runPrismDeterministicWork<T>(args: {
  work: PrismStructuredGenerationRequest<T>["work"];
  run: () => T | Promise<T>;
}): Promise<PrismStructuredGenerationResult<T>> {
  const work = normalizePrismGenerationWorkContext({
    ...args.work,
    executionLane: "deterministic",
    privacyMode: "local",
  });
  const startedAt = Date.now();
  const value = await runWithPrismGenerationWorkContext(work, args.run);
  return {
    value,
    receipt: receipt({
      work,
      provider: "deterministic",
      model: "prism",
      durationMs: Date.now() - startedAt,
      outputTokens: null,
      fallbackReason: null,
    }),
    attempts: [],
  };
}

/**
 * Shared structured-generation boundary for selected and auxiliary work.
 * Auto advances through the frozen lane order; fixed selection retries only
 * its selected lane with caller-authored repair context.
 */
export async function runPrismStructuredGeneration<T>(
  request: PrismStructuredGenerationRequest<T>,
): Promise<PrismStructuredGenerationResult<T>> {
  const work = normalizePrismGenerationWorkContext(request.work);
  if (work.executionLane === "auxiliary" && work.outputClass === "critical") {
    throw new Error("Auxiliary generation cannot finalize critical output.");
  }
  const lanes = eligibleLanes(work, request.lanes);
  if (!lanes.length) {
    throw new Error(
      work.privacyMode === "local"
        ? "No local model is available for this generation work."
        : "No generation model is available for this work.",
    );
  }
  const startedAt = Date.now();
  let acceptedOutputTokens: number | null = null;
  let priorError: string | null = null;

  if (request.modelSelectionKind === "auto" && lanes.length > 1) {
    const result = await runAutoFallbackChain<T>({
      attempts: lanes.map((lane, index) => ({
        provider: lane.providerName,
        model: lane.model,
        available: lane.available,
        run: async (signal) => {
          const attemptWork = workForAttempt(work, index + 1, priorError);
          return await Promise.resolve(
            runWithPrismGenerationWorkContext(attemptWork, () =>
              request.run({
                lane,
                attempt: index + 1,
                priorError,
                signal,
                work: attemptWork,
              }),
            ),
          );
        },
      })),
      perAttemptTimeoutMs: (attempt, index) => {
        const lane = lanes[index]!;
        return request.perAttemptTimeoutMs?.(lane, index) ??
          reasoningGenerationBudgetMs(lane.reasoningEffort, {
            provider: attempt.provider,
            modelId: attempt.model,
          });
      },
      totalTimeoutMs:
        request.totalTimeoutMs ?? REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS,
      signal: request.signal,
      validate: (raw) => {
        const textFailure = validateAutoFallbackText(raw);
        if (!textFailure.ok) {
          priorError = textFailure.reason;
          return textFailure;
        }
        try {
          const value = request.validate(raw);
          acceptedOutputTokens = estimatePrismTextTokens(raw);
          return { ok: true as const, value };
        } catch (error) {
          priorError = errorMessage(error);
          return {
            ok: false as const,
            reason: "invalid_output" as const,
            clause: priorError.slice(0, 80),
          };
        }
      },
    });
    const firstFailure = result.attempts.find(
      (attempt) => attempt.outcome === "failed",
    );
    return {
      value: result.value,
      receipt: receipt({
        work,
        provider: result.provider,
        model: result.model,
        durationMs: Date.now() - startedAt,
        outputTokens: acceptedOutputTokens,
        fallbackReason: firstFailure?.reason ?? null,
      }),
      attempts: result.attempts.map((attempt) => ({
        provider: attempt.provider,
        model: attempt.model,
        outcome: attempt.outcome,
        ...(attempt.reason ? { reason: attempt.reason } : {}),
        durationMs: attempt.durationMs,
      })),
    };
  }

  const lane = lanes[0]!;
  const maxAttempts = Math.max(1, Math.min(3, request.maxFixedAttempts ?? 3));
  const attempts: PrismStructuredGenerationResult<T>["attempts"] = [];
  let lastError: unknown = new Error("Generation work did not complete.");
  for (let index = 0; index < maxAttempts; index += 1) {
    const attempt = index + 1;
    const attemptWork = workForAttempt(work, attempt, priorError);
    const attemptStartedAt = Date.now();
    try {
      const raw = await runBoundedAttempt({
        timeoutMs:
          request.perAttemptTimeoutMs?.(lane, index) ??
          reasoningGenerationBudgetMs(lane.reasoningEffort, {
            provider: lane.providerName,
            modelId: lane.model,
          }),
        signal: request.signal,
        run: async (signal) =>
          await Promise.resolve(
            runWithPrismGenerationWorkContext(attemptWork, () =>
              request.run({
                lane,
                attempt,
                priorError,
                signal,
                work: attemptWork,
              }),
            ),
          ),
      });
      const textFailure = validateAutoFallbackText(raw);
      if (!textFailure.ok) throw new Error(textFailure.reason);
      const value = request.validate(raw);
      acceptedOutputTokens = estimatePrismTextTokens(raw);
      attempts.push({
        provider: lane.providerName,
        model: lane.model,
        outcome: "succeeded",
        durationMs: Date.now() - attemptStartedAt,
      });
      return {
        value,
        receipt: receipt({
          work,
          provider: lane.providerName,
          model: lane.model,
          durationMs: Date.now() - startedAt,
          outputTokens: acceptedOutputTokens,
          fallbackReason: attempts.length > 1 ? priorError : null,
        }),
        attempts,
      };
    } catch (error) {
      lastError = error;
      priorError = errorMessage(error);
      attempts.push({
        provider: lane.providerName,
        model: lane.model,
        outcome: "failed",
        reason: priorError,
        durationMs: Date.now() - attemptStartedAt,
      });
    }
  }
  throw lastError;
}

/**
 * Stable server-side broker surface used beneath applet orchestration. The
 * function exports remain as narrow test seams and backwards-compatible
 * helpers; product code should share this singleton.
 */
export class PrismGenerationBroker {
  public runStructured<T>(
    request: PrismStructuredGenerationRequest<T>,
  ): Promise<PrismStructuredGenerationResult<T>> {
    return runPrismStructuredGeneration(request);
  }

  public runDeterministic<T>(args: {
    work: PrismStructuredGenerationRequest<T>["work"];
    run: () => T | Promise<T>;
  }): Promise<PrismStructuredGenerationResult<T>> {
    return runPrismDeterministicWork(args);
  }
}

export const prismGenerationBroker = new PrismGenerationBroker();
