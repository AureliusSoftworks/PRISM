import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botPowerSourceHashV1 } from "./botPower.ts";

import {
  BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT,
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  BOTCAST_VOICE_LEVEL_DEFAULT,
  BOTCAST_VOICE_LEVEL_MAX,
  applyBotcastProducerCueToTension,
  botcastFallbackStudioAccentVariantForSeed,
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastCameraOffsetXPercent,
  botcastCameraOffsetYPercent,
  botcastDirectorSuggestion,
  botcastGuestDepartureEligible,
  botcastGuestHasDepartedAt,
  botcastListenerReactionForMessage,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  botcastNextSpeakerRole,
  botcastSegmentForTurn,
  botcastSessionShouldClose,
  botcastSocialInfluenceEventsAt,
  botcastStrongestNegativeSocialInfluenceAt,
  botcastSnapshotHasSpeakingOnlyAvatarVisibility,
  botcastVoiceMoodForTension,
  isBotcastFallbackStudioAccentVariant,
  normalizeBotcastStudioLayout,
  normalizeBotcastStudioAtmosphereMix,
  normalizeBotcastVoiceLevel,
  normalizeBotcastVoiceLevelsByBotId,
  swapBotcastStudioLayoutSeats,
  type BotcastReplayEvent,
} from "./botcast.ts";

describe("Signal fallback studio accents", () => {
  it("reads only valid saved listener reactions for the requested message", () => {
    const events: BotcastReplayEvent[] = [{
      id: "event-1",
      episodeId: "episode-1",
      sequence: 1,
      kind: "listener_reaction",
      occurredAt: "2026-07-17T12:00:00.000Z",
      payload: {
        plan: {
          v: 1,
          name: "listenerReaction",
          speakerBotId: "guest",
          listenerBotId: "host",
          messageId: "message-1",
          targetSource: "role",
          visualAction: "nod",
          spokenCue: "No, hold on.",
          interjectionAttempt: true,
          targetProgress: 0.48,
          seed: "signal-listener-v1:test",
          cameraCutEligible: true,
        },
      },
    }];
    assert.equal(
      botcastListenerReactionForMessage(events, "message-1")?.listenerBotId,
      "host",
    );
    assert.equal(
      botcastListenerReactionForMessage(events, "message-1")
        ?.interjectionAttempt,
      true,
    );
    assert.equal(botcastListenerReactionForMessage(events, "other"), null);
  });

  it("recognizes the three variants and deterministically assigns legacy shows", () => {
    assert.deepEqual(BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS, [0, 1, 2]);
    for (const variant of BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS) {
      assert.equal(isBotcastFallbackStudioAccentVariant(variant), true);
    }
    assert.equal(isBotcastFallbackStudioAccentVariant(-1), false);
    assert.equal(isBotcastFallbackStudioAccentVariant(3), false);
    assert.equal(isBotcastFallbackStudioAccentVariant("1"), false);

    const first = botcastFallbackStudioAccentVariantForSeed("legacy-show-1");
    assert.equal(
      botcastFallbackStudioAccentVariantForSeed("legacy-show-1"),
      first,
    );
    assert.equal(isBotcastFallbackStudioAccentVariant(first), true);
  });
});

describe("Signal replayed Power influence", () => {
  it("restores valid active influence and selects the strongest negative pressure", () => {
    const events: BotcastReplayEvent[] = [
      {
        id: "power-small",
        episodeId: "episode-1",
        sequence: 1,
        kind: "power_effect",
        occurredAt: "2026-07-17T12:00:00.000Z",
        payload: {
          v: 1,
          effect: "social_influence",
          powerId: "annoying",
          powerName: "Annoying",
          sourceBotId: "guest",
          targetBotId: "host",
          sourceRole: "guest",
          targetRole: "host",
          trigger: "after_speech",
          polarity: "negative",
          strength: "small",
          atMs: 3_200,
          sourceMessageId: "message-1",
        },
      },
      {
        id: "power-large",
        episodeId: "episode-1",
        sequence: 2,
        kind: "power_effect",
        occurredAt: "2026-07-17T12:00:00.000Z",
        payload: {
          v: 1,
          effect: "social_influence",
          powerId: "intimidation",
          powerName: "Intimidation",
          sourceBotId: "guest",
          targetBotId: "host",
          sourceRole: "guest",
          targetRole: "host",
          trigger: "session_start",
          polarity: "negative",
          strength: "large",
          atMs: 0,
        },
      },
    ];

    assert.equal(botcastSocialInfluenceEventsAt({ events, elapsedMs: 0 }).length, 1);
    assert.equal(
      botcastStrongestNegativeSocialInfluenceAt({
        events,
        elapsedMs: 4_000,
        targetBotId: "host",
      })?.powerName,
      "Intimidation",
    );
    assert.equal(
      botcastStrongestNegativeSocialInfluenceAt({
        events,
        elapsedMs: 4_000,
        targetBotId: "other",
      }),
      null,
    );
  });
});

describe("Signal replayed ghost avatar presence", () => {
  it("uses the episode-start Ready Power snapshot instead of mutable bot data", () => {
    const events: BotcastReplayEvent[] = [{
      id: "snapshot-1",
      episodeId: "episode-1",
      sequence: 1,
      kind: "segment",
      occurredAt: "2026-07-19T12:00:00.000Z",
      payload: {
        segment: "opening",
        ordinal: 0,
        powerSnapshot: {
          v: 1,
          hostBotId: "host",
          guestBotId: "guest",
          hostPowers: [],
          guestPowers: [{
            version: 1,
            id: "ghost",
            name: "Ghost",
            intent: "Invisible while idle and visible only while speaking.",
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(
                "Ghost",
                "Invisible while idle and visible only while speaking.",
              ),
              selfCue: "Fade in to speak.",
              observerCue: "A chill follows.",
              effects: [{ type: "avatar_visibility", mode: "speaking_only" }],
              ruleLabels: [],
            },
          }],
        },
      },
    }];
    assert.equal(
      botcastSnapshotHasSpeakingOnlyAvatarVisibility(
        { events, hostBotId: "host", guestBotId: "guest" },
        "guest",
      ),
      true,
    );
  });
});

describe("Signal studio relighting", () => {
  it("requests one replacement frame without persona reconstruction or comparison layouts", () => {
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /sole canonical source frame/iu);
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /change only the illumination and exterior sky/iu);
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /single daytime replacement frame/iu);
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /do not show a nighttime state/iu);
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /diptych|split screen|comparison/iu);
    assert.doesNotMatch(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /persona|set bible|host/iu);
  });
});

describe("Signal studio layout", () => {
  it("defaults missing positions and clamps saved props inside the stage", () => {
    assert.deepEqual(normalizeBotcastStudioLayout(undefined), BOTCAST_DEFAULT_STUDIO_LAYOUT);
    assert.equal(BOTCAST_DEFAULT_STUDIO_LAYOUT.hostBot.y, 71.25);
    assert.equal(BOTCAST_DEFAULT_STUDIO_LAYOUT.guestBot.y, 71.25);
    assert.equal(BOTCAST_DEFAULT_STUDIO_LAYOUT.hostCup.y, 90);
    assert.equal(BOTCAST_DEFAULT_STUDIO_LAYOUT.guestCup.y, 90);
    assert.deepEqual(
      normalizeBotcastStudioLayout({
        hostBot: { x: 22.5, y: 64 },
        guestBot: { x: 77.5, y: 64 },
        hostCup: { x: 36.25, y: 80 },
        guestCup: { x: 63.75, y: 80 },
      }),
      BOTCAST_DEFAULT_STUDIO_LAYOUT,
    );
    assert.deepEqual(
      normalizeBotcastStudioLayout({
        hostBot: { x: -40, y: 150 },
        guestCup: { x: 42.1234, y: 60.5678 },
      }),
      {
        ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
        hostBot: { x: 10, y: 82 },
        guestCup: { x: 42.12, y: 60.57 },
      },
    );
  });

  it("centers close-ups when possible and keeps every pan inside the TV frame", () => {
    const layout = normalizeBotcastStudioLayout({
      hostBot: { x: 14, y: 42 },
      guestBot: { x: 68, y: 75 },
    });
    assert.equal(botcastCameraOffsetXPercent("left", layout), 21);
    assert.equal(botcastCameraOffsetXPercent("right", layout), -21);
    assert.equal(botcastCameraOffsetXPercent("wide", layout), 0);
    assert.equal(botcastCameraOffsetYPercent("left", layout), 18.46);
    assert.equal(botcastCameraOffsetYPercent("right", layout), -18.9);
    assert.equal(botcastCameraOffsetYPercent("wide", layout), 0);
  });

  it("swaps the two seats while keeping each bot paired with its cup", () => {
    const layout = normalizeBotcastStudioLayout({
      hostBot: { x: 18, y: 62 },
      guestBot: { x: 74, y: 68 },
      hostCup: { x: 32, y: 86 },
      guestCup: { x: 67, y: 91 },
    });
    const swapped = swapBotcastStudioLayoutSeats(layout);

    assert.deepEqual(swapped, {
      hostBot: layout.guestBot,
      guestBot: layout.hostBot,
      hostCup: layout.guestCup,
      guestCup: layout.hostCup,
    });
    assert.deepEqual(swapBotcastStudioLayoutSeats(swapped), layout);
  });
});

describe("Signal voice levels", () => {
  it("normalizes show-scoped levels and preserves separate guests", () => {
    assert.equal(normalizeBotcastVoiceLevel(undefined), BOTCAST_VOICE_LEVEL_DEFAULT);
    assert.equal(normalizeBotcastVoiceLevel(9), BOTCAST_VOICE_LEVEL_MAX);
    assert.equal(normalizeBotcastVoiceLevel(-1), 0);
    assert.deepEqual(
      normalizeBotcastVoiceLevelsByBotId(
        { "guest-b": "0.65", "guest-c": 4, malformed: null },
        { host: 1.1, "guest-a": 0.8 },
      ),
      { host: 1.1, "guest-a": 0.8, "guest-b": 0.65, "guest-c": 1.25 },
    );
  });
});

describe("Signal studio atmosphere mix", () => {
  it("gives legacy shows the full fallback mix and bounds saved levels", () => {
    assert.deepEqual(
      normalizeBotcastStudioAtmosphereMix(undefined),
      BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
    );
    assert.deepEqual(
      normalizeBotcastStudioAtmosphereMix({
        background: 99,
        grain: -1,
        foley: "1.4",
      }),
      { background: 0.32, grain: 0, foley: 1.4 },
    );
    assert.deepEqual(
      normalizeBotcastStudioAtmosphereMix(
        { background: 0.2, grain: 0.006, foley: 1.1 },
        { background: 0, grain: 0, foley: 0 },
      ),
      { background: 0.2, grain: 0.006, foley: 1.1 },
    );
  });
});

describe("Botcast episode state", () => {
  it("maps recorded tension into a stable voice-delivery mood", () => {
    assert.equal(botcastVoiceMoodForTension({ level: 0 }), "neutral");
    assert.equal(botcastVoiceMoodForTension({ level: 1 }), "guarded");
    assert.equal(botcastVoiceMoodForTension({ level: 2 }), "strained");
    assert.equal(botcastVoiceMoodForTension({ level: 3 }), "strained");
  });

  it("moves through opening, interview, and closing with asymmetric turns", () => {
    assert.equal(
      botcastNextSpeakerRole({ messages: [], segment: "opening", guestDeparted: false }),
      "host",
    );
    assert.equal(
      botcastNextSpeakerRole({
        messages: [{ speakerRole: "host" }],
        segment: "opening",
        guestDeparted: false,
      }),
      "guest",
    );
    assert.equal(
      botcastSegmentForTurn({ current: "opening", utteranceCount: 2, guestDeparted: false }),
      "interview",
    );
    assert.equal(
      botcastSegmentForTurn({ current: "interview", utteranceCount: 10, guestDeparted: false }),
      "interview",
    );
    assert.equal(
      botcastNextSpeakerRole({
        messages: [{ speakerRole: "guest" }, { speakerRole: "host" }],
        segment: "closing",
        guestDeparted: false,
      }),
      null,
    );
  });

  it("lets Auto follow conversation tempo before closing at a safe ceiling", () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      speakerRole: index % 2 === 0 ? "host" as const : "guest" as const,
      content: "A substantial answer keeps opening another useful direction for the conversation tonight.",
    }));
    assert.equal(botcastSessionShouldClose({
      messages,
      durationMinutes: null,
      startedAtMs: 0,
      nowMs: 29 * 60_000,
    }), false);
    assert.equal(botcastSessionShouldClose({
      messages,
      durationMinutes: null,
      startedAtMs: 0,
      nowMs: 30 * 60_000,
    }), true);
    assert.equal(botcastSessionShouldClose({
      messages: [
        ...messages.slice(0, 5),
        { speakerRole: "guest", content: "Ultimately, that is what matters." },
      ],
      durationMinutes: null,
      startedAtMs: 0,
      nowMs: 1,
    }), true);
    assert.equal(botcastSessionShouldClose({
      messages: Array.from({ length: 30 }, (_, index) => ({
        speakerRole: index % 2 === 0 ? "host" as const : "guest" as const,
        content: "The subject remains active and unresolved across this exchange.",
      })),
      durationMinutes: null,
      startedAtMs: 0,
      nowMs: 1,
    }), true);
  });

  it("uses elapsed time for a timed Signal session without ending before three exchanges", () => {
    const twoExchanges = Array.from({ length: 4 }, (_, index) => ({
      speakerRole: index % 2 === 0 ? "host" as const : "guest" as const,
      content: "A line.",
    }));
    assert.equal(botcastSessionShouldClose({
      messages: twoExchanges,
      durationMinutes: 3,
      startedAtMs: 0,
      nowMs: 4 * 60_000,
    }), false);
    assert.equal(botcastSessionShouldClose({
      messages: [
        ...twoExchanges,
        { speakerRole: "host", content: "One more question." },
        { speakerRole: "guest", content: "One more answer." },
      ],
      durationMinutes: 3,
      startedAtMs: 0,
      nowMs: 4 * 60_000,
    }), true);
  });

  it("subtracts completed and active model warmup holds from Signal time", () => {
    const threeExchanges = Array.from({ length: 6 }, (_, index) => ({
      speakerRole: index % 2 === 0 ? "host" as const : "guest" as const,
      content: "A line.",
    }));
    assert.equal(botcastSessionShouldClose({
      messages: threeExchanges,
      durationMinutes: 3,
      startedAtMs: 0,
      nowMs: 4 * 60_000,
      modelWarmupHoldDurationMs: 2 * 60_000,
    }), false);
    assert.equal(botcastSessionShouldClose({
      messages: threeExchanges,
      durationMinutes: 3,
      startedAtMs: 0,
      nowMs: 4 * 60_000,
      modelWarmupHoldStartedAtMs: 2 * 60_000,
    }), false);
  });

  it("requires resistance and a warning before departure", () => {
    const calm = { level: 0 as const, warningCount: 0, stage: "calm" as const };
    const resistance = applyBotcastProducerCueToTension(calm, { kind: "press_harder" });
    assert.equal(resistance.stage, "resistance");
    assert.equal(botcastGuestDepartureEligible(resistance), false);
    const warning = applyBotcastProducerCueToTension(resistance, { kind: "press_harder" });
    assert.equal(warning.stage, "warning");
    assert.equal(warning.warningCount, 1);
    assert.equal(botcastGuestDepartureEligible(warning), false);
    const departed = applyBotcastProducerCueToTension(warning, { kind: "press_harder" });
    assert.equal(departed.stage, "departed");
    assert.equal(botcastGuestDepartureEligible(departed), true);
    assert.equal(
      applyBotcastProducerCueToTension(warning, { kind: "move_on" }).stage,
      "resistance",
    );
  });

  it("recognizes explicit pressure inside freeform producer direction", () => {
    const calm = { level: 0 as const, warningCount: 0, stage: "calm" as const };
    assert.equal(
      applyBotcastProducerCueToTension(calm, {
        kind: "ask_about",
        detail: "Annoy the guest off the show.",
      }).stage,
      "resistance",
    );
    assert.equal(
      applyBotcastProducerCueToTension(calm, {
        kind: "ask_about",
        detail: "Make a guest leave.",
      }).stage,
      "resistance",
    );
    const resistance = applyBotcastProducerCueToTension(calm, {
      kind: "ask_about",
      detail: "Say something to offend him. Try to get him to leave.",
    });
    assert.equal(resistance.stage, "resistance");

    const warning = applyBotcastProducerCueToTension(resistance, {
      kind: "ask_about",
      detail: "Be meaner.",
    });
    assert.equal(warning.stage, "warning");
    assert.equal(warning.warningCount, 1);

    const stagedInterruption = applyBotcastProducerCueToTension(warning, {
      kind: "ask_about",
      detail: "Interrupt him when he talks next.",
    });
    assert.deepEqual(stagedInterruption, warning);

    const departed = applyBotcastProducerCueToTension(stagedInterruption, {
      kind: "ask_about",
      detail: "Why is he faking that accent? Make him rage quit.",
    });
    assert.equal(departed.stage, "departed");
    assert.equal(botcastGuestDepartureEligible(departed), true);
  });
});

describe("Botcast replay director", () => {
  it("opens every episode on the host before dynamic direction takes over", () => {
    assert.deepEqual(
      botcastDirectorSuggestion({
        atMs: 0,
        speakerRole: "host",
        segment: "opening",
      }),
      {
        shot: "left",
        reason: "opening",
        atMs: 0,
        minimumHoldMs: 3_200,
      },
    );
  });

  it("holds short opposing lines instead of thrashing cameras", () => {
    const host = botcastDirectorSuggestion({
      atMs: 4_000,
      speakerRole: "host",
      utteranceDurationMs: 4_000,
      segment: "interview",
    });
    const shortGuest = botcastDirectorSuggestion({
      previous: host,
      atMs: 4_700,
      speakerRole: "guest",
      utteranceDurationMs: 700,
      segment: "interview",
    });
    assert.deepEqual(shortGuest, host);
    const sustainedGuest = botcastDirectorSuggestion({
      previous: host,
      atMs: host.atMs + BOTCAST_DIRECTOR_MIN_SHOT_MS,
      speakerRole: "guest",
      utteranceDurationMs: 4_200,
      segment: "interview",
    });
    assert.equal(sustainedGuest.shot, "right");
  });

  it("always takes the final host signoff wide", () => {
    const closing = botcastDirectorSuggestion({
      previous: {
        shot: "right",
        reason: "speaker",
        atMs: 12_000,
        minimumHoldMs: 3_200,
      },
      atMs: 12_400,
      speakerRole: "host",
      utteranceDurationMs: 1_400,
      segment: "closing",
    });
    assert.deepEqual(closing, {
      shot: "wide",
      reason: "closing",
      atMs: 12_400,
      minimumHoldMs: 3_200,
    });
  });

  it("uses wide for a departure and replays the recorded live camera modes", () => {
    const departure = botcastDirectorSuggestion({
      atMs: 12_000,
      speakerRole: "guest",
      segment: "closing",
      event: "departure",
    });
    assert.equal(departure.shot, "wide");
    const events: BotcastReplayEvent[] = [
      {
        id: "event-1",
        episodeId: "episode-1",
        sequence: 1,
        kind: "camera_suggestion",
        payload: { shot: "right", atMs: 5_000 },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "event-2",
        episodeId: "episode-1",
        sequence: 2,
        kind: "camera_suggestion",
        payload: { shot: "left", atMs: 7_000 },
        occurredAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "event-3",
        episodeId: "episode-1",
        sequence: 3,
        kind: "camera_mode",
        payload: { mode: "wide", shot: "wide", atMs: 6_000 },
        occurredAt: "2026-01-01T00:00:02.000Z",
      },
      {
        id: "event-4",
        episodeId: "episode-1",
        sequence: 4,
        kind: "camera_mode",
        payload: { mode: "auto", shot: "right", atMs: 8_000 },
        occurredAt: "2026-01-01T00:00:03.000Z",
      },
    ];
    assert.equal(
      botcastCameraShotAt({ events, elapsedMs: 5_500 }),
      "right",
    );
    assert.equal(
      botcastCameraShotAt({ events, elapsedMs: 7_500 }),
      "wide",
    );
    assert.equal(botcastCameraModeAt({ events, elapsedMs: 7_500 }), "wide");
    assert.equal(botcastCameraShotAt({ events, elapsedMs: 8_000 }), "right");
    assert.equal(botcastCameraModeAt({ events, elapsedMs: 8_000 }), "auto");
  });

  it("keeps the guest on stage until the saved departure beat", () => {
    const events: BotcastReplayEvent[] = [
      {
        id: "departure",
        episodeId: "episode",
        sequence: 1,
        kind: "departure",
        payload: {},
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "departure-camera",
        episodeId: "episode",
        sequence: 2,
        kind: "camera_suggestion",
        payload: { shot: "wide", reason: "departure", atMs: 9_000 },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    assert.equal(botcastGuestHasDepartedAt(events, 8_999), false);
    assert.equal(botcastGuestHasDepartedAt(events, 9_000), true);
    const timeline = botcastReplayTimeline(
      [{ content: "A short opening." }, { content: "A much longer guest answer with detail." }],
      events,
    );
    assert.ok(timeline.durationMs >= 12_200);
    assert.equal(botcastReplayMessageIndexAt(timeline.messageStartMs, 0), 0);
    assert.equal(
      botcastReplayMessageIndexAt(timeline.messageStartMs, timeline.messageStartMs[1]!),
      1,
    );
  });
});
