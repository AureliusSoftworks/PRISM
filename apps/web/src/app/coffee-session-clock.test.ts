import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeSessionClockHoldReasons,
  coffeeSessionClockShouldTick,
  coffeeSessionEndsAtAfterPausedClockTick,
  reconcileCoffeeSessionClock,
  type CoffeeSessionClockPhase,
} from "./coffee-session-clock.ts";

describe("coffee session clock", () => {
  it("ticks the dock clock while bots are arriving or live", () => {
    assert.equal(coffeeSessionClockShouldTick("coffee-1", "arriving"), true);
    assert.equal(coffeeSessionClockShouldTick("coffee-1", "live"), true);

    for (const phase of [
      "selecting",
      "preview",
      "topic",
      "finished",
    ] satisfies CoffeeSessionClockPhase[]) {
      assert.equal(coffeeSessionClockShouldTick("coffee-1", phase), false);
    }
    assert.equal(coffeeSessionClockShouldTick(null, "live"), false);
  });

  it("extends paused sessions by a finite tick", () => {
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(10_000), 11_000);
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(10_000, 250), 10_250);
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(10_000, -250), 10_000);
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(null), null);
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(Number.NaN), null);
  });

  it("tracks model warmup separately from manual autoplay pause", () => {
    assert.deepEqual(
      coffeeSessionClockHoldReasons({
        autoplayPaused: false,
        modelWarmup: true,
        foregroundGeneration: false,
      }),
      ["model_warmup"],
    );
    assert.deepEqual(
      coffeeSessionClockHoldReasons({
        autoplayPaused: true,
        modelWarmup: true,
        foregroundGeneration: true,
      }),
      ["manual_autoplay_pause", "model_warmup", "foreground_generation"],
    );
    // Player composing is deliberately not a hold reason: bots keep talking
    // while the user types, so session time keeps flowing.
    assert.deepEqual(
      coffeeSessionClockHoldReasons({
        autoplayPaused: false,
        modelWarmup: false,
        foregroundGeneration: false,
      }),
      [],
    );
  });

  it("holds an expired session while foreground generation blocks the table", () => {
    const holdReasons = coffeeSessionClockHoldReasons({
      autoplayPaused: false,
      modelWarmup: false,
      foregroundGeneration: true,
    });
    assert.deepEqual(holdReasons, ["foreground_generation"]);
    assert.deepEqual(
      reconcileCoffeeSessionClock({
        previousTickAtMs: 10_000,
        nowMs: 25_000,
        endsAtMs: 20_000,
        countdownPaused: holdReasons.length > 0,
      }),
      {
        elapsedMs: 15_000,
        nextEndsAtMs: 35_000,
        shouldFinish: false,
        shouldUpdate: true,
      },
    );
  });

  it("uses actual elapsed time so delayed ticks preserve manual pauses", () => {
    assert.deepEqual(
      reconcileCoffeeSessionClock({
        previousTickAtMs: 1_000,
        nowMs: 11_000,
        endsAtMs: 20_000,
        countdownPaused: true,
      }),
      {
        elapsedMs: 10_000,
        nextEndsAtMs: 30_000,
        shouldFinish: false,
        shouldUpdate: true,
      },
    );
  });

  it("finishes an expired active session instead of replaying missed turns", () => {
    const result = reconcileCoffeeSessionClock({
      previousTickAtMs: 1_000,
      nowMs: 31_000,
      endsAtMs: 20_000,
      countdownPaused: false,
    });

    assert.equal(result.nextEndsAtMs, 20_000);
    assert.equal(result.shouldFinish, true);
  });

  it("lets an in-progress table line finish without extending the deadline", () => {
    const result = reconcileCoffeeSessionClock({
      previousTickAtMs: 19_000,
      nowMs: 21_000,
      endsAtMs: 20_000,
      countdownPaused: false,
      finishBlocked: true,
    });

    assert.equal(result.nextEndsAtMs, 20_000);
    assert.equal(result.shouldFinish, false);
  });

  it("coalesces duplicate focus and visibility restoration events", () => {
    const result = reconcileCoffeeSessionClock({
      previousTickAtMs: 10_000,
      nowMs: 10_010,
      endsAtMs: 20_000,
      countdownPaused: false,
      minimumElapsedMs: 50,
    });

    assert.equal(result.shouldUpdate, false);
    assert.equal(result.shouldFinish, false);
  });
});
