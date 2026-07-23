import assert from "node:assert/strict";
import test from "node:test";
import {
  REPLAY_VIDEO_FPS,
  compileReplayTimelineV1,
  replayManifestToMarkdownV1,
  replayTimelineToWebVttV1,
  type ReplayManifestV1,
  type ReplayVoiceTakeRecordV1,
} from "./replay.ts";

const manifest: ReplayManifestV1 = {
  v: 1,
  surface: "signal",
  sourceId: "episode-1",
  title: "A deterministic episode",
  createdAt: "2026-07-21T00:00:00.000Z",
  completedAt: "2026-07-21T00:04:00.000Z",
  privacyMode: "local",
  participants: [
    {
      id: "host",
      name: "Host",
      kind: "bot",
      role: "host",
      color: "#ff3366",
      glyph: "spark",
      seatIndex: 0,
      visible: true,
    },
    {
      id: "guest",
      name: "Guest",
      kind: "bot",
      role: "guest",
      color: "#33aaff",
      glyph: "orbit",
      seatIndex: 1,
      visible: true,
    },
  ],
  utterances: [
    {
      id: "one",
      sourceMessageId: "message-1",
      speakerId: "host",
      speakerRole: "host",
      text: "Welcome to the show.",
      spokenText: "Welcome to the show.",
      moodKey: "warm",
      audible: true,
      visible: true,
      createdAt: "2026-07-21T00:00:01.000Z",
    },
    {
      id: "two",
      sourceMessageId: "message-2",
      speakerId: "guest",
      speakerRole: "guest",
      text: "I am talking over the handoff.",
      spokenText: "I am talking over the handoff.",
      moodKey: "neutral",
      audible: true,
      visible: true,
      createdAt: "2026-07-21T00:00:02.000Z",
    },
  ],
  events: [
    {
      id: "overlap",
      kind: "perception_overlap",
      sourceMessageId: "message-2",
      occurredAt: null,
      payload: {
        precedingMessageId: "message-1",
        overlappingMessageId: "message-2",
        startRatio: 0.66,
      },
    },
  ],
  visual: {
    theme: "dark",
    accentColor: "#ff3366",
    atmosphereImageUrl: null,
  },
};

test("replay timeline is deterministic and honors captured durations and overlap", () => {
  const takes = [
    {
      id: "take-1",
      recordingId: "recording-1",
      snapshot: {
        v: 1,
        sourceKey: "message-1",
        sourceMessageId: "message-1",
        sourceEventId: null,
        speakerId: "host",
        speakerName: "Host",
        spokenText: "Welcome to the show.",
        performanceText: null,
        mode: "english",
        requestedEngine: "builtin",
        resolvedEngine: "builtin",
        profile: {
          v: 1,
          baseVoiceId: "voice-1",
          pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
        },
        moodKey: "warm",
        effectsEnabled: true,
        gain: 1,
        stereoPan: -0.3,
        channel: "primary",
        seed: "one",
        audible: true,
        durationMs: 4_000,
        alignment: null,
      },
      status: "captured",
      audioUrl: "/audio",
      audioContentType: "audio/wav",
      audioSizeBytes: 4,
      createdAt: manifest.createdAt,
      updatedAt: manifest.createdAt,
    },
  ] satisfies ReplayVoiceTakeRecordV1[];
  const first = compileReplayTimelineV1(manifest, takes);
  const second = compileReplayTimelineV1(manifest, takes);
  assert.deepEqual(first, second);
  const utterances = first.beats.filter((beat) => beat.kind === "utterance");
  assert.equal(utterances[0]?.endMs - utterances[0]?.startMs, 4_000);
  assert.equal(utterances[1]?.channel, "crosstalk");
  assert.equal(
    utterances[1]?.startMs,
    Math.round((utterances[0]?.startMs ?? 0) + 4_000 * 0.66),
  );
});

test("Signal live-master timing keeps the intro, speech, dead air, and outro verbatim", () => {
  const capturedManifest: ReplayManifestV1 = {
    ...manifest,
    events: [
      ...manifest.events,
      {
        id: "start-one",
        kind: "capture_timing",
        sourceMessageId: "message-1",
        occurredAt: manifest.createdAt,
        payload: {
          phase: "speech_start",
          messageId: "message-1",
          atMs: 4_380,
        },
      },
      {
        id: "end-one",
        kind: "capture_timing",
        sourceMessageId: "message-1",
        occurredAt: manifest.createdAt,
        payload: {
          phase: "speech_end",
          messageId: "message-1",
          atMs: 7_910,
        },
      },
      {
        id: "start-two",
        kind: "capture_timing",
        sourceMessageId: "message-2",
        occurredAt: manifest.createdAt,
        payload: {
          phase: "speech_start",
          messageId: "message-2",
          atMs: 12_240,
        },
      },
      {
        id: "end-two",
        kind: "capture_timing",
        sourceMessageId: "message-2",
        occurredAt: manifest.createdAt,
        payload: {
          phase: "speech_end",
          messageId: "message-2",
          atMs: 15_600,
        },
      },
      {
        id: "outro",
        kind: "capture_timing",
        sourceMessageId: null,
        occurredAt: manifest.completedAt,
        payload: { phase: "outro_start", atMs: 16_900 },
      },
      {
        id: "capture-end",
        kind: "capture_timing",
        sourceMessageId: null,
        occurredAt: manifest.completedAt,
        payload: { phase: "capture_end", atMs: 20_750 },
      },
    ],
  };
  const timeline = compileReplayTimelineV1(capturedManifest);
  const title = timeline.beats.find((beat) => beat.kind === "title");
  const utterances = timeline.beats.filter(
    (beat) => beat.kind === "utterance",
  );
  const end = timeline.beats.find((beat) => beat.kind === "end");
  assert.equal(title?.endMs, 4_380);
  assert.deepEqual(
    utterances.map((beat) => [beat.startMs, beat.endMs]),
    [
      [4_380, 7_910],
      [12_240, 15_600],
    ],
  );
  assert.equal(end?.startMs, 16_900);
  assert.equal(end?.endMs, 20_750);
  assert.equal(timeline.durationMs, 20_750);

  const skippedIntroTimeline = compileReplayTimelineV1({
    ...capturedManifest,
    events: capturedManifest.events.map((event) =>
      event.kind === "capture_timing" &&
      event.payload.phase === "speech_start" &&
      event.payload.messageId === "message-1"
        ? { ...event, payload: { ...event.payload, atMs: 1_100 } }
        : event,
    ),
  });
  assert.equal(
    skippedIntroTimeline.beats.find((beat) => beat.kind === "title")?.endMs,
    1_100,
  );
});

test("replay transcript exports use the same deterministic timeline", () => {
  const timeline = compileReplayTimelineV1(manifest);
  const vtt = replayTimelineToWebVttV1(timeline);
  const markdown = replayManifestToMarkdownV1(manifest, timeline);
  assert.match(vtt, /^WEBVTT/u);
  assert.match(vtt, /Host: Welcome to the show\./u);
  assert.match(markdown, /# A deterministic episode/u);
  assert.match(markdown, /\*\*\d\d:\d\d · Guest\*\*/u);
});

test("the fixed video clock keeps scheduled speech and captions inside the drift budget", () => {
  const timeline = compileReplayTimelineV1(manifest);
  const frameDurationMs = 1_000 / REPLAY_VIDEO_FPS;
  for (const beat of timeline.beats.filter((entry) => entry.kind === "utterance")) {
    const firstVisibleFrameMs =
      Math.ceil(beat.startMs / frameDurationMs) * frameDurationMs;
    assert.ok(firstVisibleFrameMs - beat.startMs <= frameDurationMs);
    assert.ok(firstVisibleFrameMs - beat.startMs < 80);
  }
});
