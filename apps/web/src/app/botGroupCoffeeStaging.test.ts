import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BOT_GROUP_COFFEE_STAGING_MAX_SELECTED,
  BOT_GROUP_COFFEE_STAGING_MIN_SELECTED,
  BOT_GROUP_COFFEE_STAGING_RANKING_STRATEGY,
  BOT_GROUP_COFFEE_STAGING_REACTION_COPY,
  botGroupCoffeeStagingReplacementRoster,
  createBotGroupCoffeeStagingModel,
  normalizeBotGroupCoffeeStagingPrompt,
  normalizeBotGroupCoffeeStagingRoster,
  rankBotGroupCoffeeStagingVisibleBots,
  reconcileBotGroupCoffeeStagingSelection,
  replaceBotGroupCoffeeStagingSelection,
  summarizeBotGroupCoffeeStagingSelection,
  toggleBotGroupCoffeeStagingSelection,
  type BotGroupCoffeeStagingBotInput,
} from "./botGroupCoffeeStaging.ts";

const bots: BotGroupCoffeeStagingBotInput[] = [
  {
    id: "engineer",
    name: "Ada",
    system_prompt: "A practical software engineer who debugs distributed systems.",
  },
  {
    id: "philosopher",
    name: "Marcus",
    system_prompt: "A Stoic philosopher interested in virtue and mortality.",
  },
  {
    id: "mediator",
    name: "Mercy",
    system_prompt: "A compassionate mediator focused on forgiveness and conflict.",
  },
  {
    id: "strategist",
    name: "Sun",
    system_prompt: "A strategist studying power, command, and careful planning.",
  },
  {
    id: "artist",
    name: "Frida",
    system_prompt: "A painter exploring identity, color, and physical pain.",
  },
  {
    id: "chef",
    name: "Julia",
    system_prompt: "A chef who teaches recipes with warmth and precision.",
  },
];

describe("waiting-room Coffee staging ranking", () => {
  it("ranks the visible cast with deterministic local name and prompt overlap", () => {
    const first = rankBotGroupCoffeeStagingVisibleBots({
      prompt: "Mercy and power after conflict",
      visibleBots: bots,
    });
    const repeated = rankBotGroupCoffeeStagingVisibleBots({
      prompt: "Mercy and power after conflict",
      visibleBots: bots,
    });

    assert.deepEqual(first, repeated);
    assert.deepEqual(
      first.slice(0, 3).map(({ id }) => id),
      ["mediator", "strategist", "engineer"],
    );
    assert.deepEqual(first[0]?.match.matchedTokens, ["mercy", "conflict"]);
    assert.equal(first[0]?.reactionBand, "strong");
    assert.equal(first[1]?.reactionBand, "related");
    assert.equal(first.at(-1)?.reactionBand, "available");
  });

  it("preserves visible order as the stable tie-break without mutating input", () => {
    const tied = [bots[4], bots[1], bots[5]];
    const snapshot = structuredClone(tied);
    const ranked = rankBotGroupCoffeeStagingVisibleBots({
      prompt: "unmatched quasar",
      visibleBots: tied,
    });
    assert.deepEqual(
      ranked.map(({ id }) => id),
      ["artist", "philosopher", "chef"],
    );
    assert.deepEqual(tied, snapshot);
  });

  it("normalizes Unicode, punctuation, accents, casing, whitespace, and common filler", () => {
    assert.equal(
      normalizeBotGroupCoffeeStagingPrompt(" \n  Café\tethics   with ADA  "),
      "Café ethics with ADA",
    );
    const ranked = rankBotGroupCoffeeStagingVisibleBots({
      prompt: "What about CAFE systems with ada?",
      visibleBots: [
        bots[1],
        {
          id: "cafe-engineer",
          name: "Ada Café",
          system_prompt: "Builds resilient systems.",
        },
      ],
    });
    assert.equal(ranked[0]?.id, "cafe-engineer");
    assert.deepEqual(ranked[0]?.match.matchedTokens, ["cafe", "systems", "ada"]);
  });

  it("preselects the five most relevant visible bots and preserves exact submitted text", () => {
    const exact = "  Power, mercy—then systems?\n";
    const model = createBotGroupCoffeeStagingModel({
      prompt: exact,
      visibleBots: bots,
      fullRosterBots: [...bots, { id: "offstage", name: "Offstage" }],
    });
    assert.equal(model.rankingStrategy, BOT_GROUP_COFFEE_STAGING_RANKING_STRATEGY);
    assert.equal(model.submittedPrompt, exact);
    assert.equal(model.normalizedPrompt, "Power, mercy—then systems?");
    assert.equal(model.selectedBotIds.length, BOT_GROUP_COFFEE_STAGING_MAX_SELECTED);
    assert.deepEqual(
      model.selectedBotIds,
      model.rankedVisibleBots.slice(0, 5).map(({ id }) => id),
    );
    assert.equal(model.selectedBotIds.includes("offstage"), false);
    assert.equal(model.selection.canStart, true);
  });
});

describe("waiting-room Coffee staging roster and selection safety", () => {
  it("drops malformed entries and duplicate ids while accepting both prompt field shapes", () => {
    const malformed = [
      null,
      {},
      { id: " " },
      { id: 42, name: "Wrong" },
      { id: " ada ", name: "  Ada   Lovelace ", system_prompt: " Math  engines " },
      { id: "ada", name: "Duplicate", systemPrompt: "ignored" },
      { id: "grace", name: null, systemPrompt: " Compilers " },
    ] as BotGroupCoffeeStagingBotInput[];
    assert.deepEqual(normalizeBotGroupCoffeeStagingRoster(malformed), [
      {
        id: "ada",
        name: "Ada Lovelace",
        systemPrompt: "Math engines",
        rosterIndex: 4,
      },
      {
        id: "grace",
        name: "grace",
        systemPrompt: "Compilers",
        rosterIndex: 6,
      },
    ]);
  });

  it("filters, deduplicates, caps, and fills malformed selection state to two", () => {
    assert.deepEqual(
      reconcileBotGroupCoffeeStagingSelection({
        selectedBotIds: ["missing", "c", "c", null, "d", "e", "f", "g", "a"],
        rosterBotIds: ["a", "b", "c", "d", "e", "f", "g"],
      }),
      ["c", "d", "e", "f", "g"],
    );
    assert.deepEqual(
      reconcileBotGroupCoffeeStagingSelection({
        selectedBotIds: ["missing"],
        rosterBotIds: ["a", "b", "c"],
        preferredBotIds: ["c", "a"],
      }),
      ["c", "a"],
    );
    assert.equal(summarizeBotGroupCoffeeStagingSelection(["a"]).status, "too-few");
    assert.equal(summarizeBotGroupCoffeeStagingSelection(["a", "b"]).status, "ready");
    assert.equal(
      summarizeBotGroupCoffeeStagingSelection(["a", "b", "c", "d", "e", "f"])
        .status,
      "too-many",
    );
  });

  it("toggles only within the enforced two-to-five boundary", () => {
    const rosterBotIds = ["a", "b", "c", "d", "e", "f"];
    const minimum = toggleBotGroupCoffeeStagingSelection({
      selectedBotIds: ["a", "b"],
      botId: "a",
      rosterBotIds,
    });
    assert.equal(minimum.reason, "minimum-reached");
    assert.deepEqual(minimum.selectedBotIds, ["a", "b"]);

    const added = toggleBotGroupCoffeeStagingSelection({
      selectedBotIds: ["a", "b"],
      botId: "c",
      rosterBotIds,
    });
    assert.equal(added.reason, "selected");
    assert.equal(added.selection.count, 3);

    const removed = toggleBotGroupCoffeeStagingSelection({
      selectedBotIds: added.selectedBotIds,
      botId: "a",
      rosterBotIds,
    });
    assert.equal(removed.reason, "deselected");
    assert.deepEqual(removed.selectedBotIds, ["b", "c"]);

    const maximum = toggleBotGroupCoffeeStagingSelection({
      selectedBotIds: ["a", "b", "c", "d", "e"],
      botId: "f",
      rosterBotIds,
    });
    assert.equal(maximum.reason, "maximum-reached");
    assert.equal(maximum.selection.count, BOT_GROUP_COFFEE_STAGING_MAX_SELECTED);

    const unavailable = toggleBotGroupCoffeeStagingSelection({
      selectedBotIds: ["a", "b"],
      botId: "deleted",
      rosterBotIds,
    });
    assert.equal(unavailable.reason, "unavailable");
    assert.equal(unavailable.changed, false);
  });

  it("replaces one selected bot from the full saved-group roster in place", () => {
    const replaced = replaceBotGroupCoffeeStagingSelection({
      selectedBotIds: ["a", "b", "c", "d", "e"],
      outgoingBotId: "c",
      incomingBotId: "g",
      rosterBotIds: ["a", "b", "c", "d", "e", "f", "g"],
    });
    assert.equal(replaced.reason, "replaced");
    assert.deepEqual(replaced.selectedBotIds, ["a", "b", "g", "d", "e"]);
    assert.equal(replaced.selection.canStart, true);

    const duplicate = replaceBotGroupCoffeeStagingSelection({
      selectedBotIds: replaced.selectedBotIds,
      outgoingBotId: "b",
      incomingBotId: "g",
      rosterBotIds: ["a", "b", "c", "d", "e", "f", "g"],
    });
    assert.equal(duplicate.reason, "already-selected");
    assert.deepEqual(duplicate.selectedBotIds, replaced.selectedBotIds);
  });

  it("builds a deduplicated full-roster replacement list in saved-group order", () => {
    const roster = botGroupCoffeeStagingReplacementRoster({
      prompt: "recipes and systems",
      fullRosterBots: [...bots, bots[0], null],
      selectedBotIds: ["engineer", "chef"],
    });
    assert.deepEqual(
      roster.map(({ id }) => id),
      bots.map((bot) => bot?.id),
    );
    assert.deepEqual(
      roster.filter(({ selected }) => selected).map(({ id }) => id),
      ["engineer", "chef"],
    );
    assert.equal(roster[0]?.reactionBand, "related");
    assert.equal(roster.at(-1)?.reactionBand, "related");
  });

  it("reports undersized rosters without inventing participants", () => {
    const model = createBotGroupCoffeeStagingModel({
      prompt: "Anything",
      visibleBots: [bots[0], null, bots[0]],
    });
    assert.deepEqual(model.selectedBotIds, ["engineer"]);
    assert.equal(model.selection.count, 1);
    assert.equal(model.selection.canStart, false);
    assert.equal(model.selection.minimum, BOT_GROUP_COFFEE_STAGING_MIN_SELECTED);
  });
});

describe("waiting-room Coffee staging privacy and reaction contract", () => {
  it("uses only static non-dialogue reaction metadata", () => {
    assert.deepEqual(Object.keys(BOT_GROUP_COFFEE_STAGING_REACTION_COPY), [
      "strong",
      "related",
      "available",
    ]);
    for (const copy of Object.values(BOT_GROUP_COFFEE_STAGING_REACTION_COPY)) {
      assert.deepEqual(Object.keys(copy).sort(), [
        "accessibleLabel",
        "cue",
        "intensity",
        "label",
      ]);
      assert.doesNotMatch(copy.label, /[“”"']/u);
    }
  });

  it("contains no network, timer, randomness, or storage path", () => {
    const source = readFileSync(
      new URL("./botGroupCoffeeStaging.ts", import.meta.url),
      "utf8",
    );
    for (const pattern of [
      /\bfetch\s*\(/u,
      /\b(?:new\s+)?XMLHttpRequest\s*\(/u,
      /\b(?:new\s+)?WebSocket\s*\(/u,
      /\b(?:new\s+)?EventSource\s*\(/u,
      /\bnavigator\s*\.\s*sendBeacon\s*\(/u,
    ]) {
      assert.doesNotMatch(source, pattern);
    }
    assert.doesNotMatch(
      source,
      /\b(?:setTimeout|setInterval|localStorage|sessionStorage)\b|Math\.random/u,
    );
  });
});
