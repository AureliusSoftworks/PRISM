import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBotcastSpeechRevealSegmentTiming,
  botcastSpeechRevealIsVoicing,
  botcastSpeechRevealVisibleText,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
} from "./botcastSpeechReveal.ts";
import {
  buildSpeechActivityWindowsFromHeardSegments,
  visibleCharacterCountFromSegmentTimings,
  type SpeechSegmentTiming,
} from "./speechSegmentClock.ts";
import { speechActivityAtMs } from "./speechActivity.ts";

const SPONGES_TEXT =
  "The sponges, they are red and blue. Not green and white.";

function spongesSegments(): SpeechSegmentTiming[] {
  // Three clauses with deliberate comma/period gaps — mirrors chunked English.
  return [
    {
      kind: "speech",
      sourceStart: 0,
      sourceEnd: 12, // "The sponges,"
      startMs: 0,
      endMs: 800,
      heard: true,
    },
    {
      kind: "speech",
      sourceStart: 12,
      sourceEnd: 12,
      startMs: 800,
      endMs: 1100,
      heard: false,
    },
    {
      kind: "speech",
      sourceStart: 12,
      sourceEnd: 36, // " they are red and blue."
      startMs: 1100,
      endMs: 2200,
      heard: true,
    },
    {
      kind: "speech",
      sourceStart: 36,
      sourceEnd: 36,
      startMs: 2200,
      endMs: 2500,
      heard: false,
    },
    {
      kind: "speech",
      sourceStart: 36,
      sourceEnd: SPONGES_TEXT.length,
      startMs: 2500,
      endMs: 3400,
      heard: true,
    },
  ];
}

describe("speech segment clock — English clause gaps", () => {
  it("holds visible text through comma/period silence", () => {
    const segments = spongesSegments();
    const midCommaGap = visibleCharacterCountFromSegmentTimings(
      SPONGES_TEXT,
      segments,
      950,
    );
    assert.equal(midCommaGap, 12);
    const afterSecondClause = visibleCharacterCountFromSegmentTimings(
      SPONGES_TEXT,
      segments,
      2300,
    );
    assert.equal(afterSecondClause, 36);
    const midSecondClause = visibleCharacterCountFromSegmentTimings(
      SPONGES_TEXT,
      segments,
      1650,
    );
    assert.ok(midSecondClause > 12);
    assert.ok(midSecondClause < 36);
  });

  it("idles mouth activity during clause gaps after brief release", () => {
    const segments = spongesSegments();
    const windows = buildSpeechActivityWindowsFromHeardSegments(
      segments,
      3400,
    );
    assert.ok(windows);
    assert.equal(speechActivityAtMs(windows, 400), true);
    // Deep in the comma gap (after release tail) the mouth is closed.
    assert.equal(speechActivityAtMs(windows, 1025), false);
    assert.equal(speechActivityAtMs(windows, 1500), true);
    // Deep in the period gap after the second clause.
    assert.equal(speechActivityAtMs(windows, 2425), false);
  });

  it("keeps Signal reveal text and mouth frozen through a gap", () => {
    const [first, gap, second] = spongesSegments();
    let reveal = startBotcastSpeechReveal({
      text: SPONGES_TEXT,
      durationMs: 3400,
      segmentTimings: [first!],
    });
    reveal = updateBotcastSpeechReveal(reveal, 800);
    const prefixAfterFirst = botcastSpeechRevealVisibleText(reveal);
    assert.equal(prefixAfterFirst.trimEnd(), "The sponges,");

    reveal = applyBotcastSpeechRevealSegmentTiming(reveal, gap!);
    reveal = updateBotcastSpeechReveal(reveal, 1025);
    assert.equal(
      botcastSpeechRevealVisibleText(reveal).trimEnd(),
      "The sponges,",
    );
    assert.equal(botcastSpeechRevealIsVoicing(reveal), false);

    reveal = applyBotcastSpeechRevealSegmentTiming(reveal, second!);
    reveal = updateBotcastSpeechReveal(reveal, 1500);
    const resumed = botcastSpeechRevealVisibleText(reveal);
    assert.ok(resumed.length > prefixAfterFirst.length);
    assert.ok(resumed.startsWith(prefixAfterFirst.trimEnd()));
    assert.equal(botcastSpeechRevealIsVoicing(reveal), true);
  });
});
