import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCoffeeSessionSettings } from "@localai/shared";
import { coffeeAutonomousTurnDelayMs } from "./coffee-turn-pacing.ts";

describe("Coffee autonomous turn pacing", () => {
  it("adds no artificial gap to a max-speed pileup", () => {
    const afterparty = normalizeCoffeeSessionSettings({
      responseDelayBias: 100,
      breathingRoom: 0,
      crossTalk: "pileup",
    });

    assert.equal(coffeeAutonomousTurnDelayMs(afterparty, 1, () => 1), 0);
    assert.equal(coffeeAutonomousTurnDelayMs(afterparty, 0.35, () => 0), 0);
  });

  it("preserves breathing room for ordinary table modes", () => {
    const relaxed = normalizeCoffeeSessionSettings({
      responseDelayBias: 58,
      breathingRoom: 38,
      crossTalk: "normal",
    });

    assert.ok(coffeeAutonomousTurnDelayMs(relaxed, 1, () => 0.5) > 0);
  });
});
