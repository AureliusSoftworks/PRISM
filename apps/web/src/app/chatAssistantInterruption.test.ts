import assert from "node:assert/strict";
import test from "node:test";

import { interruptedAssistantAudibleSnippet } from "./chatAssistantInterruption.ts";

test("cuts a structured local speech segment at its current audible source cursor", () => {
  assert.equal(
    interruptedAssistantAudibleSnippet({
      displayText: "The quick brown fox",
      visibleTokenCount: 4,
      sourceClock: {
        sourceText: "The quick brown fox",
        elapsedMs: 800,
        segment: {
          sourceStart: 0,
          sourceEnd: 15,
          startMs: 0,
          endMs: 1_000,
          heard: true,
        },
      },
    }),
    "The quick br—",
  );
});

test("uses provider character alignment without revealing the unheard suffix", () => {
  assert.equal(
    interruptedAssistantAudibleSnippet({
      displayText: "The quick brown fox",
      visibleTokenCount: 4,
      timeline: {
        tokenSignature: "The quick brown fox",
        revealAtMs: [0, 300, 600, 900],
        durationMs: 1_200,
        elapsedMs: 825,
        phase: "playing",
        visiblePrefixTokenCount: 0,
        totalTokenCount: 4,
        finalSegment: true,
        speechActivityWindows: null,
        alignment: {
          characters: Array.from("The quick brown fox"),
          characterStartTimesSeconds: Array.from(
            { length: 19 },
            (_, index) => index * 0.06,
          ),
          characterEndTimesSeconds: Array.from(
            { length: 19 },
            (_, index) => (index + 1) * 0.06,
          ),
        },
      },
    }),
    "The quick brow—",
  );
});

test("returns no fragment before audio starts and never forces a first token", () => {
  assert.equal(
    interruptedAssistantAudibleSnippet({
      displayText: "Nothing has been heard",
      visibleTokenCount: 0,
      timeline: {
        tokenSignature: "Nothing has been heard",
        revealAtMs: [],
        durationMs: 0,
        elapsedMs: 0,
        phase: "preparing",
        speechActivityWindows: null,
        alignment: null,
      },
    }),
    "",
  );
});

test("does not count an aligned character whose timestamp starts at zero before playback", () => {
  assert.equal(
    interruptedAssistantAudibleSnippet({
      displayText: "Nothing has been heard",
      visibleTokenCount: 1,
      timeline: {
        tokenSignature: "Nothing has been heard",
        revealAtMs: [0, 300, 600, 900],
        durationMs: 1_200,
        elapsedMs: 0,
        phase: "playing",
        visiblePrefixTokenCount: 0,
        totalTokenCount: 4,
        finalSegment: true,
        speechActivityWindows: null,
        alignment: {
          characters: Array.from("Nothing has been heard"),
          characterStartTimesSeconds: Array.from(
            { length: 22 },
            (_, index) => index * 0.05,
          ),
          characterEndTimesSeconds: Array.from(
            { length: 22 },
            (_, index) => (index + 1) * 0.05,
          ),
        },
      },
    }),
    "",
  );
});

test("keeps only an already-heard phrase prefix while the next phrase prepares", () => {
  assert.equal(
    interruptedAssistantAudibleSnippet({
      displayText: "Already heard next phrase",
      visibleTokenCount: 4,
      timeline: {
        tokenSignature: "Already heard next phrase",
        revealAtMs: [],
        durationMs: 0,
        elapsedMs: 0,
        phase: "preparing",
        visiblePrefixTokenCount: 2,
        totalTokenCount: 4,
        finalSegment: false,
        speechActivityWindows: null,
        alignment: null,
      },
    }),
    "Already heard—",
  );
});

test("keeps completed visible words intact when no acoustic metadata exists", () => {
  assert.equal(
    interruptedAssistantAudibleSnippet({
      displayText: "One whole word remains hidden",
      visibleTokenCount: 3,
    }),
    "One whole word—",
  );
});
