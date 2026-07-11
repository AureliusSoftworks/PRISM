import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEnglishVoicePostProcessing } from "./englishVoice.ts";

describe("English voice post processing", () => {
  it("maps pitch and warmth without changing portable profile semantics", () => {
    assert.deepEqual(
      resolveEnglishVoicePostProcessing({
        v: 1,
        baseVoiceId: "voice-5",
        pitch: 0.5,
        warmth: 0.5,
        pace: 0,
        lilt: 0,
      }),
      { detuneCents: 325, lowpassHz: 4650, gain: 0.94 }
    );
  });
});
