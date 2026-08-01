import assert from "node:assert/strict";
import test from "node:test";
import { cleanPlayerVoiceProfile, playerVoiceEngine } from "./playerVoice.ts";

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
