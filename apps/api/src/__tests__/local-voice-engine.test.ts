import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LocalVoiceCalibrationStateV1 } from "@localai/shared";
import {
  localVoiceRuntimeHealthy,
  pcmWaveDurationMs,
  recordInstantVoiceCalibration,
  resolveLocalVoiceEngine,
} from "../local-voice-engine.ts";

function calibration(
  overrides: Partial<LocalVoiceCalibrationStateV1["voicePlus"]> = {},
): LocalVoiceCalibrationStateV1 {
  return {
    v: 1,
    platform: "darwin",
    architecture: "arm64",
    calibratedAt: "2026-08-02T00:00:00.000Z",
    instant: { available: true, warmRealtimeFactor: 0.1, firstPlayableMs: 80 },
    voicePlus: {
      available: true,
      qualified: true,
      warmRealtimeFactor: 0.8,
      firstPlayableMs: 900,
      modelHash: "a".repeat(64),
      unavailableReason: null,
      ...overrides,
    },
  };
}

describe("adaptive local voice selection", () => {
  it("uses qualified Voice+ for a healthy Auto utterance", () => {
    assert.deepEqual(
      resolveLocalVoiceEngine({
        preference: "auto",
        calibration: calibration(),
        runtimeHealthy: true,
      }),
      { requested: "auto", resolved: "voice-plus", fallback: false, notice: null },
    );
  });

  it("keeps Auto on Instant when latency or runtime health misses the gate", () => {
    assert.equal(
      resolveLocalVoiceEngine({
        preference: "auto",
        calibration: calibration({ warmRealtimeFactor: 1.01 }),
        runtimeHealthy: true,
      }).resolved,
      "instant",
    );
    assert.equal(
      resolveLocalVoiceEngine({
        preference: "auto",
        calibration: calibration(),
        runtimeHealthy: false,
      }).resolved,
      "instant",
    );
  });

  it("makes a forced Voice+ hard failure visible while recovering to Instant", () => {
    assert.deepEqual(
      resolveLocalVoiceEngine({
        preference: "voice-plus",
        calibration: calibration({
          warmRealtimeFactor: 1.7,
          firstPlayableMs: 4_000,
        }),
        runtimeHealthy: true,
      }),
      {
        requested: "voice-plus",
        resolved: "voice-plus",
        fallback: false,
        notice: null,
      },
    );
    const decision = resolveLocalVoiceEngine({
      preference: "voice-plus",
      calibration: calibration({ available: false, qualified: false }),
      runtimeHealthy: true,
    });
    assert.equal(decision.resolved, "instant");
    assert.equal(decision.fallback, true);
    assert.ok(decision.notice);
  });

  it("checks both free memory and process pressure", () => {
    const gib = 1024 ** 3;
    assert.equal(
      localVoiceRuntimeHealthy({
        freeMemoryBytes: 4 * gib,
        totalMemoryBytes: 16 * gib,
        processResidentBytes: 2 * gib,
      }),
      true,
    );
    assert.equal(
      localVoiceRuntimeHealthy({
        freeMemoryBytes: 1 * gib,
        totalMemoryBytes: 16 * gib,
        processResidentBytes: 2 * gib,
      }),
      false,
    );
  });

  it("records warm Instant calibration from decoded PCM duration", () => {
    const sampleRate = 24_000;
    const dataBytes = sampleRate * 2;
    const wave = Buffer.alloc(44 + dataBytes);
    wave.write("RIFF", 0, "ascii");
    wave.writeUInt32LE(36 + dataBytes, 4);
    wave.write("WAVE", 8, "ascii");
    wave.write("fmt ", 12, "ascii");
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(sampleRate, 24);
    wave.writeUInt32LE(sampleRate * 2, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write("data", 36, "ascii");
    wave.writeUInt32LE(dataBytes, 40);

    assert.equal(pcmWaveDurationMs(wave), 1_000);
    const state = recordInstantVoiceCalibration({
      elapsedMs: 125,
      audioDurationMs: 1_000,
      calibratedAt: "2026-08-02T01:02:03.000Z",
    });
    assert.equal(state.instant.warmRealtimeFactor, 0.125);
    assert.equal(state.instant.firstPlayableMs, 125);
    assert.equal(state.calibratedAt, "2026-08-02T01:02:03.000Z");
  });
});
