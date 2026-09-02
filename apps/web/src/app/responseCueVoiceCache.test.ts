import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  purgeResponseCueVoiceClipsForOwner,
  readResponseCueVoiceClip,
  responseCueVoiceCacheKey,
  storeResponseCueVoiceClip,
} from "./responseCueVoiceCache.ts";

test("response cue cache invalidates on voice, engine, phrase, and delivery edits", () => {
  const base = {
    ownerId: "owner-a",
    botId: "bot",
    voiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    engine: "built-in",
    phrase: "…Okay, then.",
    deliverySettings: { mood: "neutral" },
  };
  const key = responseCueVoiceCacheKey(base);
  assert.notEqual(
    key,
    responseCueVoiceCacheKey({ ...base, ownerId: "owner-b" }),
  );
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

test("response cue clips with the same logical key remain owner-isolated", async () => {
  await storeResponseCueVoiceClip("cue-owner-a", "same-key", {
    bytes: Uint8Array.from([1, 2, 3]).buffer,
    alignment: null,
    audioContentType: "audio/wav",
    engineUsed: "owner-a-engine",
  });
  await storeResponseCueVoiceClip("cue-owner-b", "same-key", {
    bytes: Uint8Array.from([7, 8, 9]).buffer,
    alignment: null,
    audioContentType: "audio/wav",
    engineUsed: "owner-b-engine",
  });
  const ownerA = await readResponseCueVoiceClip("cue-owner-a", "same-key");
  const ownerB = await readResponseCueVoiceClip("cue-owner-b", "same-key");
  assert.equal(ownerA?.engineUsed, "owner-a-engine");
  assert.equal(ownerB?.engineUsed, "owner-b-engine");
  assert.deepEqual([...new Uint8Array(ownerA!.bytes)], [1, 2, 3]);
  assert.deepEqual([...new Uint8Array(ownerB!.bytes)], [7, 8, 9]);
  assert.equal(
    await readResponseCueVoiceClip("cue-owner-c", "same-key"),
    null,
  );

  await purgeResponseCueVoiceClipsForOwner("cue-owner-a");
  assert.equal(await readResponseCueVoiceClip("cue-owner-a", "same-key"), null);
  assert.equal(
    (await readResponseCueVoiceClip("cue-owner-b", "same-key"))?.engineUsed,
    "owner-b-engine",
  );
});
