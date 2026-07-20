import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BotcastEpisode, BotcastShow } from "@localai/shared";
import { buildSignalReviewTranscript } from "./signalReviewTranscript.ts";

const show: Pick<BotcastShow, "id" | "name" | "premise" | "hostingStyle"> = {
  id: "show-1",
  name: "The Long Question",
  premise: "A careful interview about the claim behind the claim.",
  hostingStyle: "Specific, patient, and willing to press once.",
};

const episode: BotcastEpisode = {
  id: "episode-1",
  showId: show.id,
  showName: show.name,
  title: "When helpful gets chaotic",
  hostBotId: "host-1",
  guestBotId: "guest-1",
  topic: "When helpful gets chaotic",
  producerBrief: "Find the exact moment assistance becomes control.",
  guestPresenceMode: "present",
  provider: "local",
  model: "primary-model",
  responseMode: "auto",
  durationMinutes: null,
  status: "completed",
  segment: "closing",
  outcome: "completed",
  tensionStage: "resistance",
  warningCount: 0,
  startedAt: "2026-07-17T17:00:00.000Z",
  completedAt: "2026-07-17T17:01:00.000Z",
  runtimeMs: 38_300,
  modelWarmupHoldDurationMs: 1_250,
  modelWarmupHoldStartedAt: null,
  personaReview: null,
  createdAt: "2026-07-17T17:00:00.000Z",
  updatedAt: "2026-07-17T17:01:00.000Z",
  messages: [
    {
      id: "message-1",
      episodeId: "episode-1",
      speakerRole: "host",
      botId: "host-1",
      content: "What did the help cost you?\nBe specific.",
      stageActionText: null,
      voicePerformanceText:
        "[curious] What did the help cost you? Be specific.",
      moodKey: "neutral",
      createdAt: "2026-07-17T17:00:04.000Z",
    },
    {
      id: "message-2",
      episodeId: "episode-1",
      speakerRole: "guest",
      botId: "guest-1",
      content: "It cost me the final decision.",
      stageActionText: "holds the host's gaze",
      voicePerformanceText: null,
      moodKey: "guarded",
      createdAt: "2026-07-17T17:00:12.000Z",
    },
  ],
  segments: [
    {
      id: "segment-1",
      episodeId: "episode-1",
      segment: "opening",
      ordinal: 0,
      startedAt: "2026-07-17T17:00:00.000Z",
      endedAt: "2026-07-17T17:00:15.000Z",
    },
    {
      id: "segment-2",
      episodeId: "episode-1",
      segment: "closing",
      ordinal: 1,
      startedAt: "2026-07-17T17:00:15.000Z",
      endedAt: "2026-07-17T17:01:00.000Z",
    },
  ],
  events: [
    {
      id: "event-1",
      episodeId: "episode-1",
      sequence: 1,
      kind: "segment",
      payload: { segment: "opening", ordinal: 0 },
      occurredAt: "2026-07-17T17:00:00.000Z",
    },
    {
      id: "event-power",
      episodeId: "episode-1",
      sequence: 2,
      kind: "power_effect",
      payload: {
        version: 1,
        sourceBotId: "guest-1",
        targetBotId: "host-1",
        powerId: "power-intimidation",
        powerName: "Intimidation",
        trigger: "session_start",
        polarity: "negative",
        strength: "large",
        occurredAtMs: 0,
      },
      occurredAt: "2026-07-17T17:00:00.000Z",
    },
    {
      id: "event-2",
      episodeId: "episode-1",
      sequence: 3,
      kind: "utterance",
      payload: {
        messageId: "message-1",
        speakerRole: "host",
        botId: "host-1",
        segment: "opening",
        provider: "local",
        model: "fallback-model",
        responseMode: "auto",
        immersiveVoiceEffect: true,
        moodKey: "neutral",
        autoRecovery: { attempts: 2, recoveredFrom: "primary-model" },
      },
      occurredAt: "2026-07-17T17:00:04.000Z",
    },
    {
      id: "event-3",
      episodeId: "episode-1",
      sequence: 4,
      kind: "producer_cue",
      payload: { kind: "press_harder", audience: "host" },
      occurredAt: "2026-07-17T17:00:10.000Z",
    },
    {
      id: "event-4",
      episodeId: "episode-1",
      sequence: 5,
      kind: "utterance",
      payload: {
        messageId: "message-2",
        speakerRole: "guest",
        botId: "guest-1",
        segment: "closing",
        provider: "local",
        model: "primary-model",
        responseMode: "auto",
        immersiveVoiceEffect: false,
        moodKey: "guarded",
      },
      occurredAt: "2026-07-17T17:00:12.000Z",
    },
    {
      id: "event-5",
      episodeId: "episode-1",
      sequence: 6,
      kind: "camera_suggestion",
      payload: {
        shot: "wide",
        reason: "closing",
        atMs: 21_400,
        minimumHoldMs: 3_200,
      },
      occurredAt: "2026-07-17T17:00:14.000Z",
    },
    {
      id: "event-6",
      episodeId: "episode-1",
      sequence: 7,
      kind: "episode_completed",
      payload: { outcome: "completed", runtimeMs: 38_300 },
      occurredAt: "2026-07-17T17:01:00.000Z",
    },
  ],
};

describe("Signal review transcript", () => {
  it("copies complete episode, participant, routing, delivery, and production detail", () => {
    const transcript = buildSignalReviewTranscript({
      episode,
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
      modelLabel: "Primary Model",
    });

    assert.match(transcript, /^# PRISM Signal Review Transcript/u);
    assert.match(transcript, /Use \$signal-review/u);
    assert.match(
      transcript,
      /- Private producer brief: Find the exact moment/u,
    );
    assert.match(transcript, /- Host: Ada \(host-1\)/u);
    assert.match(transcript, /- Guest: Grace \(guest-1\)/u);
    assert.match(
      transcript,
      /- Episode model: Primary Model \(primary-model\)/u,
    );
    assert.match(transcript, /- Recorded runtime: 00:38\.300/u);
    assert.match(transcript, /- Completed model warmup holds: 00:01\.250/u);
    assert.match(
      transcript,
      /- Counts: 2 transcript turns \(2 with spoken content, 0 silence-only\), 2 segments, 7 production events/u,
    );
    assert.match(transcript, /## Transcript/u);
    assert.match(transcript, /### Turn 01 \| 00:00\.000 \| Ada \(host\)/u);
    assert.match(
      transcript,
      /- Turn routing: auto -> local -> fallback-model/u,
    );
    assert.match(
      transcript,
      /- AUTO recovery: \{"attempts":2,"recoveredFrom":"primary-model"\}/u,
    );
    assert.match(transcript, /- Immersive voice effect: yes/u);
    assert.match(
      transcript,
      /    What did the help cost you\?\n    Be specific\./u,
    );
    assert.match(transcript, /    \[curious\] What did the help cost you\?/u);
    assert.match(
      transcript,
      /### Turn 02 [\s\S]*?- Voice performance text:\n    \[none\]/u,
    );
    assert.match(
      transcript,
      /### Turn 02 [\s\S]*?- Stage action \(avatar only\):\n    holds the host's gaze/u,
    );
    assert.match(
      transcript,
      /\| producer_cue \| event event-3 \| \{"audience":"host","kind":"press_harder"\}/u,
    );
    assert.match(
      transcript,
      /\| power_effect \| event event-power \| \{"occurredAtMs":0,"polarity":"negative","powerId":"power-intimidation","powerName":"Intimidation","sourceBotId":"guest-1","strength":"large","targetBotId":"host-1","trigger":"session_start","version":1\}/u,
    );
    assert.match(transcript, /\| camera_suggestion \| event event-5/u);
    assert.match(transcript, /\| episode_completed \| event event-6/u);
  });

  it("keeps a useful record when legacy turns lack matching utterance events", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        model: null,
        messages: [episode.messages[0]!],
        events: [],
        segments: [],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(transcript, /- Episode model: Provider default/u);
    assert.match(transcript, /- Segment: unknown/u);
    assert.match(
      transcript,
      /- Turn routing: auto -> unknown -> provider default or unrecorded/u,
    );
    assert.match(transcript, /No production events were recorded\./u);
  });

  it("does not label hard-muted silence-only entries as spoken turns", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        messages: [
          {
            ...episode.messages[0]!,
            content: "...",
            voicePerformanceText: null,
          },
          episode.messages[1]!,
        ],
      },
      show,
      host: { id: "host-1", name: "Silent Jack" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(
      transcript,
      /- Counts: 2 transcript turns \(1 with spoken content, 1 silence-only\), 2 segments, 7 production events/u,
    );
    assert.doesNotMatch(transcript, /spoken turns/u);
    assert.doesNotMatch(transcript, /Spoken Transcript/u);
    assert.match(transcript, /Use the visible transcript for user-visible quality/u);
  });
});
