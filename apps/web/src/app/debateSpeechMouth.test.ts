import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_MOUTH_PAUSE_CLOSE_MS,
  debateSpeechMouthShouldRest,
} from "./debateSpeechMouth.ts";

describe("Debate speech mouth rest", () => {
  it("keeps the mouth live through short clause breaths", () => {
    assert.equal(DEBATE_MOUTH_PAUSE_CLOSE_MS, 1_000);
    assert.equal(
      debateSpeechMouthShouldRest({
        lastVoiceProgressAtMs: 4_000,
        nowMs: 4_720,
      }),
      false,
    );
  });

  it("rests the mouth after a pause longer than one second", () => {
    assert.equal(
      debateSpeechMouthShouldRest({
        lastVoiceProgressAtMs: 4_000,
        nowMs: 5_000,
      }),
      true,
    );
  });

  it("does not rest before any voice progress has been heard", () => {
    assert.equal(
      debateSpeechMouthShouldRest({
        lastVoiceProgressAtMs: null,
        nowMs: 8_000,
      }),
      false,
    );
  });
});
