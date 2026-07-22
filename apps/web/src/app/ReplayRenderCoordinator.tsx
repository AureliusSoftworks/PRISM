"use client";

import { useEffect, useRef } from "react";
import {
  REPLAY_VIDEO_FPS,
  REPLAY_VIDEO_HEIGHT,
  REPLAY_VIDEO_WIDTH,
  normalizeBotcastStudioAtmosphereMix,
  type ReplayRecordingV1,
  type ReplaySurfaceV1,
  type ReplayTimelineV1,
} from "@localai/shared";
import { prepareReplayAudio } from "./replayAudio";
import {
  claimReplayRecording,
  completeReplayRender,
  failReplayRender,
  replayAuthHeaders,
  updateReplayRenderProgress,
} from "./replayClient";
import { ReplayPixiScene } from "./replayScene";
import { replayVideoBitrateForFilmGrain } from "./signalFilmGrain";

export const REPLAY_RECORDING_CHANGED_EVENT = "prism:replay-recording-changed";

export interface ReplayFrameRenderer {
  /** Expensive DOM captures may run below the encoded 30 fps; frames are held between captures. */
  captureFps: number;
  prepare: (
    recording: ReplayRecordingV1,
    timeline: ReplayTimelineV1,
  ) => Promise<void>;
  renderAt: (timeMs: number) => Promise<HTMLCanvasElement>;
  finish?: () => void;
}

function replayErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Replay rendering failed.";
}

async function nextBrowserTurn(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function interleavedReplayAudio(buffer: AudioBuffer): Float32Array {
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const interleaved = new Float32Array(buffer.length * 2);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    interleaved[frame * 2] = left[frame] ?? 0;
    interleaved[frame * 2 + 1] = right[frame] ?? 0;
  }
  return interleaved;
}

function waitForReplayWorker(
  worker: Worker,
  expectedType: "ready" | "frame-added" | "done",
  expectedFrame?: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<Record<string, unknown>>) => {
      if (event.data.type === "error") {
        cleanup();
        reject(new Error(String(event.data.error ?? "Replay worker failed.")));
        return;
      }
      if (
        event.data.type !== expectedType ||
        (expectedFrame !== undefined && event.data.frame !== expectedFrame)
      ) {
        return;
      }
      cleanup();
      resolve(event.data);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "Replay worker crashed."));
    };
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
  });
}

async function renderClaimedReplay(
  claim: NonNullable<Awaited<ReturnType<typeof claimReplayRecording>>>,
  frameRenderer?: ReplayFrameRenderer,
): Promise<void> {
  const { recording, takes, renderToken } = claim;
  if (!recording.manifest) throw new Error("Replay manifest is missing.");
  if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
    throw new Error("This PRISM client cannot encode replay video. Retry on a worker-capable client.");
  }
  await updateReplayRenderProgress({
    recordingId: recording.id,
    renderToken,
    status: "preparing_audio",
    progress: 0.04,
  });
  const prepared = await prepareReplayAudio(recording, takes);
  await updateReplayRenderProgress({
    recordingId: recording.id,
    renderToken,
    status: "rendering",
    progress: 0.18,
  });
  const scene = frameRenderer
    ? null
    : await ReplayPixiScene.create({
        manifest: recording.manifest,
        timeline: prepared.timeline,
      });
  let worker: Worker | null = null;
  try {
    if (recording.surface === "signal" && !frameRenderer) {
      throw new Error(
        "Open this Signal episode so PRISM can render its authentic studio.",
      );
    }
    await frameRenderer?.prepare(recording, prepared.timeline);
    worker = new Worker(
      new URL("./replayEncoder.worker.ts", import.meta.url),
      { type: "module", name: `prism-replay-${recording.id}` },
    );
    const interleaved = interleavedReplayAudio(prepared.audioBuffer);
    const filmGrainLevel =
      recording.surface === "signal"
        ? normalizeBotcastStudioAtmosphereMix(
            recording.manifest.visual.metadata?.atmosphereMix,
          ).filmGrain
        : 0;
    const ready = waitForReplayWorker(worker, "ready");
    worker.postMessage(
      {
        type: "init",
        recordingId: recording.id,
        renderToken,
        authHeaders: replayAuthHeaders(),
        title: recording.manifest.title,
        width: REPLAY_VIDEO_WIDTH,
        height: REPLAY_VIDEO_HEIGHT,
        fps: REPLAY_VIDEO_FPS,
        filmGrainLevel,
        videoBitrate: replayVideoBitrateForFilmGrain(filmGrainLevel),
        sampleRate: prepared.audioBuffer.sampleRate,
        numberOfChannels: 2,
        audio: interleaved.buffer,
      },
      [interleaved.buffer],
    );
    const encoding = await ready;
    const durationSeconds = Math.max(
      prepared.audioBuffer.duration,
      prepared.timeline.durationMs / 1_000,
    );
    const frameDuration = 1 / REPLAY_VIDEO_FPS;
    const frameCount = Math.max(1, Math.ceil(durationSeconds * REPLAY_VIDEO_FPS));
    const captureEveryFrames = Math.max(
      1,
      Math.round(
        REPLAY_VIDEO_FPS /
          Math.max(
            1,
            Math.min(
              REPLAY_VIDEO_FPS,
              frameRenderer?.captureFps ?? REPLAY_VIDEO_FPS,
            ),
          ),
      ),
    );
    let renderedCanvas: HTMLCanvasElement | null = null;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const timestamp = frame * frameDuration;
      if (!renderedCanvas || frame % captureEveryFrames === 0) {
        if (frameRenderer) {
          renderedCanvas = await frameRenderer.renderAt(timestamp * 1_000);
        } else if (scene) {
          scene.renderAt(timestamp * 1_000);
          renderedCanvas = scene.canvas;
        }
      }
      if (!renderedCanvas) throw new Error("Replay frame renderer returned no canvas.");
      const bitmap = await createImageBitmap(renderedCanvas);
      const added = waitForReplayWorker(worker, "frame-added", frame);
      worker.postMessage(
        { type: "frame", frame, timestamp, duration: frameDuration, bitmap },
        [bitmap],
      );
      await added;
      if (frame % REPLAY_VIDEO_FPS === 0) {
        await updateReplayRenderProgress({
          recordingId: recording.id,
          renderToken,
          status: "rendering",
          progress: 0.18 + (frame / frameCount) * 0.8,
        });
        await nextBrowserTurn();
      }
    }
    const done = waitForReplayWorker(worker, "done");
    worker.postMessage({ type: "finish" });
    const completed = await done;
    await completeReplayRender({
      recordingId: recording.id,
      renderToken,
      contentType:
        completed.contentType === "video/webm" ? "video/webm" : "video/mp4",
      codec: String(completed.codec ?? encoding.codec ?? "unknown"),
      durationMs: Math.round(durationSeconds * 1_000),
      warning: prepared.warnings.length > 0 ? prepared.warnings.join(" ") : null,
    });
  } finally {
    worker?.terminate();
    scene?.destroy();
    frameRenderer?.finish?.();
  }
}

export function ReplayRenderCoordinator({
  surface = "coffee",
  sourceId,
  frameRenderer,
}: {
  surface?: ReplaySurfaceV1;
  sourceId?: string;
  frameRenderer?: ReplayFrameRenderer;
} = {}): null {
  const runningRef = useRef(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (delayMs: number) => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    };
    const run = async () => {
      if (
        disposed ||
        runningRef.current ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      ) {
        schedule(8_000);
        return;
      }
      runningRef.current = true;
      let claim: Awaited<ReturnType<typeof claimReplayRecording>> = null;
      try {
        claim = await claimReplayRecording({ surface, sourceId });
        if (claim) await renderClaimedReplay(claim, frameRenderer);
      } catch (error) {
        if (claim) {
          await failReplayRender({
            recordingId: claim.recording.id,
            renderToken: claim.renderToken,
            error: replayErrorMessage(error),
          }).catch(() => undefined);
        }
      } finally {
        runningRef.current = false;
        window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
        schedule(claim ? 1_000 : 8_000);
      }
    };
    const wake = () => schedule(250);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener(REPLAY_RECORDING_CHANGED_EVENT, wake);
    schedule(1_500);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener(REPLAY_RECORDING_CHANGED_EVENT, wake);
    };
  }, [frameRenderer, sourceId, surface]);
  return null;
}
