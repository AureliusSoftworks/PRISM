import { fork, type ChildProcess } from "node:child_process";
import type { BotAudioVoiceProfileV1 } from "@localai/shared";

export interface BuiltinTtsChildRequest {
  type: "generate";
  id: string;
  text: string;
  profile: BotAudioVoiceProfileV1;
}

export type BuiltinTtsChildResponse =
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
  signal?: AbortSignal;
};

type PendingJob = {
  request: BuiltinTtsChildRequest;
  signal?: AbortSignal;
  resolve: (wave: Buffer) => void;
  reject: (error: Error) => void;
  onAbort: () => void;
  timeout: NodeJS.Timeout | null;
};

type WorkerClientOptions = {
  workerUrl?: URL;
  timeoutMs?: number;
  maxQueueLength?: number;
  spawnWorker?: (workerUrl: URL) => ChildProcess;
};

const DEFAULT_WORKER_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_QUEUE_LENGTH = 12;

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
  return (
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
  private readonly maxQueueLength: number;
  private readonly spawnWorker: (workerUrl: URL) => ChildProcess;
  private worker: ChildProcess | null = null;
  private active: PendingJob | null = null;
  private queue: PendingJob[] = [];
  private requestSequence = 0;
  private waitingForWorkerExit = false;

  constructor(options: WorkerClientOptions = {}) {
    this.workerUrl = options.workerUrl ?? defaultWorkerUrl();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
    this.maxQueueLength = options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH;
    this.spawnWorker = options.spawnWorker ?? spawnDefaultWorker;
  }

  generate(args: GenerateArgs): Promise<Buffer> {
    if (args.signal?.aborted) return Promise.reject(abortError());
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
      };
      const job: PendingJob = {
        request,
        signal: args.signal,
        resolve,
        reject,
        timeout: null,
        onAbort: () => this.abortJob(job),
      };
      args.signal?.addEventListener("abort", job.onAbort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  dispose(): void {
    const error = new Error("The local voice worker stopped.");
    if (this.active) this.finishJob(this.active, { error });
    for (const job of this.queue.splice(0)) this.finishJob(job, { error });
    const worker = this.worker;
    this.worker = null;
    this.waitingForWorkerExit = false;
    if (worker && worker.exitCode === null) worker.kill("SIGTERM");
  }

  private pump(): void {
    if (this.active || this.waitingForWorkerExit) return;
    let job = this.queue.shift() ?? null;
    while (job?.signal?.aborted) {
      this.finishJob(job, { error: abortError() });
      job = this.queue.shift() ?? null;
    }
    if (!job) return;

    let worker: ChildProcess;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      this.finishJob(job, {
        error:
          error instanceof Error
            ? error
            : new Error("The local voice worker could not start."),
      });
      queueMicrotask(() => this.pump());
      return;
    }

    this.active = job;
    job.timeout = setTimeout(() => {
      if (this.active !== job) return;
      this.finishJob(job, {
        error: new Error("Local voice synthesis timed out."),
      });
      this.recycleWorker(worker);
    }, this.timeoutMs);
    job.timeout.unref?.();

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
    worker.on("message", (message: unknown) =>
      this.handleWorkerMessage(worker, message),
    );
    worker.once("error", (error) => this.handleWorkerFailure(worker, error));
    worker.once("exit", (code, signal) => {
      const reason = new Error(
        `The local voice worker stopped (${signal ?? code ?? "unknown"}).`,
      );
      this.handleWorkerFailure(worker, reason);
    });
    return worker;
  }

  private handleWorkerMessage(
    worker: ChildProcess,
    message: unknown,
  ): void {
    if (worker !== this.worker || !isChildResponse(message)) return;
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

  private handleWorkerFailure(worker: ChildProcess, error: Error): void {
    if (worker !== this.worker) return;
    this.worker = null;
    this.waitingForWorkerExit = false;
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
    const worker = this.worker;
    this.finishJob(job, { error: abortError() });
    if (worker) this.recycleWorker(worker);
    else this.pump();
  }

  private recycleWorker(worker: ChildProcess): void {
    if (worker !== this.worker) {
      this.pump();
      return;
    }
    this.waitingForWorkerExit = true;
    if (worker.exitCode !== null || !worker.kill("SIGTERM")) {
      this.worker = null;
      this.waitingForWorkerExit = false;
      this.pump();
    }
  }

  private finishJob(
    job: PendingJob,
    result: { wave?: Buffer; error?: Error },
  ): void {
    if (job.timeout) clearTimeout(job.timeout);
    job.signal?.removeEventListener("abort", job.onAbort);
    if (this.active === job) this.active = null;
    if (result.error) job.reject(result.error);
    else job.resolve(result.wave ?? Buffer.alloc(0));
  }
}
