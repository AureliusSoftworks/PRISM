import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coffeeCupPacedProgress,
  coffeeCupStatusForProgress,
} from "@localai/shared";
import {
  buildCoffeeCupVisualState,
  COFFEE_CUP_SPRITE_COLORS,
  coffeeCupCanTopOff,
  coffeeCupColorForBotColor,
  coffeeCupConsumptionTimingForSeat,
  coffeeCupConsumptionRate,
  coffeeCupFramePosition,
  coffeeCupProgressAfterTopOff,
  coffeeCupProgressForSipCount,
  coffeeCupPrismFamilyForBotColor,
  coffeeCupSessionDurationPaceMultiplier,
  coffeeCupSeedWithTempoRole,
  coffeeCupSipBelongsToCurrentFill,
  coffeeCupSipCycleMs,
  coffeeCupSipGatedTimedProgress,
  coffeeCupSipAnimationTiming,
  coffeeCupTempoRoleForBot,
  coffeeCupShouldMirrorForSeat,
  coffeeCupShouldFinishAfterSip,
  coffeeCupSideForSeat,
  coffeeCupSipLikelihoodForProgress,
  coffeeCupSippingActive,
  coffeeCupSteamVisualState,
  coffeeCupTopOffSnapshotForProgress,
  coffeeCupVisualSipCountForAnimation,
} from "./coffee-cup-sprites.ts";
import { coffeeReplayPlayhead } from "./coffee-replay.ts";

function coffeeCupAssetPngSize(assetName: string): { width: number; height: number } {
  const data = readFileSync(
    new URL(`../../public/coffee-cups/${assetName}`, import.meta.url)
  );
  assert.equal(data.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function replayCupState(
  messageIndex: number,
  revealFraction: number,
  topOff: ReturnType<typeof coffeeCupTopOffSnapshotForProgress> = null,
) {
  const startedAt = "2026-07-14T20:00:00.000Z";
  const playhead = coffeeReplayPlayhead({
    conversationStartedAt: startedAt,
    durationMinutes: 1,
    messages: [
      { createdAt: startedAt },
      { createdAt: "2026-07-14T20:00:30.000Z" },
      { createdAt: "2026-07-14T20:01:00.000Z" },
    ],
    messageIndex,
    revealFraction,
  });
  return buildCoffeeCupVisualState({
    seed: "replay-cup",
    nowMs: playhead.nowMs,
    sessionStartedAtMs: playhead.sessionStartedAtMs,
    sessionEndsAtMs: playhead.sessionEndsAtMs,
    durationMinutes: 1,
    topOff,
    sippingOverride: false,
  });
}

describe("coffee cup sprites", () => {
  it("freezes, resumes, seeks, and tops off from the replay playhead", () => {
    const paused = replayCupState(1, 0.25);
    const stillPaused = replayCupState(1, 0.25);
    const resumed = replayCupState(1, 0.75);
    const soughtBack = replayCupState(0, 0);
    const topOff = coffeeCupTopOffSnapshotForProgress(
      0.5,
      "2026-07-14T20:00:30.000Z",
      0.1,
    );
    assert.notEqual(topOff, null);
    const toppedOff = replayCupState(1, 0.75, topOff);

    assert.equal(stillPaused.frameIndex, paused.frameIndex);
    assert.equal(stillPaused.progress, paused.progress);
    assert.ok(resumed.progress > paused.progress);
    assert.ok(soughtBack.progress < paused.progress);
    assert.ok(toppedOff.progress < resumed.progress);
  });
  it("maps drink levels to authored sheet positions", () => {
    assert.deepEqual(coffeeCupFramePosition(0), { frameX: "0%", frameY: "0%" });
    assert.deepEqual(coffeeCupFramePosition(2), { frameX: "100%", frameY: "0%" });
    assert.deepEqual(coffeeCupFramePosition(3), { frameX: "0%", frameY: "50%" });
    assert.deepEqual(coffeeCupFramePosition(5), { frameX: "100%", frameY: "50%" });
    assert.deepEqual(coffeeCupFramePosition(6), { frameX: "0%", frameY: "100%" });
  });

  it("maps progress through the full seven-frame cup sequence", () => {
    for (const [progress, frameIndex] of [
      [0, 0],
      [0.1, 1],
      [0.2, 2],
      [0.4, 3],
      [0.6, 4],
      [0.8, 5],
      [0.96, 6],
    ] as const) {
      assert.equal(coffeeCupStatusForProgress(progress).frameIndex, frameIndex);
    }
  });

  it("lets thinking finish a sip but suppresses sipping once speech begins", () => {
    const thinking = buildCoffeeCupVisualState({
      seed: "thinking-cup",
      nowMs: 10_000,
      progressOverride: 0.4,
      sippingOverride: true,
      thinking: true,
    });
    const idle = buildCoffeeCupVisualState({
      seed: "thinking-cup",
      nowMs: 10_000,
      progressOverride: 0.4,
      sippingOverride: true,
      thinking: false,
    });
    const speaking = buildCoffeeCupVisualState({
      seed: "speaking-cup",
      nowMs: 10_000,
      progressOverride: 0.4,
      sippingOverride: true,
      speaking: true,
    });

    assert.equal(thinking.sipping, true);
    assert.equal(speaking.sipping, false);
    assert.equal(idle.sipping, true);
    assert.equal(thinking.frameIndex, idle.frameIndex);
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
    assert.equal(finished.frameIndex, 6);
    assert.equal(finished.amount, "empty");
  });

  it("starts delayed-arrival consumption only after the seat becomes active", () => {
    const durationMinutes = 10;
    const sessionStartedAtMs = 0;
    const sessionEndsAtMs = durationMinutes * 60 * 1000;
    const seatActivatedAtMs = 9 * 60 * 1000;
    const inactiveTiming = coffeeCupConsumptionTimingForSeat({
      seatActive: false,
      seatActivatedAtMs,
      fallbackSessionStartedAtMs: sessionStartedAtMs,
      fallbackSessionEndsAtMs: sessionEndsAtMs,
      durationMinutes,
    });
    const activeTiming = coffeeCupConsumptionTimingForSeat({
      seatActive: true,
      seatActivatedAtMs,
      fallbackSessionStartedAtMs: sessionStartedAtMs,
      fallbackSessionEndsAtMs: sessionEndsAtMs,
      durationMinutes,
    });

    assert.deepEqual(inactiveTiming, {
      sessionStartedAtMs: null,
      sessionEndsAtMs: null,
    });
    assert.deepEqual(activeTiming, {
      sessionStartedAtMs: seatActivatedAtMs,
      sessionEndsAtMs: seatActivatedAtMs + durationMinutes * 60 * 1000,
    });

    const beforeArrival = buildCoffeeCupVisualState({
      seed: "session:bot-late",
      nowMs: seatActivatedAtMs - 1,
      ...inactiveTiming,
      durationMinutes,
      sippingOverride: false,
    });
    const atArrival = buildCoffeeCupVisualState({
      seed: "session:bot-late",
      nowMs: seatActivatedAtMs,
      ...activeTiming,
      durationMinutes,
    });
    const incorrectlySessionTimed = buildCoffeeCupVisualState({
      seed: "session:bot-late",
      nowMs: seatActivatedAtMs,
      sessionStartedAtMs,
      sessionEndsAtMs,
      durationMinutes,
    });

    assert.equal(beforeArrival.progress, 0);
    assert.equal(beforeArrival.sipping, false);
    assert.equal(atArrival.progress, 0);
    assert.equal(atArrival.frameIndex, 0);
    assert.ok(incorrectlySessionTimed.progress > atArrival.progress);

    const sawAmbientSipAfterSeating = Array.from(
      { length: 91 },
      (_, second) => seatActivatedAtMs + second * 1000,
    ).some(
      (nowMs) =>
        buildCoffeeCupVisualState({
          seed: "session:bot-late",
          nowMs,
          ...activeTiming,
          durationMinutes,
        }).sipping,
    );
    assert.equal(sawAmbientSipAfterSeating, true);
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

  it("ships every rest and sip sprite as a 500x576 seven-frame sheet", () => {
    const expectedSize = { width: 500, height: 576 };

    for (const color of [...COFFEE_CUP_SPRITE_COLORS, "prism"]) {
      for (const themePrefix of ["", "light_"]) {
        for (const stateSuffix of ["", "_sip"]) {
          const assetName = `coffee_${themePrefix}${color}${stateSuffix}.png`;
          assert.deepEqual(coffeeCupAssetPngSize(assetName), expectedSize, assetName);
        }
      }
    }
  });

  it("maps accepted sip counts to deterministic visual depletion", () => {
    assert.equal(coffeeCupProgressForSipCount(0), 0);
    assert.equal(coffeeCupProgressForSipCount(1), 0.1);
    assert.equal(coffeeCupProgressForSipCount(4), 0.4);
    assert.equal(coffeeCupProgressForSipCount(10), 0.96);
    assert.equal(coffeeCupProgressForSipCount(1, 0.38), 0.48);
    assert.equal(coffeeCupProgressForSipCount(6, 0.38), 0.96);

    const untouched = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 0,
      sipCount: 0,
      sippingOverride: false,
    });
    const afterTwoSips = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 0,
      sipCount: 2,
      sippingOverride: false,
    });

    assert.equal(untouched.frameIndex, 0);
    assert.equal(untouched.progress, 0);
    assert.ok(afterTwoSips.progress > untouched.progress);
    assert.equal(afterTwoSips.frameIndex, 2);
  });

  it("keeps Auto depletion moving after an explicit sip or zero-count override", () => {
    const base = {
      seed: "auto-session:bot-alice",
      sessionStartedAtMs: 0,
      sessionEndsAtMs: 600_000,
      durationMinutes: 10,
      sippingOverride: false,
    } as const;
    const earlyAfterOneSip = buildCoffeeCupVisualState({
      ...base,
      nowMs: 60_000,
      sipCount: 1,
    });
    const laterWithSameSipCount = buildCoffeeCupVisualState({
      ...base,
      nowMs: 360_000,
      sipCount: 1,
    });
    const zeroCountAtMidSession = buildCoffeeCupVisualState({
      ...base,
      nowMs: 240_000,
      sipCount: 0,
    });

    assert.ok(earlyAfterOneSip.progress >= 0.1);
    assert.ok(laterWithSameSipCount.progress > earlyAfterOneSip.progress);
    assert.ok(zeroCountAtMidSession.progress > 0.3);
  });

  it("counts explicit sips from the latest top-off baseline", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.82, toppedOffAt, 0.38);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt) + 1_000;
    const afterOneSip = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs,
      topOff,
      sipCount: 1,
      sippingOverride: false,
    });
    const afterSixSips = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs,
      topOff,
      sipCount: 6,
      sippingOverride: false,
      finishSeed: "visible-empty-after-refill",
    });

    assert.equal(afterOneSip.progress, 0.48);
    assert.equal(afterOneSip.frameIndex, 3);
    assert.equal(afterSixSips.frameIndex, 6);
  });

  it("keeps sip history before a top-off out of the current fill state", () => {
    const topOff = coffeeCupTopOffSnapshotForProgress(
      0.82,
      "2026-07-01T12:00:10.000Z"
    );
    assert.notEqual(topOff, null);

    assert.equal(
      coffeeCupSipBelongsToCurrentFill({
        messageCreatedAt: "2026-07-01T12:00:09.999Z",
        topOff,
      }),
      false
    );
    assert.equal(
      coffeeCupSipBelongsToCurrentFill({
        messageCreatedAt: "2026-07-01T12:00:10.001Z",
        topOff,
      }),
      true
    );
    assert.equal(
      coffeeCupSipBelongsToCurrentFill({
        messageCreatedAt: "not-a-date",
        topOff,
      }),
      true
    );
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

  it("blocks cup sipping while a refill lock is active", () => {
    const locked = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 1_000,
      sipCount: 1,
      sippingOverride: true,
      sipLockedUntilMs: 4_000,
    });
    const unlocked = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: 4_001,
      sipCount: 1,
      sippingOverride: true,
      sipLockedUntilMs: 4_000,
    });

    assert.equal(locked.sipping, false);
    assert.equal(unlocked.sipping, true);
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

    assert.equal(lastFrame.frameIndex, 6);
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

  it("assigns one subtle faster and one subtle slower cup tempo per session", () => {
    const sessionSeed = "coffee-session-tempo-demo";
    const seatBotIds = ["alice", "boris", "cleo", "daria"];
    const roles = seatBotIds.map((botId) =>
      coffeeCupTempoRoleForBot({ sessionSeed, botId, seatBotIds })
    );

    assert.equal(roles.filter((role) => role === "faster").length, 1);
    assert.equal(roles.filter((role) => role === "slower").length, 1);

    const baseSeed = `${sessionSeed}:alice:0:0`;
    const normalSeed = coffeeCupSeedWithTempoRole(baseSeed, "normal");
    const fasterSeed = coffeeCupSeedWithTempoRole(baseSeed, "faster");
    const slowerSeed = coffeeCupSeedWithTempoRole(baseSeed, "slower");
    const normalRate = coffeeCupConsumptionRate(normalSeed);
    const fasterRate = coffeeCupConsumptionRate(fasterSeed);
    const slowerRate = coffeeCupConsumptionRate(slowerSeed);

    assert.equal(normalSeed, baseSeed);
    assert.equal(coffeeCupSeedWithTempoRole(fasterSeed, "slower"), slowerSeed);
    assert.ok(fasterRate > normalRate);
    assert.ok(slowerRate < normalRate);
    assert.ok(fasterRate < normalRate * 1.1);
    assert.ok(slowerRate > normalRate * 0.9);
    assert.ok(coffeeCupSipCycleMs(fasterSeed) < coffeeCupSipCycleMs(normalSeed));
    assert.ok(coffeeCupSipCycleMs(slowerSeed) > coffeeCupSipCycleMs(normalSeed));
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

  it("can top off cups to a partial visible frame", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.82, toppedOffAt, 0.38);
    assert.notEqual(topOff, null);

    const toppedOff = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: Date.parse(toppedOffAt),
      progressOverride: 0.82,
      topOff,
      sippingOverride: false,
    });

    assert.equal(topOff?.progressBefore, 0.82);
    assert.equal(topOff?.progressAfter, 0.38);
    assert.equal(toppedOff.frameIndex, 3);
    assert.equal(toppedOff.amount, "half");
  });

  it("does not top off already-full cups", () => {
    assert.equal(coffeeCupCanTopOff(0.08), false);
    assert.equal(
      coffeeCupTopOffSnapshotForProgress(0.08, "2026-07-01T12:00:00.000Z"),
      null
    );
  });

  it("depletes a top-off from the refilled baseline instead of the old empty state", () => {
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
    const naturalProgress = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs: nowMs + 10 * 60 * 1000,
      durationMinutes: 10,
    });

    assert.equal(immediate, 0.04);
    assert.ok(later > immediate);
    assert.ok(later < 0.3);
    assert.equal(naturalProgress, 0.72);
  });

  it("keeps fast and slow cup tempo after a top-off", () => {
    const toppedOffAt = "2026-07-01T12:00:00.000Z";
    const topOff = coffeeCupTopOffSnapshotForProgress(0.72, toppedOffAt);
    assert.notEqual(topOff, null);
    const nowMs = Date.parse(toppedOffAt) + 3 * 60 * 1000;
    const baseSeed = "session:bot-alice";
    const normalProgress = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs,
      durationMinutes: 10,
      seed: coffeeCupSeedWithTempoRole(baseSeed, "normal"),
    });
    const fasterProgress = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs,
      durationMinutes: 10,
      seed: coffeeCupSeedWithTempoRole(baseSeed, "faster"),
    });
    const slowerProgress = coffeeCupProgressAfterTopOff({
      progress: 0.72,
      topOff,
      nowMs,
      durationMinutes: 10,
      seed: coffeeCupSeedWithTempoRole(baseSeed, "slower"),
    });

    assert.ok(fasterProgress > normalProgress);
    assert.ok(slowerProgress < normalProgress);
    assert.ok(fasterProgress - slowerProgress < 0.08);
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

  it("lets sips drain a topped-off cup from the refilled level", () => {
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
      progress: 0.14,
      topOff,
      nowMs,
      durationMinutes: 10,
      lowerProgressMeansConsumption: true,
    });

    assert.equal(immediate, 0.04);
    assert.equal(afterSip, 0.14);
  });

  it("keeps a refilled timed cup filled after the next sip", () => {
    const sessionStartedAtMs = Date.parse("2026-07-01T12:00:00.000Z");
    const toppedOffAtMs = sessionStartedAtMs + 9 * 60 * 1000;
    const durationMinutes = 10;
    const topOff = coffeeCupTopOffSnapshotForProgress(
      0.9,
      new Date(toppedOffAtMs).toISOString()
    );
    assert.notEqual(topOff, null);

    const afterRefillIdle = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: toppedOffAtMs + 2 * 60 * 1000,
      sessionStartedAtMs,
      durationMinutes,
      topOff,
      sippingOverride: false,
    });
    const afterFirstSip = buildCoffeeCupVisualState({
      seed: "session:bot-alice",
      nowMs: toppedOffAtMs + 2 * 60 * 1000,
      sessionStartedAtMs,
      durationMinutes,
      topOff,
      sipCount: 1,
      sippingOverride: false,
    });

    assert.ok(afterRefillIdle.progress < 0.3);
    assert.ok(afterFirstSip.progress < 0.3);
    assert.notEqual(afterFirstSip.frameIndex, 6);
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

  it("renders the same faster Coffee power pace used by server decisions", () => {
    const normal = buildCoffeeCupVisualState({
      seed: "session:voltaire",
      nowMs: 120_000,
      durationMinutes: 10,
      progressOverride: 0.3,
    });
    const powered = buildCoffeeCupVisualState({
      seed: "session:voltaire",
      nowMs: 120_000,
      durationMinutes: 10,
      progressOverride: 0.3,
      powerRateMultiplier: 2.5,
    });
    assert.ok(powered.progress > normal.progress);
  });

  it("keeps refused coffee full and unsipped while it goes cold", () => {
    const durationMinutes = 10;
    const sessionEndsAtMs = durationMinutes * 60 * 1000;
    const refused = buildCoffeeCupVisualState({
      seed: "session:theodore",
      nowMs: sessionEndsAtMs,
      sessionStartedAtMs: 0,
      sessionEndsAtMs,
      durationMinutes,
      powerRateMultiplier: 0,
      sipCount: 4,
      sippingOverride: true,
      forceEmpty: true,
      finished: true,
    });

    assert.equal(coffeeCupPacedProgress(0.6, "session:theodore", 10, 0), 0);
    assert.equal(refused.progress, 0);
    assert.equal(refused.frameIndex, 0);
    assert.equal(refused.amount, "full");
    assert.equal(refused.temperatureLabel, "cold");
    assert.equal(refused.steamAlpha, 0);
    assert.equal(refused.sipping, false);
    assert.equal(refused.finished, false);
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

  it("keeps ambient sip art active until the sprite return animation finishes", () => {
    const seed = "session:bot-alice";
    const sipAnimationMs = coffeeCupSipAnimationTiming({ seed }).durationMs;
    const cycleMs = coffeeCupSipCycleMs(seed);
    let windowStartMs: number | null = null;
    let previousActive = coffeeCupSippingActive({
      seed,
      nowMs: 0,
      progress: 0.5,
    });

    for (let nowMs = 10; nowMs <= cycleMs * 2; nowMs += 10) {
      const active = coffeeCupSippingActive({
        seed,
        nowMs,
        progress: 0.5,
      });
      if (!previousActive && active) {
        windowStartMs = nowMs;
        break;
      }
      previousActive = active;
    }

    if (windowStartMs === null) {
      assert.fail("expected to find a deterministic ambient sip window");
    }

    assert.equal(
      coffeeCupSippingActive({
        seed,
        nowMs: windowStartMs + sipAnimationMs - 30,
        progress: 0.5,
      }),
      true
    );
  });

  it("keeps sampled ambient sips active for the full up-and-down animation", () => {
    const renderSampleMs = 1_000;

    for (const seed of ["a", "b", "session:bot-alice"]) {
      const sipAnimationMs = coffeeCupSipAnimationTiming({ seed }).durationMs;
      const cycleMs = coffeeCupSipCycleMs(seed);
      let previousActive = coffeeCupSippingActive({
        seed,
        nowMs: 0,
        progress: 0.5,
      });
      let sampledRunStartedAtMs: number | null = null;
      let sampledRunDurationMs: number | null = null;

      for (let nowMs = renderSampleMs; nowMs <= cycleMs * 3; nowMs += renderSampleMs) {
        const active = coffeeCupSippingActive({
          seed,
          nowMs,
          progress: 0.5,
        });
        if (!previousActive && active) {
          sampledRunStartedAtMs = nowMs;
        } else if (previousActive && !active && sampledRunStartedAtMs !== null) {
          sampledRunDurationMs = nowMs - sampledRunStartedAtMs;
          break;
        }
        previousActive = active;
      }

      assert.notEqual(sampledRunDurationMs, null, `expected a sampled sip run for ${seed}`);
      assert.ok(
        sampledRunDurationMs! >= sipAnimationMs,
        `${seed} sampled for ${sampledRunDurationMs}ms but needs ${sipAnimationMs}ms`
      );
    }
  });

  it("shows sip art only in short ambient windows", () => {
    const seed = "session:bot-alice";
    const sipAnimationMs = coffeeCupSipAnimationTiming({ seed }).durationMs;
    const cycleMs = coffeeCupSipCycleMs(seed);
    let sippingSeconds = 0;
    for (let nowMs = 0; nowMs <= 180_000; nowMs += 1_000) {
      if (
        coffeeCupSippingActive({
          seed,
          nowMs,
          progress: 0.5,
        })
      ) {
        sippingSeconds += 1;
      }
    }

    assert.ok(sippingSeconds >= 1);
    assert.ok(
      sippingSeconds <=
        (Math.ceil(180_000 / cycleMs) + 1) * Math.ceil((sipAnimationMs + 1_000) / 1_000)
    );
    assert.equal(
      coffeeCupSippingActive({
        seed,
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

  it("keeps ambient sips inside listener windows without blocking explicit sips", () => {
    const seed = "session:bot-listener";
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
        ambientSipAllowed: false,
      }),
      false,
    );
    assert.equal(
      buildCoffeeCupVisualState({
        seed,
        nowMs: sipWindowMs!,
        progressOverride: 0.5,
        ambientSipAllowed: false,
      }).sipping,
      false,
    );
    assert.equal(
      buildCoffeeCupVisualState({
        seed,
        nowMs: sipWindowMs!,
        progressOverride: 0.5,
        ambientSipAllowed: false,
        sippingOverride: true,
      }).sipping,
      true,
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
