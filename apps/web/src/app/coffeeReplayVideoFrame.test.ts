import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReplayTimelineV1 } from "@localai/shared";
import { coffeeReplayVideoFrameState, createCoffeeReplayVideoFrameSampler } from "./coffeeReplayVideoFrame.ts";

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

it("prepared frames preserve overlapping speakers, tied starts, gaps, pauses, and seeks", () => {
  const savedMessages = Array.from({ length: 120 }, (_, index) => ({ id: `message-${index}`, displayLength: index + 8 }));
  const beats = savedMessages.map((message, index) => ({
    ...timeline.beats[1]!, id: message.id, sourceMessageId: message.id,
    startMs: 100 + Math.floor(index / 3) * 140,
    endMs: 101 + Math.floor(index / 3) * 140 + (index * 71) % 1_000,
    speakerId: `speaker-${index % 5}`,
  })).reverse();
  const savedTimeline = { ...timeline, beats: [...beats, timeline.beats[3]!] };
  const original = structuredClone(savedTimeline);
  const ordered = [...beats].sort((a, b) => a.startMs - b.startMs);
  const sampler = createCoffeeReplayVideoFrameSampler({ messages: savedMessages, timeline: savedTimeline, displayLengthForMessage: (message) => message.displayLength });
  const times = [0, 7_000, 100, 101, ...beats.flatMap((beat) => [beat.startMs - 1, beat.startMs, beat.endMs - 1, beat.endMs]), ...Array.from({ length: 600 }, (_, index) => (index * 7919) % 7_000)];
  for (const time of times) {
    // Independent pre-change reverse-scan oracle, deliberately not the new sampler.
    const active = [...ordered].reverse().find((beat) => time >= beat.startMs && time < beat.endMs);
    const previous = [...ordered].reverse().find((beat) => time >= beat.endMs);
    const selected = active ?? previous ?? ordered[0]!;
    const index = savedMessages.findIndex((message) => message.id === selected.sourceMessageId);
    const length = savedMessages[index]!.displayLength;
    const expected = {
      videoElapsedMs: time,
      phase: active ? "table" : time >= 6_000 ? "end" : previous ? "table" : "title",
      messageIndex: index,
      visibleLength: active ? Math.min(length, Math.max(0, Math.round(length * (time - active.startMs) / Math.max(1, active.endMs - active.startMs)))) : previous ? length : 0,
      activeSpeakerId: active?.speakerId ?? null,
    };
    assert.deepEqual(sampler(time), expected, `at ${time}ms`);
    assert.deepEqual(sampler(time), expected, "pause/repeated sampling is stable");
  }
  assert.deepEqual(savedTimeline, original);
});

it("prepared playback scans/indexes once and calculates display text once per message", () => {
  let reads = 0;
  let textReads = 0;
  const savedTimeline = { ...timeline, beats: new Proxy(timeline.beats, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/u.test(property)) reads++;
      return Reflect.get(target, property, receiver);
    },
  }) };
  const sample = createCoffeeReplayVideoFrameSampler({ messages, timeline: savedTimeline, displayLengthForMessage: (message) => { textReads++; return message.displayLength; } });
  assert.ok(reads > 0);
  reads = 0;
  for (let frame = 0; frame < 600; frame++) sample(3_200);
  assert.equal(reads, 0);
  assert.equal(textReads, 1);
});

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
