import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoffeeArrivalMotionProfile,
  buildCoffeeArrivalPlan,
  COFFEE_ARRIVAL_WALK_MAX_MS,
  COFFEE_ARRIVAL_WALK_MIN_MS,
  COFFEE_ARRIVAL_WINDOW_MS,
} from "./coffee-arrivals.ts";

describe("coffee arrival plan", () => {
  it("allows longer opening arrivals while capping the final arrival at three minutes", () => {
    let observedAfterOldCap = false;
    for (let index = 0; index < 300; index += 1) {
      const plan = buildCoffeeArrivalPlan(
        {
          id: `arrival-seed-${index}`,
          botGroupIds: ["bot-a", "bot-b", "bot-c", "bot-d", "bot-e"],
          coffeeSessionDurationMinutes: 10,
        },
        "partial-table-in-progress"
      );
      const finalDelayMs = Math.max(...plan.map((entry) => entry.delayMs));
      assert.ok(finalDelayMs <= COFFEE_ARRIVAL_WINDOW_MS);
      if (finalDelayMs > 60_000) observedAfterOldCap = true;
    }

    assert.equal(COFFEE_ARRIVAL_WINDOW_MS, 180_000);
    assert.equal(observedAfterOldCap, true);
  });

  it("keeps very short sessions from scheduling arrivals into the final half-minute", () => {
    const plan = buildCoffeeArrivalPlan(
      {
        id: "short-session",
        botGroupIds: ["bot-a", "bot-b", "bot-c"],
        coffeeSessionDurationMinutes: 2,
      },
      "user-first"
    );

    assert.ok(plan.length > 0);
    assert.ok(Math.max(...plan.map((entry) => entry.delayMs)) <= 90_000);
  });

  it("gives same-time arrivals deterministic motion differences", () => {
    const profiles = ["bot-a", "bot-b", "bot-c", "bot-d", "bot-e"].map((botId) =>
      buildCoffeeArrivalMotionProfile(`conversation-1:${botId}`)
    );
    const durations = new Set(profiles.map((profile) => profile.walkDurationMs));
    const offsets = new Set(
      profiles.map((profile) => `${profile.seatOffsetX},${profile.seatOffsetY}`)
    );

    assert.ok(
      profiles.every(
        (profile) =>
          profile.walkDurationMs >= COFFEE_ARRIVAL_WALK_MIN_MS &&
          profile.walkDurationMs <= COFFEE_ARRIVAL_WALK_MAX_MS
      )
    );
    assert.ok(durations.size >= 3);
    assert.ok(offsets.size >= 3);
    assert.deepEqual(
      buildCoffeeArrivalMotionProfile("conversation-1:bot-a"),
      buildCoffeeArrivalMotionProfile("conversation-1:bot-a")
    );
  });
});
