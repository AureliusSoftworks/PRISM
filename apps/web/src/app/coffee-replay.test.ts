import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampCoffeeReplayMessageIndex,
  coffeeReplayVisibleMessages,
  collectCoffeeReplayActionsForBot,
} from "./coffee-replay.ts";

describe("coffee replay helpers", () => {
  it("clamps replay indexes to the saved transcript", () => {
    assert.equal(clampCoffeeReplayMessageIndex(4, -10), 0);
    assert.equal(clampCoffeeReplayMessageIndex(4, 2), 2);
    assert.equal(clampCoffeeReplayMessageIndex(4, 99), 3);
    assert.equal(clampCoffeeReplayMessageIndex(0, 99), 0);
  });

  it("returns the transcript visible at the current replay index", () => {
    const messages = ["a", "b", "c"];
    assert.deepEqual(coffeeReplayVisibleMessages(messages, 0), ["a"]);
    assert.deepEqual(coffeeReplayVisibleMessages(messages, 1), ["a", "b"]);
    assert.deepEqual(coffeeReplayVisibleMessages(messages, 20), ["a", "b", "c"]);
  });

  it("collects bot actions only up to the provided visible transcript", () => {
    const messages = [
      { id: "m1", role: "assistant", botName: "Nova", content: "*sips coffee* Hello." },
      { id: "m2", role: "assistant", botName: "Orion", content: "*leans in* Sure." },
      { id: "m3", role: "assistant", botName: "Nova", content: "Good point. *nods*" },
    ];
    const visible = coffeeReplayVisibleMessages(messages, 1);
    const actions = collectCoffeeReplayActionsForBot(visible, "Nova");
    assert.deepEqual(actions.map((action) => action.action), ["sips coffee"]);
  });
});
