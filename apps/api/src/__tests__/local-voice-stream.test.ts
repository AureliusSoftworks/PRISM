import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  splitLocalVoiceStreamSegments,
  splitLocalVoiceStreamText,
} from "../local-voice-stream.ts";

describe("local voice streaming chunks", () => {
  it("cuts at every comma and period so Kokoro cannot invent mid-clause pauses", () => {
    const text =
      "The sponges, they are red and blue. Not green and white.";
    assert.deepEqual(splitLocalVoiceStreamText(text), [
      "The sponges,",
      "they are red and blue.",
      "Not green and white.",
    ]);
  });

  it("preserves the complete utterance while yielding punctuated clauses", () => {
    const text =
      "Oh! Oh, okay, good—sorry, I was watching you for a second there and I could not tell if you were laughing with me or at me. It is usually at me, so that is an occupational hazard.";
    const chunks = splitLocalVoiceStreamText(text);

    assert.equal(chunks.join(" "), text);
    assert.ok(chunks.length >= 4);
    assert.equal(chunks[0], "Oh!");
    assert.equal(chunks[1], "Oh,");
    assert.equal(chunks[2], "okay,");
    assert.ok(
      chunks.every((chunk) => chunk.split(/\s+/u).length <= 80),
    );
  });

  it("handles empty, short, and punctuation-light speech", () => {
    assert.deepEqual(splitLocalVoiceStreamText("  "), []);
    assert.deepEqual(splitLocalVoiceStreamText("Hello there."), ["Hello there."]);
    const long = splitLocalVoiceStreamText("word ".repeat(160));
    assert.ok(long.length > 1);
    assert.equal(long.join(" "), "word ".repeat(160).trim());
    assert.ok(long.every((chunk) => chunk.split(/\s+/u).length <= 80));
  });

  it("keeps complete sentences as their own synthesis clauses", () => {
    const sentence = (index: number) =>
      `Sentence ${index} carries enough context to preserve a natural speaking cadence across the local synthesis pipeline.`;
    const text = Array.from({ length: 9 }, (_, index) => sentence(index + 1)).join(" ");
    const chunks = splitLocalVoiceStreamText(text);
    assert.equal(chunks.join(" "), text);
    assert.equal(chunks.length, 9);
    assert.ok(chunks.every((chunk) => /\.$/u.test(chunk)));
  });

  it("treats mid-utterance commas as hard synthesis boundaries", () => {
    const text =
      "After the opening settles into place, the next spoken clause keeps enough steady words to finally cross the clause threshold, then another clause continues with still more spoken detail for the local voice stream to carry forward.";
    const chunks = splitLocalVoiceStreamText(text);
    assert.equal(chunks.join(" "), text);
    assert.deepEqual(chunks, [
      "After the opening settles into place,",
      "the next spoken clause keeps enough steady words to finally cross the clause threshold,",
      "then another clause continues with still more spoken detail for the local voice stream to carry forward.",
    ]);
  });

  it("keeps exact canonical source ranges for interruption and replay", () => {
    const text = "  First phrase,   then the second phrase keeps going.";
    const segments = splitLocalVoiceStreamSegments(text, 40);
    assert.deepEqual(
      segments.map((segment) => text.slice(
        segment.sourceStart - 40,
        segment.sourceEnd - 40,
      ).replace(/\s+/gu, " ")),
      segments.map((segment) => segment.text),
    );
    assert.equal(segments.length, 2);
    assert.equal(segments[0]?.text, "First phrase,");
  });
});
