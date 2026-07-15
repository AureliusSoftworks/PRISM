import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BOT_GROUP_COFFEE_RETURN_CHECKPOINT_STORAGE_PREFIX,
  botGroupCoffeeReturnCheckpointStorageKey,
  createBotGroupCoffeeReturnCheckpoint,
  normalizeBotGroupCoffeeReturnCheckpoint,
  parseBotGroupCoffeeReturnCheckpoint,
  resolveBotGroupCoffeeReturn,
  serializeBotGroupCoffeeReturnCheckpoint,
  type BotGroupCoffeeReturnCheckpoint,
  type BotGroupCoffeeReturnSourceGroup,
} from "./botGroupCoffeeReturnCheckpoint.ts";

const validBotIds = Array.from(
  { length: 8 },
  (_, index) => `bot-${index + 1}`,
);

function checkpoint(
  overrides: Partial<BotGroupCoffeeReturnCheckpoint> = {},
): BotGroupCoffeeReturnCheckpoint {
  return {
    version: 1,
    coffeeSessionId: "coffee-session-1",
    sourceGroupId: "group-friends",
    sourceRoomVisitSeed: "group-friends:visit:17",
    createdAtMs: 42,
    ...overrides,
  };
}

function group(
  overrides: Partial<BotGroupCoffeeReturnSourceGroup> = {},
): BotGroupCoffeeReturnSourceGroup {
  return {
    id: "group-friends",
    builtIn: false,
    botIds: validBotIds,
    ...overrides,
  };
}

describe("Coffee group-room return checkpoint storage model", () => {
  it("normalizes a minimal JSON-safe checkpoint and keys it by Coffee session", () => {
    const created = createBotGroupCoffeeReturnCheckpoint({
      coffeeSessionId: "  coffee/session 1  ",
      sourceGroupId: "  group-friends ",
      sourceRoomVisitSeed: "  group-friends:visit:17 ",
      createdAtMs: 42,
    });
    assert.deepEqual(created, {
      version: 1,
      coffeeSessionId: "coffee/session 1",
      sourceGroupId: "group-friends",
      sourceRoomVisitSeed: "group-friends:visit:17",
      createdAtMs: 42,
    });
    assert.equal(
      botGroupCoffeeReturnCheckpointStorageKey("  coffee/session 1  "),
      `${BOT_GROUP_COFFEE_RETURN_CHECKPOINT_STORAGE_PREFIX}coffee%2Fsession%201`,
    );
    assert.equal(botGroupCoffeeReturnCheckpointStorageKey(" \u0000 "), null);
  });

  it("round-trips through JSON without persisting a room roster", () => {
    const serialized = serializeBotGroupCoffeeReturnCheckpoint(checkpoint());
    assert.ok(serialized);
    assert.deepEqual(
      parseBotGroupCoffeeReturnCheckpoint(serialized, "coffee-session-1"),
      checkpoint(),
    );
    const stored = JSON.parse(serialized) as Record<string, unknown>;
    assert.deepEqual(Object.keys(stored).sort(), [
      "coffeeSessionId",
      "createdAtMs",
      "sourceGroupId",
      "sourceRoomVisitSeed",
      "version",
    ]);
    assert.equal("botIds" in stored, false);
    assert.equal("roster" in stored, false);
  });

  it("fails closed for malformed, mismatched, or non-JSON-safe input", () => {
    assert.equal(parseBotGroupCoffeeReturnCheckpoint("{"), null);
    assert.equal(parseBotGroupCoffeeReturnCheckpoint("[]"), null);
    assert.equal(
      parseBotGroupCoffeeReturnCheckpoint(
        JSON.stringify(checkpoint()),
        "another-session",
      ),
      null,
    );
    assert.equal(
      normalizeBotGroupCoffeeReturnCheckpoint({
        ...checkpoint(),
        version: 2,
      }),
      null,
    );
    assert.equal(
      normalizeBotGroupCoffeeReturnCheckpoint({
        ...checkpoint(),
        createdAtMs: Number.NaN,
      }),
      null,
    );
    assert.equal(
      normalizeBotGroupCoffeeReturnCheckpoint({
        ...checkpoint(),
        sourceRoomVisitSeed: "visit\u0000seed",
      }),
      null,
    );
    assert.equal(
      serializeBotGroupCoffeeReturnCheckpoint({
        ...checkpoint(),
        coffeeSessionId: "",
      }),
      null,
    );
  });

  it("contains no storage, network, database, clock, or random side effects", () => {
    const source = readFileSync(
      new URL("./botGroupCoffeeReturnCheckpoint.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /\b(?:sessionStorage|localStorage|fetch|indexedDB|Date\.now|Math\.random)\b/u,
    );
  });
});

describe("Coffee group-room return resolution", () => {
  it("returns to the current ordinary source group with a fresh visit seed", () => {
    const outcome = resolveBotGroupCoffeeReturn({
      checkpoint: checkpoint(),
      groups: [
        group({
          botIds: [
            "bot-1",
            "bot-2",
            "bot-2",
            "bot-3",
            "bot-4",
            "bot-5",
            "bot-6",
            "deleted-bot",
            " ",
          ],
        }),
      ],
      validBotIds,
    });
    assert.deepEqual(outcome, {
      kind: "fresh-room",
      view: "chat",
      groupFilterId: "group-friends",
      groupId: "group-friends",
      coffeeSessionId: "coffee-session-1",
      invalidatedVisitSeed: "group-friends:visit:17",
      visitSeed: "coffee-return:group-friends:coffee-session-1:42",
      validBotIds: validBotIds.slice(0, 6),
    });
    assert.notEqual(outcome.visitSeed, checkpoint().sourceRoomVisitSeed);
  });

  it("falls back to Chat and All bots when the source group was deleted", () => {
    assert.deepEqual(
      resolveBotGroupCoffeeReturn({
        checkpoint: checkpoint(),
        groups: [],
        validBotIds,
      }),
      {
        kind: "chat-all-bots",
        view: "chat",
        groupFilterId: "all",
        reason: "missing-source-group",
      },
    );
  });

  it("falls back for built-in, special, or undersized current groups", () => {
    for (const sourceGroup of [
      group({ builtIn: true }),
      group({ special: true }),
      group({ botIds: ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5"] }),
      group({
        botIds: ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5", "gone"],
      }),
    ]) {
      assert.deepEqual(
        resolveBotGroupCoffeeReturn({
          checkpoint: checkpoint(),
          groups: [sourceGroup],
          validBotIds,
        }),
        {
          kind: "chat-all-bots",
          view: "chat",
          groupFilterId: "all",
          reason: "ineligible-source-group",
        },
      );
    }
  });

  it("uses the same safe fallback for an invalid checkpoint", () => {
    assert.deepEqual(
      resolveBotGroupCoffeeReturn({
        checkpoint: { ...checkpoint(), coffeeSessionId: "" },
        groups: [group()],
        validBotIds,
      }),
      {
        kind: "chat-all-bots",
        view: "chat",
        groupFilterId: "all",
        reason: "invalid-checkpoint",
      },
    );
  });
});
