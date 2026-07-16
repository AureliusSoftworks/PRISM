import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  applyBotcastProducerCueToTension,
  botcastFallbackStudioAccentVariantForSeed,
  botcastCameraShotAt,
  botcastCameraOffsetXPercent,
  botcastCameraOffsetYPercent,
  botcastDirectorSuggestion,
  botcastGuestDepartureEligible,
  botcastGuestHasDepartedAt,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  botcastNextSpeakerRole,
  botcastSegmentForTurn,
  botcastSessionShouldClose,
  botcastVoiceMoodForTension,
  isBotcastFallbackStudioAccentVariant,
  normalizeBotcastStudioLayout,
  type BotcastReplayEvent,
} from "./botcast.ts";

describe("Signal fallback studio accents", () => {
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

  it("centers close-ups on each saved bot position", () => {
    const layout = normalizeBotcastStudioLayout({
      hostBot: { x: 14, y: 42 },
      guestBot: { x: 68, y: 75 },
    });
    assert.equal(botcastCameraOffsetXPercent("left", layout), 51.12);
    assert.equal(botcastCameraOffsetXPercent("right", layout), -25.56);
    assert.equal(botcastCameraOffsetXPercent("wide", layout), 0);
    assert.equal(botcastCameraOffsetYPercent("left", layout), 18.46);
    assert.equal(botcastCameraOffsetYPercent("right", layout), -28.4);
    assert.equal(botcastCameraOffsetYPercent("wide", layout), 0);
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

  it("uses wide for a departure and viewer-local manual locks", () => {
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
    ];
    assert.equal(
      botcastCameraShotAt({ events, elapsedMs: 7_000, manualShot: "auto" }),
      "right",
    );
    assert.equal(
      botcastCameraShotAt({ events, elapsedMs: 7_000, manualShot: "wide" }),
      "wide",
    );
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
