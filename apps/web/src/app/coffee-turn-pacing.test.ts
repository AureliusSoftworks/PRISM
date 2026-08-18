import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCoffeeSessionSettings } from "@localai/shared";
import {
  COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER,
  coffeeAutonomousTurnDelayMs,
  coffeePlayerComposingDelayMultiplier,
} from "./coffee-turn-pacing.ts";

describe("Coffee autonomous turn pacing", () => {
  it("keeps only a short paint gap for a max-speed pileup", () => {
    const afterparty = normalizeCoffeeSessionSettings({
      responseDelayBias: 100,
      breathingRoom: 0,
      crossTalk: "pileup",
    });

    assert.equal(coffeeAutonomousTurnDelayMs(afterparty, 1, () => 1), 320);
    assert.equal(coffeeAutonomousTurnDelayMs(afterparty, 0.35, () => 0), 320);
  });

  it("preserves breathing room for ordinary table modes", () => {
    const relaxed = normalizeCoffeeSessionSettings({
      responseDelayBias: 58,
      breathingRoom: 38,
      crossTalk: "normal",
    });

    assert.ok(coffeeAutonomousTurnDelayMs(relaxed, 1, () => 0.5) > 0);
  });

  it("runs the table at one-eighth speed while the player composes", () => {
    // Debate parity: DEBATE_PARTICIPATION_CLOCK_RATE is 1/8, so Coffee's
    // composing multiplier must stay its exact inverse.
    assert.equal(COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER, 8);
    assert.equal(coffeePlayerComposingDelayMultiplier("playerComposing"), 8);
    assert.equal(coffeePlayerComposingDelayMultiplier("idle"), 1);
    assert.equal(coffeePlayerComposingDelayMultiplier("botThinking"), 1);

    // The stretch must multiply OUTSIDE coffeeAutonomousTurnDelayMs — its
    // internal ceiling clamps in-function multipliers well short of 8x.
    const relaxed = normalizeCoffeeSessionSettings({
      responseDelayBias: 58,
      breathingRoom: 38,
      crossTalk: "normal",
    });
    const baseline = coffeeAutonomousTurnDelayMs(relaxed, 1, () => 0.5);
    const clampedInside = coffeeAutonomousTurnDelayMs(
      relaxed,
      COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER,
      () => 0.5,
    );
    assert.ok(clampedInside < baseline * COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER);
    assert.equal(
      Math.round(baseline * coffeePlayerComposingDelayMultiplier("playerComposing")),
      baseline * COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER,
    );
  });
});
