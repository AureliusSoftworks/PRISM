import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCoffeeOfflineProtectionMessage } from "./coffeeOfflineProtection.ts";

/**
 * The Coffee picker shows this notice as soon as a player drops at least
 * one offline-only ("Protected") bot into a seat. The string is the player's
 * single source of truth that the entire session will run offline because
 * of those specific bots — so the line MUST name them, scale gracefully
 * past 2-3 names, and never render an awkward placeholder when no bots
 * are protected. These tests pin all three.
 */
describe("buildCoffeeOfflineProtectionMessage", () => {
  it("returns null when no bots are protected (notice should not render)", () => {
    assert.equal(buildCoffeeOfflineProtectionMessage([]), null);
  });

  it("ignores blank or whitespace-only names so a stray bot row never produces an empty notice", () => {
    assert.equal(buildCoffeeOfflineProtectionMessage(["", "   "]), null);
  });

  it("uses singular phrasing for a single protected bot", () => {
    const message = buildCoffeeOfflineProtectionMessage(["Alice"]);
    assert.equal(
      message,
      "🔒 This session will run fully offline. Alice is protected as offline-only."
    );
  });

  it("uses 'and' for two protected bots without a leading comma", () => {
    const message = buildCoffeeOfflineProtectionMessage(["Alice", "Boris"]);
    assert.equal(
      message,
      "🔒 This session will run fully offline. Alice and Boris are protected as offline-only."
    );
  });

  it("folds the tail into 'and N other(s)' so the notice never grows unbounded", () => {
    const three = buildCoffeeOfflineProtectionMessage(["Alice", "Boris", "Cara"]);
    assert.equal(
      three,
      "🔒 This session will run fully offline. Alice, Boris and 1 other are protected as offline-only."
    );
    const five = buildCoffeeOfflineProtectionMessage([
      "Alice",
      "Boris",
      "Cara",
      "Dax",
      "Echo",
    ]);
    assert.equal(
      five,
      "🔒 This session will run fully offline. Alice, Boris and 3 others are protected as offline-only."
    );
  });

  it("trims surrounding whitespace before composing the line", () => {
    const message = buildCoffeeOfflineProtectionMessage(["  Alice ", " Boris  "]);
    assert.equal(
      message,
      "🔒 This session will run fully offline. Alice and Boris are protected as offline-only."
    );
  });
});
