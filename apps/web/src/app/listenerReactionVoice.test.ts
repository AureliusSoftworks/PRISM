import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_VOICE_GAIN_DB_MAX,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  DIRECTIONAL_IRRITATION_GAIN_DB_MAX,
  normalizeBotAudioVoiceProfileV1,
} from "@localai/shared";
import { applyDirectionalIrritationGainToProfile } from "./listenerReactionVoice.ts";

describe("applyDirectionalIrritationGainToProfile", () => {
  it("raises gain temporarily without mutating the source profile", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      gainDb: 1,
    });
    const boosted = applyDirectionalIrritationGainToProfile(profile, 1.2);
    assert.equal(profile.gainDb, 1);
    assert.equal(boosted.gainDb, 2.2);
    assert.notEqual(boosted, profile);
  });

  it("clamps boost to irritation max and profile max", () => {
    const nearCeiling = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      gainDb: BOT_VOICE_GAIN_DB_MAX - 0.2,
    });
    assert.equal(
      applyDirectionalIrritationGainToProfile(
        nearCeiling,
        DIRECTIONAL_IRRITATION_GAIN_DB_MAX + 3,
      ).gainDb,
      BOT_VOICE_GAIN_DB_MAX,
    );
    assert.equal(
      applyDirectionalIrritationGainToProfile(nearCeiling, 0).gainDb,
      nearCeiling.gainDb,
    );
    assert.equal(
      applyDirectionalIrritationGainToProfile(nearCeiling, null).gainDb,
      nearCeiling.gainDb,
    );
  });
});
