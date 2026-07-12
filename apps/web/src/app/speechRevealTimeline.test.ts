import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpeechRevealPhrases,
  finishSpeechRevealTimeline,
  prepareSpeechRevealTimeline,
  speechRevealTimelineComplete,
  speechRevealVisibleTokenCount,
  startAlignedSpeechRevealTimeline,
  startSpeechRevealPhraseTimeline,
  startSpeechRevealTimeline,
  updateSpeechRevealTimeline,
} from "./speechRevealTimeline.ts";

describe("speech reveal timeline", () => {
  it("holds text until audio actually begins", () => {
    const timeline = prepareSpeechRevealTimeline("Hello there.");
    assert.equal(speechRevealVisibleTokenCount(timeline), 0);
    assert.equal(speechRevealTimelineComplete(timeline), false);
  });

  it("reveals from the audio clock and lands exactly at the end", () => {
    const started = startSpeechRevealTimeline(
      ["Hello ", "there, ", "friend."],
      "Hello there, friend.",
      1200
    );
    assert.equal(speechRevealVisibleTokenCount(started), 1);
    const middle = updateSpeechRevealTimeline(started, 600);
    assert.equal(speechRevealVisibleTokenCount(middle) >= 2, true);
    const spokenButStillPlaying = updateSpeechRevealTimeline(started, 1199);
    assert.equal(speechRevealVisibleTokenCount(spokenButStillPlaying), 3);
    assert.equal(speechRevealTimelineComplete(spokenButStillPlaying), false);
    const ended = finishSpeechRevealTimeline(middle);
    assert.equal(speechRevealVisibleTokenCount(ended), 3);
    assert.equal(speechRevealTimelineComplete(ended), true);
  });

  it("gives sentence punctuation more breathing room", () => {
    const timeline = startSpeechRevealTimeline(
      ["Wait. ", "Now ", "go"],
      "Wait. Now go",
      1000
    );
    assert.equal((timeline.revealAtMs[1] ?? 0) > (timeline.revealAtMs[2] ?? 0) / 3, true);
  });

  it("uses exact provider character marks when available", () => {
    const timeline = startAlignedSpeechRevealTimeline(
      ["Hello ", "there"],
      "Hello there",
      1000,
      {
        characters: Array.from("Hello there"),
        characterStartTimesSeconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.6, 0.68, 0.76, 0.84, 0.92],
        characterEndTimesSeconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.68, 0.76, 0.84, 0.92, 1],
      }
    );
    assert.equal(timeline.revealAtMs[0], 0);
    assert.equal(timeline.revealAtMs[1], 600);
    assert.equal(speechRevealVisibleTokenCount(updateSpeechRevealTimeline(timeline, 590)), 1);
    assert.equal(speechRevealVisibleTokenCount(updateSpeechRevealTimeline(timeline, 610)), 2);
  });

  it("builds short phrase buffers without changing the utterance", () => {
    const tokens = ["One ", "two ", "three, ", "four ", "five ", "six ", "seven ", "eight ", "nine."];
    const phrases = buildSpeechRevealPhrases(tokens, { minWords: 3, maxWords: 5 });
    assert.equal(phrases.map((phrase) => phrase.text).join(""), tokens.join(""));
    assert.deepEqual(
      phrases.map((phrase) => [phrase.startTokenIndex, phrase.endTokenIndex]),
      [[0, 3], [3, 8], [8, 9]]
    );
  });

  it("preserves completed text while the next buffered phrase prepares", () => {
    const tokens = ["One ", "two ", "three. ", "Four ", "five."];
    const first = startSpeechRevealPhraseTimeline({
      tokens,
      tokenSignature: tokens.join(""),
      phrase: { text: "One two three. ", startTokenIndex: 0, endTokenIndex: 3 },
      durationMs: 500,
    });
    const waiting = finishSpeechRevealTimeline(first);
    assert.equal(waiting.phase, "preparing");
    assert.equal(speechRevealVisibleTokenCount(waiting), 3);
    assert.equal(speechRevealTimelineComplete(waiting), false);
    const second = startSpeechRevealPhraseTimeline({
      tokens,
      tokenSignature: tokens.join(""),
      phrase: { text: "Four five.", startTokenIndex: 3, endTokenIndex: 5 },
      durationMs: 400,
    });
    assert.equal(speechRevealVisibleTokenCount(second), 4);
    assert.equal(speechRevealVisibleTokenCount(finishSpeechRevealTimeline(second)), 5);
  });
});
