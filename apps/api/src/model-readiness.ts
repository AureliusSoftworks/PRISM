import type {
  ModelPreparationFailure,
  ModelPreparationResponse,
} from "@localai/shared";
import {
  LocalModelRequestError,
  resolveLocalOllamaTarget,
  setLocalOllamaResponseObserver,
  type DualOllamaWorkloadOptions,
  type ResolvedLocalOllamaTarget,
} from "./providers.ts";

const MODEL_PREPARATION_KEEP_ALIVE = "10m";
const MODEL_PREPARATION_TIMEOUT_MS = 10 * 60_000;
const MODEL_READINESS_PROBE_TIMEOUT_MS = 4_000;
const MODEL_PREPARATION_RETRY_AFTER_MS = 1_000;

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

const readinessByTarget = new Map<string, StoredReadiness>();
const inspectionByTarget = new Map<
  string,
  Promise<ModelPreparationResponse>
>();

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

async function runningModel(
  target: ResolvedLocalOllamaTarget,
): Promise<{ digest: string; expiresAt: string | null } | null> {
  const response = await fetch(`${target.host}/api/ps`, {
    signal: AbortSignal.timeout(MODEL_READINESS_PROBE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Ollama readiness probe failed.");
  const payload = (await response.json()) as { models?: OllamaRunningModel[] };
  const desired = normalizedModelId(target.model);
  const row = (payload.models ?? []).find((candidate) => {
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
  if (existing?.state === "warming" || existing?.state === "unavailable") {
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

export function resetModelReadinessForTests(): void {
  readinessByTarget.clear();
  inspectionByTarget.clear();
}
