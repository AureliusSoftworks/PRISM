import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { filterBotsByLibraryGroup } from "./botLibraryGroupFilter.ts";

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
});
