import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoffeeCupVisualState,
  coffeeCupColorForBotColor,
  coffeeCupConsumptionRate,
  coffeeCupFramePosition,
  coffeeCupPrismFamilyForBotColor,
  coffeeCupSipCycleMs,
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
