import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOTCAST_PRODUCER_GUEST_ID,
  type BotcastEpisode,
  type BotcastShow,
} from "@localai/shared";
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
    assert.match(transcript, /Review format: 2/u);
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
    assert.match(transcript, /- ONLINE retry: None recorded/u);
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
    assert.match(transcript, /Recording diagnostics: unavailable/u);
    assert.match(
      transcript,
      /recorded post-validation utterance; raw provider draft not preserved/u,
    );
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

    assert.match(transcript, /- Episode model: Auto/u);
    assert.match(transcript, /- Segment: unknown/u);
    assert.match(
      transcript,
      /- Turn routing: auto -> unknown -> provider default or unrecorded/u,
    );
    assert.match(transcript, /No production events were recorded\./u);
  });

  it("records cue lifecycle without leaking private cue wording into review output", () => {
    const privateDirection = "Say this exact private sentence to the guest.";
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        events: [
          ...episode.events,
          {
            id: "cue-queued",
            episodeId: episode.id,
            sequence: 8,
            kind: "producer_cue",
            payload: {
              cueId: "cue-private",
              lifecycle: "queued",
              kind: "ask_about",
              directQuote: privateDirection,
              delivery: "next_host_turn",
            },
            occurredAt: "2026-07-17T17:01:01.000Z",
          },
          {
            id: "cue-failed",
            episodeId: episode.id,
            sequence: 9,
            kind: "producer_cue",
            payload: {
              cueId: "cue-private",
              lifecycle: "failed",
              failure: "privacy_validation",
            },
            occurredAt: "2026-07-17T17:01:02.000Z",
          },
        ],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(transcript, /## Producer Cue Lifecycle/u);
    assert.match(transcript, /Cue cue-private \| failed \| privacy_validation/u);
    assert.doesNotMatch(transcript, /Say this exact private sentence/u);
  });

  it("identifies Producer guest composer turns as human-authored", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        guestBotId: BOTCAST_PRODUCER_GUEST_ID,
        messages: [{
          ...episode.messages[1]!,
          botId: BOTCAST_PRODUCER_GUEST_ID,
          content: "A perfect plan needs enough coffee to survive revision.",
        }],
        events: [{
          ...episode.events[4]!,
          payload: {
            messageId: "message-2",
            speakerRole: "guest",
            botId: BOTCAST_PRODUCER_GUEST_ID,
            segment: "interview",
            source: "producer_guest_composer",
          },
        }],
        segments: [],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: BOTCAST_PRODUCER_GUEST_ID, name: "Jared" },
    });

    assert.match(
      transcript,
      /- Turn routing: human-authored -> no provider -> no model/u,
    );
    assert.match(
      transcript,
      /- AUTO recovery: Not applicable \(human-authored\)/u,
    );
    assert.match(
      transcript,
      /- ONLINE retry: Not applicable \(human-authored\)/u,
    );
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
            mutePerformance: {
              v: 1,
              name: "mutePerformance",
              durationMs: 9_000,
              periodCount: 9,
              interrupted: false,
              elapsedCue: "*9 seconds pass without an audible word.*",
              reactionBeats: [],
            },
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
    assert.match(
      transcript,
      /- Visible transcript:\n    \.{9} \*9 seconds pass without an audible word\.\*/u,
    );
    assert.match(transcript, /Use the visible transcript for user-visible quality/u);
  });

  it("prints same-route ONLINE retry metadata beside the recovered utterance", () => {
    const providerRecovery = {
      v: 1,
      strategy: "same_route_retry",
      attempts: [
        {
          provider: "openai",
          model: "gpt-signal",
          durationMs: 410,
          outcome: "failed",
          reason: "provider_error",
          httpStatus: 500,
        },
        {
          provider: "openai",
          model: "gpt-signal",
          durationMs: 220,
          outcome: "succeeded",
        },
      ],
      finalProvider: "openai",
      finalModel: "gpt-signal",
    };
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        events: episode.events.map((event) =>
          event.id === "event-2"
            ? {
                ...event,
                payload: {
                  ...event.payload,
                  responseMode: "online",
                  providerRecovery,
                },
              }
            : event,
        ),
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(
      transcript,
      /- ONLINE retry: \{"attempts":\[\{"durationMs":410,"httpStatus":500,"model":"gpt-signal","outcome":"failed","provider":"openai","reason":"provider_error"\},\{"durationMs":220,"model":"gpt-signal","outcome":"succeeded","provider":"openai"\}\],"finalModel":"gpt-signal","finalProvider":"openai","strategy":"same_route_retry","v":1\}/u,
    );
  });

  it("places repair provenance and silent thinking direction beside review evidence", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        events: episode.events.map((event) =>
          event.id === "event-2"
            ? {
                ...event,
                payload: {
                  ...event.payload,
                  utteranceRepair: {
                    reason: "peer_label",
                    fallbackKind: "host_follow_up",
                  },
                },
              }
            : event,
        ),
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
      recordingEvidence: {
        state: "recorded",
        recordingId: "recording-1",
        availability: "faithful",
        status: "ready",
        manifestVersion: 2,
        audioDurationMs: 38_300,
        timelineDurationMs: 38_300,
        warningPresent: false,
        warningDetail: null,
        errorPresent: false,
        errorDetail: null,
        direction: [
          {
            sequence: 1,
            atMs: 2_000,
            endMs: 3_500,
            kind: "thinking",
            sourceMessageId: "message-1",
            payload: {
              participantId: "host",
              botId: "host-1",
              startMs: 2_000,
              endMs: 3_500,
              audible: false,
              camera: "host",
              segment: "opening",
              followingMessageId: "message-1",
              endReason: "completed",
            },
          },
        ],
      },
    });

    assert.match(
      transcript,
      /- Utterance repair: \{"fallbackKind":"host_follow_up","reason":"peer_label"\}/u,
    );
    assert.match(
      transcript,
      /recorded repaired\/fallback utterance; raw provider draft not preserved/u,
    );
    assert.match(transcript, /- Replay availability: faithful/u);
    assert.match(
      transcript,
      /kind=thinking \| sourceMessageId=message-1 \| payload=.*"audible":false/u,
    );
    assert.match(transcript, /"followingMessageId":"message-1"/u);
  });

  it("annotates the interrupted turn and provenance for a producer host redirect", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        messages: [episode.messages[0]!],
        events: [
          episode.events[2]!,
          {
            id: "event-redirect",
            episodeId: episode.id,
            sequence: 4,
            kind: "producer_cue",
            payload: {
              kind: "ask_about",
              detail: "Ask what the first failure cost.",
              delivery: "redirect_host",
              audience: "host",
              interruptedMessageId: "message-1",
            },
            occurredAt: "2026-07-17T17:00:05.000Z",
          },
        ],
        segments: [],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(
      transcript,
      /- Producer interruption: redirect_host — ask_about \(event event-redirect\); this canonical turn contains only the audience-heard prefix/u,
    );
    assert.match(
      transcript,
      /- Event ID: event-redirect \| Delivery: redirect_host \| Kind: ask_about \| Interrupted message ID: message-1 \| Scheduled bridge: None \| Canonical interrupted message: yes/u,
    );
  });

  it("annotates a canonical interrupt_guest prefix", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        messages: [episode.messages[1]!],
        events: [
          episode.events[4]!,
          {
            id: "event-guest-interrupt",
            episodeId: episode.id,
            sequence: 6,
            kind: "producer_cue",
            payload: {
              kind: "press_harder",
              delivery: "interrupt_guest",
              audience: "host",
              interruptedMessageId: "message-2",
              interruptionBridgeLine: "Let me stop you there.",
            },
            occurredAt: "2026-07-17T17:00:13.000Z",
          },
        ],
        segments: [],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(
      transcript,
      /- Producer interruption: interrupt_guest — press_harder \(event event-guest-interrupt\); this canonical turn contains only the audience-heard prefix/u,
    );
    assert.match(
      transcript,
      /Scheduled bridge: Let me stop you there\. \| Canonical interrupted message: yes/u,
    );
  });

  it("records interrupt_guest provenance when no interrupted message is canonical", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        messages: [episode.messages[0]!],
        events: [
          episode.events[2]!,
          {
            id: "event-hidden-guest-interrupt",
            episodeId: episode.id,
            sequence: 4,
            kind: "producer_cue",
            payload: {
              kind: "ask_about",
              delivery: "interrupt_guest",
              audience: "host",
              interruptedMessageId: "cancelled-guest-draft",
              interruptionBridgeLine: "Hold that thought.",
            },
            occurredAt: "2026-07-17T17:00:05.000Z",
          },
        ],
        segments: [],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(
      transcript,
      /- Event ID: event-hidden-guest-interrupt \| Delivery: interrupt_guest \| Kind: ask_about \| Interrupted message ID: cancelled-guest-draft \| Scheduled bridge: Hold that thought\. \| Canonical interrupted message: no/u,
    );
    assert.match(
      transcript,
      /Canonical interrupted message: no means no audience-heard prefix was persisted; it does not mean the producer handoff disappeared\./u,
    );
    assert.doesNotMatch(
      transcript,
      /Producer interruption: interrupt_guest — ask_about \(event event-hidden-guest-interrupt\)/u,
    );
  });

  it("renders an explicit audible-response fallback for missing and empty cue arrays", () => {
    for (const presenceBeats of [undefined, []] as const) {
      const transcript = buildSignalReviewTranscript({
        episode,
        show,
        host: { id: "host-1", name: "Ada" },
        guest: { id: "guest-1", name: "Grace" },
        presenceBeats,
      });
      assert.match(
        transcript,
        /## Response cues \(heard only\)\n\nNo audible response cues\./u,
      );
    }
  });

  it("keeps saved interruption words in public transcript speech rather than stage actions", () => {
    const transcript = buildSignalReviewTranscript({
      episode: {
        ...episode,
        messages: [episode.messages[0]!],
        events: [
          {
            id: "event-interruption",
            episodeId: episode.id,
            sequence: 1,
            kind: "listener_reaction",
            payload: {
              plan: {
                v: 1,
                name: "listenerReaction",
                speakerBotId: "host-1",
                listenerBotId: "guest-1",
                messageId: "message-1",
                targetSource: "role",
                visualAction: "lean_in",
                spokenCue: "Hold on.",
                interjectionAttempt: true,
                floorOutcome: "yield",
                interruptedSpeakerCue: "One second.",
                interruptedSpeakerCuePlayback: "crosstalk",
                targetProgress: 0.5,
                seed: "interruption-seed",
                cameraCutEligible: true,
              },
            },
            occurredAt: "2026-07-17T17:00:05.000Z",
          },
        ],
      },
      show,
      host: { id: "host-1", name: "Ada" },
      guest: { id: "guest-1", name: "Grace" },
    });

    assert.match(
      transcript,
      /- Public reaction speech:\n    Grace: Hold on\./u,
    );
    assert.match(transcript, /- Stage action \(avatar only\):\n    \[none\]/u);
  });
});
