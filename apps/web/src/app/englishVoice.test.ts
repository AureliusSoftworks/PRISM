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
      { detuneCents: 325, lowpassHz: 13000, gain: 0.94 }
    );
  });

  it("keeps neutral speech spectrally transparent", () => {
    const processing = resolveEnglishVoicePostProcessing({
      v: 1,
      baseVoiceId: "voice-1",
      pitch: 0,
      warmth: 0,
      pace: 0,
      lilt: 0,
    });
    assert.equal(processing.lowpassHz, 16000);
  });
});
