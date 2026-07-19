import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoffeeDeliveryPlan,
  COFFEE_DELIVERY_MAX_DURATION_MS,
  COFFEE_VOICE_REVEAL_TAIL_GRACE_MS,
  coffeeDeliveryIsHoldingAtMs,
  coffeeDeliveryVisibleLengthAtMs,
  coffeeVoiceRevealFallbackDelayMs,
} from "./coffee-speech-delivery.ts";

describe("Coffee speech delivery", () => {
  it("leaves a watchdog tail behind voiced playback only", () => {
    assert.equal(
      coffeeVoiceRevealFallbackDelayMs(1_000, true),
      1_000 + COFFEE_VOICE_REVEAL_TAIL_GRACE_MS,
    );
    assert.equal(coffeeVoiceRevealFallbackDelayMs(1_000, false), 1_000);
    assert.equal(
      coffeeVoiceRevealFallbackDelayMs(Number.NaN, true),
      COFFEE_VOICE_REVEAL_TAIL_GRACE_MS,
    );
  });

  it("uses a calmer table reveal pace and gives long replies more room", () => {
    const neutral = buildCoffeeDeliveryPlan({
      text: "A steady conversational line.",
      seed: "neutral-pace",
      mood: "neutral",
      humanPacing: 0,
    });
    const longReply = buildCoffeeDeliveryPlan({
      text: "x".repeat(500),
      seed: "long-reply",
      mood: "neutral",
      humanPacing: 0,
    });

    assert.equal(neutral.baseCharacterMs, 100);
    assert.equal(longReply.durationMs, COFFEE_DELIVERY_MAX_DURATION_MS);
    assert.equal(COFFEE_DELIVERY_MAX_DURATION_MS, 18_000);
  });

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

  it("uses provider character timestamps when speech supplies them", () => {
    const text = "Hi!";
    const plan = buildCoffeeDeliveryPlan({
      text,
      seed: "aligned",
      humanPacing: 0,
      audioDurationMs: 1000,
      audioAlignment: {
        characters: Array.from(text),
        characterStartTimesSeconds: [0, 0.1, 0.8],
        characterEndTimesSeconds: [0.1, 0.2, 1],
      },
    });
    assert.deepEqual(plan.revealAtMs, [0, 100, 800]);
    assert.equal(coffeeDeliveryVisibleLengthAtMs(plan, 750), 2);
    assert.equal(coffeeDeliveryVisibleLengthAtMs(plan, 850), 3);
  });

  it("rests the speaking face during provider-timed phrase pauses", () => {
    const text = "Hi. There";
    const plan = buildCoffeeDeliveryPlan({
      text,
      seed: "aligned-pause",
      humanPacing: 0,
      audioDurationMs: 1_000,
      audioAlignment: {
        characters: Array.from(text),
        characterStartTimesSeconds: [0, 0.08, 0.16, 0.35, 0.58, 0.66, 0.74, 0.82, 0.9],
        characterEndTimesSeconds: [0.08, 0.16, 0.35, 0.58, 0.66, 0.74, 0.82, 0.9, 1],
      },
    });

    assert.equal(coffeeDeliveryIsHoldingAtMs(plan, 100), false);
    assert.equal(coffeeDeliveryIsHoldingAtMs(plan, 400), true);
    assert.equal(coffeeDeliveryIsHoldingAtMs(plan, 620), false);
  });
});
