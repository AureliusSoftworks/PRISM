import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  normalizeBotAudioVoiceProfileV1,
  normalizeEnglishVoiceEngine,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeVoiceMode,
} from "./audioVoice.ts";

describe("audio voice normalization", () => {
  it("keeps only supported modes and engines", () => {
    assert.equal(normalizeVoiceMode("english"), "english");
    assert.equal(normalizeVoiceMode("robot"), "mute");
    assert.equal(normalizeEnglishVoiceEngine("elevenlabs"), "elevenlabs");
    assert.equal(normalizeEnglishVoiceEngine("remote"), "builtin");
  });
  it("uses a deterministic portable profile and clamps controls", () => {
    assert.deepEqual(normalizeBotAudioVoiceProfileV1(undefined), DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1);
    assert.deepEqual(normalizeBotAudioVoiceProfileV1({ v: 1, baseVoiceId: "voice-4", pitch: 4, warmth: -4, pace: ".125", lilt: 0.2 }), {
      v: 1, baseVoiceId: "voice-4", pitch: 1, warmth: -1, pace: 0.125, lilt: 0.2,
    });
  });
  it("does not turn malformed user overrides into an override", () => {
    assert.equal(normalizeOptionalBotAudioVoiceProfileV1(null), null);
    assert.equal(normalizeOptionalBotAudioVoiceProfileV1("voice-1"), null);
    assert.equal(normalizeOptionalBotAudioVoiceProfileV1({}), null);
    assert.deepEqual(
      normalizeOptionalBotAudioVoiceProfileV1({ v: 1, baseVoiceId: "voice-2" }),
      { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, baseVoiceId: "voice-2" }
    );
  });
});
