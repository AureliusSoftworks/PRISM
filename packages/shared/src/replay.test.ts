import assert from "node:assert/strict";
import test from "node:test";
import {
  REPLAY_VIDEO_FPS,
  buildReplaySceneCheckpointsV2,
  compileReplayTimelineV1,
  compileReplayTimelineV2,
  replayManifestToMarkdownV1,
  replayManifestToMarkdownV2,
  replayManifestV2IsValid,
  replaySceneAtV2,
  replayTimelineToWebVttV1,
  type ReplayManifestV1,
  type ReplayManifestV2,
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

const manifestV2: ReplayManifestV2 = {
  v: 2,
  surface: "signal",
  sourceId: "episode-v2",
  title: "Faithful direction",
  createdAt: "2026-07-24T00:00:00.000Z",
  completedAt: "2026-07-24T00:00:12.000Z",
  privacyMode: "local",
  participants: manifest.participants,
  utterances: manifest.utterances,
  initialScene: {
    camera: "wide",
    segment: "opening",
    introActive: true,
    outroActive: false,
    activeAction: null,
    activeReaction: null,
    overlapMessageIds: [],
    studioMix: { master: 0.8 },
    participants: {
      host: {
        visible: true,
        present: true,
        speaking: false,
        thinking: false,
        mood: "warm",
        cupLevel: 1,
        sipping: false,
        voiceMode: "english",
        audible: true,
        gain: 0.9,
        pan: -0.4,
        effects: ["radio"],
      },
      guest: {
        visible: true,
        present: true,
        speaking: false,
        thinking: false,
        mood: "neutral",
        cupLevel: 0.6,
        sipping: false,
        voiceMode: "bottish",
        audible: true,
        gain: 1,
        pan: 0.4,
        effects: [],
      },
    },
  },
  direction: [
    {
      sequence: 1,
      atMs: 500,
      kind: "intro",
      sourceMessageId: null,
      payload: { active: false },
    },
    {
      sequence: 2,
      atMs: 600,
      endMs: 1_000,
      kind: "thinking",
      sourceMessageId: "message-1",
      payload: {
        participantId: "host",
        botId: "host",
        startMs: 600,
        endMs: 1_000,
        audible: false,
        camera: "left",
        segment: "opening",
        followingMessageId: "message-1",
        endReason: "completed",
      },
    },
    {
      sequence: 3,
      atMs: 700,
      endMs: 1_500,
      kind: "thinking",
      sourceMessageId: "message-2",
      payload: {
        participantId: "guest",
        botId: "guest",
        startMs: 700,
        endMs: 1_500,
        audible: true,
        camera: "wide",
        segment: "opening",
        followingMessageId: "message-2",
        endReason: "interrupted",
      },
    },
    {
      sequence: 4,
      atMs: 1_000,
      endMs: 4_000,
      kind: "speech",
      sourceMessageId: "message-1",
      payload: {
        speakerId: "host",
        voiceMode: "english",
        audible: true,
        gain: 0.9,
        pan: -0.4,
        effects: ["radio"],
        active: true,
      },
    },
    {
      sequence: 5,
      atMs: 1_500,
      kind: "camera",
      sourceMessageId: "message-1",
      payload: { shot: "left" },
    },
    {
      sequence: 6,
      atMs: 2_000,
      endMs: 3_500,
      kind: "overlap",
      sourceMessageId: "message-2",
      payload: {
        messageIds: ["message-1", "message-2"],
        active: true,
      },
    },
    {
      sequence: 7,
      atMs: 4_500,
      endMs: 5_200,
      kind: "sip",
      sourceMessageId: null,
      payload: { participantId: "guest", active: true },
    },
    {
      sequence: 8,
      atMs: 6_000,
      kind: "departure",
      sourceMessageId: null,
      payload: { participantId: "guest" },
    },
    {
      sequence: 9,
      atMs: 8_000,
      endMs: 12_000,
      kind: "outro",
      sourceMessageId: null,
      payload: { active: true },
    },
  ],
  visual: manifest.visual,
};

test("V2 direction seeks deterministically through speech, overlaps, sips, departures, and outro", () => {
  assert.equal(replayManifestV2IsValid(manifestV2), true);
  const checkpoints = buildReplaySceneCheckpointsV2(manifestV2, 2_000);
  const firstThinking = replaySceneAtV2(manifestV2, 650, checkpoints);
  assert.equal(firstThinking.camera, "left");
  assert.equal(firstThinking.participants.host?.thinking, true);
  assert.equal(firstThinking.participants.host?.audible, false);
  const overlappingThinking = replaySceneAtV2(manifestV2, 800, checkpoints);
  assert.equal(overlappingThinking.camera, "wide");
  assert.equal(overlappingThinking.participants.host?.thinking, true);
  assert.equal(overlappingThinking.participants.guest?.thinking, true);
  const speechAfterThinking = replaySceneAtV2(manifestV2, 1_200, checkpoints);
  assert.equal(speechAfterThinking.participants.host?.thinking, false);
  assert.equal(speechAfterThinking.participants.host?.speaking, true);
  assert.equal(speechAfterThinking.participants.guest?.thinking, true);
  assert.equal(
    replaySceneAtV2(manifestV2, 1_600, checkpoints).participants.guest
      ?.thinking,
    false,
  );
  assert.deepEqual(
    replaySceneAtV2(manifestV2, 2_500, checkpoints),
    replaySceneAtV2(manifestV2, 2_500),
  );
  const overlap = replaySceneAtV2(manifestV2, 2_500, checkpoints);
  assert.equal(overlap.camera, "left");
  assert.equal(overlap.participants.host?.speaking, true);
  assert.deepEqual(overlap.overlapMessageIds, ["message-1", "message-2"]);

  const afterSpeech = replaySceneAtV2(manifestV2, 4_250, checkpoints);
  assert.equal(afterSpeech.participants.host?.speaking, false);
  assert.deepEqual(afterSpeech.overlapMessageIds, []);

  assert.equal(
    replaySceneAtV2(manifestV2, 4_800, checkpoints).participants.guest
      ?.sipping,
    true,
  );
  assert.equal(
    replaySceneAtV2(manifestV2, 5_500, checkpoints).participants.guest
      ?.sipping,
    false,
  );
  const departed = replaySceneAtV2(manifestV2, 7_000, checkpoints);
  assert.equal(departed.participants.guest?.present, false);
  assert.equal(departed.participants.guest?.visible, false);
  assert.equal(replaySceneAtV2(manifestV2, 9_000).outroActive, true);
  assert.equal(replaySceneAtV2(manifestV2, 12_500).outroActive, false);
});

test("V2 compiles only captured speech timing and exports a readable private-safe transcript", () => {
  const timeline = compileReplayTimelineV2(manifestV2);
  assert.deepEqual(
    timeline.beats
      .filter((beat) => beat.kind === "utterance")
      .map((beat) => [beat.startMs, beat.endMs]),
    [[1_000, 4_000]],
  );
  const markdown = replayManifestToMarkdownV2(manifestV2, timeline);
  assert.match(markdown, /\*\*00:01 · Host\*\*/u);
  assert.match(markdown, /Welcome to the show\./u);
  assert.doesNotMatch(
    markdown,
    /voiceMode|effects|radio|provider|diagnostic|camera|thinking|endReason/u,
  );
});
