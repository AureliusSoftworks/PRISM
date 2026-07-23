import { fork, type ChildProcess } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import type { ReplayRenderKindV1, ReplaySurfaceV1 } from "@localai/shared";
import {
  claimNextReplayRecording,
  failReplayRender,
} from "./replay-recordings.ts";
import {
  removeReplayFile,
  replayRenderAudioRelativePath,
} from "./replay-storage.ts";
import { resolveWebPublicPort } from "./network-config.ts";

export interface ReplayRenderChildJob {
  type: "render";
  id: string;
  userId: string;
  sessionToken: string;
  recordingId: string;
  sourceId: string;
  surface: ReplaySurfaceV1;
  renderToken: string;
  renderKind: ReplayRenderKindV1;
  webOrigin: string;
  durationMs: number;
}

export type ReplayRenderChildResponse =
  | { type: "complete"; id: string }
  | { type: "error"; id: string; message: string };

type WakeRequest = {
  db: DatabaseSync;
  userId: string;
  sessionToken: string;
};

type WorkerClientOptions = {
  workerUrl?: URL;
  spawnWorker?: (workerUrl: URL) => ChildProcess;
  webOrigin?: string;
};

function defaultWorkerUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  return new URL(`./replay-render-child.${extension}`, import.meta.url);
}

function spawnDefaultWorker(workerUrl: URL): ChildProcess {
  const sourceWorker = workerUrl.pathname.endsWith(".ts");
  return fork(workerUrl, [], {
    execArgv: sourceWorker ? ["--experimental-strip-types"] : [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
}

function normalizeHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveReplayRenderWebOrigin(): string {
  const configured = process.env.PRISM_REPLAY_RENDER_WEB_ORIGIN?.trim();
  const normalized = configured ? normalizeHttpOrigin(configured) : null;
  if (normalized) return normalized;
  return `http://127.0.0.1:${resolveWebPublicPort()}`;
}

function isChildResponse(value: unknown): value is ReplayRenderChildResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReplayRenderChildResponse>;
  return (
    typeof candidate.id === "string" &&
    (candidate.type === "complete" ||
      (candidate.type === "error" && typeof candidate.message === "string"))
  );
}

function renderTimeoutMs(durationMs: number): number {
  return Math.max(
    10 * 60_000,
    Math.min(3 * 60 * 60_000, Math.max(0, durationMs) * 2 + 10 * 60_000),
  );
}

/**
 * Serializes authentic replay video rendering behind one child process.
 * Chromium and FFmpeg never run in the API process, so live product traffic
 * keeps its own event loop and the foreground page never owns the render lease.
 */
export class ReplayRenderWorkerClient {
  private readonly workerUrl: URL;
  private readonly spawnWorker: (workerUrl: URL) => ChildProcess;
  private readonly webOrigin: string;
  private readonly pending = new Map<string, WakeRequest>();
  private activeWorker: ChildProcess | null = null;
  private active = false;
  private disposed = false;
  private sequence = 0;

  constructor(options: WorkerClientOptions = {}) {
    this.workerUrl = options.workerUrl ?? defaultWorkerUrl();
    this.spawnWorker = options.spawnWorker ?? spawnDefaultWorker;
    this.webOrigin = options.webOrigin ?? resolveReplayRenderWebOrigin();
  }

  wake(request: WakeRequest): void {
    if (this.disposed) return;
    this.pending.set(request.userId, request);
    queueMicrotask(() => void this.pump());
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    const worker = this.activeWorker;
    this.activeWorker = null;
    if (worker?.exitCode === null) worker.kill("SIGTERM");
  }

  private async pump(): Promise<void> {
    if (this.active || this.disposed) return;
    const next = this.pending.entries().next().value as
      | [string, WakeRequest]
      | undefined;
    if (!next) return;
    const [key, request] = next;
    this.pending.delete(key);
    const claim = claimNextReplayRecording(request.db, request.userId);
    if (!claim) {
      queueMicrotask(() => void this.pump());
      return;
    }

    this.active = true;
    const durationMs = Math.max(
      claim.recording.timeline?.durationMs ?? 0,
      claim.recording.durationMs ?? 0,
    );
    const job: ReplayRenderChildJob = {
      type: "render",
      id: `replay-${process.pid}-${++this.sequence}`,
      userId: request.userId,
      sessionToken: request.sessionToken,
      recordingId: claim.recording.id,
      sourceId: claim.recording.sourceId,
      surface: claim.recording.surface,
      renderToken: claim.renderToken,
      renderKind: claim.renderKind,
      webOrigin: this.webOrigin,
      durationMs,
    };
    try {
      await this.runChild(job);
    } catch (error) {
      try {
        failReplayRender(
          request.db,
          request.userId,
          claim.recording.id,
          claim.renderToken,
          error,
        );
      } catch {
        // The child may have completed or failed the lease immediately before
        // its process stopped. Database truth wins in that race.
      }
    } finally {
      removeReplayFile(
        replayRenderAudioRelativePath(
          request.userId,
          claim.recording.id,
          claim.renderToken,
        ),
      );
      this.active = false;
      this.activeWorker = null;
      if (!this.disposed) {
        this.pending.set(request.userId, request);
        queueMicrotask(() => void this.pump());
      }
    }
  }

  private runChild(job: ReplayRenderChildJob): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;
      const worker = this.spawnWorker(this.workerUrl);
      this.activeWorker = worker;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        worker.removeAllListeners();
        if (worker.exitCode === null) worker.kill("SIGTERM");
        if (error) reject(error);
        else resolve();
      };
      worker.on("message", (message: unknown) => {
        if (!isChildResponse(message) || message.id !== job.id) return;
        if (message.type === "complete") finish();
        else finish(new Error(message.message));
      });
      worker.once("error", (error) => finish(error));
      worker.once("exit", (code, signal) => {
        if (!settled) {
          finish(
            new Error(
              `Background replay renderer stopped (${signal ?? code ?? "unknown"}).`,
            ),
          );
        }
      });
      timeout = setTimeout(() => {
        finish(new Error("Background replay renderer timed out."));
      }, renderTimeoutMs(job.durationMs));
      timeout.unref?.();
      worker.send(job, (error) => {
        if (error) finish(error);
      });
    });
  }
}

export const replayRenderWorkerClient = new ReplayRenderWorkerClient();

export function wakeReplayBackgroundRender(request: WakeRequest): void {
  if (process.env.PRISM_API_DISABLE_AUTOSTART === "1") return;
  replayRenderWorkerClient.wake(request);
}
