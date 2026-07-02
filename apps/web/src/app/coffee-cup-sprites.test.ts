import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeCupPacedProgress,
  coffeeCupStatusForProgress,
} from "@localai/shared";
import {
  buildCoffeeCupVisualState,
  coffeeCupCanTopOff,
  coffeeCupColorForBotColor,
  coffeeCupConsumptionRate,
  coffeeCupFramePosition,
  coffeeCupProgressAfterTopOff,
  coffeeCupProgressForSipCount,
  coffeeCupPrismFamilyForBotColor,
  coffeeCupSessionDurationPaceMultiplier,
  coffeeCupSipCycleMs,
  coffeeCupSipGatedTimedProgress,
  coffeeCupSipAnimationTiming,
  coffeeCupShouldMirrorForSeat,
  coffeeCupShouldFinishAfterSip,
  coffeeCupSideForSeat,
  coffeeCupSipLikelihoodForProgress,
  coffeeCupSippingActive,
  coffeeCupSteamVisualState,
  coffeeCupTopOffSnapshotForProgress,
  coffeeCupVisualSipCountForAnimation,
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

  it("keeps untopped cups depleted when another cup is topped off without an end time", () => {
    const sessionStartedAtMs = Date.parse("2026-07-01T12:00:00.000Z");
    const nowMs = sessionStartedAtMs + 9 * 60 * 1000;
    const durationMinutes = 10;
    const untoppedBefore = buildCoffeeCupVisualState({
      seed: "session:bot-boris",
      nowMs,
      sessionStartedAtMs,
      sessionEndsAtMs: null,
      durationMinutes,
    });
    const topOff = coffeeCupTopOffSnapshotForProgress(
      untoppedBefore.progress,
      new Date(nowMs).toISOString()
    );
    assert.notEqual(topOff, null);

    const topped = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs,
      sessionStartedAtMs,
      sessionEndsAtMs: null,
      durationMinutes,
      topOff,
    });
    const untoppedAfter = buildCoffeeCupVisualState({
      seed: "session:bot-boris",
      nowMs,
      sessionStartedAtMs,
      sessionEndsAtMs: null,
      durationMinutes,
    });

    assert.equal(topped.frameIndex, 0);
    assert.equal(topped.amount, "full");
    assert.ok(untoppedAfter.progress > 0.45);
    assert.notEqual(untoppedAfter.frameIndex, 0);
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
    assert.equal(coffeeCupProgressForSipCount(1), 0.1);
    assert.equal(coffeeCupProgressForSipCount(4), 0.4);
    assert.equal(coffeeCupProgressForSipCount(10), 0.96);

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
    assert.equal(afterTwoSips.frameIndex, 1);
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
    const forcedEmptySipping = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 1_000,
      sipCount: 1,
      sippingOverride: true,
      forceEmpty: true,
    });

    assert.equal(notSipping.sipping, false);
    assert.equal(sipping.sipping, true);
    assert.equal(forcedEmptySipping.sipping, false);
    assert.ok(sipping.sipAnimationMs > sipping.sipHoldMs);
    assert.ok(sipping.sipHoldMs >= 500);
    assert.ok(sipping.sipHoldMs <= 2_200);
  });

  it("cools steam over session age and removes it near minute 25", () => {
    const fresh = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 0,
      sessionStartedAtMs: 0,
      durationMinutes: 30,
      sippingOverride: false,
    });
    const cooling = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 12.5 * 60 * 1000,
      sessionStartedAtMs: 0,
      durationMinutes: 30,
      sippingOverride: false,
    });
    const cold = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 25 * 60 * 1000,
      sessionStartedAtMs: 0,
      durationMinutes: 30,
      sippingOverride: false,
    });

    assert.ok(fresh.steamAlpha > cooling.steamAlpha);
    assert.ok(cooling.steamAlpha > cold.steamAlpha);
    assert.equal(cold.steamAlpha, 0);
    assert.ok(cooling.steamRateMs > fresh.steamRateMs);
    assert.ok(cold.steamRateMs > cooling.steamRateMs);
  });

  it("restores steam when a cooled cup is topped off", () => {
    const sessionStartedAtMs = Date.parse("2026-07-01T12:00:00.000Z");
    const toppedOffAtMs = sessionStartedAtMs + 25 * 60 * 1000;
    const topOff = coffeeCupTopOffSnapshotForProgress(
      0.72,
      new Date(toppedOffAtMs).toISOString()
    );
    assert.notEqual(topOff, null);

    const cooled = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: toppedOffAtMs,
      sessionStartedAtMs,
      durationMinutes: 30,
      progressOverride: 0.72,
      sippingOverride: false,
    });
    const refilled = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: toppedOffAtMs,
      sessionStartedAtMs,
      durationMinutes: 30,
      progressOverride: 0.72,
      topOff,
      sippingOverride: false,
    });

    assert.equal(cooled.steamAlpha, 0);
    assert.equal(refilled.frameIndex, 0);
    assert.ok(refilled.steamAlpha > 0);
    assert.ok(refilled.steamRateMs < cooled.steamRateMs);
  });

  it("scales steam down with fill level and removes it for cold dregs", () => {
    const full = coffeeCupSteamVisualState({
      nowMs: 0,
      frameIndex: 0,
      progress: 0,
    });
    const low = coffeeCupSteamVisualState({
      nowMs: 0,
      frameIndex: 4,
      progress: 0.8,
    });
    const coldDregs = coffeeCupSteamVisualState({
      nowMs: 0,
      frameIndex: 4,
      progress: 0.9,
    });

    assert.ok(full.steamAlpha > low.steamAlpha);
    assert.ok(low.steamAlpha > coldDregs.steamAlpha);
    assert.equal(coldDregs.steamAlpha, 0);
  });

  it("keeps the final empty sip animatable before hiding the cup", () => {
    const visibleEmptySeed = Array.from({ length: 1_000 }, (_, index) => `visible-${index}`).find(
      (seed) =>
        !coffeeCupShouldFinishAfterSip({
          seed,
          previousProgress: 0.9,
          nextProgress: 0.96,
          sipCount: 10,
        })
    );
    const coldFinishSeed = Array.from({ length: 1_000 }, (_, index) => `finish-${index}`).find(
      (seed) =>
        coffeeCupShouldFinishAfterSip({
          seed,
          previousProgress: 0.9,
          nextProgress: 0.96,
          sipCount: 10,
        })
    );

    assert.notEqual(visibleEmptySeed, undefined);
    assert.notEqual(coldFinishSeed, undefined);

    const lastFrame = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      finishSeed: visibleEmptySeed,
      nowMs: 1_000,
      sipCount: 10,
      sippingOverride: false,
    });
    const finalSip = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      finishSeed: visibleEmptySeed,
      nowMs: 1_000,
      sipCount: 11,
      sippingOverride: true,
    });
    const coldFinished = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      finishSeed: coldFinishSeed,
      nowMs: 1_000,
      sipCount: 10,
      sippingOverride: false,
    });

    assert.equal(lastFrame.frameIndex, 5);
    assert.equal(lastFrame.finished, false);
    assert.equal(finalSip.finished, true);
    assert.equal(finalSip.sipping, true);
    assert.equal(finalSip.steamAlpha, 0);
    assert.equal(coldFinished.finished, true);
    assert.equal(coldFinished.sipping, false);
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
    assert.ok(coffeeCupConsumptionRate(slowSeed) > 0.9);
    assert.ok(coffeeCupConsumptionRate(fastSeed) > 1.2);
    assert.ok(coffeeCupSipCycleMs(slowSeed) < 45_000);
    assert.ok(coffeeCupSipCycleMs(fastSeed) < 30_000);
    assert.ok(fast.progress > slow.progress);
    assert.ok(fast.frameIndex >= slow.frameIndex);
  });

  it("tops off non-full cups toward hot/full", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.62, toppedOffAt);
    assert.notEqual(topOff, null);

    const toppedOff = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: Date.parse(toppedOffAt),
      progressOverride: 0.62,
      topOff,
      sippingOverride: false,
    });

    assert.equal(coffeeCupCanTopOff(0.62), true);
    assert.equal(toppedOff.frameIndex, 0);
    assert.equal(toppedOff.amount, "full");
    assert.equal(toppedOff.temperatureLabel, "hot");
    assert.ok(toppedOff.steamAlpha > 0);
  });

  it("does not top off already-full cups", () => {
    assert.equal(coffeeCupCanTopOff(0.08), false);
    assert.equal(
      coffeeCupTopOffSnapshotForProgress(0.08, "2026-07-01T12:00:00.000Z"),
      null
    );
  });

  it("lets top-off refill state decay back to normal cup progress", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.72, toppedOffAt);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt);
    const immediate = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs,
      durationMinutes: 10,
    });
    const later = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs: nowMs + 2 * 60 * 1000,
      durationMinutes: 10,
    });
    const decayed = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs: nowMs + 10 * 60 * 1000,
      durationMinutes: 10,
    });

    assert.ok(immediate < later);
    assert.ok(later > 0.45);
    assert.ok(later < decayed);
    assert.equal(decayed, 0.72);
  });

  it("keeps a fresh top-off full when timed progress is already ahead", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.62, toppedOffAt);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt);

    assert.equal(
      coffeeCupProgressAfterTopOff({
        progress: 0.95,
        topOff,
        nowMs,
        durationMinutes: 10,
      }),
      0.04
    );

    const visual = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: nowMs + 500,
      sessionStartedAtMs: nowMs - 9 * 60 * 1000,
      sessionEndsAtMs: nowMs + 60 * 1000,
      durationMinutes: 10,
      topOff,
      sippingOverride: false,
    });

    assert.equal(visual.frameIndex, 0);
    assert.ok(visual.progress < 0.06);
  });

  it("lets sips drain a topped-off cup before time decay catches up", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.62, toppedOffAt);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt);
    const immediate = coffeeCupProgressAfterTopOff({
      progress: 0.62,
      topOff,
      nowMs,
      durationMinutes: 10,
    });
    const afterSip = coffeeCupProgressAfterTopOff({
      progress: 0.82,
      topOff,
      nowMs,
      durationMinutes: 10,
      lowerProgressMeansConsumption: true,
    });

    assert.equal(immediate, 0.04);
    assert.ok(afterSip > immediate);
    assert.ok(afterSip < 0.82);
  });

  it("lets the first sip drain a timed top-off even before sip progress catches up", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.72, toppedOffAt);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt);
    const immediate = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs,
      durationMinutes: 10,
    });
    const firstSip = coffeeCupProgressAfterTopOff({
      progress: 0.1,
      topOff,
      nowMs,
      durationMinutes: 10,
      lowerProgressMeansConsumption: true,
    });
    const secondSip = coffeeCupProgressAfterTopOff({
      progress: 0.2,
      topOff,
      nowMs,
      durationMinutes: 10,
      lowerProgressMeansConsumption: true,
    });

    assert.equal(immediate, 0.04);
    assert.equal(firstSip, 0.1);
    assert.equal(secondSip, 0.2);
  });

  it("keeps a fresh top-off full when lower timed progress is not sip consumption", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(1, toppedOffAt);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt);

    assert.equal(
      coffeeCupProgressAfterTopOff({
        progress: 0.72,
        topOff,
        nowMs,
        durationMinutes: 10,
      }),
      0.04
    );
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

  it("swaps to the drained rest frame before the sip sprite returns", () => {
    const durationMs = 2_000;

    assert.equal(
      coffeeCupVisualSipCountForAnimation({
        totalSipCount: 3,
        activeSipAnimationCount: 3,
        animationAgeMs: 0,
        animationDurationMs: durationMs,
      }),
      2
    );
    assert.equal(
      coffeeCupVisualSipCountForAnimation({
        totalSipCount: 3,
        activeSipAnimationCount: 3,
        animationAgeMs: durationMs * 0.81,
        animationDurationMs: durationMs,
      }),
      2
    );
    assert.equal(
      coffeeCupVisualSipCountForAnimation({
        totalSipCount: 3,
        activeSipAnimationCount: 3,
        animationAgeMs: durationMs * 0.82,
        animationDurationMs: durationMs,
      }),
      3
    );
    assert.equal(
      coffeeCupVisualSipCountForAnimation({
        totalSipCount: 3,
        activeSipAnimationCount: null,
        animationAgeMs: durationMs,
        animationDurationMs: durationMs,
      }),
      3
    );
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

  it("keeps timed fill frames from advancing between sip windows", () => {
    const seed = "session:bot-alice";
    const durationMinutes = 10;
    const sessionStartedAtMs = 0;
    const sessionEndsAtMs = durationMinutes * 60 * 1000;
    let held:
      | {
          nowMs: number;
          rawFrameIndex: number;
          visibleFrameIndex: number;
        }
      | null = null;

    for (let nowMs = 0; nowMs <= sessionEndsAtMs; nowMs += 250) {
      const baseProgress = 1 - (sessionEndsAtMs - nowMs) / sessionEndsAtMs;
      const rawFrameIndex = coffeeCupStatusForProgress(
        coffeeCupPacedProgress(baseProgress, seed, durationMinutes),
        seed
      ).frameIndex;
      const visual = buildCoffeeCupVisualState({
        seed,
        nowMs,
        sessionStartedAtMs,
        sessionEndsAtMs,
        durationMinutes,
      });
      if (!visual.sipping && rawFrameIndex > visual.frameIndex) {
        held = {
          nowMs,
          rawFrameIndex,
          visibleFrameIndex: visual.frameIndex,
        };
        break;
      }
    }

    assert.notEqual(held, null);
    assert.ok(held!.rawFrameIndex > held!.visibleFrameIndex);
  });

  it("allows timed fill frames to advance during a sip window", () => {
    const seed = "session:bot-alice";
    const durationMinutes = 10;
    const sessionStartedAtMs = 0;
    const sessionEndsAtMs = durationMinutes * 60 * 1000;
    let sipDrain:
      | {
          nowMs: number;
          frameIndex: number;
        }
      | null = null;

    for (let nowMs = 0; nowMs <= sessionEndsAtMs; nowMs += 250) {
      const visual = buildCoffeeCupVisualState({
        seed,
        nowMs,
        sessionStartedAtMs,
        sessionEndsAtMs,
        durationMinutes,
      });
      if (visual.sipping && visual.frameIndex > 0) {
        sipDrain = {
          nowMs,
          frameIndex: visual.frameIndex,
        };
        break;
      }
    }

    assert.notEqual(sipDrain, null);
    assert.ok(sipDrain!.frameIndex > 0);
  });

  it("only changes timed fill frames while sip art is active", () => {
    const seed = "session:bot-alice";
    const durationMinutes = 10;
    const sessionStartedAtMs = 0;
    const sessionEndsAtMs = durationMinutes * 60 * 1000;
    let previous = buildCoffeeCupVisualState({
      seed,
      nowMs: sessionStartedAtMs,
      sessionStartedAtMs,
      sessionEndsAtMs,
      durationMinutes,
    });

    for (let nowMs = 250; nowMs <= sessionEndsAtMs; nowMs += 250) {
      const visual = buildCoffeeCupVisualState({
        seed,
        nowMs,
        sessionStartedAtMs,
        sessionEndsAtMs,
        durationMinutes,
      });
      if (visual.frameIndex !== previous.frameIndex) {
        assert.equal(visual.sipping, true, `frame changed at ${nowMs}ms`);
      }
      previous = visual;
    }
  });

  it("gates timed progress to the latest sip cadence boundary", () => {
    const seed = "session:bot-alice";
    const durationMinutes = 10;
    const sessionStartedAtMs = 0;
    const sessionEndsAtMs = durationMinutes * 60 * 1000;
    const nowMs = 140_000;
    const rawProgress = 1 - (sessionEndsAtMs - nowMs) / sessionEndsAtMs;
    const gated = coffeeCupSipGatedTimedProgress({
      seed,
      nowMs,
      progress: rawProgress,
      sessionStartedAtMs,
      sessionEndsAtMs,
      durationMinutes,
    });

    assert.ok(gated <= rawProgress);
  });

  it("makes cold coffee less likely to show ambient sip art", () => {
    assert.ok(
      coffeeCupSipLikelihoodForProgress(0.92) <
        coffeeCupSipLikelihoodForProgress(0.42)
    );
    assert.equal(
      coffeeCupSippingActive({
        seed: "session:bot-alice",
        nowMs: 1_000,
        progress: 0.96,
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
