import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearZenProgressiveVoiceSegmentsForTests,
  readZenProgressiveVoiceSegment,
  registerZenProgressiveVoiceSegment,
} from "../zen-progressive-voice.ts";

describe("Zen progressive voice segment authority", () => {
  it("scopes segment text and provider truth to the authenticated user", () => {
    clearZenProgressiveVoiceSegmentsForTests();
    const segment = registerZenProgressiveVoiceSegment({
      userId: "user-a",
      text: "A complete spoken beat.",
      provider: "openai",
      botId: "bot-a",
      moodKey: "warm",
      nowMs: 1_000,
    });
    assert.equal(
      readZenProgressiveVoiceSegment("user-a", segment.id, 1_001)?.text,
      "A complete spoken beat.",
    );
    assert.equal(
      readZenProgressiveVoiceSegment("user-b", segment.id, 1_001),
      null,
    );
  });

  it("expires request-scoped segments", () => {
    clearZenProgressiveVoiceSegmentsForTests();
    const segment = registerZenProgressiveVoiceSegment({
      userId: "user-a",
      text: "Temporary.",
      provider: "local",
      botId: null,
      moodKey: "neutral",
      nowMs: 1_000,
    });
    assert.equal(
      readZenProgressiveVoiceSegment(
        "user-a",
        segment.id,
        1_000 + 5 * 60_000 + 1,
      ),
      null,
    );
  });
});

