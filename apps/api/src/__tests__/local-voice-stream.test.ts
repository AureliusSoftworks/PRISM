import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitLocalVoiceStreamText } from "../local-voice-stream.ts";

describe("local voice streaming chunks", () => {
  it("preserves the complete utterance while yielding a short first phrase", () => {
    const text =
      "Oh! Oh, okay, good—sorry, I was watching you for a second there and I could not tell if you were laughing with me or at me. It is usually at me, so that is an occupational hazard.";
    const chunks = splitLocalVoiceStreamText(text);

    assert.equal(chunks.join(" "), text);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0], "Oh! Oh, okay,");
    assert.ok(chunks[0]!.split(/\s+/u).length <= 12);
    assert.ok(
      chunks.slice(1).every((chunk) => chunk.split(/\s+/u).length <= 80),
    );
  });

  it("handles empty, short, and punctuation-light speech", () => {
    assert.deepEqual(splitLocalVoiceStreamText("  "), []);
    assert.deepEqual(splitLocalVoiceStreamText("Hello there."), ["Hello there."]);
    const long = splitLocalVoiceStreamText("word ".repeat(80));
    assert.ok(long.length > 1);
    assert.equal(long.join(" "), "word ".repeat(80).trim());
    assert.ok(long.slice(1, -1).every((chunk) => chunk.split(/\s+/u).length >= 20));
  });

  it("keeps complete sentences together after the latency-first phrase", () => {
    const sentence = (index: number) =>
      `Sentence ${index} carries enough context to preserve a natural speaking cadence across the local synthesis pipeline.`;
    const text = Array.from({ length: 9 }, (_, index) => sentence(index + 1)).join(" ");
    const chunks = splitLocalVoiceStreamText(text);
    assert.equal(chunks.join(" "), text);
    assert.ok(chunks.length >= 3);
    assert.ok(chunks.slice(1).every((chunk) => chunk.split(/\s+/u).length <= 80));
  });
});
