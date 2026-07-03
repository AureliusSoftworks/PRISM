import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  filterBotsByLibraryGroup,
  pruneBotLibraryGroupsForExistingBots,
  pruneBotLibraryGroupsWithFewBots,
} from "./botLibraryGroupFilter.ts";

describe("bot library group filtering", () => {
  const bots = [
    { id: "bot-a", name: "Astra" },
    { id: "bot-b", name: "Basil" },
    { id: "bot-c", name: "Cora" },
  ];
  const groups = [
    { id: "builtin:favorites", botIds: ["bot-c", "bot-missing"] },
    { id: "group:story", botIds: ["bot-b", "bot-a"] },
  ];

  it("returns every bot for the all filter", () => {
    assert.deepEqual(
      filterBotsByLibraryGroup(bots, groups, "all").map((bot) => bot.id),
      ["bot-a", "bot-b", "bot-c"]
    );
  });

  it("filters bots by saved group while preserving library order", () => {
    assert.deepEqual(
      filterBotsByLibraryGroup(bots, groups, "group:story").map((bot) => bot.id),
      ["bot-a", "bot-b"]
    );
  });

  it("falls back to every bot when a stale group id is selected", () => {
    assert.deepEqual(
      filterBotsByLibraryGroup(bots, groups, "group:deleted").map((bot) => bot.id),
      ["bot-a", "bot-b", "bot-c"]
    );
  });

  it("deletes custom groups with fewer than two bots", () => {
    const maintainedGroups = pruneBotLibraryGroupsWithFewBots([
      { id: "builtin:favorites", botIds: ["bot-a"], builtIn: true },
      { id: "group:empty", botIds: [], builtIn: false },
      { id: "group:solo", botIds: ["bot-a"], builtIn: false },
      { id: "group:duo", botIds: ["bot-a", "bot-b"], builtIn: false },
    ]);

    assert.deepEqual(
      maintainedGroups.map((group) => group.id),
      ["builtin:favorites", "group:duo"]
    );
  });

  it("deletes custom groups that fall below two surviving bots", () => {
    const maintainedGroups = pruneBotLibraryGroupsForExistingBots(
      [
        { id: "builtin:favorites", botIds: ["bot-missing"], builtIn: true },
        { id: "group:stale-solo", botIds: ["bot-a", "bot-missing"], builtIn: false },
        {
          id: "group:stale-trio",
          botIds: ["bot-a", "bot-b", "bot-missing"],
          builtIn: false,
        },
      ],
      new Set(["bot-a", "bot-b"])
    );

    assert.deepEqual(
      maintainedGroups.map((group) => group.id),
      ["builtin:favorites", "group:stale-trio"]
    );
    assert.deepEqual(maintainedGroups[1]?.botIds, ["bot-a", "bot-b"]);
  });
});
