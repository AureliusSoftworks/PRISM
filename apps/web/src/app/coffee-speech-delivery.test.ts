import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoffeeDeliveryPlan,
  coffeeDeliveryIsHoldingAtMs,
  coffeeDeliveryVisibleLengthAtMs,
} from "./coffee-speech-delivery.ts";

describe("Coffee speech delivery", () => {
  it("builds deterministic phrase timing", () => {
    const input = { text: "Well, this is interesting.", seed: "m1:b1", humanPacing: 50 };
    assert.deepEqual(buildCoffeeDeliveryPlan(input), buildCoffeeDeliveryPlan(input));
  });

  it("adds stronger punctuation holds as human pacing increases", () => {
    const steady = buildCoffeeDeliveryPlan({ text: "One, two.", seed: "m", humanPacing: 0 });
    const natural = buildCoffeeDeliveryPlan({ text: "One, two.", seed: "m", humanPacing: 50 });
    const commaIndex = Array.from(natural.text).indexOf(",");
    const steadyGap = (steady.revealAtMs[commaIndex + 1] ?? 0) - (steady.revealAtMs[commaIndex] ?? 0);
    const naturalGap = (natural.revealAtMs[commaIndex + 1] ?? 0) - (natural.revealAtMs[commaIndex] ?? 0);
    assert.ok(naturalGap > steadyGap);
  });

  it("scales the same delivery shape to supplied audio duration", () => {
    const plan = buildCoffeeDeliveryPlan({
      text: "Wait—really?",
      seed: "m",
      mood: "warm",
      humanPacing: 50,
      audioDurationMs: 2400,
    });
    assert.equal(plan.durationMs, 2400);
    assert.deepEqual(plan.emphasis, { start: 0, end: 4 });
    assert.equal(coffeeDeliveryVisibleLengthAtMs(plan, 2400), Array.from(plan.text).length);
  });

  it("reports visible progress and semantic holds", () => {
    const plan = buildCoffeeDeliveryPlan({ text: "Um… okay.", seed: "m", humanPacing: 50 });
    const ellipsisIndex = Array.from(plan.text).indexOf("…");
    const duringHold = (plan.revealAtMs[ellipsisIndex] ?? 0) + plan.baseCharacterMs * 3;
    assert.equal(coffeeDeliveryIsHoldingAtMs(plan, duringHold), true);
    assert.ok(coffeeDeliveryVisibleLengthAtMs(plan, duringHold) > 0);
  });
});
