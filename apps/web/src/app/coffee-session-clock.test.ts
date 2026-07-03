import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeSessionClockShouldTick,
  coffeeSessionEndsAtAfterPausedClockTick,
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
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(null), null);
    assert.equal(coffeeSessionEndsAtAfterPausedClockTick(Number.NaN), null);
  });
});
