import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT,
  BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS,
  BOT_GROUP_WAITING_ROOM_ROTATION_MAX_MS,
  BOT_GROUP_WAITING_ROOM_ROTATION_MIN_MS,
  botGroupWaitingRoomHandoffOrder,
  botGroupWaitingRoomIsEligible,
  botGroupWaitingRoomPresenceCount,
  botGroupWaitingRoomRotationPaused,
  botGroupWaitingRoomSnapshot,
  botGroupWaitingRoomUsesCompactFallback,
  botGroupWaitingRoomVisiblePlacements,
  botGroupWaitingRoomWithDraft,
  botGroupWaitingRoomWithReturnCheckpoint,
  createBotGroupWaitingRoomVisit,
  engageBotGroupWaitingRoomAnchor,
  promoteBotGroupWaitingRoomRoamer,
  reconcileBotGroupWaitingRoomVisit,
  rotateBotGroupWaitingRoomRoamer,
  type BotGroupWaitingRoomVisitState,
} from "./botGroupWaitingRoom.ts";

function botIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `bot-${index + 1}`);
}

function visit(count = 12): BotGroupWaitingRoomVisitState {
  const state = createBotGroupWaitingRoomVisit({
    groupId: "group:friends",
    validBotIds: botIds(count),
    visitSeed: "visit:fixed",
  });
  assert.ok(state);
  return state;
}

describe("bot group waiting-room eligibility", () => {
  it("requires two unique valid bots", () => {
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "group:friends", builtIn: false },
        botIds(2),
      ),
      true,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "group:friends", builtIn: false },
        ["a", "a", ""],
      ),
      false,
    );
  });

  it("excludes other built-in and special groups, but allows Favorites and Ungrouped", () => {
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "ungrouped", builtIn: true },
        botIds(60),
      ),
      true,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "builtin:favorites", builtIn: true },
        botIds(12),
      ),
      true,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "starter:prism", builtIn: false, special: true },
        botIds(12),
      ),
      false,
    );
  });
});

describe("bot group waiting-room responsive cast", () => {
  it("pins the compact boundary and exact breakpoint counts", () => {
    assert.equal(botGroupWaitingRoomUsesCompactFallback({ width: 899, height: 560 }), true);
    assert.equal(botGroupWaitingRoomUsesCompactFallback({ width: 900, height: 559 }), true);
    assert.equal(botGroupWaitingRoomUsesCompactFallback({ width: 900, height: 560 }), false);

    const cases = [
      [{ width: 900, height: 560 }, 12],
      [{ width: 1280, height: 720 }, 12],
      [{ width: 1280, height: 760 }, 12],
      [{ width: 1600, height: 900 }, 12],
      [{ width: 1920, height: 1080 }, 12],
    ] as const;
    for (const [viewport, expected] of cases) {
      assert.equal(botGroupWaitingRoomPresenceCount(viewport, 12), expected);
    }
  });

  it("keeps the whole cast visible on supported desktop viewports", () => {
    const state = visit();
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1280, height: 760 },
      { width: 1600, height: 900 },
    ] as const) {
      const placements = botGroupWaitingRoomVisiblePlacements(state, viewport);
      assert.equal(
        placements.filter(({ role }) => role === "anchor").length,
        BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT,
      );
      assert.equal(
        placements.filter(({ role }) => role === "roamer").length,
        7,
      );
    }
  });

  it("caps every room, including a large Ungrouped roster, at 24", () => {
    assert.equal(
      botGroupWaitingRoomPresenceCount({ width: 1920, height: 1080 }, 6),
      6,
    );
    assert.equal(
      botGroupWaitingRoomPresenceCount({ width: 1920, height: 1080 }, 5),
      5,
    );
    assert.equal(
      botGroupWaitingRoomPresenceCount({ width: 1920, height: 1080 }, 60),
      BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS,
    );
    assert.equal(
      botGroupWaitingRoomPresenceCount({ width: 1920, height: 1080 }, 1),
      0,
    );
  });
});

describe("bot group waiting-room visit state", () => {
  it("selects a stable cast, geometry, deck, and delay for the visit seed", () => {
    const first = createBotGroupWaitingRoomVisit({
      groupId: "group:friends",
      validBotIds: botIds(12),
      visitSeed: "visit:stable",
    });
    const repeated = createBotGroupWaitingRoomVisit({
      groupId: "group:friends",
      validBotIds: botIds(12).reverse(),
      visitSeed: "visit:stable",
    });
    assert.deepEqual(first, repeated);
    assert.equal(first?.anchorBotIds.length, 5);
    assert.equal(first?.roamerBotIds.length, 7);
    assert.equal(first?.placements.length, 12);
    assert.equal(
      first?.placements.every(
        (placement) =>
          placement.xPercent >= 6 &&
          placement.xPercent <= 94 &&
          placement.yPercent >= 12 &&
          placement.yPercent <= 88 &&
          placement.driftDurationMs >= 8_400,
      ),
      true,
    );
    assert.ok(
      (first?.nextRotationDelayMs ?? 0) >=
        BOT_GROUP_WAITING_ROOM_ROTATION_MIN_MS,
    );
    assert.ok(
      (first?.nextRotationDelayMs ?? Infinity) <=
        BOT_GROUP_WAITING_ROOM_ROTATION_MAX_MS,
    );
  });

  it("keeps draft and return checkpoint in the visit only", () => {
    const state = visit();
    const drafted = botGroupWaitingRoomWithDraft(state, "Listen up");
    const checkpoint = {
      lane: "zen" as const,
      botId: drafted.anchorBotIds[0],
      createdAtMs: 42,
      room: botGroupWaitingRoomSnapshot(drafted),
    };
    const returned = botGroupWaitingRoomWithReturnCheckpoint(
      drafted,
      checkpoint,
    );
    assert.equal(returned.draft, "Listen up");
    assert.deepEqual(returned.returnCheckpoint, checkpoint);
    assert.deepEqual(
      JSON.parse(JSON.stringify(returned.returnCheckpoint)),
      checkpoint,
    );
    assert.equal(state.draft, "");
    assert.equal(state.returnCheckpoint, null);
  });

  it("promotes a clicked roamer and demotes the least-recent anchor", () => {
    const state = visit();
    const oldestAnchor = state.anchorBotIds[0]!;
    const engagedAnchor = state.anchorBotIds[1]!;
    const engaged = engageBotGroupWaitingRoomAnchor(state, engagedAnchor);
    assert.equal(engaged.engagementOrder.at(-1), engagedAnchor);
    const roamer = state.roamerBotIds[0]!;
    const promoted = promoteBotGroupWaitingRoomRoamer(engaged, roamer);
    assert.equal(promoted.anchorBotIds.length, 5);
    assert.equal(promoted.roamerBotIds.length, 7);
    assert.ok(promoted.anchorBotIds.includes(roamer));
    assert.ok(promoted.roamerBotIds.includes(oldestAnchor));
    assert.equal(promoted.engagementOrder.at(-1), roamer);
  });
});

describe("bot group waiting-room rotation", () => {
  it("uses the required handoff order at six and eight and a seeded order at seven", () => {
    assert.equal(
      botGroupWaitingRoomHandoffOrder(6, "visit", 1),
      "arrival-before-departure",
    );
    assert.equal(
      botGroupWaitingRoomHandoffOrder(8, "visit", 1),
      "departure-before-arrival",
    );
    const seven = botGroupWaitingRoomHandoffOrder(7, "visit", 1);
    assert.equal(seven, botGroupWaitingRoomHandoffOrder(7, "visit", 1));
    assert.ok(
      seven === "arrival-before-departure" ||
        seven === "departure-before-arrival",
    );
  });

  it("rotates one visible roamer without changing the five anchors", () => {
    const state = visit(30);
    const result = rotateBotGroupWaitingRoomRoamer(state, {
      width: 1280,
      height: 720,
    });
    assert.equal(result.changed, true);
    assert.deepEqual(result.state.anchorBotIds, state.anchorBotIds);
    assert.equal(result.handoffOrder, "departure-before-arrival");
    assert.ok(result.arrivingBotId);
    assert.ok(result.departingBotId);
    assert.notEqual(result.arrivingBotId, result.departingBotId);
    assert.equal(
      botGroupWaitingRoomVisiblePlacements(result.state, {
        width: 1280,
        height: 720,
      }).length,
      BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS,
    );
  });

  it("does not repeat arrivals until the seeded deck is exhausted", () => {
    let state = visit(30);
    const initialDeckLength = state.rotationDeck.length;
    const arrivals: string[] = [];
    for (let index = 0; index < initialDeckLength; index += 1) {
      const result = rotateBotGroupWaitingRoomRoamer(state, {
        width: 1280,
        height: 720,
      });
      assert.equal(result.changed, true);
      arrivals.push(result.arrivingBotId!);
      state = result.state;
    }
    assert.equal(new Set(arrivals).size, arrivals.length);
    assert.equal(state.rotationDeck.length, 0);
    const nextCycle = rotateBotGroupWaitingRoomRoamer(state, {
      width: 1280,
      height: 720,
    });
    assert.equal(nextCycle.changed, true);
    assert.equal(nextCycle.state.rotationCycle, 1);
  });

  it("has no rotation candidate when every eligible bot is visible", () => {
    const state = visit(6);
    const result = rotateBotGroupWaitingRoomRoamer(state, {
      width: 1920,
      height: 1080,
    });
    assert.equal(result.changed, false);
    assert.equal(result.arrivingBotId, null);
  });
});

describe("bot group waiting-room lifecycle safety", () => {
  it("pauses independently for every required interruption", () => {
    const idle = {
      typing: false,
      zenFocused: false,
      coffeeStaging: false,
      pageHidden: false,
      reducedMotion: false,
    };
    assert.equal(botGroupWaitingRoomRotationPaused(idle), false);
    for (const reason of Object.keys(idle) as (keyof typeof idle)[]) {
      assert.equal(
        botGroupWaitingRoomRotationPaused({ ...idle, [reason]: true }),
        true,
      );
    }
  });

  it("reconciles deleted anchors, roamers, and deck entries safely", () => {
    const state = visit(30);
    const deleted = new Set([
      state.anchorBotIds[0]!,
      state.roamerBotIds[0]!,
      state.rotationDeck[0]!,
    ]);
    const valid = state.eligibleBotIds.filter((botId) => !deleted.has(botId));
    const reconciled = reconcileBotGroupWaitingRoomVisit(state, valid);
    assert.ok(reconciled);
    assert.equal(reconciled.anchorBotIds.length, 5);
    assert.equal(reconciled.roamerBotIds.length, 19);
    assert.equal(
      reconciled.placements.every(({ botId }) => valid.includes(botId)),
      true,
    );
  });

  it("does not reintroduce consumed arrivals when membership changes", () => {
    const initial = visit(30);
    const first = rotateBotGroupWaitingRoomRoamer(initial, {
      width: 1280,
      height: 720,
    });
    assert.equal(first.changed, true);
    const consumedArrival = first.arrivingBotId!;
    const withNewMember = reconcileBotGroupWaitingRoomVisit(first.state, [
      ...first.state.eligibleBotIds,
      "bot-31",
    ]);
    assert.ok(withNewMember);
    assert.equal(withNewMember.rotationDeck.includes(consumedArrival), false);
    assert.equal(withNewMember.rotationDeck.includes("bot-31"), true);
  });

  it("falls back only when deletions leave fewer than two valid members", () => {
    assert.equal(reconcileBotGroupWaitingRoomVisit(visit(), botIds(1)), null);
    assert.ok(reconcileBotGroupWaitingRoomVisit(visit(), botIds(2)));
  });
});
