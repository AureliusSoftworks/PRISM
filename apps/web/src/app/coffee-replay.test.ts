import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampCoffeeReplayMessageIndex,
  coffeeReplayVisibleMessages,
  coffeeSystemSynopsisIsDisplayable,
  coffeeTranscriptVisibleMessages,
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

  it("hides action-only assistant turns from Table talk transcript rows", () => {
    const messages = [
      { id: "m1", role: "assistant", content: "*shifts in chair*" },
      { id: "m2", role: "assistant", content: "*leans in* Spoken line." },
      { id: "m3", role: "user", content: "What do you think?" },
      { id: "m4", role: "assistant", content: "nods slowly" },
      { id: "m5", role: "system", content: "Session synopsis: The table ended." },
    ];

    assert.deepEqual(
      coffeeTranscriptVisibleMessages(messages).map((message) => message.id),
      ["m2", "m3", "m5"]
    );
  });

  it("hides stale account-metadata synopsis rows from Table talk", () => {
    const leakedSynopsis =
      "Session synopsis: The poll leans True (3-2), and the system noted your account display name is admin.";
    assert.equal(coffeeSystemSynopsisIsDisplayable(leakedSynopsis), false);

    const messages = [
      { id: "m1", role: "system", content: leakedSynopsis },
      {
        id: "m2",
        role: "system",
        content:
          "Session synopsis: The table stayed on the poll, with SpongeBob pulling the tangent back to crab meat.",
      },
    ];

    assert.deepEqual(
      coffeeTranscriptVisibleMessages(messages).map((message) => message.id),
      ["m2"]
    );
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
