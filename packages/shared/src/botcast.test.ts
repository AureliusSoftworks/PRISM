import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botPowerAvatarScaleModeV1,
  botPowerIsMutedV1,
  botPowerSourceHashV1,
} from "./botPower.ts";

import {
  BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
  BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT,
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  BOTCAST_VOICE_LEVEL_DEFAULT,
  BOTCAST_VOICE_LEVEL_MAX,
  applyBotcastProducerCueToTension,
  botcastAutoCameraLeadInMs,
  botcastFallbackStudioAccentVariantForSeed,
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastCameraOffsetXPercent,
  botcastCameraOffsetYPercent,
  botcastDirectorSuggestion,
  botcastEpisodeDepartureOutcome,
  botcastGuestDepartureEligible,
  botcastGuestVoluntaryDepartureIntent,
  botcastGuestHasDepartedAt,
  botcastHostHasDepartedAt,
  botcastHostInterruptionLineAt,
  botcastHostInterruptionLinesForSeed,
  botcastHostRageQuitIntent,
  botcastHostSignOffIntent,
  botcastInterruptedGuestContent,
  botcastInterruptionBridgeMessageId,
  botcastMessageIsEphemeralInterruptionBridge,
  botcastListenerReactionForMessage,
  botcastProducerGuestThinkingDiscountMs,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  botcastSoundboardCueFromEvent,
  botcastSoundboardCueLabel,
  botcastSignalStandardCadenceDurationMs,
  botcastNextSpeakerRole,
  botcastSegmentForTurn,
  botcastSessionShouldClose,
  botcastSocialInfluenceEventsAt,
  botcastMoodDrainEventsAt,
  normalizeBotcastMoodDrainEventV1,
  botcastStrongestNegativeSocialInfluenceAt,
  botcastSnapshotAvatarVisibilityModeV1,
  botcastSnapshotHasSpeakingOnlyAvatarVisibility,
  botcastSnapshotPowersForRoleV1,
  botcastVoiceMoodForTension,
  isBotcastFallbackStudioAccentVariant,
  isBotcastEchoDashboardBlurb,
  normalizeBotcastStudioLayout,
  normalizeBotcastStudioAtmosphereMix,
  normalizeBotcastStudioGlowTuning,
  normalizeBotcastHostRecoveryQuestions,
  normalizeBotcastVoiceLevel,
  normalizeBotcastVoiceLevelsByBotId,
  swapBotcastStudioLayoutSeats,
  type BotcastReplayEvent,
} from "./botcast.ts";

describe("Signal fallback studio accents", () => {
  it("normalizes the four replay-safe Signal soundboard cues", () => {
    const event: BotcastReplayEvent = {
      id: "soundboard-1",
      episodeId: "episode-1",
      sequence: 1,
      kind: "soundboard_cue",
      payload: { kind: "applause", atMs: 1_250, source: "producer" },
      occurredAt: "2026-07-21T00:00:00.000Z",
    };
    assert.deepEqual(botcastSoundboardCueFromEvent(event), {
      kind: "applause",
      atMs: 1_250,
    });
    assert.equal(botcastSoundboardCueLabel("rimshot"), "Rimshot");
    assert.equal(
      botcastSoundboardCueFromEvent({
        ...event,
        payload: { kind: "airhorn", atMs: 1_250 },
      }),
      null,
    );
  });

  it("uses Premium-calibrated cadence for speech and a full shot for silence", () => {
    assert.equal(
      botcastSignalStandardCadenceDurationMs(
        "A streamed reply with several words.",
      ),
      2_260,
    );
    assert.equal(
      botcastSignalStandardCadenceDurationMs("..."),
      BOTCAST_DIRECTOR_MIN_SHOT_MS,
    );
    const replayLine = "One two three four five six seven eight nine ten eleven twelve.";
    const replayTimeline = botcastReplayTimeline(
      [{ content: replayLine }],
      [],
    );
    assert.equal(
      replayTimeline.messageEndMs[0]! - replayTimeline.messageStartMs[0]!,
      botcastSignalStandardCadenceDurationMs(replayLine),
    );
  });

  it("recognizes the one Echo dashboard joke across persona wording", () => {
    assert.equal(
      BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
      "I always have an original thing to say.",
    );
    assert.equal(
      isBotcastEchoDashboardBlurb(
        "Naturally, my originality remains entirely without precedent.",
      ),
      true,
    );
    assert.equal(
      isBotcastEchoDashboardBlurb("Here is another unrelated dashboard quip."),
      false,
    );
  });

  it("keeps host interruption bridges stable and trims guests to what aired", () => {
    const lines = botcastHostInterruptionLinesForSeed("host-1");
    assert.equal(lines.length, 6);
    assert.deepEqual(lines, botcastHostInterruptionLinesForSeed("host-1"));
    assert.equal(botcastHostInterruptionLineAt(lines, lines.length), lines[0]);
    assert.equal(
      botcastInterruptedGuestContent(
        "The part you have heard and the hidden remainder.",
        "The part you have heard",
      ),
      "The part you have heard—",
    );
    assert.equal(
      botcastInterruptedGuestContent("Nothing aired.", ""),
      null,
    );
    const id = botcastInterruptionBridgeMessageId("episode-1", 2);
    assert.equal(
      botcastMessageIsEphemeralInterruptionBridge({ id }),
      true,
    );
  });

  it("keeps only a complete, distinct set of reusable host recovery questions", () => {
    assert.deepEqual(
      normalizeBotcastHostRecoveryQuestions([
        "Show me one example that would actually test that claim?",
        "Which consequence matters, and who gets handed the bill?",
        "Where does that become a choice rather than a slogan?",
        "What evidence would force you to revise the answer?",
        "A fifth question should not survive?",
      ]),
      [
        "Show me one example that would actually test that claim?",
        "Which consequence matters, and who gets handed the bill?",
        "Where does that become a choice rather than a slogan?",
        "What evidence would force you to revise the answer?",
      ],
    );
    assert.deepEqual(
      normalizeBotcastHostRecoveryQuestions([
        "Question: What happened?",
        "[leans in] What happened?",
        "This is not a question.",
      ]),
      [],
    );
    assert.deepEqual(normalizeBotcastHostRecoveryQuestions(["..."]), ["..."]);
  });

  it("reads only valid saved listener reactions for the requested message", () => {
    const events: BotcastReplayEvent[] = [
      {
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
            interruptedSpeakerCue: "... okay, never mind, I guess.",
            interruptedSpeakerCuePlayback: "crosstalk",
            targetProgress: 0.48,
            seed: "signal-listener-v1:test",
            cameraCutEligible: true,
          },
        },
      },
      {
        id: "event-2",
        episodeId: "episode-1",
        sequence: 2,
        kind: "listener_reaction",
        occurredAt: "2026-07-17T12:00:05.000Z",
        payload: {
          plan: {
            v: 1,
            name: "listenerReaction",
            speakerBotId: "host",
            listenerBotId: "guest",
            messageId: "message-2",
            targetSource: "role",
            visualAction: "head_tilt",
            vocalFoley: "clears throat",
            targetProgress: 0.55,
            seed: "signal-listener-v1:foley",
            cameraCutEligible: false,
          },
        },
      },
    ];
    assert.equal(
      botcastListenerReactionForMessage(events, "message-1")?.listenerBotId,
      "host",
    );
    assert.equal(
      botcastListenerReactionForMessage(events, "message-1")
        ?.interjectionAttempt,
      true,
    );
    assert.equal(
      botcastListenerReactionForMessage(events, "message-1")
        ?.interruptedSpeakerCuePlayback,
      "crosstalk",
    );
    assert.equal(botcastListenerReactionForMessage(events, "other"), null);
    assert.equal(
      botcastListenerReactionForMessage(events, "message-2")?.vocalFoley,
      "clears throat",
    );
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

describe("Signal automatic camera lead-in", () => {
  it("waits briefly for short speech and caps the delay on long turns", () => {
    assert.equal(botcastAutoCameraLeadInMs(1_400), 240);
    assert.equal(botcastAutoCameraLeadInMs(2_800), 336);
    assert.equal(botcastAutoCameraLeadInMs(12_000), 420);
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

describe("Signal replayed mood drain", () => {
  it("normalizes and deduplicates one explicit addresser drain per holder and source turn", () => {
    const payload = {
      v: 1,
      effect: "mood_drain",
      powerId: "sad-sally",
      powerName: "Sad",
      sourceBotId: "sally",
      targetBotId: "host",
      sourceRole: "guest",
      targetRole: "host",
      trigger: "after_direct_address",
      recipient: "addresser",
      strength: "medium",
      theme: "light",
      moodBefore: "neutral",
      moodAfter: "guarded",
      atMs: 3_200,
      sourceMessageId: "host-addresses-sally",
    } as const;
    assert.deepEqual(normalizeBotcastMoodDrainEventV1(payload), payload);
    const events: BotcastReplayEvent[] = [1, 2].map((sequence) => ({
      id: `drain-${sequence}`,
      episodeId: "episode-drain",
      sequence,
      kind: "power_effect" as const,
      occurredAt: "2026-07-21T02:00:00.000Z",
      payload,
    }));
    assert.deepEqual(
      botcastMoodDrainEventsAt({
        events,
        elapsedMs: Number.POSITIVE_INFINITY,
        targetBotId: "host",
      }),
      [payload],
    );
    assert.equal(
      normalizeBotcastMoodDrainEventV1({ ...payload, recipient: "everyone" }),
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
              effects: [
                { type: "avatar_scale", mode: "smaller" },
                { type: "avatar_visibility", mode: "speaking_only" },
              ],
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
    assert.equal(
      botcastSnapshotAvatarVisibilityModeV1(
        { events, hostBotId: "host", guestBotId: "guest" },
        "guest",
      ),
      "speaking_only",
    );
    assert.equal(
      botPowerAvatarScaleModeV1(
        botcastSnapshotPowersForRoleV1(
          { events, hostBotId: "host", guestBotId: "guest" },
          "guest",
        ),
      ),
      "smaller",
    );
  });

  it("exposes legacy mute snapshots to every live Signal side channel", () => {
    const name = "Mute";
    const intent = "Never talks. Ever.";
    const events: BotcastReplayEvent[] = [{
      id: "snapshot-mute",
      episodeId: "episode-mute",
      sequence: 1,
      kind: "segment",
      occurredAt: "2026-07-19T12:00:00.000Z",
      payload: {
        segment: "opening",
        ordinal: 0,
        powerSnapshot: {
          v: 1,
          hostBotId: "silent-jack",
          guestBotId: "guest",
          hostPowers: [{
            version: 1,
            id: "legacy-mute",
            name,
            intent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(name, intent),
              selfCue: "Silence is golden.",
              observerCue: "He rarely speaks.",
              effects: [],
              ruleLabels: ["Absolute Silence"],
            },
          }],
          guestPowers: [],
        },
      },
    }];
    const episode = {
      events,
      hostBotId: "silent-jack",
      guestBotId: "guest",
    };

    assert.equal(
      botPowerIsMutedV1(botcastSnapshotPowersForRoleV1(episode, "host")),
      true,
    );
    assert.equal(
      botPowerIsMutedV1(botcastSnapshotPowersForRoleV1(episode, "guest")),
      false,
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
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /Preserve[\s\S]*microphones/iu);
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /#FF00FF[\s\S]*every other object/iu);
    assert.match(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /Do not add coffee cups, mugs/iu);
    assert.doesNotMatch(BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT, /persona|set bible|host/iu);
  });
});

describe("Signal studio layout", () => {
  it("defaults missing positions and clamps saved props inside the stage", () => {
    assert.deepEqual(normalizeBotcastStudioLayout(undefined), BOTCAST_DEFAULT_STUDIO_LAYOUT);
    assert.deepEqual(BOTCAST_DEFAULT_STUDIO_LAYOUT, {
      hostBot: { x: 18.5, y: 66 },
      guestBot: { x: 81.5, y: 66 },
      hostCup: { x: 36.25, y: 86 },
      guestCup: { x: 63.75, y: 86 },
      hostFloorGlow: { x: 18.5, y: 84, scale: 1 },
      guestFloorGlow: { x: 81.5, y: 84, scale: 1 },
    });
    assert.deepEqual(
      normalizeBotcastStudioLayout({
        hostBot: { x: 22.5, y: 71.25 },
        guestBot: { x: 77.5, y: 71.25 },
        hostCup: { x: 36.25, y: 90 },
        guestCup: { x: 63.75, y: 90 },
      }),
      BOTCAST_DEFAULT_STUDIO_LAYOUT,
    );
    assert.equal(
      normalizeBotcastStudioLayout({
        hostBot: { x: 22.5, y: 71.25 },
        guestBot: { x: 77.5, y: 71.25 },
        hostCup: { x: 36.25, y: 90 },
        guestCup: { x: 63.75, y: 90 },
        hostFloorGlow: { x: 22.5, y: 86, scale: 0.5 },
        guestFloorGlow: { x: 77.5, y: 86, scale: 0.75 },
      }).hostFloorGlow.scale,
      0.5,
    );
    assert.deepEqual(
      normalizeBotcastStudioLayout({
        hostBot: { x: 22.5, y: 64 },
        guestBot: { x: 77.5, y: 64 },
        hostCup: { x: 36.25, y: 80 },
        guestCup: { x: 63.75, y: 80 },
      }),
      BOTCAST_DEFAULT_STUDIO_LAYOUT,
    );
    const customizedPreviousLayout = {
      hostBot: { x: 20, y: 71.25 },
      guestBot: { x: 77.5, y: 71.25 },
      hostCup: { x: 36.25, y: 90 },
      guestCup: { x: 63.75, y: 90 },
    };
    assert.deepEqual(
      normalizeBotcastStudioLayout(customizedPreviousLayout),
      {
        ...customizedPreviousLayout,
        hostFloorGlow: { x: 20, y: 84, scale: 1 },
        guestFloorGlow: { x: 77.5, y: 84, scale: 1 },
      },
    );
    assert.deepEqual(
      normalizeBotcastStudioLayout({
        hostBot: { x: -40, y: 150 },
        guestCup: { x: 42.1234, y: 60.5678 },
        hostFloorGlow: { x: 70, y: 120, scale: 0.1 },
      }),
      {
        ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
        hostBot: { x: 10, y: 82 },
        guestCup: { x: 42.12, y: 60.57 },
        hostFloorGlow: { x: 10, y: 96, scale: 0.35 },
      },
    );
    assert.equal(
      normalizeBotcastStudioLayout({
        guestFloorGlow: { x: 80, y: 84, scale: 8 },
      }).guestFloorGlow.scale,
      1,
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

  it("swaps the seats with each bot's cup and floor glow", () => {
    const layout = normalizeBotcastStudioLayout({
      hostBot: { x: 18, y: 62 },
      guestBot: { x: 74, y: 68 },
      hostCup: { x: 32, y: 86 },
      guestCup: { x: 67, y: 91 },
      hostFloorGlow: { x: 18, y: 80, scale: 0.55 },
      guestFloorGlow: { x: 74, y: 88, scale: 0.8 },
    });
    const swapped = swapBotcastStudioLayoutSeats(layout);

    assert.deepEqual(swapped, {
      hostBot: layout.guestBot,
      guestBot: layout.hostBot,
      hostCup: layout.guestCup,
      guestCup: layout.hostCup,
      hostFloorGlow: layout.guestFloorGlow,
      guestFloorGlow: layout.hostFloorGlow,
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
    assert.equal(BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX.filmGrain, 1);
    assert.deepEqual(
      normalizeBotcastStudioAtmosphereMix({
        background: 99,
        grain: -1,
        foley: "1.4",
        filmGrain: 99,
      }),
      { background: 0.32, grain: 0, foley: 1.4, filmGrain: 1 },
    );
    assert.deepEqual(
      normalizeBotcastStudioAtmosphereMix(
        { background: 0.2, grain: 0.006, foley: 1.1, filmGrain: 0 },
        { background: 0, grain: 0, foley: 0, filmGrain: 0.75 },
      ),
      { background: 0.2, grain: 0, foley: 1.1, filmGrain: 0 },
    );
  });
});

describe("Signal studio underglow", () => {
  it("defaults both themes to full-strength Overlay and bounds saved show tuning", () => {
    assert.deepEqual(
      normalizeBotcastStudioGlowTuning(undefined),
      BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
    );
    assert.deepEqual(normalizeBotcastStudioGlowTuning({
      dark: { opacity: 4, blendMode: "multiply" },
      light: { opacity: "0.37", blendMode: "screen" },
    }), {
      dark: { opacity: 1, blendMode: "overlay" },
      light: { opacity: 0.37, blendMode: "screen" },
    });
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
      botcastNextSpeakerRole({
        messages: [],
        segment: "opening",
        guestDeparted: false,
      }),
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
      botcastSegmentForTurn({
        current: "opening",
        utteranceCount: 2,
        guestDeparted: false,
      }),
      "interview",
    );
    assert.equal(
      botcastSegmentForTurn({
        current: "interview",
        utteranceCount: 10,
        guestDeparted: false,
      }),
      "interview",
    );
    assert.equal(
      botcastNextSpeakerRole({
        messages: [{ speakerRole: "host" }, { speakerRole: "guest" }],
        segment: "closing",
        guestDeparted: false,
      }),
      "host",
    );
    assert.equal(
      botcastNextSpeakerRole({
        messages: [
          { speakerRole: "host" },
          { speakerRole: "guest" },
          { speakerRole: "host" },
        ],
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
      messages: Array.from({ length: 12 }, (_, index) => ({
        speakerRole: index % 2 === 0 ? "host" as const : "guest" as const,
        content: index === 11
          ? "Good luck with Karen. I mean that."
          : "A substantial exchange keeps developing the topic with a concrete example.",
      })),
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

  it("does not mistake repeated questions and fragments for a settled interview", () => {
    const reviewedEpisode = [
      { speakerRole: "host" as const, content: "What makes a plan perfect?" },
      { speakerRole: "guest" as const, content: "Sorry, what was that you said?" },
      { speakerRole: "host" as const, content: "Does its design matter, or must it survive reality?" },
      { speakerRole: "guest" as const, content: "For real, once more. What did you just ask?" },
      { speakerRole: "host" as const, content: "When a plan fails, should it bend or blame reality?" },
      { speakerRole: "guest" as const, content: "Sorry, I got distracted. What was that?" },
      { speakerRole: "host" as const, content: "What makes a plan perfect?" },
      { speakerRole: "guest" as const, content: "coffee..." },
      { speakerRole: "host" as const, content: "Does a perfect plan adapt?" },
      { speakerRole: "guest" as const, content: "No, a perfect plan involves coffee. Lots of coffee." },
    ];
    assert.equal(botcastSessionShouldClose({
      messages: reviewedEpisode,
      durationMinutes: null,
      startedAtMs: 0,
      nowMs: 5 * 60_000,
    }), false);

    const substantiveEpisode = reviewedEpisode.map((message, index) =>
      message.speakerRole === "guest" && index < 7
        ? {
            ...message,
            content:
              "A perfect plan changes when reality exposes a cost its designer missed.",
          }
        : message,
    );
    assert.equal(botcastSessionShouldClose({
      messages: substantiveEpisode,
      durationMinutes: null,
      startedAtMs: 0,
      nowMs: 5 * 60_000,
    }), true);
  });

  it("recognizes earned voluntary exits without treating conditional warnings as departures", () => {
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "I should probably get going and let you two have this conversation.",
      segment: "interview",
      priorUtteranceCount: 7,
    }), true);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "This is my cue to step outside now. Take care of each other.",
      segment: "interview",
      priorUtteranceCount: 11,
    }), true);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "If you keep pushing, I have to leave.",
      segment: "interview",
      priorUtteranceCount: 11,
    }), false);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "I need to go back to the contradiction in your first question.",
      segment: "interview",
      priorUtteranceCount: 11,
    }), false);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "I should leave that assumption aside and answer the real question.",
      segment: "interview",
      priorUtteranceCount: 11,
    }), false);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "I'm going back to your first question because the premise matters.",
      segment: "interview",
      priorUtteranceCount: 11,
    }), false);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "I'm leaving that interpretation behind, not the interview.",
      segment: "interview",
      priorUtteranceCount: 11,
    }), false);
    assert.equal(botcastGuestVoluntaryDepartureIntent({
      content: "I should probably get going.",
      segment: "opening",
      priorUtteranceCount: 1,
    }), false);
  });

  it("recognizes an earned host rage-quit without treating threats as a departure", () => {
    assert.equal(botcastHostRageQuitIntent({
      content: "No. I'm ending this interview now.",
      segment: "interview",
      priorUtteranceCount: 6,
    }), true);
    assert.equal(botcastHostRageQuitIntent({
      content: "We're done here. I refuse to continue.",
      segment: "interview",
      priorUtteranceCount: 8,
    }), true);
    assert.equal(botcastHostRageQuitIntent({
      content: "I've had enough. I'm leaving the studio.",
      segment: "interview",
      priorUtteranceCount: 8,
    }), true);
    assert.equal(botcastHostRageQuitIntent({
      content: "If you keep dodging the question, we're done here.",
      segment: "interview",
      priorUtteranceCount: 8,
    }), false);
    assert.equal(botcastHostRageQuitIntent({
      content: "I'm ending this interview now.",
      segment: "interview",
      priorUtteranceCount: 4,
    }), false);
    assert.equal(botcastHostRageQuitIntent({
      content: "I'm ending this interview now.",
      segment: "closing",
      priorUtteranceCount: 8,
    }), false);
  });

  it("recognizes an earned host sign-off without closing on descriptive or conditional wording", () => {
    assert.equal(botcastHostSignOffIntent({
      content:
        "Verdict: memory beats mush; that's the podcast, go watch something with consequences.",
      segment: "interview",
      priorUtteranceCount: 12,
    }), true);
    assert.equal(botcastHostSignOffIntent({
      content:
        "Episode's over, verdict stands, and no, drink in your own dimension.",
      segment: "interview",
      priorUtteranceCount: 14,
    }), true);
    assert.equal(botcastHostSignOffIntent({
      content:
        "And that's the show, folks—consequences matter and cutaways don't.",
      segment: "interview",
      priorUtteranceCount: 16,
    }), true);
    assert.equal(botcastHostSignOffIntent({
      content:
        "Storming the wing factory — hehehehehehe, that's the most romantic thing anyone's ever said to me. That's it for What Grinds Your Gears — Rick Sanchez, everybody, the guy who killed money and made my change jar cry. Freakin' sweet, goodnight Quahog!",
      segment: "interview",
      priorUtteranceCount: 14,
    }), true);
    assert.equal(botcastHostSignOffIntent({
      content:
        'Hehehehehehe, "subpoenas are annoyingly real" — put that on my tombstone right under "he tried to deep-fry the jar." We\'re out, goodnight everybody!',
      segment: "interview",
      priorUtteranceCount: 16,
    }), true);
    assert.equal(botcastHostSignOffIntent({
      content: "That's the show I wanted to make, but we still have more to discuss.",
      segment: "interview",
      priorUtteranceCount: 12,
    }), false);
    assert.equal(botcastHostSignOffIntent({
      content: "If that's it for tonight, we never reach the hard question.",
      segment: "interview",
      priorUtteranceCount: 12,
    }), false);
    assert.equal(botcastHostSignOffIntent({
      content: "If the episode's over, we never reach the difficult question.",
      segment: "interview",
      priorUtteranceCount: 12,
    }), false);
    assert.equal(botcastHostSignOffIntent({
      content: "That's the podcast, everyone.",
      segment: "interview",
      priorUtteranceCount: 4,
    }), false);
    assert.equal(botcastHostSignOffIntent({
      content: "That's the podcast, everyone.",
      segment: "closing",
      priorUtteranceCount: 12,
    }), false);
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

  it("runs the episode clock at half speed while the Producer guest thinks", () => {
    const threeExchanges = Array.from({ length: 6 }, (_, index) => ({
      speakerRole: index % 2 === 0 ? "host" as const : "guest" as const,
      content: "A line.",
    }));
    assert.equal(
      botcastSessionShouldClose({
        messages: threeExchanges,
        durationMinutes: 3,
        startedAtMs: 0,
        nowMs: 4 * 60_000,
        producerGuestThinkingDiscountMs: 2 * 60_000,
      }),
      false,
    );
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
    assert.deepEqual(
      applyBotcastProducerCueToTension(calm, { kind: "refocus" }),
      calm,
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

  it("keeps Auto wide for an audible but hidden performer", () => {
    assert.deepEqual(
      botcastDirectorSuggestion({
        atMs: 4_000,
        speakerRole: "host",
        speakerVisible: false,
        utteranceDurationMs: 4_000,
        segment: "interview",
      }),
      {
        shot: "wide",
        reason: "hidden_speaker",
        atMs: 4_000,
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

  it("smooths legacy recurring Auto Wide cuts without overriding producer Wide", () => {
    const events: BotcastReplayEvent[] = [
      {
        id: "speaker-host",
        episodeId: "episode-1",
        sequence: 1,
        kind: "camera_suggestion",
        payload: { shot: "left", reason: "speaker", atMs: 1_000 },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "legacy-transition",
        episodeId: "episode-1",
        sequence: 2,
        kind: "camera_suggestion",
        payload: { shot: "wide", reason: "transition", atMs: 4_000 },
        occurredAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "producer-wide",
        episodeId: "episode-1",
        sequence: 3,
        kind: "camera_mode",
        payload: { mode: "wide", shot: "wide", atMs: 5_000 },
        occurredAt: "2026-01-01T00:00:02.000Z",
      },
      {
        id: "producer-auto",
        episodeId: "episode-1",
        sequence: 4,
        kind: "camera_mode",
        payload: { mode: "auto", shot: "right", atMs: 6_000 },
        occurredAt: "2026-01-01T00:00:03.000Z",
      },
    ];

    assert.equal(botcastCameraShotAt({ events, elapsedMs: 4_500 }), "left");
    assert.equal(botcastCameraShotAt({ events, elapsedMs: 5_500 }), "wide");
    assert.equal(botcastCameraShotAt({ events, elapsedMs: 6_000 }), "right");
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
    assert.equal(botcastHostHasDepartedAt(events, 9_000), false);
    assert.equal(botcastEpisodeDepartureOutcome(events), "guest_departed");
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

  it("keeps host departures distinct from legacy guest walkouts", () => {
    const events: BotcastReplayEvent[] = [
      {
        id: "host-departure",
        episodeId: "episode",
        sequence: 1,
        kind: "departure",
        payload: { speakerRole: "host", cause: "host_rage_quit" },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "host-departure-camera",
        episodeId: "episode",
        sequence: 2,
        kind: "camera_suggestion",
        payload: {
          shot: "wide",
          reason: "departure",
          speakerRole: "host",
          atMs: 9_000,
        },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    assert.equal(botcastHostHasDepartedAt(events, 8_999), false);
    assert.equal(botcastHostHasDepartedAt(events, 9_000), true);
    assert.equal(botcastGuestHasDepartedAt(events, 9_000), false);
    assert.equal(botcastEpisodeDepartureOutcome(events), "host_departed");
  });

  it("replays Producer typing pauses at the half-speed episode duration", () => {
    const events: BotcastReplayEvent[] = [
      {
        id: "thinking",
        episodeId: "episode",
        sequence: 1,
        kind: "guest_thinking",
        payload: {
          messageId: "guest-answer",
          wallDurationMs: 12_000,
          timelineDurationMs: 12_000,
        },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const timeline = botcastReplayTimeline(
      [
        { id: "host-question", content: "What changed?" },
        { id: "guest-answer", content: "My standards changed." },
      ],
      events,
    );

    assert.equal(botcastProducerGuestThinkingDiscountMs(events), 6_000);
    assert.equal(timeline.thinkingRanges[0]?.startMs, timeline.messageEndMs[0]);
    assert.equal(
      timeline.thinkingRanges[0]?.endMs,
      timeline.messageEndMs[0]! + 6_000,
    );
    assert.equal(
      timeline.messageStartMs[1],
      timeline.thinkingRanges[0]?.endMs,
    );
    assert.equal(
      botcastReplayMessageIndexAt(
        timeline.messageStartMs,
        timeline.messageEndMs[0]! + 1_000,
        timeline.messageEndMs,
      ),
      -1,
    );
  });

  it("keeps complete perception-overlap lines with at most two voices", () => {
    const overlap = (
      sequence: number,
      precedingMessageId: string,
      overlappingMessageId: string,
      precedingBotId: string,
      overlappingBotId: string,
    ): BotcastReplayEvent => ({
      id: `overlap-${sequence}`,
      episodeId: "episode",
      sequence,
      kind: "power_effect",
      payload: {
        v: 1,
        effect: "perception_overlap",
        precedingMessageId,
        overlappingMessageId,
        precedingBotId,
        overlappingBotId,
        startRatio: 0.64,
        maxSimultaneousVoices: 2,
      },
      occurredAt: "2026-07-21T00:00:00.000Z",
    });
    const timeline = botcastReplayTimeline(
      [
        { id: "one", content: "First speaker gives a complete and deliberately long answer." },
        { id: "two", content: "Second speaker begins without hearing that answer and keeps talking." },
        { id: "three", content: "Third speaker also attempts to begin before the handoff settles." },
      ],
      [
        overlap(1, "one", "two", "ryuk", "lincoln"),
        overlap(2, "two", "three", "lincoln", "ryuk"),
      ],
    );
    assert.ok(timeline.messageStartMs[1]! < timeline.messageEndMs[0]!);
    assert.ok(timeline.messageEndMs[1]! > timeline.messageStartMs[1]!);
    assert.ok(timeline.messageStartMs[2]! >= timeline.messageEndMs[0]!);
    assert.ok(timeline.messageEndMs[2]! > timeline.messageStartMs[2]!);
  });
});
