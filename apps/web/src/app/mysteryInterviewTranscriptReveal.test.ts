import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mysteryInterviewTranscriptVisibleText } from "./mysteryInterviewTranscriptReveal.ts";

describe("Whodunnit interview transcript reveal", () => {
  it("withholds every character until its exact audio-clock end mark", () => {
    const text = "Hi there";
    const alignment = {
      characters: Array.from(text),
      characterStartTimesSeconds: [0, 0.1, 0.2, 0.25, 0.5, 0.6, 0.7, 0.8],
      characterEndTimesSeconds: [0.1, 0.2, 0.25, 0.3, 0.6, 0.7, 0.8, 1],
    };

    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 0, durationMs: 1_000, alignment }), "");
    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 199, durationMs: 1_000, alignment }), "H");
    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 200, durationMs: 1_000, alignment }), "Hi");
    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 899, durationMs: 1_000, alignment }), "Hi ther");
    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 1_000, durationMs: 1_000, alignment }), text);
  });

  it("streams from audible playback progress when exact timing is unavailable", () => {
    const text = "Do not guess.";
    assert.equal(mysteryInterviewTranscriptVisibleText({
      text,
      elapsedMs: 0,
      durationMs: 1_000,
      alignment: null,
    }), "");
    assert.equal(mysteryInterviewTranscriptVisibleText({
      text,
      elapsedMs: 500,
      durationMs: 1_000,
      alignment: null,
    }), "Do not");
    assert.equal(mysteryInterviewTranscriptVisibleText({
      text,
      elapsedMs: 1_000,
      durationMs: 1_000,
      alignment: null,
    }), text);
  });

  it("falls back to playback progress when provider timing is malformed", () => {
    const text = "Do not guess.";
    assert.equal(mysteryInterviewTranscriptVisibleText({
      text,
      elapsedMs: 500,
      durationMs: 1_000,
      alignment: {
        characters: Array.from(text),
        characterStartTimesSeconds: [0],
        characterEndTimesSeconds: [1],
      },
    }), "Do not");
  });

  it("uses the decoded audio clock when the provider supplies an offset", () => {
    const text = "OK";
    const alignment = {
      characters: Array.from(text),
      characterStartTimesSeconds: [0, 0.1],
      characterEndTimesSeconds: [0.1, 0.2],
      audioTimelineOffsetSeconds: 0.5,
    };

    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 599, durationMs: 900, alignment }), "");
    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 600, durationMs: 900, alignment }), "O");
    assert.equal(mysteryInterviewTranscriptVisibleText({ text, elapsedMs: 700, durationMs: 900, alignment }), text);
  });
});
