import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeGroupAttendanceCanStart,
  coffeeGroupAttendingBotIds,
  coffeeGroupSessionExcludedBotIds,
  sanitizeCoffeeSeatBotIdsForAvailableBots,
  toggleCoffeeSeatBotId,
  toggleCoffeeExcludedBotId,
} from "./coffee-session-attendance.ts";

describe("coffee session attendance helpers", () => {
  it("toggles bots away for the next session and preserves the group roster", () => {
    const groupBotIds = ["bot-a", "bot-b", "bot-c", "bot-d"];
    const excluded = toggleCoffeeExcludedBotId(new Set<string>(), "bot-b");

    assert.deepEqual(coffeeGroupAttendingBotIds(groupBotIds, excluded), [
      "bot-a",
      "bot-c",
      "bot-d",
    ]);
    assert.deepEqual(coffeeGroupSessionExcludedBotIds(groupBotIds, excluded), ["bot-b"]);

    const invitedAgain = toggleCoffeeExcludedBotId(excluded, "bot-b");
    assert.deepEqual(coffeeGroupAttendingBotIds(groupBotIds, invitedAgain), groupBotIds);
  });

  it("filters stale exclusions before building the session request payload", () => {
    assert.deepEqual(
      coffeeGroupSessionExcludedBotIds(["bot-a", "bot-b"], ["bot-missing", "bot-b"]),
      ["bot-b"]
    );
  });

  it("prunes missing and duplicate draft seat ids before Coffee starts", () => {
    assert.deepEqual(
      sanitizeCoffeeSeatBotIdsForAvailableBots(
        ["bot-a", "bot-missing", null, " bot-b ", "bot-a"],
        ["bot-a", "bot-b"]
      ),
      ["bot-a", null, null, "bot-b", null]
    );
  });

  it("selects and deselects the same Coffee bot without changing the seat shape", () => {
    const emptySeats = Array.from({ length: 5 }, () => null);

    const selected = toggleCoffeeSeatBotId(emptySeats, "bot-a", () => 0);
    assert.deepEqual(selected, ["bot-a", null, null, null, null]);
    assert.equal(selected.filter(Boolean).length, 1);

    const deselected = toggleCoffeeSeatBotId(selected, "bot-a", () => 0);
    assert.deepEqual(deselected, emptySeats);
    assert.equal(deselected.filter(Boolean).length, 0);
  });

  it("keeps five selected Coffee bots canonical and treats a sixth as a no-op", () => {
    let seats: Array<string | null> = Array.from({ length: 5 }, () => null);
    for (let index = 1; index <= 5; index += 1) {
      seats = toggleCoffeeSeatBotId(seats, `bot-${index}`, () => 0);
    }

    assert.deepEqual(seats, ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5"]);

    const afterSixth = toggleCoffeeSeatBotId(seats, "bot-6", () => 0);
    assert.strictEqual(afterSixth, seats);
    assert.deepEqual(afterSixth, ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5"]);
  });

  it("prevents starts with fewer than the required attending bots", () => {
    const groupBotIds = ["bot-a", "bot-b", "bot-c"];

    assert.equal(coffeeGroupAttendanceCanStart(groupBotIds, ["bot-c"], 2), true);
    assert.equal(coffeeGroupAttendanceCanStart(groupBotIds, ["bot-a", "bot-b"], 2), false);
  });
});
