import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  type LocalVoiceCalibrationStateV1,
} from "@localai/shared";
import {
  localVoiceRuntimeHealthy,
  pcmWaveDurationMs,
  recordInstantVoiceCalibration,
  resolveLocalVoiceEngine,
  resolveLocalVoicePronunciation,
  resolveLocalVoiceSpeechprint,
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

  it("routes active Auto Speechprints to Instant and resolves provenance", () => {
    const engine = resolveLocalVoiceEngine({
      preference: "auto",
      calibration: calibration(),
      runtimeHealthy: true,
      speechprintActive: true,
    });
    assert.equal(engine.resolved, "instant");
    const resolved = resolveLocalVoiceSpeechprint({
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        speechprintInfluence: "indian-english",
        speechprintStrength: "balanced",
        speechprintVariationSeed: "speaker-1",
      },
      localEngine: engine,
      usingSystemVoice: false,
    });
    assert.equal(resolved.status, "applied");
    assert.equal(resolved.appliedInfluence, "indian-english");
    assert.match(resolved.rulesetSha256 ?? "", /^[a-f0-9]{64}$/u);
  });

  it("uses the shared Accent Map identity as Local's fallback authority", () => {
    const engine = resolveLocalVoiceEngine({
      preference: "instant",
      calibration: calibration(),
      runtimeHealthy: true,
      speechprintActive: true,
    });
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      accentDefinitionId: "german-influenced-english",
      pronunciationBase: "en-US" as const,
      speechprintInfluence: "italian-influenced-english" as const,
    };
    const pronunciation = resolveLocalVoicePronunciation({
      profile,
      localEngine: engine,
      usingSystemVoice: false,
    });
    const speechprint = resolveLocalVoiceSpeechprint({
      profile,
      localEngine: engine,
      usingSystemVoice: false,
      pronunciation,
    });
    assert.equal(speechprint.requestedInfluence, "german-influenced-english");
    assert.equal(speechprint.appliedInfluence, "german-influenced-english");
  });

  it("bypasses Local Accent Map pronunciation and Speechprint when disabled", () => {
    const engine = resolveLocalVoiceEngine({
      preference: "instant",
      calibration: calibration(),
      runtimeHealthy: true,
      speechprintActive: true,
    });
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      accentPronunciationEnabled: false,
      accentDefinitionId: "german-influenced-english",
      pronunciationBase: "en-GB" as const,
      speechprintInfluence: "german-influenced-english" as const,
    };
    const pronunciation = resolveLocalVoicePronunciation({
      profile,
      localEngine: engine,
      usingSystemVoice: false,
    });
    const speechprint = resolveLocalVoiceSpeechprint({
      profile,
      localEngine: engine,
      usingSystemVoice: false,
      pronunciation,
    });
    assert.equal(pronunciation.status, "natural");
    assert.equal(pronunciation.requestedBase, "follow-voice");
    assert.equal(speechprint.requestedInfluence, "none");
    assert.equal(speechprint.status, "natural");
  });

  it("routes a cross-accent pronunciation through Instant before Speechprints", () => {
    const engine = resolveLocalVoiceEngine({
      preference: "auto",
      calibration: calibration(),
      runtimeHealthy: true,
      pronunciationOverrideActive: true,
    });
    assert.equal(engine.resolved, "instant");
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-1" as const,
      accentLocale: "en-US",
      pronunciationBase: "en-GB" as const,
      speechprintInfluence: "spanish-influenced-english" as const,
    };
    const pronunciation = resolveLocalVoicePronunciation({
      profile,
      localEngine: engine,
      usingSystemVoice: false,
    });
    assert.deepEqual(pronunciation, {
      requestedBase: "en-GB",
      sourceLocale: "en-US",
      resolvedBaseLocale: "en-GB",
      status: "applied",
      reason: null,
    });
    assert.equal(
      resolveLocalVoiceSpeechprint({
        profile,
        localEngine: engine,
        usingSystemVoice: false,
        pronunciation,
      }).baseLocale,
      "en-GB",
    );
  });

  it("suspends a cross-accent pronunciation for Voice+ and system voices", () => {
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      pronunciationBase: "en-GB" as const,
    };
    assert.equal(
      resolveLocalVoicePronunciation({
        profile,
        localEngine: resolveLocalVoiceEngine({
          preference: "voice-plus",
          calibration: calibration(),
          runtimeHealthy: true,
          pronunciationOverrideActive: true,
        }),
        usingSystemVoice: false,
      }).reason,
      "engine-unsupported",
    );
    assert.equal(
      resolveLocalVoicePronunciation({
        profile,
        localEngine: resolveLocalVoiceEngine({
          preference: "auto",
          calibration: calibration({ qualified: false }),
          runtimeHealthy: true,
          pronunciationOverrideActive: true,
        }),
        usingSystemVoice: true,
      }).reason,
      "system-voice",
    );
  });

  it("visibly suspends Speechprints for Voice+ and system voices", () => {
    const voicePlus = resolveLocalVoiceEngine({
      preference: "voice-plus",
      calibration: calibration(),
      runtimeHealthy: true,
      speechprintActive: true,
    });
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      speechprintInfluence: "mandarin-influenced-english" as const,
    };
    assert.deepEqual(
      resolveLocalVoiceSpeechprint({
        profile,
        localEngine: voicePlus,
        usingSystemVoice: false,
      }).reason,
      "engine-unsupported",
    );
    assert.deepEqual(
      resolveLocalVoiceSpeechprint({
        profile,
        localEngine: {
          requested: "auto",
          resolved: "instant",
          fallback: false,
          notice: null,
        },
        usingSystemVoice: true,
      }).reason,
      "system-voice",
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
