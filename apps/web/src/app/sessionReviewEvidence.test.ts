import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReplayRecordingV1 } from "@localai/shared";
import {
  sessionReviewDirectionLines,
  sessionReviewRecordingEvidenceFromRecording,
  sessionReviewRecordingSummaryLines,
  sessionReviewStableJson,
} from "./sessionReviewEvidence.ts";

const recording: ReplayRecordingV1 = {
  id: "recording-1",
  surface: "signal",
  sourceId: "episode-1",
  status: "ready",
  progress: 1,
  manifest: {
    v: 2,
    surface: "signal",
    sourceId: "episode-1",
    title: "Evidence",
    createdAt: "2026-07-25T00:00:00.000Z",
    completedAt: "2026-07-25T00:00:05.000Z",
    privacyMode: "local",
    participants: [],
    utterances: [],
    initialScene: {
      camera: "wide",
      segment: "opening",
      introActive: false,
      outroActive: false,
      activeAction: null,
      activeReaction: null,
      overlapMessageIds: [],
      studioMix: {},
      participants: {},
    },
    direction: [
      {
        sequence: 2,
        atMs: 1_900,
        kind: "speech",
        sourceMessageId: "message-2",
        payload: { active: true, speakerId: "bot-1" },
      },
      {
        sequence: 1,
        atMs: 800,
        endMs: 1_850,
        kind: "thinking",
        sourceMessageId: "message-2",
        payload: {
          participantId: "guest",
          botId: "bot-1",
          startMs: 800,
          endMs: 1_850,
          audible: false,
          camera: "guest",
          segment: "interview",
          followingMessageId: "message-2",
          endReason: "completed",
          audioUrl: "/private/master.webm",
          systemPrompt: "never export this",
        },
      },
    ],
    visual: {
      theme: "dark",
      accentColor: null,
      atmosphereImageUrl: null,
    },
  },
  timeline: { v: 1, durationMs: 5_000, beats: [] },
  width: 1920,
  height: 1080,
  fps: 30,
  durationMs: null,
  sizeBytes: null,
  codec: null,
  contentType: null,
  videoUrl: "/private/video.mp4",
  audioUrl: "/private/audio.webm",
  audioContentType: "audio/webm",
  audioSizeBytes: 42,
  audioDurationMs: 5_000,
  transcriptVttUrl: null,
  transcriptMarkdownUrl: null,
  availability: "faithful",
  warning: null,
  error: null,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:05.000Z",
};

describe("session review evidence", () => {
  it("summarizes faithful recording state without exposing media URLs", () => {
    const evidence = sessionReviewRecordingEvidenceFromRecording(recording);
    const summary = sessionReviewRecordingSummaryLines(evidence).join("\n");

    assert.match(summary, /Replay availability: faithful/u);
    assert.match(summary, /Manifest version: 2/u);
    assert.match(summary, /Faithful audio duration: 00:05\.000/u);
    assert.doesNotMatch(summary, /private|audio\.webm|video\.mp4/u);
  });

  it("orders private V2 direction and preserves silent thinking evidence", () => {
    const evidence = sessionReviewRecordingEvidenceFromRecording(recording);
    const direction = sessionReviewDirectionLines(evidence).join("\n");

    assert.match(
      direction,
      /^- #0001 \| atMs=800 \| endMs=1850 \| kind=thinking/u,
    );
    assert.match(direction, /"audible":false/u);
    assert.match(direction, /"followingMessageId":"message-2"/u);
    assert.match(direction, /"endReason":"completed"/u);
    assert.doesNotMatch(direction, /master\.webm|never export this/u);
  });

  it("redacts private prompt and credential-shaped fields recursively", () => {
    const text = sessionReviewStableJson({
      provider: "local",
      model: "gemma",
      moodKey: "warm",
      nested: {
        apiKey: "secret",
        filePath: "/tmp/private",
        prompt: "hidden",
      },
    });

    assert.match(text, /"provider":"local"/u);
    assert.match(text, /"model":"gemma"/u);
    assert.match(text, /"moodKey":"warm"/u);
    assert.doesNotMatch(text, /secret|private|hidden|apiKey|filePath|prompt/u);
  });
});
