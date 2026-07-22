import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitLocalVoiceStreamText } from "../local-voice-stream.ts";

describe("local voice streaming chunks", () => {
  it("preserves the complete utterance while yielding a short first phrase", () => {
    const text =
      "Oh! Oh, okay, good—sorry, I was watching you for a second there and I could not tell if you were laughing with me or at me. It is usually at me, so that is an occupational hazard.";
    const chunks = splitLocalVoiceStreamText(text);

    assert.equal(chunks.join(" "), text);
    assert.ok(chunks.length >= 3);
    assert.equal(chunks[0], "Oh! Oh, okay, good—sorry,");
    assert.ok(chunks[0]!.length <= 32);
    assert.ok(chunks.every((chunk) => chunk.length <= 80));
  });

  it("handles empty, short, and punctuation-light speech", () => {
    assert.deepEqual(splitLocalVoiceStreamText("  "), []);
    assert.deepEqual(splitLocalVoiceStreamText("Hello there."), ["Hello there."]);
    const long = splitLocalVoiceStreamText("word ".repeat(80));
    assert.ok(long.length > 1);
    assert.equal(long.join(" "), "word ".repeat(80).trim());
  });
});
