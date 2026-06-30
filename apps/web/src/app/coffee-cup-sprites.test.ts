import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoffeeCupVisualState,
  coffeeCupColorForBotColor,
  coffeeCupConsumptionRate,
  coffeeCupFramePosition,
  coffeeCupProgressForSipCount,
  coffeeCupPrismFamilyForBotColor,
  coffeeCupSessionDurationPaceMultiplier,
  coffeeCupSipCycleMs,
  coffeeCupSipAnimationTiming,
  coffeeCupShouldMirrorForSeat,
  coffeeCupSideForSeat,
  coffeeCupSippingActive,
} from "./coffee-cup-sprites.ts";

describe("coffee cup sprites", () => {
  it("maps drink levels to authored sheet positions", () => {
    assert.deepEqual(coffeeCupFramePosition(0), { frameX: "0%", frameY: "0%" });
    assert.deepEqual(coffeeCupFramePosition(2), { frameX: "100%", frameY: "0%" });
    assert.deepEqual(coffeeCupFramePosition(3), { frameX: "0%", frameY: "100%" });
    assert.deepEqual(coffeeCupFramePosition(5), { frameX: "100%", frameY: "100%" });
  });

  it("advances cup state over session time and force-empties finished cups", () => {
    const full = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      botColor: "#2fd3e3",
      nowMs: 1_000,
      sessionStartedAtMs: 1_000,
      sessionEndsAtMs: 601_000,
      durationMinutes: 10,
    });
    const empty = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 601_000,
      sessionStartedAtMs: 1_000,
      sessionEndsAtMs: 601_000,
      durationMinutes: 10,
    });
    const finished = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 601_000,
      sessionStartedAtMs: 1_000,
      sessionEndsAtMs: 601_000,
      durationMinutes: 10,
      forceEmpty: true,
    });

    assert.equal(full.frameIndex, 0);
    assert.equal(full.color, "blue");
    assert.match(full.restImageUrl, /coffee_blue\.png$/);
    assert.match(full.sipImageUrl, /coffee_blue_sip\.png$/);
    assert.ok(empty.progress > full.progress);
    assert.ok(empty.frameIndex >= full.frameIndex);
    assert.equal(finished.frameIndex, 5);
    assert.equal(finished.amount, "empty");
  });

  it("selects light-mode cup sprites when requested", () => {
    const dark = buildCoffeeCupVisualState({
      seed: "session:bot-red",
      botColor: "#ff4d6d",
      nowMs: 1_000,
      theme: "dark",
    });
    const light = buildCoffeeCupVisualState({
      seed: "session:bot-red",
      botColor: "#ff4d6d",
      nowMs: 1_000,
      theme: "light",
    });

    assert.match(dark.restImageUrl, /coffee_red\.png$/);
    assert.match(dark.sipImageUrl, /coffee_red_sip\.png$/);
    assert.match(light.restImageUrl, /coffee_light_red\.png$/);
    assert.match(light.sipImageUrl, /coffee_light_red_sip\.png$/);
  });

  it("maps accepted sip counts to deterministic visual depletion", () => {
    assert.equal(coffeeCupProgressForSipCount(0), 0);
    assert.equal(coffeeCupProgressForSipCount(1), 0.2);
    assert.equal(coffeeCupProgressForSipCount(4), 0.8);
    assert.equal(coffeeCupProgressForSipCount(9), 0.96);

    const untouched = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 300_000,
      sessionStartedAtMs: 1_000,
      sessionEndsAtMs: 301_000,
      durationMinutes: 5,
      sipCount: 0,
      sippingOverride: false,
    });
    const afterTwoSips = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 300_000,
      sessionStartedAtMs: 1_000,
      sessionEndsAtMs: 301_000,
      durationMinutes: 5,
      sipCount: 2,
      sippingOverride: false,
    });

    assert.equal(untouched.frameIndex, 0);
    assert.equal(untouched.progress, 0);
    assert.ok(afterTwoSips.progress > untouched.progress);
    assert.equal(afterTwoSips.frameIndex, 2);
  });

  it("uses explicit sip animation only when provided for sip-count cups", () => {
    const notSipping = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 1_000,
      sipCount: 1,
      sippingOverride: false,
    });
    const sipping = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 1_000,
      sipCount: 1,
      sippingOverride: true,
    });
    const emptySipping = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 1_000,
      sipCount: 8,
      sippingOverride: true,
    });

    assert.equal(notSipping.sipping, false);
    assert.equal(sipping.sipping, true);
    assert.equal(emptySipping.sipping, false);
    assert.ok(sipping.sipAnimationMs > sipping.sipHoldMs);
    assert.ok(sipping.sipHoldMs >= 500);
    assert.ok(sipping.sipHoldMs <= 2_200);
  });

  it("correlates faster sip cadence with faster depletion", () => {
    const seeds = Array.from({ length: 80 }, (_, index) => `session:bot-${index}`);
    const slowSeed = seeds.reduce((slowest, seed) =>
      coffeeCupConsumptionRate(seed) < coffeeCupConsumptionRate(slowest) ? seed : slowest
    );
    const fastSeed = seeds.reduce((fastest, seed) =>
      coffeeCupConsumptionRate(seed) > coffeeCupConsumptionRate(fastest) ? seed : fastest
    );
    const slow = buildCoffeeCupVisualState({
      seed: slowSeed,
      nowMs: 300_000,
      progressOverride: 0.5,
    });
    const fast = buildCoffeeCupVisualState({
      seed: fastSeed,
      nowMs: 300_000,
      progressOverride: 0.5,
    });

    assert.ok(coffeeCupConsumptionRate(fastSeed) > coffeeCupConsumptionRate(slowSeed));
    assert.ok(coffeeCupSipCycleMs(fastSeed) < coffeeCupSipCycleMs(slowSeed));
    assert.ok(fast.progress > slow.progress);
    assert.ok(fast.frameIndex >= slow.frameIndex);
  });

  it("paces cup consumption more slowly for longer sessions", () => {
    const seed = "session:bot-alice";
    const short = buildCoffeeCupVisualState({
      seed,
      nowMs: 180_000,
      sessionStartedAtMs: 0,
      sessionEndsAtMs: 0,
      durationMinutes: 3,
    });
    const long = buildCoffeeCupVisualState({
      seed,
      nowMs: 1_800_000,
      sessionStartedAtMs: 0,
      sessionEndsAtMs: 0,
      durationMinutes: 30,
    });

    assert.equal(coffeeCupSessionDurationPaceMultiplier(3), 1);
    assert.ok(coffeeCupSessionDurationPaceMultiplier(30) > 1);
    assert.ok(coffeeCupSipCycleMs(seed, 30) > coffeeCupSipCycleMs(seed, 3));
    assert.ok(coffeeCupConsumptionRate(seed, 30) < coffeeCupConsumptionRate(seed, 3));
    assert.ok(long.progress < 1);
    assert.ok(short.progress >= long.progress);
  });

  it("varies sip hold timing by sip count", () => {
    const first = coffeeCupSipAnimationTiming({
      seed: "session:bot-alice",
      sipCount: 1,
    });
    const second = coffeeCupSipAnimationTiming({
      seed: "session:bot-alice",
      sipCount: 2,
    });

    assert.ok(first.holdMs >= 500);
    assert.ok(first.holdMs <= 2_200);
    assert.ok(second.holdMs >= 500);
    assert.ok(second.holdMs <= 2_200);
    assert.notEqual(first.holdMs, second.holdMs);
  });

  it("shows sip art only in short ambient windows", () => {
    let sippingSeconds = 0;
    for (let nowMs = 0; nowMs <= 180_000; nowMs += 1_000) {
      if (
        coffeeCupSippingActive({
          seed: "session:bot-alice",
          nowMs,
          progress: 0.5,
        })
      ) {
        sippingSeconds += 1;
      }
    }

    assert.ok(sippingSeconds >= 1);
    assert.ok(sippingSeconds <= 8);
    assert.equal(
      coffeeCupSippingActive({
        seed: "session:bot-alice",
        nowMs: 1_000,
        progress: 1,
      }),
      false
    );
  });

  it("suppresses sip art while the bot is speaking", () => {
    const seed = "session:bot-alice";
    let sipWindowMs: number | null = null;
    for (let nowMs = 0; nowMs <= 180_000; nowMs += 100) {
      if (coffeeCupSippingActive({ seed, nowMs, progress: 0.5 })) {
        sipWindowMs = nowMs;
        break;
      }
    }

    assert.notEqual(sipWindowMs, null);
    assert.equal(
      coffeeCupSippingActive({
        seed,
        nowMs: sipWindowMs!,
        progress: 0.5,
        speaking: true,
      }),
      false
    );
    assert.equal(
      buildCoffeeCupVisualState({
        seed,
        nowMs: sipWindowMs!,
        progressOverride: 0.5,
        speaking: true,
      }).sipping,
      false
    );
  });

  it("maps bot colors to the five PRISM cup families", () => {
    assert.equal(coffeeCupPrismFamilyForBotColor("#ff4d6d"), "p");
    assert.equal(coffeeCupColorForBotColor("#ff4d6d"), "red");
    assert.equal(coffeeCupColorForBotColor("#ff9f1c"), "orange");
    assert.equal(coffeeCupColorForBotColor("#b7e63a"), "green");
    assert.equal(coffeeCupColorForBotColor("#2fd3e3"), "blue");
    assert.equal(coffeeCupColorForBotColor("#7b5cff"), "purple");
    assert.equal(coffeeCupColorForBotColor(null), "red");
  });

  it("places cups on the table-facing side of each seat", () => {
    assert.equal(
      coffeeCupSideForSeat({ compact: false, seatIndex: 0, seatCount: 2, layoutIndex: 0 }),
      "right"
    );
    assert.equal(
      coffeeCupSideForSeat({ compact: false, seatIndex: 1, seatCount: 2, layoutIndex: 1 }),
      "left"
    );
    assert.equal(
      coffeeCupSideForSeat({ compact: false, seatIndex: 0, seatCount: 5, layoutIndex: 0 }),
      "right"
    );
    assert.equal(
      coffeeCupSideForSeat({ compact: false, seatIndex: 4, seatCount: 5, layoutIndex: 4 }),
      "left"
    );
  });

  it("places top-seat cups on a stable per-session side with matching mirroring", () => {
    assert.equal(
      coffeeCupSideForSeat({
        compact: false,
        seatIndex: 0,
        seatCount: 5,
        layoutIndex: 0,
        sessionSeed: "session-left",
      }),
      "left"
    );
    assert.equal(
      coffeeCupShouldMirrorForSeat({
        compact: false,
        seatIndex: 0,
        seatCount: 5,
        layoutIndex: 0,
        sessionSeed: "session-left",
      }),
      false
    );
    assert.equal(
      coffeeCupSideForSeat({
        compact: false,
        seatIndex: 0,
        seatCount: 5,
        layoutIndex: 0,
        sessionSeed: "session-right",
      }),
      "right"
    );
    assert.equal(
      coffeeCupShouldMirrorForSeat({
        compact: false,
        seatIndex: 0,
        seatCount: 5,
        layoutIndex: 0,
        sessionSeed: "session-right",
      }),
      true
    );
  });

  it("mirrors cups for left and bottom-left seats", () => {
    assert.equal(
      coffeeCupShouldMirrorForSeat({ compact: false, seatIndex: 0, seatCount: 5, layoutIndex: 1 }),
      true
    );
    assert.equal(
      coffeeCupShouldMirrorForSeat({ compact: false, seatIndex: 3, seatCount: 5, layoutIndex: 3 }),
      true
    );
    assert.equal(
      coffeeCupShouldMirrorForSeat({ compact: false, seatIndex: 4, seatCount: 5, layoutIndex: 4 }),
      false
    );
  });
});
