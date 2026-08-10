import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  VOICE_SYNC_LAB_PCM_CAPTURE_PROCESSOR,
  assembleVoiceSyncLabPcmCaptureResult,
  voiceSyncLabDeviceLatencyEstimate,
  voiceSyncLabPcmCaptureFrameForContextTime,
} from "./voiceSyncLabPcmCapture.ts";

const noDeviceLatency = {
  baseLatencyMs: 10,
  outputLatencyMs: 20,
  estimatedTotalMs: 30,
  appliedToPcm: false as const,
  physicalLoopbackIncluded: false as const,
};

describe("Voice Sync Lab final-bus capture clock", () => {
  it("maps context time to a signed frame without folding in device latency", () => {
    assert.equal(
      voiceSyncLabPcmCaptureFrameForContextTime({
        contextTime: 2.25,
        frameZeroContextFrame: 2_000,
        sampleRate: 1_000,
      }),
      250,
    );
    assert.equal(
      voiceSyncLabPcmCaptureFrameForContextTime({
        contextTime: 1.75,
        frameZeroContextFrame: 2_000,
        sampleRate: 1_000,
      }),
      -250,
    );
  });

  it("assembles equal-length channels in the AudioContext frame domain", () => {
    const result = assembleVoiceSyncLabPcmCaptureResult({
      captureKind: "audio-worklet",
      sampleRate: 1_000,
      channelCount: 2,
      frameZeroContextFrame: 100,
      captureStopContextFrame: 106,
      quanta: [
        {
          sequence: 0,
          contextStartFrame: 100,
          contextStartTime: 0.1,
          frameCount: 3,
          channels: [
            new Float32Array([0.1, 0.2, 0.3]),
            new Float32Array([-0.1, -0.2, -0.3]),
          ],
        },
        {
          sequence: 1,
          contextStartFrame: 103,
          contextStartTime: 0.103,
          frameCount: 3,
          channels: [
            new Float32Array([0.4, 0.5, 0.6]),
            new Float32Array([-0.4, -0.5, -0.6]),
          ],
        },
      ],
      markerTimes: [{ label: "mouth-open", contextTime: 0.102 }],
      deviceLatency: noDeviceLatency,
    });

    assert.equal(result.frameCount, 6);
    assert.equal(result.channels[0]?.length, result.frameCount);
    assert.equal(result.channels[1]?.length, result.frameCount);
    assert.deepEqual(
      Array.from(result.channels[0] ?? []),
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map(Math.fround),
    );
    assert.deepEqual(
      Array.from(result.channels[1] ?? []),
      [-0.1, -0.2, -0.3, -0.4, -0.5, -0.6].map(Math.fround),
    );
    assert.equal(result.markers[0]?.frame, 2);
    assert.equal(result.unobservedFrameCount, 0);
    assert.equal(result.droppedQuantumCount, 0);
    assert.equal(result.deterministicRenderClock, true);
    assert.equal(result.deviceLatency.appliedToPcm, false);
    assert.equal(result.deviceLatency.physicalLoopbackIncluded, false);
  });

  it("fills delivery gaps but refuses to call that clock deterministic", () => {
    const result = assembleVoiceSyncLabPcmCaptureResult({
      captureKind: "audio-worklet",
      sampleRate: 1_000,
      channelCount: 1,
      frameZeroContextFrame: 100,
      captureStopContextFrame: 109,
      quanta: [
        {
          sequence: 4,
          contextStartFrame: 100,
          contextStartTime: 0.1,
          frameCount: 3,
          channels: [new Float32Array([1, 1, 1])],
        },
        {
          sequence: 6,
          contextStartFrame: 106,
          contextStartTime: 0.106,
          frameCount: 3,
          channels: [new Float32Array([2, 2, 2])],
        },
      ],
      markerTimes: [],
      deviceLatency: noDeviceLatency,
    });
    assert.deepEqual(Array.from(result.channels[0] ?? []), [1, 1, 1, 0, 0, 0, 2, 2, 2]);
    assert.equal(result.unobservedFrameCount, 3);
    assert.equal(
      result.droppedQuantumCount,
      5,
      "sequences 0-3 and the interior sequence 5 were not delivered",
    );
    assert.equal(result.deterministicRenderClock, false);
  });

  it("rejects a capture whose first delivered Worklet sequence is not zero", () => {
    const result = assembleVoiceSyncLabPcmCaptureResult({
      captureKind: "audio-worklet",
      sampleRate: 1_000,
      channelCount: 1,
      frameZeroContextFrame: 100,
      captureStopContextFrame: 103,
      quanta: [{
        sequence: 3,
        contextStartFrame: 100,
        contextStartTime: 0.1,
        frameCount: 3,
        channels: [new Float32Array([1, 1, 1])],
      }],
      markerTimes: [],
      deviceLatency: noDeviceLatency,
    });
    assert.equal(result.unobservedFrameCount, 0);
    assert.equal(result.droppedQuantumCount, 3);
    assert.equal(result.deterministicRenderClock, false);
  });

  it("keeps browser-reported device latency separate from raw PCM", () => {
    const estimate = voiceSyncLabDeviceLatencyEstimate({
      baseLatency: 0.01,
      outputLatency: 0.02,
      currentTime: 1,
    });
    assert.equal(estimate.baseLatencyMs, 10);
    assert.equal(estimate.outputLatencyMs, 20);
    assert.equal(estimate.estimatedTotalMs, 30);
    assert.equal(estimate.appliedToPcm, false);
    assert.equal(estimate.physicalLoopbackIncluded, false);
  });

  it("ships a transferable render-quantum worklet under the matching name", () => {
    const source = readFileSync(
      new URL("../../public/worklets/prism-voice-sync-lab-capture.js", import.meta.url),
      "utf8",
    );
    assert.match(source, new RegExp(`registerProcessor\\(\\s*[\"']${VOICE_SYNC_LAB_PCM_CAPTURE_PROCESSOR}`));
    assert.match(source, /contextStartFrame:\s*currentFrame/u);
    assert.match(source, /contextStartTime:\s*currentTime/u);
    assert.match(source, /postMessage\([\s\S]*transfer/u);
  });

  it("anchors frame zero to the first delivered render quantum", () => {
    const source = readFileSync(
      new URL("./voiceSyncLabPcmCapture.ts", import.meta.url),
      "utf8",
    );
    const workletStart = source.indexOf("async function startWorkletCapture");
    const fallbackStart = source.indexOf("function startScriptProcessorCapture");
    assert.ok(workletStart >= 0 && fallbackStart > workletStart);
    const workletSource = source.slice(workletStart, fallbackStart);
    assert.match(workletSource, /firstQuantum\s*=\s*await Promise\.race/u);
    assert.match(
      workletSource,
      /const frameZeroContextFrame\s*=\s*firstQuantum\.contextStartFrame/u,
    );
    assert.doesNotMatch(
      workletSource,
      /const frameZeroContextFrame\s*=\s*Math\.round\(\s*args\.context\.currentTime/u,
      "the deterministic Worklet path must not guess frame zero before a quantum arrives",
    );
  });
});
