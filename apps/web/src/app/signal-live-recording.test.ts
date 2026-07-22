import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ReplayRecordingV1 } from "@localai/shared";
import { signalEpisodeArchiveActionLabel } from "./signalReplayVideoGate.ts";

const source = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), "utf8");

describe("Signal live recording", () => {
  it("captures the authentic audience roots without producer actions or duplicate grain", () => {
    const recorder = source("SignalLiveReplayRecorder.ts");
    const experience = source("BotcastExperience.tsx");
    assert.match(recorder, /LIVE_CAPTURE_INTERVAL_MS = 100/u);
    assert.match(recorder, /this\.frameInWorker/u);
    assert.match(recorder, /pixelRatio: 1/u);
    assert.match(recorder, /filmGrainLevel: 0/u);
    assert.doesNotMatch(
      recorder,
      /toCanvas\([\s\S]{0,500}width: REPLAY_VIDEO_WIDTH/u,
    );
    assert.match(experience, /data-signal-live-capture-root="intro"/u);
    assert.match(experience, /data-signal-live-capture-root="outro"/u);
    assert.match(experience, /data-signal-recording-exclude="true"/u);
    assert.match(experience, /\?\?\s*signalStageRef\.current/u);
  });

  it("routes every Signal on-air audio family through one scoped bus", () => {
    const voice = source("voiceEffects.ts");
    const atmosphere = source("session-atmosphere-audio.ts");
    const ident = source("signalIntroAudio.ts");
    const soundboard = source("signalSoundboard.ts");
    const actionSfx = source("coffee-action-sfx.ts");
    const page = source("page.tsx");
    const bus = source("signalLiveAudioBus.ts");
    assert.match(voice, /signalLiveAudioContext\(\)/u);
    assert.match(voice, /destination: signalLiveAudioDestination\(context\)/u);
    assert.match(atmosphere, /signalLiveAudioContext\(\)/u);
    assert.match(atmosphere, /signalLiveAudioDestination\(context\)/u);
    assert.match(ident, /connectSignalLiveMediaElement\(args\.audio\)/u);
    assert.match(soundboard, /connectSignalLiveMediaElement\(audio\)/u);
    assert.match(actionSfx, /connectSignalLiveMediaElement\(audio\)/u);
    assert.match(page, /connectSignalLiveMediaElement\(audio\)/u);
    assert.match(bus, /stop\(preservePlayback = false\)/u);
    assert.match(bus, /if \(!preservePlayback\) this\.master\.disconnect\(\)/u);
  });

  it("keeps live muxing incremental, bounded, serialized, and recoverable", () => {
    const worker = source("replayEncoder.worker.ts");
    const recorder = source("SignalLiveReplayRecorder.ts");
    assert.match(worker, /LIVE_DEFERRED_UPLOAD_MAX_BYTES = 32 \* 1024 \* 1024/u);
    assert.match(worker, /type: "init-live"/u);
    assert.match(worker, /type: "attach-upload"/u);
    assert.match(worker, /type: "audio"/u);
    assert.match(worker, /type: "frame"/u);
    assert.match(worker, /let operationChain = Promise\.resolve\(\)/u);
    assert.match(worker, /await encodeLiveFramesThrough/u);
    assert.match(recorder, /LIVE_CAPTURE_DEGRADE_AFTER_MS = 2_000/u);
    assert.match(recorder, /document\.visibilityState === "hidden"/u);
    assert.match(recorder, /queueReplayManifest\(manifest\)/u);
  });

  it("uses the finishing, rebuilding, and watch archive states", () => {
    const base = {
      id: "recording-1",
      surface: "signal",
      sourceId: "episode-1",
      captureMode: "live",
      captureReport: null,
      progress: 0.5,
      manifest: null,
      timeline: null,
      width: 1920,
      height: 1080,
      fps: 30,
      durationMs: null,
      sizeBytes: null,
      codec: null,
      contentType: null,
      videoUrl: null,
      transcriptVttUrl: null,
      transcriptMarkdownUrl: null,
      warning: null,
      error: null,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    } satisfies Omit<ReplayRecordingV1, "status">;
    const item = { status: "completed" } as Parameters<
      typeof signalEpisodeArchiveActionLabel
    >[0];
    assert.equal(
      signalEpisodeArchiveActionLabel(item, { ...base, status: "rendering" }),
      "Finishing recording",
    );
    assert.equal(
      signalEpisodeArchiveActionLabel(item, {
        ...base,
        status: "queued",
        captureMode: "rebuild",
      }),
      "Rebuilding episode video",
    );
  });
});
