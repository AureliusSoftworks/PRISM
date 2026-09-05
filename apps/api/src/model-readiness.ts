import type {
  ModelPreparationFailure,
  ModelPreparationResponse,
} from "@localai/shared";
import {
  LocalModelRequestError,
  isOllamaCloudModelReference,
  resolveLocalOllamaTarget,
  setLocalOllamaActivityObserver,
  setLocalOllamaResponseObserver,
  type DualOllamaWorkloadOptions,
  type ResolvedLocalOllamaTarget,
} from "./providers.ts";
import { setPrismAuxiliaryHostPaused } from "./generation-work.ts";

const MODEL_PREPARATION_KEEP_ALIVE = "10m";
const MODEL_PREPARATION_TIMEOUT_MS = 10 * 60_000;
const MODEL_READINESS_PROBE_TIMEOUT_MS = 4_000;
const MODEL_PREPARATION_RETRY_AFTER_MS = 1_000;
const AUXILIARY_MODEL_KEEP_ALIVE = -1;
const LIVE_MODEL_LANE_SWEEP_INTERVAL_MS = 30_000;

type StoredReadiness =
  | {
      state: "warming";
      target: ResolvedLocalOllamaTarget;
      startedAt: string;
      promise: Promise<void>;
    }
  | {
      state: "ready";
      target: ResolvedLocalOllamaTarget;
      digest: string;
      expiresAt: string | null;
    }
  | {
      state: "unavailable";
      target: ResolvedLocalOllamaTarget;
      startedAt: string | null;
      failure: ModelPreparationFailure;
    };

interface OllamaRunningModel {
  name?: unknown;
  model?: unknown;
  digest?: unknown;
  expires_at?: unknown;
}

interface LiveModelLaneLease {
  target: ResolvedLocalOllamaTarget;
  sweptAtMs: number;
}

const readinessByTarget = new Map<string, StoredReadiness>();
const inspectionByTarget = new Map<
  string,
  Promise<ModelPreparationResponse>
>();
const persistentWarmupByTarget = new Map<
  string,
  Promise<ModelPreparationResponse>
>();
const persistentWarmupControllerByTarget = new Map<string, AbortController>();
const liveModelLaneLeaseByOwner = new Map<string, LiveModelLaneLease>();
const liveModelLaneSweepByHost = new Map<string, Promise<void>>();
const activeLocalModelRequestCountByTarget = new Map<string, number>();
const pinnedAuxiliaryTargetByHost = new Map<
  string,
  ResolvedLocalOllamaTarget
>();
const yieldedAuxiliaryTargetByHost = new Map<
  string,
  ResolvedLocalOllamaTarget
>();

function notApplicableResponse(model: string): ModelPreparationResponse {
  return {
    ok: true,
    state: "not_applicable",
    model,
    startedAt: null,
    expiresAt: null,
    retryAfterMs: null,
    failure: null,
  };
}

function normalizedModelId(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.endsWith(":latest")
    ? normalized.slice(0, -":latest".length)
    : normalized;
}

function targetKey(target: ResolvedLocalOllamaTarget): string {
  return `${target.host}\u0000${normalizedModelId(target.model)}`;
}

function safeIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function runningModelName(row: OllamaRunningModel): string {
  return typeof row.model === "string" && row.model.trim()
    ? row.model.trim()
    : typeof row.name === "string"
      ? row.name.trim()
      : "";
}

async function runningModels(host: string): Promise<OllamaRunningModel[]> {
  const response = await fetch(`${host}/api/ps`, {
    signal: AbortSignal.timeout(MODEL_READINESS_PROBE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Ollama readiness probe failed.");
  const payload = (await response.json()) as { models?: OllamaRunningModel[] };
  return payload.models ?? [];
}

async function runningModel(
  target: ResolvedLocalOllamaTarget,
): Promise<{ digest: string; expiresAt: string | null } | null> {
  const desired = normalizedModelId(target.model);
  const row = (await runningModels(target.host)).find((candidate) => {
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const model = typeof candidate.model === "string" ? candidate.model : "";
    return normalizedModelId(name) === desired || normalizedModelId(model) === desired;
  });
  if (!row) return null;
  const expiresAt = safeIso(row.expires_at);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;
  return {
    digest: typeof row.digest === "string" ? row.digest : "",
    expiresAt,
  };
}

async function unloadLocalModel(
  host: string,
  model: string,
): Promise<void> {
  const response = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }),
    signal: AbortSignal.timeout(MODEL_READINESS_PROBE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Ollama model release failed.");
  readinessByTarget.delete(`${host}\u0000${normalizedModelId(model)}`);
}

/**
 * Give a latency-critical Coffee or Signal session one local-model residency
 * lane. Other live sessions and the pinned auxiliary model remain protected;
 * stale chat and prior-session runners on the same host are released.
 * Failure is deliberately best-effort so a remote/self-managed Ollama host can
 * still serve the turn even when it does not support residency inspection.
 */
export async function claimLiveLocalModelLane(args: {
  owner: string;
  model: string;
  options?: DualOllamaWorkloadOptions;
  /** Wait for non-live local work to clear before exposing a live scene. */
  quiesceOtherModels?: boolean;
  /** Temporarily yield auxiliary residency after a foreground load failure. */
  yieldAuxiliary?: boolean;
}): Promise<boolean> {
  const owner = args.owner.trim();
  if (!owner) return false;
  let target: ResolvedLocalOllamaTarget;
  try {
    target = await resolveLocalOllamaTarget(args.model, args.options);
  } catch {
    return false;
  }

  const nowMs = Date.now();
  const existing = liveModelLaneLeaseByOwner.get(owner);
  liveModelLaneLeaseByOwner.set(owner, {
    target,
    sweptAtMs: existing?.sweptAtMs ?? 0,
  });
  setPrismAuxiliaryHostPaused(target.host, true);
  // A keep-warm request may have started just before the browser published its
  // live-performance marker. Stop its decode before foreground work begins,
  // while retaining any residency Ollama already established.
  const interruptedWarmups: Promise<ModelPreparationResponse>[] = [];
  for (const [key, controller] of persistentWarmupControllerByTarget) {
    if (!key.startsWith(`${target.host}\u0000`)) continue;
    controller.abort();
    const warmup = persistentWarmupByTarget.get(key);
    if (warmup) interruptedWarmups.push(warmup);
  }
  if (interruptedWarmups.length > 0) {
    await Promise.allSettled(interruptedWarmups);
  }
  const pinnedAuxiliary = pinnedAuxiliaryTargetByHost.get(target.host);
  if (
    args.yieldAuxiliary &&
    pinnedAuxiliary &&
    normalizedModelId(pinnedAuxiliary.model) !== normalizedModelId(target.model)
  ) {
    yieldedAuxiliaryTargetByHost.set(target.host, pinnedAuxiliary);
    await unloadLocalModel(
      pinnedAuxiliary.host,
      pinnedAuxiliary.model,
    ).catch(() => undefined);
  }
  if (args.quiesceOtherModels) {
    const deadlineMs = Date.now() + 20_000;
    while (Date.now() < deadlineMs) {
      const protectedTargets = new Set(
        Array.from(liveModelLaneLeaseByOwner.values())
          .filter((lease) => lease.target.host === target.host)
          .map((lease) => targetKey(lease.target)),
      );
      const otherRequestActive = Array.from(
        activeLocalModelRequestCountByTarget.entries(),
      ).some(
        ([key, count]) =>
          count > 0 &&
          key.startsWith(`${target.host}\u0000`) &&
          !protectedTargets.has(key),
      );
      if (!otherRequestActive) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
  if (
    !args.quiesceOtherModels &&
    existing?.target.host === target.host &&
    normalizedModelId(existing.target.model) === normalizedModelId(target.model) &&
    nowMs - existing.sweptAtMs < LIVE_MODEL_LANE_SWEEP_INTERVAL_MS
  ) {
    return true;
  }

  const activeSweep = liveModelLaneSweepByHost.get(target.host);
  if (activeSweep) {
    await activeSweep;
    return true;
  }
  const sweep = (async () => {
    try {
      const rows = await runningModels(target.host);
      for (const row of rows) {
        const model = runningModelName(row);
        if (!model) continue;
        const normalized = normalizedModelId(model);
        const protectedByLiveSession = Array.from(
          liveModelLaneLeaseByOwner.values(),
        ).some(
          (lease) =>
            lease.target.host === target.host &&
            normalizedModelId(lease.target.model) === normalized,
        );
        const activeRequestCount =
          activeLocalModelRequestCountByTarget.get(
            `${target.host}\u0000${normalized}`,
          ) ?? 0;
        const protectedPinnedAuxiliary =
          !args.yieldAuxiliary &&
          pinnedAuxiliary?.host === target.host &&
          normalizedModelId(pinnedAuxiliary.model) === normalized;
        if (
          protectedByLiveSession ||
          protectedPinnedAuxiliary ||
          activeRequestCount > 0
        ) continue;
        await unloadLocalModel(target.host, model).catch(() => undefined);
      }
    } catch {
      // Residency is a QoL optimization, never an availability gate.
    }
  })();
  liveModelLaneSweepByHost.set(target.host, sweep);
  try {
    await sweep;
    const current = liveModelLaneLeaseByOwner.get(owner);
    if (current) current.sweptAtMs = Date.now();
    return true;
  } finally {
    if (liveModelLaneSweepByHost.get(target.host) === sweep) {
      liveModelLaneSweepByHost.delete(target.host);
    }
  }
}

/** Release only the exact model owned by a finished live session. */
export async function releaseLiveLocalModelLane(owner: string): Promise<void> {
  const lease = liveModelLaneLeaseByOwner.get(owner);
  if (!lease) return;
  liveModelLaneLeaseByOwner.delete(owner);
  const stillProtected = Array.from(liveModelLaneLeaseByOwner.values()).some(
    (candidate) =>
      candidate.target.host === lease.target.host &&
      normalizedModelId(candidate.target.model) ===
        normalizedModelId(lease.target.model),
  );
  const hostStillOwned = Array.from(liveModelLaneLeaseByOwner.values()).some(
    (candidate) => candidate.target.host === lease.target.host,
  );
  if (
    !stillProtected &&
    (activeLocalModelRequestCountByTarget.get(targetKey(lease.target)) ?? 0) ===
      0
  ) {
    await unloadLocalModel(lease.target.host, lease.target.model).catch(
      () => undefined,
    );
  }
  if (hostStillOwned) return;
  setPrismAuxiliaryHostPaused(lease.target.host, false);
  const yieldedAuxiliary = yieldedAuxiliaryTargetByHost.get(lease.target.host);
  if (yieldedAuxiliary) {
    yieldedAuxiliaryTargetByHost.delete(lease.target.host);
    void warmResolvedAuxiliaryTarget(yieldedAuxiliary).catch(() => undefined);
  }
}

function responseFor(entry: StoredReadiness): ModelPreparationResponse {
  if (entry.state === "warming") {
    return {
      ok: true,
      state: "warming",
      model: entry.target.model,
      startedAt: entry.startedAt,
      expiresAt: null,
      retryAfterMs: MODEL_PREPARATION_RETRY_AFTER_MS,
      failure: null,
    };
  }
  if (entry.state === "ready") {
    return {
      ok: true,
      state: "ready",
      model: entry.target.model,
      startedAt: null,
      expiresAt: entry.expiresAt,
      retryAfterMs: null,
      failure: null,
    };
  }
  return {
    ok: true,
    state: "unavailable",
    model: entry.target.model,
    startedAt: entry.startedAt,
    expiresAt: null,
    retryAfterMs: null,
    failure: entry.failure,
  };
}

async function finishPreparation(
  target: ResolvedLocalOllamaTarget,
  startedAt: string,
  timeoutMs = MODEL_PREPARATION_TIMEOUT_MS,
): Promise<void> {
  const key = targetKey(target);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let failure: ModelPreparationFailure = "request_failed";
  try {
    const response = await fetch(`${target.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: target.model,
        messages: [],
        stream: false,
        think: false,
        keep_alive: MODEL_PREPARATION_KEEP_ALIVE,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      failure = /model[^\n]{0,120}(not found|missing|does not exist)/iu.test(detail)
        ? "model_unavailable"
        : "request_failed";
      throw new Error("Ollama model preparation failed.");
    }
    const resident = await runningModel(target);
    if (!resident) throw new Error("Prepared model was not resident.");
    readinessByTarget.set(key, {
      state: "ready",
      target,
      digest: resident.digest,
      expiresAt: resident.expiresAt,
    });
  } catch (error) {
    if (controller.signal.aborted) failure = "timed_out";
    readinessByTarget.set(key, {
      state: "unavailable",
      target,
      startedAt,
      failure,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareLocalModel(args: {
  model: string;
  options?: DualOllamaWorkloadOptions;
  retry?: boolean;
  /** Test seam; production always uses the ten-minute cap. */
  timeoutMs?: number;
}): Promise<ModelPreparationResponse> {
  if (isOllamaCloudModelReference(args.model)) {
    return notApplicableResponse(args.model);
  }
  let target: ResolvedLocalOllamaTarget;
  try {
    target = await resolveLocalOllamaTarget(args.model, args.options);
  } catch (error) {
    const failure: ModelPreparationFailure =
      error instanceof LocalModelRequestError && error.kind === "model_unavailable"
        ? "model_unavailable"
        : "runtime_unavailable";
    return {
      ok: true,
      state: "unavailable",
      model: args.model,
      startedAt: null,
      expiresAt: null,
      retryAfterMs: null,
      failure,
    };
  }

  const key = targetKey(target);
  let existing = readinessByTarget.get(key);
  if (args.retry && existing?.state === "unavailable") {
    readinessByTarget.delete(key);
    existing = undefined;
  }
  if (existing?.state === "warming") {
    // The empty warmup request can sit behind a real Coffee/Signal generation
    // in Ollama's queue. That real request may load the model first, at which
    // point residency—not completion of the redundant empty request—is the
    // readiness contract. Re-probe on each browser poll so every applet can
    // leave its intermission as soon as the requested model is actually live.
    try {
      const resident = await runningModel(target);
      if (resident) {
        const ready: StoredReadiness = {
          state: "ready",
          target,
          digest: resident.digest,
          expiresAt: resident.expiresAt,
        };
        readinessByTarget.set(key, ready);
        return responseFor(ready);
      }
    } catch {
      // The original preparation still owns failure reporting and timeout.
      // A transient inspection failure must not replace it prematurely.
    }
    return responseFor(existing);
  }
  if (existing?.state === "unavailable") {
    // A failed empty warmup is not authoritative once Ollama reports the
    // requested model as resident. This can happen when the warmup request
    // times out behind a real Signal/Coffee generation that successfully
    // loads the same model. Reconcile the cached failure before showing a
    // blocking intermission so a healthy live runner always wins.
    try {
      const resident = await runningModel(target);
      if (resident) {
        const ready: StoredReadiness = {
          state: "ready",
          target,
          digest: resident.digest,
          expiresAt: resident.expiresAt,
        };
        readinessByTarget.set(key, ready);
        return responseFor(ready);
      }
    } catch {
      // Preserve the original bounded failure. Retry remains explicit when
      // residency itself cannot be inspected.
    }
    return responseFor(existing);
  }

  const activeInspection = inspectionByTarget.get(key);
  if (activeInspection) return activeInspection;

  const inspection = (async (): Promise<ModelPreparationResponse> => {
    try {
      const resident = await runningModel(target);
      if (resident) {
        const ready: StoredReadiness = {
          state: "ready",
          target,
          digest: resident.digest,
          expiresAt: resident.expiresAt,
        };
        readinessByTarget.set(key, ready);
        return responseFor(ready);
      }
    } catch {
      const unavailable: StoredReadiness = {
        state: "unavailable",
        target,
        startedAt: null,
        failure: "runtime_unavailable",
      };
      readinessByTarget.set(key, unavailable);
      return responseFor(unavailable);
    }

    const startedAt = new Date().toISOString();
    const promise = finishPreparation(target, startedAt, args.timeoutMs);
    const warming: StoredReadiness = {
      state: "warming",
      target,
      startedAt,
      promise,
    };
    readinessByTarget.set(key, warming);
    void promise;
    return responseFor(warming);
  })();
  inspectionByTarget.set(key, inspection);
  try {
    return await inspection;
  } finally {
    if (inspectionByTarget.get(key) === inspection) {
      inspectionByTarget.delete(key);
    }
  }
}

async function warmResolvedAuxiliaryTarget(
  target: ResolvedLocalOllamaTarget,
  timeoutMs = MODEL_PREPARATION_TIMEOUT_MS,
): Promise<ModelPreparationResponse> {
  const key = targetKey(target);
  const active = persistentWarmupByTarget.get(key);
  if (active) return active;

  const startedAt = new Date().toISOString();
  const warmup = (async (): Promise<ModelPreparationResponse> => {
    const controller = new AbortController();
    persistentWarmupControllerByTarget.set(key, controller);
    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );
    let failure: ModelPreparationFailure = "request_failed";
    try {
      const response = await fetch(`${target.host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: target.model,
          messages: [],
          stream: false,
          think: false,
          keep_alive: AUXILIARY_MODEL_KEEP_ALIVE,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        failure = /model[^\n]{0,120}(not found|missing|does not exist)/iu.test(
          detail,
        )
          ? "model_unavailable"
          : "request_failed";
        throw new Error("Ollama auxiliary model warmup failed.");
      }
      const resident = await runningModel(target);
      if (!resident) throw new Error("Warmed auxiliary model was not resident.");
      const ready: StoredReadiness = {
        state: "ready",
        target,
        digest: resident.digest,
        expiresAt: resident.expiresAt,
      };
      readinessByTarget.set(key, ready);
      return responseFor(ready);
    } catch {
      if (controller.signal.aborted) failure = "timed_out";
      const unavailable: StoredReadiness = {
        state: "unavailable",
        target,
        startedAt,
        failure,
      };
      readinessByTarget.set(key, unavailable);
      return responseFor(unavailable);
    } finally {
      clearTimeout(timer);
      if (persistentWarmupControllerByTarget.get(key) === controller) {
        persistentWarmupControllerByTarget.delete(key);
      }
    }
  })();
  persistentWarmupByTarget.set(key, warmup);
  try {
    return await warmup;
  } finally {
    if (persistentWarmupByTarget.get(key) === warmup) {
      persistentWarmupByTarget.delete(key);
    }
  }
}

/**
 * Preload the active auxiliary model and ask Ollama to keep it resident until
 * explicitly yielded for a foreground load or the runtime stops. Calls for
 * the same host/model are coalesced so browser heartbeats cannot overlap.
 */
export async function keepAuxiliaryLocalModelWarm(args: {
  model: string;
  options?: DualOllamaWorkloadOptions;
  /** Test seam; production uses the normal preparation cap. */
  timeoutMs?: number;
}): Promise<ModelPreparationResponse> {
  if (isOllamaCloudModelReference(args.model)) {
    return notApplicableResponse(args.model);
  }
  let target: ResolvedLocalOllamaTarget;
  try {
    target = await resolveLocalOllamaTarget(args.model, args.options);
  } catch (error) {
    const failure: ModelPreparationFailure =
      error instanceof LocalModelRequestError && error.kind === "model_unavailable"
        ? "model_unavailable"
        : "runtime_unavailable";
    return {
      ok: true,
      state: "unavailable",
      model: args.model,
      startedAt: null,
      expiresAt: null,
      retryAfterMs: null,
      failure,
    };
  }

  pinnedAuxiliaryTargetByHost.set(target.host, target);
  if (
    Array.from(liveModelLaneLeaseByOwner.values()).some(
      (lease) => lease.target.host === target.host,
    )
  ) {
    try {
      const resident = await runningModel(target);
      if (resident) {
        const ready: StoredReadiness = {
          state: "ready",
          target,
          digest: resident.digest,
          expiresAt: resident.expiresAt,
        };
        readinessByTarget.set(targetKey(target), ready);
        return responseFor(ready);
      }
    } catch {
      // A live lane must not be delayed by an auxiliary readiness probe.
    }
    return notApplicableResponse(target.model);
  }
  return warmResolvedAuxiliaryTarget(
    target,
    args.timeoutMs ?? MODEL_PREPARATION_TIMEOUT_MS,
  );
}

async function refreshReadinessAfterLocalResponse(
  target: ResolvedLocalOllamaTarget,
): Promise<void> {
  const key = targetKey(target);
  try {
    const resident = await runningModel(target);
    if (resident) {
      const ready: StoredReadiness = {
        state: "ready",
        target,
        digest: resident.digest,
        expiresAt: resident.expiresAt,
      };
      readinessByTarget.set(key, ready);
    }
  } catch {
    // A successful generation remains authoritative. A later preparation
    // poll will retry /api/ps and invalidate the entry if Ollama disappeared.
  }
}

setLocalOllamaResponseObserver((target) => {
  void refreshReadinessAfterLocalResponse(target);
});

setLocalOllamaActivityObserver((target, active) => {
  const key = targetKey(target);
  const next = Math.max(
    0,
    (activeLocalModelRequestCountByTarget.get(key) ?? 0) + (active ? 1 : -1),
  );
  if (next === 0) activeLocalModelRequestCountByTarget.delete(key);
  else activeLocalModelRequestCountByTarget.set(key, next);
});

export function resetModelReadinessForTests(): void {
  readinessByTarget.clear();
  inspectionByTarget.clear();
  persistentWarmupByTarget.clear();
  for (const controller of persistentWarmupControllerByTarget.values()) {
    controller.abort();
  }
  persistentWarmupControllerByTarget.clear();
  liveModelLaneLeaseByOwner.clear();
  liveModelLaneSweepByHost.clear();
  activeLocalModelRequestCountByTarget.clear();
  pinnedAuxiliaryTargetByHost.clear();
  yieldedAuxiliaryTargetByHost.clear();
}
