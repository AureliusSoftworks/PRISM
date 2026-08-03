import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import { responseCueVoiceCacheKey } from "./responseCueVoiceCache.ts";

test("response cue cache invalidates on voice, engine, phrase, and delivery edits", () => {
  const base = {
    botId: "bot",
    voiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    engine: "built-in",
    phrase: "…Okay, then.",
    deliverySettings: { mood: "neutral" },
  };
  const key = responseCueVoiceCacheKey(base);
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({ ...base, phrase: "Let me see…" }),
  );
  assert.match(key, /speechprintRuleset/u);
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({
      ...base,
      voiceProfile: {
        ...base.voiceProfile,
        pronunciationBase: "en-GB",
      },
    }),
  );
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({
      ...base,
      voiceProfile: {
        ...base.voiceProfile,
        speechprintInfluence: "spanish-influenced-english",
        speechprintStrength: "light",
        speechprintVariationSeed: "bot-seed",
      },
    }),
  );
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({ ...base, engine: "elevenlabs" }),
  );
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({
      ...base,
      voiceProfile: { ...base.voiceProfile, pace: 0.2 },
    }),
  );
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({
      ...base,
      deliverySettings: { mood: "guarded" },
    }),
  );
});
