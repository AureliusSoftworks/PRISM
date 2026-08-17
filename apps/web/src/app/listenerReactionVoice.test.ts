import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_VOICE_GAIN_DB_MAX,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  DIRECTIONAL_IRRITATION_GAIN_DB_MAX,
  normalizeBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  applyDirectionalIrritationGainToProfile,
  listenerReactionVoiceCacheKey,
} from "./listenerReactionVoice.ts";

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

describe("listenerReactionVoiceCacheKey", () => {
  it("reuses ordinary Signal murmurs across kit warmup and live plans", () => {
    const profile = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1;
    const kitPlan = {
      v: 1 as const,
      name: "listenerReaction" as const,
      speakerBotId: "host",
      listenerBotId: "480fc95f379833ef0c8ec344",
      messageId: "kit",
      targetSource: "role" as const,
      visualAction: "nod" as const,
      spokenCue: "Quite so." as const,
      targetProgress: 0.5,
      seed: "signal-listener-kit:episode:guest:Quite so.",
      cameraCutEligible: false,
    };
    const livePlan = {
      ...kitPlan,
      messageId: "f6772dcc3416c458f0d79442",
      seed: "signal-listener-v1:646eaf2451a0fc6ced4fb5b2:f6772dcc3416c458f0d79442:host:guest:opening:neutral:0",
    };
    assert.equal(
      listenerReactionVoiceCacheKey({
        plan: kitPlan,
        mode: "english",
        engine: "elevenlabs",
        profile,
      }),
      listenerReactionVoiceCacheKey({
        plan: livePlan,
        mode: "english",
        engine: "elevenlabs",
        profile,
      }),
    );
  });

  it("keeps interrupt clips unique to the saved seed", () => {
    const profile = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1;
    const first = {
      v: 1 as const,
      name: "listenerReaction" as const,
      speakerBotId: "host",
      listenerBotId: "guest",
      messageId: "one",
      targetSource: "role" as const,
      visualAction: "nod" as const,
      spokenCue: "Wait a second." as const,
      interjectionAttempt: true as const,
      targetProgress: 0.5,
      seed: "interrupt-one",
      cameraCutEligible: false,
    };
    const second = { ...first, seed: "interrupt-two", messageId: "two" };
    assert.notEqual(
      listenerReactionVoiceCacheKey({
        plan: first,
        mode: "english",
        engine: "elevenlabs",
        profile,
      }),
      listenerReactionVoiceCacheKey({
        plan: second,
        mode: "english",
        engine: "elevenlabs",
        profile,
      }),
    );
  });
});
