"use client";

import { useEffect, useRef } from "react";
import type { StreamTargetChunk } from "mediabunny";
import {
  REPLAY_VIDEO_FPS,
  REPLAY_VIDEO_HEIGHT,
  REPLAY_VIDEO_WIDTH,
} from "@localai/shared";
import { prepareReplayAudio } from "./replayAudio";
import {
  claimReplayRecording,
  completeReplayRender,
  failReplayRender,
  updateReplayRenderProgress,
  uploadReplayRenderChunk,
} from "./replayClient";
import { ReplayPixiScene } from "./replayScene";

export const REPLAY_RECORDING_CHANGED_EVENT = "prism:replay-recording-changed";

function replayErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Replay rendering failed.";
}

async function nextBrowserTurn(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

async function renderClaimedReplay(
  claim: NonNullable<Awaited<ReturnType<typeof claimReplayRecording>>>,
): Promise<void> {
  const { recording, takes, renderToken } = claim;
  if (!recording.manifest) throw new Error("Replay manifest is missing.");
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    throw new Error("This PRISM client cannot encode replay video. Retry on a WebCodecs-capable client.");
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
  const media = await import("mediabunny");
  const mp4Video = await media.getFirstEncodableVideoCodec(["avc"], {
    width: REPLAY_VIDEO_WIDTH,
    height: REPLAY_VIDEO_HEIGHT,
    bitrate: 6_000_000,
  });
  const mp4Audio = await media.getFirstEncodableAudioCodec(["aac"], {
    numberOfChannels: 2,
    sampleRate: prepared.audioBuffer.sampleRate,
    bitrate: 192_000,
  });
  const useMp4 = mp4Video === "avc" && mp4Audio === "aac";
  const format = useMp4
    ? new media.Mp4OutputFormat({ fastStart: "fragmented" })
    : new media.WebMOutputFormat();
  const videoCodec = useMp4
    ? mp4Video
    : await media.getFirstEncodableVideoCodec(["vp9", "vp8"], {
        width: REPLAY_VIDEO_WIDTH,
        height: REPLAY_VIDEO_HEIGHT,
        bitrate: 6_000_000,
      });
  const audioCodec = useMp4
    ? mp4Audio
    : await media.getFirstEncodableAudioCodec(["opus"], {
        numberOfChannels: 2,
        sampleRate: prepared.audioBuffer.sampleRate,
        bitrate: 192_000,
      });
  if (!videoCodec || !audioCodec) {
    throw new Error("This PRISM client has no compatible replay video/audio encoder.");
  }
  const target = new media.StreamTarget(
    new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        await uploadReplayRenderChunk({
          recordingId: recording.id,
          renderToken,
          position: chunk.position,
          bytes: chunk.data,
        });
      },
    }),
    { chunked: true, chunkSize: 4 * 1024 * 1024 },
  );
  const scene = await ReplayPixiScene.create({
    manifest: recording.manifest,
    timeline: prepared.timeline,
  });
  try {
    const output = new media.Output({ format, target });
    const videoSource = new media.CanvasSource(scene.canvas, {
      codec: videoCodec,
      bitrate: 6_000_000,
      keyFrameInterval: 2,
      latencyMode: "quality",
      contentHint: "detail",
    });
    const audioSource = new media.AudioBufferSource({
      codec: audioCodec,
      bitrate: 192_000,
    });
    output.addVideoTrack(videoSource, {
      frameRate: REPLAY_VIDEO_FPS,
      name: recording.manifest.title,
    });
    output.addAudioTrack(audioSource, { name: "PRISM replay mix" });
    output.setMetadataTags({
      title: recording.manifest.title,
      artist: "PRISM",
      comment: `${recording.surface} deterministic replay v1`,
    });
    await output.start();
    const audioPromise = audioSource.add(prepared.audioBuffer);
    const durationSeconds = Math.max(
      prepared.audioBuffer.duration,
      prepared.timeline.durationMs / 1_000,
    );
    const frameDuration = 1 / REPLAY_VIDEO_FPS;
    const frameCount = Math.max(1, Math.ceil(durationSeconds * REPLAY_VIDEO_FPS));
    for (let frame = 0; frame < frameCount; frame += 1) {
      const timestamp = frame * frameDuration;
      scene.renderAt(timestamp * 1_000);
      await videoSource.add(timestamp, frameDuration, {
        keyFrame: frame % (REPLAY_VIDEO_FPS * 2) === 0,
      });
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
    await audioPromise;
    await output.finalize();
    await completeReplayRender({
      recordingId: recording.id,
      renderToken,
      contentType: useMp4 ? "video/mp4" : "video/webm",
      codec: `${videoCodec}/${audioCodec}`,
      durationMs: Math.round(durationSeconds * 1_000),
      warning: prepared.warnings.length > 0 ? prepared.warnings.join(" ") : null,
    });
  } finally {
    scene.destroy();
  }
}

export function ReplayRenderCoordinator(): null {
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
        claim = await claimReplayRecording();
        if (claim) await renderClaimedReplay(claim);
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
  }, []);
  return null;
}
