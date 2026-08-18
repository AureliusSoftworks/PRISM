import { fork, type ChildProcess } from "node:child_process";
import type { BotAudioVoiceProfileV1 } from "@localai/shared";

export interface BuiltinTtsChildRequest {
  type: "generate";
  id: string;
  text: string;
  profile: BotAudioVoiceProfileV1;
  protectedPhrases?: string[];
  deliveryMood?: string;
}

export type BuiltinTtsChildResponse =
  | {
      type: "ready";
    }
  | {
      type: "result";
      id: string;
      waveBase64: string;
    }
  | {
      type: "error";
      id: string;
      name: string;
      message: string;
    };

type GenerateArgs = {
  text: string;
  profile: BotAudioVoiceProfileV1;
  protectedPhrases?: readonly string[];
  deliveryMood?: string;
  signal?: AbortSignal;
};

type PendingJob = {
  request: BuiltinTtsChildRequest;
  signal?: AbortSignal;
  resolve: (wave: Buffer) => void;
  reject: (error: Error) => void;
  onAbort: () => void;
  timeout: NodeJS.Timeout | null;
  settled: boolean;
};

type WorkerClientOptions = {
  workerUrl?: URL;
  timeoutMs?: number;
  readyTimeoutMs?: number;
  maxQueueLength?: number;
  recycleGraceMs?: number;
  abandonedDrainTimeoutMs?: number;
  spawnWorker?: (workerUrl: URL) => ChildProcess;
};

const DEFAULT_WORKER_TIMEOUT_MS = 60_000;
const DEFAULT_WORKER_READY_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_QUEUE_LENGTH = 12;
const DEFAULT_WORKER_RECYCLE_GRACE_MS = 2_000;
const DEFAULT_ABANDONED_DRAIN_TIMEOUT_MS = 3_000;
const WORKER_EXIT_OBSERVATION_TIMEOUT_MS = 2_000;

export class BuiltinTtsWorkerBusyError extends Error {
  readonly code = "builtin-tts-worker-busy";

  constructor() {
    super("The local voice worker is still finishing an interrupted line.");
    this.name = "BuiltinTtsWorkerBusyError";
  }
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function defaultWorkerUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  return new URL(`./builtin-tts-child.${extension}`, import.meta.url);
}

function spawnDefaultWorker(workerUrl: URL): ChildProcess {
  const sourceWorker = workerUrl.pathname.endsWith(".ts");
  const worker = fork(workerUrl, [], {
    execArgv: sourceWorker ? ["--experimental-strip-types"] : [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  // The API server owns process lifetime. Do not let an idle model worker keep
  // tests or a completed graceful shutdown alive on its own.
  worker.unref();
  worker.channel?.unref();
  return worker;
}

function isChildResponse(value: unknown): value is BuiltinTtsChildResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BuiltinTtsChildResponse>;
  if (candidate.type === "ready") return true;
  return (
    "id" in candidate &&
    typeof candidate.id === "string" &&
    (candidate.type === "result" || candidate.type === "error")
  );
}

/**
 * Owns one persistent Kokoro child and sends it one job at a time. The API
 * event loop stays responsive even when native inference is CPU-bound; a
 * child crash, timeout, or cancellation is contained and lazily respawned.
 */
export class BuiltinTtsWorkerClient {
  private readonly workerUrl: URL;
  private readonly timeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly maxQueueLength: number;
  private readonly recycleGraceMs: number;
  private readonly abandonedDrainTimeoutMs: number;
  private readonly spawnWorker: (workerUrl: URL) => ChildProcess;
  private worker: ChildProcess | null = null;
  private workerReady = false;
  private workerReadyTimer: NodeJS.Timeout | null = null;
  private active: PendingJob | null = null;
  private queue: PendingJob[] = [];
  private requestSequence = 0;
  private waitingForWorkerExit = false;
  private recycleTimer: NodeJS.Timeout | null = null;
  private recycleExitTimer: NodeJS.Timeout | null = null;
  private recycleExitStalled = false;
  private abandonedDrainTimer: NodeJS.Timeout | null = null;
  private abandonedDrainExpired = false;

  constructor(options: WorkerClientOptions = {}) {
    this.workerUrl = options.workerUrl ?? defaultWorkerUrl();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
    this.readyTimeoutMs =
      options.readyTimeoutMs ?? DEFAULT_WORKER_READY_TIMEOUT_MS;
    this.maxQueueLength = options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH;
    this.recycleGraceMs =
      options.recycleGraceMs ?? DEFAULT_WORKER_RECYCLE_GRACE_MS;
    this.abandonedDrainTimeoutMs =
      options.abandonedDrainTimeoutMs ??
      DEFAULT_ABANDONED_DRAIN_TIMEOUT_MS;
    this.spawnWorker = options.spawnWorker ?? spawnDefaultWorker;
  }

  generate(args: GenerateArgs): Promise<Buffer> {
    if (args.signal?.aborted) return Promise.reject(abortError());
    if (this.recycleExitStalled) {
      return Promise.reject(
        new Error("The local voice worker could not finish recycling."),
      );
    }
    if (this.active?.settled && this.abandonedDrainExpired) {
      return Promise.reject(new BuiltinTtsWorkerBusyError());
    }
    if (this.queue.length + (this.active ? 1 : 0) >= this.maxQueueLength) {
      return Promise.reject(
        new Error("The local voice queue is full. Please try again shortly."),
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const request: BuiltinTtsChildRequest = {
        type: "generate",
        id: `voice-${process.pid}-${++this.requestSequence}`,
        text: args.text,
        profile: args.profile,
        ...(args.protectedPhrases?.length
          ? { protectedPhrases: [...args.protectedPhrases] }
          : {}),
        ...(args.deliveryMood ? { deliveryMood: args.deliveryMood } : {}),
      };
      const job: PendingJob = {
        request,
        signal: args.signal,
        resolve,
        reject,
        timeout: null,
        settled: false,
        onAbort: () => this.abortJob(job),
      };
      args.signal?.addEventListener("abort", job.onAbort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  dispose(): void {
    const error = new Error("The local voice worker stopped.");
    const workerHadActiveInference = this.active !== null;
    const workerWasRecycling = this.waitingForWorkerExit;
    if (this.active) this.finishJob(this.active, { error });
    for (const job of this.queue.splice(0)) this.finishJob(job, { error });
    const worker = this.worker;
    this.worker = null;
    this.workerReady = false;
    this.waitingForWorkerExit = false;
    this.clearWorkerReadyTimer();
    this.clearRecycleTimer();
    this.clearRecycleExitTimer();
    this.recycleExitStalled = false;
    this.clearAbandonedDrainState();
    if (!worker || worker.exitCode !== null) return;
    if (workerWasRecycling) {
      // A timed-out worker has already received SIGTERM. Keep owning it until
      // the existing grace period expires so dispose cannot strand a native
      // process that ignores graceful termination.
      this.ownDisposedWorkerUntilExit(worker, this.recycleGraceMs);
      return;
    }
    if (workerHadActiveInference) {
      // Closing IPC makes the child stop accepting work while allowing the
      // one native inference it already owns to drain. Signalling ONNX in the
      // middle of inference can crash during libc++ teardown on macOS.
      if (worker.connected) {
        try {
          worker.disconnect();
        } catch {
          // A simultaneous child exit already completed shutdown.
        }
      }
      // Disposal is a shutdown boundary: allow the active native call its
      // normal hard-timeout window, then use a last-resort SIGKILL only if it
      // never drains. This is bounded without signalling healthy ONNX work.
      this.ownDisposedWorkerUntilExit(worker, this.timeoutMs);
      return;
    }
    worker.kill("SIGTERM");
  }

  private pump(): void {
    if (this.active || this.waitingForWorkerExit) return;
    let job = this.queue[0] ?? null;
    while (job?.signal?.aborted) {
      this.queue.shift();
      this.finishJob(job, { error: abortError() });
      job = this.queue[0] ?? null;
    }
    if (!job) return;

    let worker: ChildProcess;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      this.queue.shift();
      this.finishJob(job, {
        error:
          error instanceof Error
            ? error
            : new Error("The local voice worker could not start."),
      });
      queueMicrotask(() => this.pump());
      return;
    }

    // The source worker imports a large Emscripten graph. Sending immediately
    // after spawn can deliver the first IPC event before the child installs
    // its listener, silently losing the request. Wait for an explicit child
    // handshake before assigning or timing the synthesis job.
    if (!this.workerReady) return;

    this.queue.shift();
    this.active = job;
    job.timeout = setTimeout(() => {
      if (this.active !== job) return;
      this.finishJob(job, {
        error: new Error("Local voice synthesis timed out."),
      });
      this.recycleWorker(worker);
    }, this.timeoutMs);

    worker.send(job.request, (error) => {
      if (!error || this.active !== job) return;
      this.finishJob(job, { error });
      this.recycleWorker(worker);
    });
  }

  private ensureWorker(): ChildProcess {
    if (this.worker?.connected && this.worker.exitCode === null) {
      return this.worker;
    }
    const worker = this.spawnWorker(this.workerUrl);
    this.worker = worker;
    this.workerReady = false;
    worker.on("message", (message: unknown) =>
      this.handleWorkerMessage(worker, message),
    );
    worker.once("error", (error) =>
      this.handleWorkerFailure(worker, error, false),
    );
    worker.once("exit", (code, signal) => {
      const reason = new Error(
        `The local voice worker stopped (${signal ?? code ?? "unknown"}).`,
      );
      this.handleWorkerFailure(worker, reason, true);
    });
    this.workerReadyTimer = setTimeout(() => {
      if (worker !== this.worker || this.workerReady) return;
      const job = this.queue.shift();
      if (job) {
        this.finishJob(job, {
          error: new Error("The local voice worker did not become ready."),
        });
      }
      this.recycleWorker(worker);
    }, this.readyTimeoutMs);
    return worker;
  }

  private handleWorkerMessage(
    worker: ChildProcess,
    message: unknown,
  ): void {
    if (worker !== this.worker || !isChildResponse(message)) return;
    if (message.type === "ready") {
      this.workerReady = true;
      this.clearWorkerReadyTimer();
      this.pump();
      return;
    }
    const job = this.active;
    if (!job || message.id !== job.request.id) return;
    if (message.type === "result") {
      this.finishJob(job, {
        wave: Buffer.from(message.waveBase64, "base64"),
      });
    } else {
      const error =
        message.name === "AbortError"
          ? abortError()
          : new Error(message.message || "Local voice synthesis failed.");
      this.finishJob(job, { error });
    }
    this.pump();
  }

  private handleWorkerFailure(
    worker: ChildProcess,
    error: Error,
    observedExit: boolean,
  ): void {
    if (worker !== this.worker) return;
    if (
      this.waitingForWorkerExit &&
      !observedExit &&
      worker.exitCode === null
    ) {
      // `ChildProcess.kill()` can emit `error` without an `exit`. Keep the
      // serialized worker owned until the recycle deadline observes a real
      // exit or escalates to SIGKILL; spawning now could overlap ONNX jobs.
      return;
    }
    this.clearWorkerReadyTimer();
    this.clearRecycleTimer();
    this.clearRecycleExitTimer();
    this.worker = null;
    this.workerReady = false;
    this.waitingForWorkerExit = false;
    this.recycleExitStalled = false;
    if (this.active) this.finishJob(this.active, { error });
    this.pump();
  }

  private abortJob(job: PendingJob): void {
    const queuedIndex = this.queue.indexOf(job);
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1);
      this.finishJob(job, { error: abortError() });
      return;
    }
    if (this.active !== job) return;
    // Reject the caller immediately, but do not SIGTERM ONNX while native
    // inference is still unwinding. The child owns one serialized job, so it
    // can safely drain this abandoned result and only then admit the next
    // queued request. Killing here caused macOS native teardown races and an
    // eventual IPC EPIPE when the completed worker tried to answer a parent
    // that had already closed its channel.
    this.finishJob(
      job,
      { error: abortError() },
      { releaseActive: false, preserveTimeout: true },
    );
    this.startAbandonedDrainDeadline(job);
  }

  private startAbandonedDrainDeadline(job: PendingJob): void {
    this.clearAbandonedDrainState();
    this.abandonedDrainTimer = setTimeout(() => {
      this.abandonedDrainTimer = null;
      if (this.active !== job || !job.settled) return;
      this.abandonedDrainExpired = true;
      // Do not spawn another Kokoro process or signal native ONNX. Release
      // waiting callers so the outer built-in voice layer can use its
      // device-local operating-system fallback while this child drains alone.
      for (const queued of this.queue.splice(0)) {
        this.finishJob(queued, {
          error: queued.signal?.aborted
            ? abortError()
            : new BuiltinTtsWorkerBusyError(),
        });
      }
    }, this.abandonedDrainTimeoutMs);
  }

  private recycleWorker(worker: ChildProcess): void {
    if (worker !== this.worker) {
      this.pump();
      return;
    }
    this.waitingForWorkerExit = true;
    this.recycleExitStalled = false;
    this.workerReady = false;
    this.clearWorkerReadyTimer();
    if (worker.exitCode !== null) {
      this.worker = null;
      this.waitingForWorkerExit = false;
      this.clearRecycleTimer();
      this.pump();
      return;
    }
    // The child and IPC channel are normally unref'ed while idle. From the
    // first recycle signal through the observed exit they must stay referenced
    // or a short-lived caller can end before the queued recovery is pumped.
    this.retainWorkerUntilExit(worker);
    worker.kill("SIGTERM");
    this.clearRecycleTimer();
    this.clearRecycleExitTimer();
    this.recycleExitTimer = setTimeout(() => {
      this.recycleExitTimer = null;
      if (worker !== this.worker || !this.waitingForWorkerExit) return;
      // Never start a replacement while an unobserved native process might
      // still exist. Fail waiting callers after a bounded observation window;
      // a later real exit clears this fail-closed state for future requests.
      this.recycleExitStalled = true;
      const error = new Error(
        "The local voice worker did not exit after recycling.",
      );
      for (const queued of this.queue.splice(0)) {
        this.finishJob(queued, { error });
      }
    }, this.recycleGraceMs + WORKER_EXIT_OBSERVATION_TIMEOUT_MS);
    this.recycleTimer = setTimeout(() => {
      this.recycleTimer = null;
      if (worker !== this.worker || !this.waitingForWorkerExit) return;
      // This path is reserved for a worker that already exceeded its hard
      // timeout or lost IPC and then ignored graceful termination. SIGKILL
      // avoids running ONNX native teardown concurrently with a replacement.
      worker.kill("SIGKILL");
    }, this.recycleGraceMs);
  }

  private retainWorkerUntilExit(worker: ChildProcess): void {
    worker.ref();
    try {
      worker.channel?.ref();
    } catch {
      // A concurrently closing IPC channel no longer needs ownership.
    }
  }

  private releaseWorkerReference(worker: ChildProcess): void {
    try {
      worker.channel?.unref();
    } catch {
      // The channel may already be closed by an observed child exit.
    }
    worker.unref();
  }

  private ownDisposedWorkerUntilExit(
    worker: ChildProcess,
    forceAfterMs: number,
  ): void {
    this.retainWorkerUntilExit(worker);
    let forceTimer: NodeJS.Timeout | null = null;
    const release = () => {
      if (forceTimer) {
        clearTimeout(forceTimer);
        forceTimer = null;
      }
      this.releaseWorkerReference(worker);
    };
    worker.once("exit", release);
    if (worker.exitCode !== null) {
      worker.off("exit", release);
      release();
      return;
    }
    forceTimer = setTimeout(() => {
      forceTimer = null;
      if (worker.exitCode === null) worker.kill("SIGKILL");
    }, forceAfterMs);
  }

  private clearRecycleTimer(): void {
    if (!this.recycleTimer) return;
    clearTimeout(this.recycleTimer);
    this.recycleTimer = null;
  }

  private clearRecycleExitTimer(): void {
    if (!this.recycleExitTimer) return;
    clearTimeout(this.recycleExitTimer);
    this.recycleExitTimer = null;
  }

  private clearWorkerReadyTimer(): void {
    if (!this.workerReadyTimer) return;
    clearTimeout(this.workerReadyTimer);
    this.workerReadyTimer = null;
  }

  private clearAbandonedDrainState(): void {
    if (this.abandonedDrainTimer) {
      clearTimeout(this.abandonedDrainTimer);
      this.abandonedDrainTimer = null;
    }
    this.abandonedDrainExpired = false;
  }

  private finishJob(
    job: PendingJob,
    result: { wave?: Buffer; error?: Error },
    options: {
      releaseActive?: boolean;
      preserveTimeout?: boolean;
    } = {},
  ): void {
    if (job.timeout && options.preserveTimeout !== true) {
      clearTimeout(job.timeout);
      job.timeout = null;
    }
    job.signal?.removeEventListener("abort", job.onAbort);
    if (options.releaseActive !== false && this.active === job) {
      this.active = null;
      this.clearAbandonedDrainState();
    }
    if (job.settled) return;
    job.settled = true;
    if (result.error) job.reject(result.error);
    else job.resolve(result.wave ?? Buffer.alloc(0));
  }
}
