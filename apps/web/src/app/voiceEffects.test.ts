import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, botVoiceTextureForPreset } from "@localai/shared";
import {
  VOICE_LILT_DEPTH_CENTS,
  buildVoiceDamageSchedule,
  resolveVoiceTexture,
  voiceLiltDetuneCents,
} from "./voiceEffects.ts";

describe("voice textures", () => {
  it("treats retired CRT texture profiles as clean", () => {
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      volume: 1.2,
      texture: { ...botVoiceTextureForPreset("crt-speaker"), amount: 0.5 },
    };
    assert.deepEqual(resolveVoiceTexture(profile), {
      bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
    });
    assert.deepEqual(resolveVoiceTexture(profile, false), {
      bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
    });
  });

  it("treats retired Lo-Fi and Tape profiles as clean", () => {
    for (const preset of ["lofi", "tape"] as const) {
      assert.deepEqual(resolveVoiceTexture({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        texture: botVoiceTextureForPreset(preset),
      }), {
        bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
      });
    }
  });

  it("builds deterministic seeded damage schedules", () => {
    const first = buildVoiceDamageSchedule("message-1:bot-2", 4200, 0.7);
    assert.deepEqual(first, buildVoiceDamageSchedule("message-1:bot-2", 4200, 0.7));
    assert.notDeepEqual(first, buildVoiceDamageSchedule("message-2:bot-2", 4200, 0.7));
    assert.ok(first.every((event) => event.atMs >= 0 && event.atMs < 4200));
  });
});

describe("voice performance", () => {
  it("gives Lilt an audible pitch contour while keeping neutral speech still", () => {
    assert.equal(voiceLiltDetuneCents(0, 0.3), 0);
    assert.ok(Math.abs(voiceLiltDetuneCents(1, 0.3)) > 100);
    assert.ok(Math.abs(voiceLiltDetuneCents(-1, 0.3)) > 100);
    assert.equal(VOICE_LILT_DEPTH_CENTS, 120);
  });
});
