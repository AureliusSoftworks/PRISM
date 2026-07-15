import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
