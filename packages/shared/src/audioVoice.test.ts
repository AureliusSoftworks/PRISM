import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_VOICE_TEXTURE_RECIPES,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  botVoiceTextureIsModified,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceTexture,
  normalizeEnglishVoiceEngine,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeVoiceMode,
  parseStoredBotAudioVoiceProfileV1,
  serializeBotAudioVoiceProfileV1,
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
    assert.deepEqual(normalizeBotAudioVoiceProfileV1({ v: 1, baseVoiceId: "voice-4", pitch: 4, warmth: -4, pace: ".125", lilt: 0.2, signal: 4 }), {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      pitch: 1,
      warmth: -1,
      pace: 0.125,
      lilt: 0.2,
      bottishTone: 1,
      volume: 1,
      texture: BOT_VOICE_TEXTURE_RECIPES.clean,
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
    assert.deepEqual(
      normalizeOptionalBotAudioVoiceProfileV1(JSON.stringify({
        baseVoiceId: "voice-3",
        systemVoiceName: "Samantha",
      })),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        baseVoiceId: "voice-3",
        systemVoiceName: "Samantha",
      }
    );
  });

  it("normalizes v2 volume and texture controls", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      volume: 4,
      texture: {
        preset: "tape",
        amount: 2,
        bandwidth: -1,
        noise: 0.2,
        instability: 0.3,
        distortion: 0.4,
        damage: 0.5,
      },
    });
    assert.equal(profile.volume, 1.25);
    assert.deepEqual(profile.texture, {
      preset: "tape",
      amount: 1,
      bandwidth: 0,
      noise: 0.2,
      instability: 0.3,
      distortion: 0.4,
      damage: 0.5,
    });
  });

  it("keeps provider-specific voice selections independent", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "  Alex  ",
      elevenLabsVoiceId: " eleven-voice-id ",
    });
    assert.equal(profile.systemVoiceName, "Alex");
    assert.equal(profile.elevenLabsVoiceId, "eleven-voice-id");
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile
    );
  });

  it("detects modified texture recipes and restores canonical defaults", () => {
    assert.equal(botVoiceTextureIsModified({ ...BOT_VOICE_TEXTURE_RECIPES.lofi }), false);
    assert.equal(botVoiceTextureIsModified({ ...BOT_VOICE_TEXTURE_RECIPES.lofi, noise: 0.4 }), true);
    assert.deepEqual(normalizeBotVoiceTexture({ preset: "crt-speaker" }), BOT_VOICE_TEXTURE_RECIPES["crt-speaker"]);
  });
});
