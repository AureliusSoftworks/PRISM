import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botcastReplayTimeline,
  type BotcastEpisode,
  type ReplayTimelineV1,
} from "@localai/shared";
import {
  signalReplayBookendAt,
  signalReplayVideoEventElapsedMs,
  signalReplayVideoFrameState,
} from "./signalReplayVideoFrame.ts";

const episode = {
  id: "episode-1",
  hostBotId: "host-1",
  guestBotId: "guest-1",
  startedAt: "2026-07-21T00:00:00.000Z",
  completedAt: "2026-07-21T00:01:00.000Z",
  updatedAt: "2026-07-21T00:01:00.000Z",
  runtimeMs: 60_000,
  events: [],
  messages: [
    {
      id: "message-1",
      speakerRole: "host",
      content: "Welcome to the real studio.",
    },
    {
      id: "message-2",
      speakerRole: "guest",
      content: "I can see it now.",
    },
  ],
} as unknown as BotcastEpisode;

const timeline: ReplayTimelineV1 = {
  v: 1,
  durationMs: 12_000,
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
      text: "Episode",
      channel: null,
    },
    {
      id: "one",
      kind: "utterance",
      startMs: 2_000,
      endMs: 6_000,
      utteranceId: "one",
      sourceMessageId: "message-1",
      speakerId: "host-1",
      speakerName: "Host",
      text: "Welcome to the real studio.",
      channel: "primary",
    },
    {
      id: "two",
      kind: "utterance",
      startMs: 6_500,
      endMs: 10_000,
      utteranceId: "two",
      sourceMessageId: "message-2",
      speakerId: "guest-1",
      speakerName: "Guest",
      text: "I can see it now.",
      channel: "primary",
    },
    {
      id: "end",
      kind: "end",
      startMs: 10_000,
      endMs: 12_000,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: "End",
      channel: null,
    },
  ],
};

describe("Signal replay video frames", () => {
  it("keeps the branded intro and outro on the replay picture timeline", () => {
    assert.equal(signalReplayBookendAt(timeline, 1_000)?.kind, "intro");
    assert.equal(signalReplayBookendAt(timeline, 7_000), null);
    assert.equal(signalReplayBookendAt(timeline, 11_000)?.kind, "outro");
  });

  it("maps frozen voice timing onto the episode director clock per message", () => {
    const director = botcastReplayTimeline(episode.messages, episode.events);
    const mapped = signalReplayVideoEventElapsedMs({
      episode,
      timeline,
      videoElapsedMs: 4_000,
    });
    const expected =
      ((director.messageStartMs[0] ?? 0) +
        (director.messageEndMs[0] ?? 0)) /
      2;
    assert.equal(mapped, expected);
  });

  it("drives the canonical stage from the active frozen utterance", () => {
    const frame = signalReplayVideoFrameState({
      episode,
      timeline,
      videoElapsedMs: 7_000,
    });
    assert.equal(frame.messageIndex, 1);
    assert.deepEqual(frame.activeMessageIndexes, [1]);
    assert.equal(frame.shot, "wide");
    assert.equal(frame.guestDeparted, false);
    assert.equal(frame.hostDeparted, false);
  });
});
