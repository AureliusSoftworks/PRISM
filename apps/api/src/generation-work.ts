import { AsyncLocalStorage } from "node:async_hooks";

export type PrismGenerationExecutionLane =
  | "deterministic"
  | "auxiliary"
  | "selected";

export type PrismGenerationWorkRole =
  | "prepare"
  | "connective"
  | "audit"
  | "author"
  | "repair";

export type PrismGenerationOutputClass =
  | "internal"
  | "connective"
  | "critical";

export type PrismGenerationPriority =
  | "interactive"
  | "compilation"
  | "background";

export type PrismGenerationPrivacyMode = "local" | "online" | "auto";

export interface PrismGenerationWorkContext {
  /** Authenticated account that owns every prompt and result in this work item. */
  ownerId?: string;
  workflow: string;
  operation: string;
  stage: string;
  executionLane: PrismGenerationExecutionLane;
  role: PrismGenerationWorkRole;
  outputClass: PrismGenerationOutputClass;
  priority: PrismGenerationPriority;
  privacyMode: PrismGenerationPrivacyMode;
  cacheKey?: string;
  timeoutMs?: number;
  sourceTokenEstimate?: number;
  exportedTokenEstimate?: number;
  fallbackReason?: string | null;
}

export interface PrismGenerationWorkReceipt {
  workflow: string;
  operation: string;
  stage: string;
  executionLane: PrismGenerationExecutionLane;
  role: PrismGenerationWorkRole;
  outputClass: PrismGenerationOutputClass;
  provider:
    | "deterministic"
    | "local"
    | "ollama_cloud"
    | "openai"
    | "anthropic";
  model: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  tokenCountSource: "estimated" | "unavailable";
  cacheHit: boolean;
  fallbackReason: string | null;
  validation: "accepted" | "bypassed";
}

const DEFAULT_TIMEOUT_MS: Record<PrismGenerationPriority, number> = {
  interactive: 120_000,
  compilation: 600_000,
  background: 600_000,
};

const PRIORITY_RANK: Record<PrismGenerationPriority, number> = {
  interactive: 0,
  compilation: 1,
  background: 2,
};

const workStorage = new AsyncLocalStorage<PrismGenerationWorkContext>();

function boundedLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : fallback;
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

export function normalizePrismGenerationWorkContext(
  value: Partial<PrismGenerationWorkContext> | null | undefined,
): PrismGenerationWorkContext {
  const priority =
    value?.priority === "interactive" ||
    value?.priority === "compilation" ||
    value?.priority === "background"
      ? value.priority
      : "background";
  return {
    ...(boundedLabel(value?.ownerId, "")
      ? { ownerId: boundedLabel(value?.ownerId, "") }
      : {}),
    workflow: boundedLabel(value?.workflow, "system"),
    operation: boundedLabel(value?.operation, "generation"),
    stage: boundedLabel(value?.stage, "generation"),
    executionLane:
      value?.executionLane === "deterministic" ||
      value?.executionLane === "selected"
        ? value.executionLane
        : "auxiliary",
    role:
      value?.role === "connective" ||
      value?.role === "audit" ||
      value?.role === "author" ||
      value?.role === "repair"
        ? value.role
        : "prepare",
    outputClass:
      value?.outputClass === "connective" || value?.outputClass === "critical"
        ? value.outputClass
        : "internal",
    priority,
    privacyMode:
      value?.privacyMode === "online" || value?.privacyMode === "auto"
        ? value.privacyMode
        : "local",
    ...(boundedLabel(value?.cacheKey, "")
      ? { cacheKey: boundedLabel(value?.cacheKey, "") }
      : {}),
    timeoutMs:
      nonNegativeInteger(value?.timeoutMs) ?? DEFAULT_TIMEOUT_MS[priority],
    ...(nonNegativeInteger(value?.sourceTokenEstimate) !== undefined
      ? { sourceTokenEstimate: nonNegativeInteger(value?.sourceTokenEstimate) }
      : {}),
    ...(nonNegativeInteger(value?.exportedTokenEstimate) !== undefined
      ? { exportedTokenEstimate: nonNegativeInteger(value?.exportedTokenEstimate) }
      : {}),
    fallbackReason: boundedLabel(value?.fallbackReason, "") || null,
  };
}

export function currentPrismGenerationWorkContext():
  | PrismGenerationWorkContext
  | undefined {
  return workStorage.getStore();
}

export function runWithPrismGenerationWorkContext<T>(
  context: PrismGenerationWorkContext,
  run: () => T | Promise<T>,
): T | Promise<T> {
  return workStorage.run(context, run);
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

interface QueuedAuxiliaryWork<T> {
  id: number;
  rank: number;
  context: PrismGenerationWorkContext;
  controller: AbortController;
  signal: AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  callerSettled: boolean;
  started: boolean;
}

interface AuxiliaryHostQueue {
  active: QueuedAuxiliaryWork<unknown> | null;
  pending: Array<QueuedAuxiliaryWork<unknown>>;
}

const auxiliaryQueues = new Map<string, AuxiliaryHostQueue>();
const auxiliaryInflightByCacheKey = new Map<string, Promise<unknown>>();
const pausedAuxiliaryHosts = new Set<string>();
let auxiliarySequence = 0;

function normalizedHost(host: string): string {
  return host.trim().replace(/\/+$/u, "") || "local";
}

function queueForHost(host: string): AuxiliaryHostQueue {
  const key = normalizedHost(host);
  const existing = auxiliaryQueues.get(key);
  if (existing) return existing;
  const created: AuxiliaryHostQueue = { active: null, pending: [] };
  auxiliaryQueues.set(key, created);
  return created;
}

function settleCaller<T>(
  item: QueuedAuxiliaryWork<T>,
  kind: "resolve" | "reject",
  value: T | unknown,
): void {
  if (item.callerSettled) return;
  item.callerSettled = true;
  clearTimeout(item.timer);
  if (kind === "resolve") item.resolve(value as T);
  else item.reject(value);
}

function abortQueuedWork<T>(
  item: QueuedAuxiliaryWork<T>,
  reason: unknown,
): void {
  if (!item.controller.signal.aborted) item.controller.abort(reason);
  settleCaller(item, "reject", reason);
}

function sortPending(queue: AuxiliaryHostQueue): void {
  queue.pending.sort((left, right) => left.rank - right.rank || left.id - right.id);
}

function pumpAuxiliaryQueue(host: string, queue: AuxiliaryHostQueue): void {
  if (queue.active) return;
  sortPending(queue);
  const paused = pausedAuxiliaryHosts.has(host);
  const nextIndex = paused
    ? queue.pending.findIndex(
        (entry) => entry.context.executionLane === "selected",
      )
    : 0;
  if (nextIndex < 0) return;
  const [next] = queue.pending.splice(nextIndex, 1);
  if (!next) return;
  if (next.signal.aborted || next.callerSettled) {
    pumpAuxiliaryQueue(host, queue);
    return;
  }
  next.started = true;
  queue.active = next;
  const actualRun = Promise.resolve().then(() => {
    if (next.signal.aborted) {
      throw next.signal.reason instanceof Error
        ? next.signal.reason
        : abortError("Auxiliary generation work cancelled.");
    }
    return next.run(next.signal);
  });
  actualRun.then(
    (value) => settleCaller(next, "resolve", value),
    (error) => settleCaller(next, "reject", error),
  );
  void actualRun.finally(() => {
    if (queue.active === next) queue.active = null;
    pumpAuxiliaryQueue(host, queue);
  }).catch(() => undefined);
}

/**
 * Serialize auxiliary decoding per resolved Ollama host. Higher-priority work
 * can cancel a lower-priority caller, but the host remains occupied until the
 * underlying provider actually settles; this prevents a non-cooperative
 * request from being overlapped by a second decode.
 */
export function schedulePrismAuxiliaryWork<T>(args: {
  host: string;
  context: PrismGenerationWorkContext;
  signal?: AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const host = normalizedHost(args.host);
  const context = normalizePrismGenerationWorkContext(args.context);
  // Ownerless work is never eligible for promise/result coalescing. The
  // auxiliary Ollama runtime is shared infrastructure, but account prompts and
  // result objects must remain isolated even when their content hashes match.
  const cacheKey =
    context.ownerId && context.cacheKey
      ? `${host}\u0000${context.ownerId}\u0000${context.cacheKey}`
      : null;
  if (cacheKey) {
    const existing = auxiliaryInflightByCacheKey.get(cacheKey);
    if (existing) return existing as Promise<T>;
  }
  const queue = queueForHost(host);
  const controller = new AbortController();
  const signal = args.signal
    ? AbortSignal.any([args.signal, controller.signal])
    : controller.signal;
  let item!: QueuedAuxiliaryWork<T>;
  const promise = new Promise<T>((resolve, reject) => {
    const timeoutMs = Math.max(1, context.timeoutMs ?? DEFAULT_TIMEOUT_MS[context.priority]);
    const timer = setTimeout(() => {
      abortQueuedWork(item, abortError("Auxiliary generation work timed out."));
    }, timeoutMs);
    item = {
      id: ++auxiliarySequence,
      rank: PRIORITY_RANK[context.priority],
      context,
      controller,
      signal,
      run: args.run,
      resolve,
      reject,
      timer,
      callerSettled: false,
      started: false,
    };
    if (args.signal?.aborted) {
      abortQueuedWork(
        item,
        args.signal.reason instanceof Error
          ? args.signal.reason
          : abortError("Auxiliary generation work cancelled."),
      );
      return;
    }
    args.signal?.addEventListener(
      "abort",
      () =>
        abortQueuedWork(
          item,
          args.signal?.reason instanceof Error
            ? args.signal.reason
            : abortError("Auxiliary generation work cancelled."),
        ),
      { once: true },
    );
    queue.pending.push(item as QueuedAuxiliaryWork<unknown>);
    const active = queue.active;
    if (
      active &&
      (item.rank < active.rank ||
        (item.context.executionLane === "selected" &&
          active.context.executionLane === "auxiliary"))
    ) {
      abortQueuedWork(
        active,
        abortError("Auxiliary generation yielded to higher-priority work."),
      );
    }
    pumpAuxiliaryQueue(host, queue);
  });
  if (cacheKey) {
    auxiliaryInflightByCacheKey.set(cacheKey, promise);
    void promise.finally(() => {
      if (auxiliaryInflightByCacheKey.get(cacheKey) === promise) {
        auxiliaryInflightByCacheKey.delete(cacheKey);
      }
    }).catch(() => undefined);
  }
  return promise;
}

/**
 * Pause new auxiliary decodes while a latency-critical selected local model
 * owns the same Ollama host. Existing work is asked to yield, but the queue
 * remains occupied until Ollama actually observes the request settling.
 */
export function setPrismAuxiliaryHostPaused(
  hostValue: string,
  paused: boolean,
): void {
  const host = normalizedHost(hostValue);
  const queue = queueForHost(host);
  if (paused) {
    pausedAuxiliaryHosts.add(host);
    if (queue.active) {
      abortQueuedWork(
        queue.active,
        abortError("Auxiliary generation paused for foreground local work."),
      );
    }
    return;
  }
  pausedAuxiliaryHosts.delete(host);
  pumpAuxiliaryQueue(host, queue);
}

export function prismGenerationSchedulerSnapshotForTests(): Array<{
  host: string;
  active: PrismGenerationPriority | null;
  queued: PrismGenerationPriority[];
}> {
  return Array.from(auxiliaryQueues.entries()).map(([host, queue]) => ({
    host,
    active: queue.active?.context.priority ?? null,
    queued: queue.pending.map((entry) => entry.context.priority),
  }));
}

export function resetPrismGenerationWorkForTests(): void {
  for (const queue of auxiliaryQueues.values()) {
    if (queue.active) {
      abortQueuedWork(queue.active, abortError("Generation work test reset."));
    }
    for (const pending of queue.pending) {
      abortQueuedWork(pending, abortError("Generation work test reset."));
    }
  }
  auxiliaryQueues.clear();
  auxiliaryInflightByCacheKey.clear();
  pausedAuxiliaryHosts.clear();
  auxiliarySequence = 0;
}
