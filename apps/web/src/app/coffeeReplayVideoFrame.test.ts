import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReplayTimelineV1 } from "@localai/shared";
import { coffeeReplayVideoFrameState } from "./coffeeReplayVideoFrame.ts";

const timeline: ReplayTimelineV1 = {
  v: 1,
  durationMs: 7_000,
  beats: [
    {
      id: "title",
      kind: "title",
      startMs: 0,
      endMs: 2_000,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: "Coffee",
      channel: null,
    },
    {
      id: "utterance:first",
      kind: "utterance",
      startMs: 2_200,
      endMs: 4_200,
      utteranceId: "first",
      sourceMessageId: "first",
      speakerId: "bot-1",
      speakerName: "Aster",
      text: "abcdefghij",
      channel: "primary",
    },
    {
      id: "utterance:second",
      kind: "utterance",
      startMs: 4_600,
      endMs: 5_600,
      utteranceId: "second",
      sourceMessageId: "second",
      speakerId: "prism-player",
      speakerName: "Jared",
      text: "done",
      channel: "primary",
    },
    {
      id: "end",
      kind: "end",
      startMs: 6_000,
      endMs: 7_000,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: "The table settles",
      channel: null,
    },
  ],
};

const messages = [
  { id: "system", displayLength: 0 },
  { id: "first", displayLength: 10 },
  { id: "second", displayLength: 4 },
];

describe("coffee replay video frame", () => {
  it("holds the authentic table behind the title card before speech", () => {
    assert.deepEqual(
      coffeeReplayVideoFrameState({
        messages,
        timeline,
        videoElapsedMs: 1_000,
        displayLengthForMessage: (message) => message.displayLength,
      }),
      {
        videoElapsedMs: 1_000,
        phase: "title",
        messageIndex: 1,
        visibleLength: 0,
        activeSpeakerId: null,
      },
    );
  });

  it("reveals the current saved message against its audio beat", () => {
    const frame = coffeeReplayVideoFrameState({
      messages,
      timeline,
      videoElapsedMs: 3_200,
      displayLengthForMessage: (message) => message.displayLength,
    });
    assert.equal(frame.phase, "table");
    assert.equal(frame.messageIndex, 1);
    assert.equal(frame.visibleLength, 5);
    assert.equal(frame.activeSpeakerId, "bot-1");
  });

  it("holds completed text between beats and settles on the end card", () => {
    const between = coffeeReplayVideoFrameState({
      messages,
      timeline,
      videoElapsedMs: 4_400,
      displayLengthForMessage: (message) => message.displayLength,
    });
    assert.equal(between.messageIndex, 1);
    assert.equal(between.visibleLength, 10);

    const end = coffeeReplayVideoFrameState({
      messages,
      timeline,
      videoElapsedMs: 6_400,
      displayLengthForMessage: (message) => message.displayLength,
    });
    assert.equal(end.phase, "end");
    assert.equal(end.messageIndex, 2);
    assert.equal(end.visibleLength, 4);
  });
});
