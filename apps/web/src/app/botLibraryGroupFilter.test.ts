import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  filterUngroupedBotsByLibraryGroups,
  filterBotsByLibraryGroup,
  pruneBotLibraryGroupsForExistingBots,
  pruneBotLibraryGroupsWithFewBots,
  resolveBotLibraryMultiSelectionActions,
  upsertBotLibraryGroup,
  type BotLibraryGroupUpsertGroup,
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

  it("allows one bot to appear in multiple differently named groups", () => {
    const libraryBots = [
      { id: "vader", name: "Darth Vader" },
      { id: "palpatine", name: "Emperor Palpatine" },
      { id: "luke", name: "Luke Skywalker" },
    ];
    const overlappingGroups = [
      { id: "group:villains", botIds: ["vader", "palpatine"] },
      { id: "group:star-wars", botIds: ["vader", "luke"] },
    ];

    assert.deepEqual(
      filterBotsByLibraryGroup(libraryBots, overlappingGroups, "group:villains").map(
        (bot) => bot.id
      ),
      ["vader", "palpatine"]
    );
    assert.deepEqual(
      filterBotsByLibraryGroup(libraryBots, overlappingGroups, "group:star-wars").map(
        (bot) => bot.id
      ),
      ["vader", "luke"]
    );
  });

  it("filters ungrouped bots that are not in favorites or custom groups", () => {
    const libraryBots = [
      { id: "bot-a", name: "Astra" },
      { id: "bot-b", name: "Basil" },
      { id: "bot-c", name: "Cora" },
      { id: "bot-d", name: "Dax" },
    ];

    assert.deepEqual(
      filterBotsByLibraryGroup(libraryBots, groups, "ungrouped").map((bot) => bot.id),
      ["bot-d"]
    );
    assert.deepEqual(
      filterUngroupedBotsByLibraryGroups(libraryBots, groups).map((bot) => bot.id),
      ["bot-d"]
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

  it("keeps marketplace theme groups with one installed bot", () => {
    const maintainedGroups = pruneBotLibraryGroupsWithFewBots([
      { id: "group:empty-marketplace", botIds: [], marketplaceThemeId: "science" },
      { id: "group:science", botIds: ["tesla"], marketplaceThemeId: "science" },
      { id: "group:solo", botIds: ["bot-a"], builtIn: false },
    ]);

    assert.deepEqual(
      maintainedGroups.map((group) => group.id),
      ["group:science"]
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

  it("keeps create-group available when selected bots already share a group", () => {
    const actions = resolveBotLibraryMultiSelectionActions(
      [
        { id: "builtin:favorites", botIds: ["vader", "palpatine"], builtIn: true },
        { id: "group:villains", botIds: ["vader", "palpatine"], builtIn: false },
      ],
      ["vader", "palpatine"]
    );

    assert.equal(actions.canCreateGroup, true);
    assert.equal(actions.removableGroup?.id, "group:villains");
  });

  it("upserts marketplace groups by theme id and merges installed bots", () => {
    const now = "2026-07-04T00:00:00.000Z";
    const groups = upsertBotLibraryGroup<BotLibraryGroupUpsertGroup>([], {
      name: "Science & Invention",
      description: "Investigators and inventors.",
      botIds: ["tesla"],
      marketplaceThemeId: "science-invention",
      now,
      createGroupId: () => "group:science",
    });

    const mergedGroups = upsertBotLibraryGroup(
      [
        {
          ...groups[0]!,
          name: "My Science Bench",
          updatedAt: "2026-07-04T01:00:00.000Z",
        },
      ],
      {
        name: "Science & Invention",
        description: "Updated catalog description.",
        botIds: ["curie", "tesla"],
        marketplaceThemeId: "science-invention",
        now: "2026-07-04T02:00:00.000Z",
        createGroupId: () => "group:duplicate",
      }
    );

    assert.equal(mergedGroups.length, 1);
    assert.equal(mergedGroups[0]?.id, "group:science");
    assert.equal(mergedGroups[0]?.name, "My Science Bench");
    assert.deepEqual(mergedGroups[0]?.botIds, ["tesla", "curie"]);
    assert.equal(mergedGroups[0]?.marketplaceThemeId, "science-invention");
    assert.equal(mergedGroups[0]?.updatedAt, "2026-07-04T02:00:00.000Z");
  });
});
