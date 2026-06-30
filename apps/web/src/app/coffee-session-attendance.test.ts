import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeGroupAttendanceCanStart,
  coffeeGroupAttendingBotIds,
  coffeeGroupSessionExcludedBotIds,
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

  it("prevents starts with fewer than the required attending bots", () => {
    const groupBotIds = ["bot-a", "bot-b", "bot-c"];

    assert.equal(coffeeGroupAttendanceCanStart(groupBotIds, ["bot-c"], 2), true);
    assert.equal(coffeeGroupAttendanceCanStart(groupBotIds, ["bot-a", "bot-b"], 2), false);
  });
});
