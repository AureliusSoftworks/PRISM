import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import { applyOfflineVoiceSelection } from "./offlineVoiceSelection.ts";
import {
  cleanPlayerVoiceProfile,
  playerLocalVoiceProfile,
  playerPremiumVoiceId,
  playerVoiceEngine,
  resolvePlayerVoicePlayback,
  selectPlayerPremiumVoice,
} from "./playerVoice.ts";

test("player voice preserves identity but removes every bot performance filter", () => {
  const clean = cleanPlayerVoiceProfile({
    v: 2,
    enabled: false,
    baseVoiceId: "voice-7",
    systemVoiceName: "Samantha",
    elevenLabsVoiceId: "premium-player",
    elevenLabsEffect: "chorus",
    elevenLabsDirection: "hushed, theatrical",
    pitch: 0.8,
    warmth: -0.5,
    pace: 0.4,
    lilt: 0.9,
    bottishTone: 1,
    eqTilt: 0.7,
    gainDb: 5,
    volume: 0.3,
    texture: {
      preset: "damaged-speaker",
      amount: 1,
      bandwidth: 1,
      noise: 1,
      instability: 1,
      distortion: 1,
      damage: 1,
    },
    avatarSfx: {
      v: 1,
      source: "upload",
      audioDataUrl: "data:audio/mpeg;base64,AAAA",
      playWhileTalking: true,
      playWhileIdle: true,
      playWhileThinking: true,
      volume: 1,
    },
  });

  assert.equal(clean.enabled, true);
  assert.equal(clean.baseVoiceId, "voice-7");
  assert.equal(clean.systemVoiceName, "Samantha");
  assert.equal(clean.elevenLabsVoiceId, "premium-player");
  assert.equal(clean.elevenLabsEffect, "clean");
  assert.equal(clean.voiceEffectExplicit, true);
  assert.equal(clean.elevenLabsDirection, undefined);
  assert.deepEqual(
    [clean.pitch, clean.warmth, clean.pace, clean.lilt, clean.bottishTone],
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual([clean.eqTilt, clean.gainDb, clean.volume], [0, 0, 1]);
  assert.equal(clean.texture.preset, "clean");
  assert.equal(clean.avatarSfx, undefined);
  assert.equal(clean.avatarSfxMuted, true);
  assert.equal(playerVoiceEngine(clean), "elevenlabs");
});

test("a local player identity always selects the builtin route", () => {
  assert.equal(
    playerVoiceEngine({
      v: 1,
      baseVoiceId: "voice-3",
      pitch: 0,
      warmth: 0,
      pace: 0,
      lilt: 0,
      signal: 0,
    }),
    "builtin",
  );
});

test("player Premium and local fallback identities remain independent", () => {
  const profile = cleanPlayerVoiceProfile({
    ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    v: 2,
    baseVoiceId: "voice-7",
    systemVoiceName: "Samantha",
    elevenLabsVoiceId: "premium-player",
    elevenLabsNativeAccentHint: "german germany",
  });

  assert.equal(playerPremiumVoiceId(profile), "premium-player");
  const local = playerLocalVoiceProfile(profile);
  assert.equal(local.baseVoiceId, "voice-7");
  assert.equal(local.systemVoiceName, "Samantha");
  assert.equal(local.elevenLabsVoiceId, undefined);
  assert.equal(local.elevenLabsVoiceIdOverride, undefined);
  assert.equal(playerVoiceEngine(local), "builtin");

  const changedLocal = cleanPlayerVoiceProfile(
    applyOfflineVoiceSelection(profile, "builtin:voice-3"),
  );
  assert.equal(changedLocal.baseVoiceId, "voice-3");
  assert.equal(playerPremiumVoiceId(changedLocal), "premium-player");

  const changedPremium = selectPlayerPremiumVoice(profile, "premium-two");
  assert.equal(playerPremiumVoiceId(changedPremium), "premium-two");
  assert.equal(changedPremium.baseVoiceId, "voice-7");
  assert.equal(changedPremium.systemVoiceName, "Samantha");
  assert.equal(changedPremium.elevenLabsNativeAccentHint, undefined);
});

test("top speech type selects the matching clean player identity", () => {
  const profile = cleanPlayerVoiceProfile({
    ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    v: 2,
    baseVoiceId: "voice-3",
    elevenLabsVoiceId: "premium-player",
  });
  const premium = resolvePlayerVoicePlayback({
    profile,
    voiceMode: "english",
    englishVoiceEngine: "elevenlabs",
    localOnly: false,
  });
  assert.equal(premium.engine, "elevenlabs");
  assert.equal(playerPremiumVoiceId(premium.profile), "premium-player");

  const english = resolvePlayerVoicePlayback({
    profile,
    voiceMode: "english",
    englishVoiceEngine: "builtin",
    localOnly: false,
  });
  assert.equal(english.engine, "builtin");
  assert.equal(english.profile.baseVoiceId, "voice-3");
  assert.equal(playerPremiumVoiceId(english.profile), null);

  const localPremium = resolvePlayerVoicePlayback({
    profile,
    voiceMode: "english",
    englishVoiceEngine: "elevenlabs",
    localOnly: true,
  });
  assert.equal(localPremium.engine, "builtin");
  assert.equal(localPremium.profile.baseVoiceId, "voice-3");

  const bottish = resolvePlayerVoicePlayback({
    profile,
    voiceMode: "bottish",
    englishVoiceEngine: "elevenlabs",
    localOnly: false,
  });
  assert.equal(bottish.engine, "builtin");
  assert.equal(bottish.profile.elevenLabsEffect, "clean");
});
