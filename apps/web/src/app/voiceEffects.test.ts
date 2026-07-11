import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, botVoiceTextureForPreset } from "@localai/shared";
import { buildVoiceDamageSchedule, resolveVoiceTexture } from "./voiceEffects.ts";

describe("voice textures", () => {
  it("scales texture controls by Amount and bypasses texture only", () => {
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      volume: 1.2,
      texture: { ...botVoiceTextureForPreset("lofi"), amount: 0.5 },
    };
    assert.deepEqual(resolveVoiceTexture(profile), {
      bandwidth: 0.725,
      noise: 0.075,
      instability: 0.04,
      distortion: 0.125,
      damage: 0.05,
    });
    assert.deepEqual(resolveVoiceTexture(profile, false), {
      bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
    });
  });

  it("builds deterministic seeded damage schedules", () => {
    const first = buildVoiceDamageSchedule("message-1:bot-2", 4200, 0.7);
    assert.deepEqual(first, buildVoiceDamageSchedule("message-1:bot-2", 4200, 0.7));
    assert.notDeepEqual(first, buildVoiceDamageSchedule("message-2:bot-2", 4200, 0.7));
    assert.ok(first.every((event) => event.atMs >= 0 && event.atMs < 4200));
  });
});
