import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_VOICE_TEXTURE_RECIPES,
  BOT_VOICE_EQ_TILT_DB_MAX,
  BOT_AVATAR_SFX_MAX_BYTES,
  ELEVENLABS_VOICE_DIRECTION_BY_MOOD,
  VOICE_DELIVERY_RATE_BY_MOOD,
  applyVoiceDeliveryMoodToProfile,
  applyBotNamePronunciations,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  DEFAULT_VOICE_EFFECT,
  VOICE_EFFECT_DESCRIPTIONS,
  VOICE_EFFECT_LABELS,
  botVoiceTextureIsModified,
  elevenLabsVoiceDirectionForMood,
  expectedVoicePlaybackDurationMs,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAvatarSfxV1,
  normalizeBotNamePronunciation,
  normalizeBotVoiceTexture,
  normalizeEnglishVoiceEngine,
  normalizeElevenLabsVoiceDirection,
  normalizeElevenLabsVoiceEffect,
  normalizeVoiceEffect,
  normalizeOptionalBotAudioVoiceProfileV1,
  resolveBotAudioVoiceProfileV1,
  normalizeVoiceMode,
  resolveVoicePlaybackTransform,
  resolveBotVoiceCharacter,
  parseStoredBotAudioVoiceProfileV1,
  serializeBotAudioVoiceProfileV1,
} from "./audioVoice.ts";

describe("audio voice normalization", () => {
  it("normalizes and applies bot name pronunciations without changing visible-name boundaries", () => {
    assert.equal(normalizeBotNamePronunciation("  Light   Yah-gah-mee  "), "Light Yah-gah-mee");
    assert.equal(
      applyBotNamePronunciations(
        "Light Yagami asked Light for help; Yagamilight stays written.",
        [
          { name: "Light", namePronunciation: "Lite" },
          { name: "Light Yagami", name_pronunciation: "Light Yah-gah-mee" },
        ],
      ),
      "Light Yah-gah-mee asked Lite for help; Yagamilight stays written.",
    );
  });

  it("uses self-referral only for the speaking bot and falls back to its written name", () => {
    const entries = [
      {
        id: "icarus",
        name: "Dr. Icarus",
        namePronunciation: "Doctor Eye-car-us",
        selfReferral: "Icarus",
      },
      {
        id: "light",
        name: "Light Yagami",
        namePronunciation: "Light Yah-gah-mee",
      },
    ];
    assert.equal(
      applyBotNamePronunciations(
        "Dr. Icarus asked Light Yagami for help.",
        entries,
        "icarus",
      ),
      "Icarus asked Light Yah-gah-mee for help.",
    );
    assert.equal(
      applyBotNamePronunciations(
        "Dr. Icarus asked Light Yagami for help.",
        [{ ...entries[0], selfReferral: "   " }, entries[1]],
        "icarus",
      ),
      "Dr. Icarus asked Light Yah-gah-mee for help.",
    );
  });

  it("keeps only supported modes and engines", () => {
    assert.equal(normalizeVoiceMode("english"), "english");
    assert.equal(normalizeVoiceMode("babble"), "babble");
    assert.equal(normalizeVoiceMode("bottish"), "bottish");
    assert.equal(normalizeVoiceMode("robot"), "mute");
    assert.equal(normalizeEnglishVoiceEngine("elevenlabs"), "elevenlabs");
    assert.equal(normalizeEnglishVoiceEngine("remote"), "builtin");
  });

  it("layers a bounded app-wide mood rate over the authored voice pace", () => {
    assert.deepEqual(VOICE_DELIVERY_RATE_BY_MOOD, {
      joyful: 1.18,
      warm: 1.12,
      neutral: 1.08,
      guarded: 1,
      strained: 0.94,
    });
    assert.equal(
      applyVoiceDeliveryMoodToProfile(
        { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
        "joyful",
      ).pace,
      0.75,
    );
    assert.equal(
      applyVoiceDeliveryMoodToProfile(
        { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
        "strained",
      ).pace,
      -0.25,
    );
    assert.equal(
      applyVoiceDeliveryMoodToProfile(
        { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 1, lilt: 0 },
        "joyful",
      ).pace,
      1,
    );
  });

  it("maps only non-neutral moods into sparse Eleven v3 directions", () => {
    assert.deepEqual(ELEVENLABS_VOICE_DIRECTION_BY_MOOD, {
      joyful: "delighted",
      warm: "warmly",
      guarded: "reserved",
      strained: "strained",
    });
    assert.equal(elevenLabsVoiceDirectionForMood("joyful"), "delighted");
    assert.equal(elevenLabsVoiceDirectionForMood("warm"), "warmly");
    assert.equal(elevenLabsVoiceDirectionForMood("guarded"), "reserved");
    assert.equal(elevenLabsVoiceDirectionForMood("strained"), "strained");
    assert.equal(elevenLabsVoiceDirectionForMood("neutral"), null);
    assert.equal(elevenLabsVoiceDirectionForMood("dramatic"), null);
    assert.equal(elevenLabsVoiceDirectionForMood(undefined), null);
  });

  it("keeps pitch independent from the single playback tempo contract", () => {
    const profile = applyVoiceDeliveryMoodToProfile(
      {
        v: 1,
        baseVoiceId: "voice-1",
        pitch: -0.75,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
      "neutral",
    );
    assert.deepEqual(resolveVoicePlaybackTransform(profile), {
      tempo: 1.08,
      pitchCents: -487,
    });
    assert.equal(
      resolveVoicePlaybackTransform({ ...profile, pitch: 1 }).tempo,
      resolveVoicePlaybackTransform({ ...profile, pitch: -1 }).tempo,
    );
    assert.equal(
      expectedVoicePlaybackDurationMs(10_000, { ...profile, pitch: 1 }),
      expectedVoicePlaybackDurationMs(10_000, { ...profile, pitch: -1 }),
    );
  });
  it("uses a deterministic portable profile and clamps controls", () => {
    assert.deepEqual(normalizeBotAudioVoiceProfileV1(undefined), DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1);
    assert.deepEqual(normalizeBotAudioVoiceProfileV1({ v: 1, baseVoiceId: "voice-4", pitch: 4, warmth: -4, pace: ".125", lilt: 0.2, signal: 4 }), {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      elevenLabsEffect: "chorus",
      pitch: 1,
      warmth: -1,
      pace: 0.125,
      lilt: 0.2,
      bottishTone: 1,
      eqTilt: 0,
      gainDb: 0,
      volume: 1,
      texture: BOT_VOICE_TEXTURE_RECIPES.clean,
    });
  });
  it("normalizes and round-trips a bounded looping avatar SFX profile", () => {
    const audioDataUrl = `data:audio/mpeg;base64,${Buffer.from("loop").toString("base64")}`;
    const avatarSfx = normalizeBotAvatarSfxV1({
      v: 99,
      source: "elevenlabs",
      audioDataUrl: `  ${audioDataUrl}  `,
      fileName: "  Soft servo loop.mp3  ",
      prompt: " soft   servo breathing ",
      playWhileTalking: true,
      playWhileIdle: false,
      playWhileThinking: true,
      volume: 4,
    });
    assert.deepEqual(avatarSfx, {
      v: 1,
      source: "elevenlabs",
      audioDataUrl,
      fileName: "Soft servo loop.mp3",
      prompt: "soft servo breathing",
      playWhileTalking: true,
      playWhileIdle: false,
      playWhileThinking: true,
      volume: 1,
    });
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      avatarSfx,
    });
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile,
    );
    assert.equal(BOT_AVATAR_SFX_MAX_BYTES, 4 * 1024 * 1024);
  });

  it("rejects non-audio and oversized avatar SFX data URLs", () => {
    assert.equal(
      normalizeBotAvatarSfxV1({
        audioDataUrl: "data:text/html;base64,PGgxPk5vPC9oMT4=",
      }),
      null,
    );
    assert.equal(
      normalizeBotAvatarSfxV1({
        audioDataUrl: `data:audio/mpeg;base64,${"A".repeat(
          Math.ceil((BOT_AVATAR_SFX_MAX_BYTES * 4) / 3) + 300,
        )}`,
      }),
      null,
    );
  });
  it("maps the Voice Character pad to coupled shelves and bounded per-bot gain", () => {
    const character = resolveBotVoiceCharacter({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      eqTilt: 0.5,
      gainDb: -30,
    });
    assert.equal(BOT_VOICE_EQ_TILT_DB_MAX, 6);
    assert.deepEqual(character, {
      eqTilt: 0.5,
      lowShelfDb: -3,
      highShelfDb: 3,
      gainDb: -12,
      gainMultiplier: 0.251189,
    });
    assert.deepEqual(
      resolveBotVoiceCharacter({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        eqTilt: -1,
        gainDb: 20,
      }),
      {
        eqTilt: -1,
        lowShelfDb: 6,
        highShelfDb: -6,
        gainDb: 6,
        gainMultiplier: 1.995262,
      },
    );
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

  it("keeps crafted ElevenLabs voices visible through legacy local overrides", () => {
    const authored = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceIdOverride: "crafted-voice",
      elevenLabsEffect: "deep-space",
      elevenLabsDirection: "measured, quietly menacing",
      pitch: -0.4,
    });
    const legacyOverride = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "Alex",
      pitch: 0.25,
      lilt: 0.5,
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, legacyOverride);

    assert.equal(resolved.elevenLabsVoiceIdOverride, "crafted-voice");
    assert.equal(resolved.elevenLabsEffect, "deep-space");
    assert.equal(resolved.elevenLabsDirection, "measured, quietly menacing");
    assert.equal(resolved.systemVoiceName, "Alex");
    assert.equal(resolved.pitch, 0.25);
    assert.equal(resolved.lilt, 0.5);
  });

  it("preserves a user's chosen ElevenLabs voice while filling a missing direction", () => {
    const authored = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceIdOverride: "crafted-voice",
      elevenLabsEffect: "deep-space",
      elevenLabsDirection: "patient, warm",
    });
    const customized = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceId: "my-voice",
      elevenLabsEffect: "radio",
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, customized);

    assert.equal(resolved.elevenLabsVoiceId, "my-voice");
    assert.equal(resolved.elevenLabsVoiceIdOverride, undefined);
    assert.equal(resolved.elevenLabsEffect, "radio");
    assert.equal(resolved.elevenLabsDirection, "patient, warm");
  });

  it("lets an initialized local-only override suppress an authored Premium identity", () => {
    const authored = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceIdOverride: "marketplace-voice",
      elevenLabsDirection: "bright, quick",
    });
    const localOnly = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "Alex",
      elevenLabsVoiceInitialized: true,
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, localOnly);

    assert.equal(resolved.systemVoiceName, "Alex");
    assert.equal(resolved.elevenLabsVoiceId, undefined);
    assert.equal(resolved.elevenLabsVoiceIdOverride, undefined);
    assert.equal(resolved.elevenLabsVoiceInitialized, true);
  });

  it("normalizes v2 volume and retires legacy texture controls to clean audio", () => {
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
    assert.deepEqual(profile.texture, BOT_VOICE_TEXTURE_RECIPES.clean);
  });

  it("keeps provider-specific voice selections independent", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "  Alex  ",
      elevenLabsVoiceId: " eleven-voice-id ",
      elevenLabsVoiceIdOverride: " portable-voice-id ",
      elevenLabsVoiceInitialized: true,
      elevenLabsEffect: "radio",
    });
    assert.equal(profile.systemVoiceName, "Alex");
    assert.equal(profile.elevenLabsVoiceId, "eleven-voice-id");
    assert.equal(profile.elevenLabsVoiceIdOverride, "portable-voice-id");
    assert.equal(profile.elevenLabsVoiceInitialized, true);
    assert.equal(profile.elevenLabsEffect, "radio");
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile
    );
  });

  it("presents the compatible Chorus ID as the Prism default", () => {
    assert.equal(DEFAULT_VOICE_EFFECT, "chorus");
    assert.equal(VOICE_EFFECT_LABELS.chorus, "Prism");
    assert.match(VOICE_EFFECT_DESCRIPTIONS.chorus, /PRISM/u);
    assert.equal(normalizeVoiceEffect(undefined), "chorus");
    assert.equal(normalizeVoiceEffect("clean"), "clean");
    assert.equal(normalizeVoiceEffect("resonance"), "resonance");
    assert.equal(normalizeElevenLabsVoiceEffect("robot"), "robot");
    assert.equal(normalizeElevenLabsVoiceEffect(undefined), "chorus");
    assert.equal(normalizeElevenLabsVoiceEffect("distortion"), "chorus");
    assert.equal(normalizeElevenLabsVoiceEffect("crt-speaker"), "clean");
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "clean",
      }).elevenLabsEffect,
      "chorus",
    );
    assert.deepEqual(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "clean",
        voiceEffectExplicit: true,
      }),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "clean",
        voiceEffectExplicit: true,
      },
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "deep-space",
      }).elevenLabsEffect,
      "deep-space"
    );
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "resonance",
        voiceEffectExplicit: true,
      })),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "resonance",
        voiceEffectExplicit: true,
      },
    );
  });

  it("normalizes and persists a compact ElevenLabs voice direction deck", () => {
    assert.equal(
      normalizeElevenLabsVoiceDirection(
        " warm , [hushed]; warm\nwith measured pauses, mischievously ",
      ),
      "warm, hushed, with measured pauses",
    );
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceId: "voice-id",
      elevenLabsEffect: "chorus",
      elevenLabsDirection: "warm, hushed, with measured pauses",
    });
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile,
    );
    assert.equal(profile.elevenLabsEffect, "chorus");
    assert.equal(profile.elevenLabsDirection, "warm, hushed, with measured pauses");
  });

  it("detects modified texture recipes and restores canonical defaults", () => {
    assert.equal(botVoiceTextureIsModified({ ...BOT_VOICE_TEXTURE_RECIPES.lofi }), false);
    assert.equal(botVoiceTextureIsModified({ ...BOT_VOICE_TEXTURE_RECIPES.lofi, noise: 0.4 }), true);
    assert.deepEqual(normalizeBotVoiceTexture({ preset: "crt-speaker" }), BOT_VOICE_TEXTURE_RECIPES["crt-speaker"]);
  });
});
