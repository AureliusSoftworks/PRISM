import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_GROUP_WAITING_ROOM_ENABLED,
  BOT_GROUP_WAITING_ROOM_MAX_MINI_BOTS,
  BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE,
  BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
  BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
  botGroupWaitingRoomIsEligible,
  createBotGroupWaitingRoomVisit,
  reconcileBotGroupWaitingRoomVisit,
  resolveBotGroupRoomLayout,
  type BotGroupRoomPlacement,
} from "./botGroupWaitingRoom.ts";

function botIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `bot-${index + 1}`);
}

function intersects(
  left: Pick<BotGroupRoomPlacement, "x" | "y" | "width" | "height">,
  right: Pick<BotGroupRoomPlacement, "x" | "y" | "width" | "height">,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function assertNoOverlaps(placements: readonly BotGroupRoomPlacement[]): void {
  for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < placements.length;
      rightIndex += 1
    ) {
      assert.equal(
        intersects(placements[leftIndex]!, placements[rightIndex]!),
        false,
        `${placements[leftIndex]!.botId} overlaps ${placements[rightIndex]!.botId}`,
      );
    }
  }
}

describe("living club-room eligibility", () => {
  it("is enabled only for authored saved groups with two valid bots", () => {
    assert.equal(BOT_GROUP_WAITING_ROOM_ENABLED, true);
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "group:friends", builtIn: false },
        ["bot-a", "bot-b"],
      ),
      true,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "builtin:favorites", builtIn: true },
        ["bot-a", "bot-b"],
      ),
      false,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "ungrouped", builtIn: true },
        ["bot-a", "bot-b"],
      ),
      false,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "starter:prism", builtIn: false, special: true },
        ["bot-a", "bot-b"],
      ),
      false,
    );
    assert.equal(
      botGroupWaitingRoomIsEligible(
        { id: "group:friends", builtIn: false },
        ["bot-a", "bot-a", ""],
      ),
      false,
    );
  });

  it("keeps the visit shell in canonical membership order without a rotating cast", () => {
    const visit = createBotGroupWaitingRoomVisit({
      groupId: "group:friends",
      validBotIds: ["bot-c", "bot-a", "bot-b"],
      visitSeed: "visit:stable",
    });
    assert.ok(visit);
    assert.deepEqual(visit.eligibleBotIds, ["bot-c", "bot-a", "bot-b"]);
    assert.deepEqual(Object.keys(visit).sort(), [
      "draft",
      "eligibleBotIds",
      "groupId",
      "returnCheckpoint",
      "visitSeed",
    ]);

    const reconciled = reconcileBotGroupWaitingRoomVisit(visit, [
      "bot-b",
      "bot-c",
      "bot-d",
    ]);
    assert.ok(reconciled);
    assert.deepEqual(reconciled.eligibleBotIds, ["bot-b", "bot-c", "bot-d"]);
  });
});

describe("resolveBotGroupRoomLayout", () => {
  it("uses mini through the 24-bot maximum when measured capacity permits", () => {
    for (const count of [2, 12, 24]) {
      const layout = resolveBotGroupRoomLayout({
        botIds: botIds(count),
        width: 900,
        height: 560,
      });
      assert.equal(layout.lod, "mini");
      assert.equal(layout.placements.length, count);
      assert.equal(
        layout.placements.every(
          (placement) =>
            placement.lod === "mini" &&
            placement.width === BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH &&
            placement.height === BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
        ),
        true,
      );
      assertNoOverlaps(layout.placements);
    }
    assert.equal(BOT_GROUP_WAITING_ROOM_MAX_MINI_BOTS, 24);
  });

  it("uses micro for 25, 50, and 100 bots and keeps every member", () => {
    for (const count of [25, 50, 100]) {
      const ids = botIds(count);
      const layout = resolveBotGroupRoomLayout({
        botIds: ids,
        width: 900,
        height: 560,
      });
      assert.equal(layout.lod, "micro");
      assert.deepEqual(
        layout.placements.map(({ botId }) => botId),
        ids,
      );
      assert.equal(
        layout.placements.every(
          (placement) =>
            placement.lod === "micro" &&
            placement.width === BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE &&
            placement.height === BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE,
        ),
        true,
      );
      assertNoOverlaps(layout.placements);
    }
  });

  it("switches to micro when available mini capacity is too small", () => {
    const layout = resolveBotGroupRoomLayout({
      botIds: botIds(12),
      width: 500,
      height: 300,
    });
    assert.equal(layout.miniCapacity, 8);
    assert.equal(layout.lod, "micro");
    assert.equal(layout.placements.length, 12);
  });

  it("preserves canonical input order, removes duplicate IDs, and is deterministic", () => {
    const options = {
      botIds: [" bot-c ", "bot-a", "bot-c", "", "bot-b"],
      width: 640,
      height: 360,
    } as const;
    const first = resolveBotGroupRoomLayout(options);
    const repeated = resolveBotGroupRoomLayout(options);
    assert.deepEqual(first, repeated);
    assert.deepEqual(
      first.placements.map(({ botId }) => botId),
      ["bot-c", "bot-a", "bot-b"],
    );
  });

  it("grows a narrow micro grid vertically rather than dropping bots", () => {
    const layout = resolveBotGroupRoomLayout({
      botIds: botIds(100),
      width: BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE * 4,
      height: BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE * 4,
    });
    assert.equal(layout.lod, "micro");
    assert.equal(layout.columns, 4);
    assert.equal(layout.rows, 25);
    assert.equal(layout.placements.length, 100);
    assert.equal(
      layout.contentHeight,
      BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE * 25,
    );
    assertNoOverlaps(layout.placements);
  });

  it("promotes one micro in place and moves only intersecting neighbors", () => {
    const ids = botIds(50);
    const base = resolveBotGroupRoomLayout({
      botIds: ids,
      width: 900,
      height: 560,
    });
    const promotedBotId = ids[22]!;
    const promoted = resolveBotGroupRoomLayout({
      botIds: ids,
      width: 900,
      height: 560,
      promotedBotId,
    });
    assert.equal(promoted.lod, "micro");
    assert.equal(promoted.promotedBotId, promotedBotId);
    assert.equal(promoted.placements.length, ids.length);
    const promotedPlacements = promoted.placements.filter(
      (placement) => placement.promoted,
    );
    assert.equal(promotedPlacements.length, 1);
    assert.equal(promotedPlacements[0]!.botId, promotedBotId);
    assert.equal(promotedPlacements[0]!.lod, "mini");
    assert.equal(
      promotedPlacements[0]!.width,
      BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
    );
    assert.equal(
      promotedPlacements[0]!.height,
      BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
    );

    const baseById = new Map(
      base.placements.map((placement) => [placement.botId, placement]),
    );
    const displaced = promoted.placements.filter(
      (placement) => placement.displaced,
    );
    assert.ok(displaced.length > 0);
    for (const placement of promoted.placements) {
      if (placement.promoted || placement.displaced) continue;
      const prior = baseById.get(placement.botId)!;
      assert.equal(placement.x, prior.x);
      assert.equal(placement.y, prior.y);
    }
    assertNoOverlaps(promoted.placements);
    assert.deepEqual(
      promoted,
      resolveBotGroupRoomLayout({
        botIds: ids,
        width: 900,
        height: 560,
        promotedBotId,
      }),
    );
  });

  it("clamps edge promotions within the room and ignores unknown promotions", () => {
    const ids = botIds(50);
    for (const promotedBotId of [ids[0]!, ids.at(-1)!]) {
      const layout = resolveBotGroupRoomLayout({
        botIds: ids,
        width: 500,
        height: 300,
        promotedBotId,
      });
      const footprint = layout.promotedFootprint!;
      assert.ok(footprint.x >= 0);
      assert.ok(footprint.y >= 0);
      assert.ok(footprint.x + footprint.width <= layout.contentWidth);
      assert.ok(footprint.y + footprint.height <= layout.contentHeight);
      assertNoOverlaps(layout.placements);
    }

    const unknown = resolveBotGroupRoomLayout({
      botIds: ids,
      width: 500,
      height: 300,
      promotedBotId: "missing-bot",
    });
    assert.equal(unknown.promotedBotId, null);
    assert.equal(unknown.promotedFootprint, null);
    assert.equal(unknown.placements.some(({ promoted }) => promoted), false);
  });

  it("does not promote in an all-mini room", () => {
    const ids = botIds(12);
    const layout = resolveBotGroupRoomLayout({
      botIds: ids,
      width: 900,
      height: 560,
      promotedBotId: ids[4],
    });
    assert.equal(layout.lod, "mini");
    assert.equal(layout.promotedBotId, null);
    assert.equal(layout.placements.every(({ promoted }) => !promoted), true);
  });

  it("keeps every presence outside a fixed central bot-grid footprint", () => {
    const exclusionFootprint = {
      x: 150,
      y: 110,
      width: 600,
      height: 340,
    };
    for (const count of [12, 24, 50, 100]) {
      const layout = resolveBotGroupRoomLayout({
        botIds: botIds(count),
        width: 900,
        height: 560,
        exclusionFootprint,
      });
      assert.equal(layout.placements.length, count);
      assert.equal(
        layout.placements.every(
          (placement) => !intersects(placement, exclusionFootprint),
        ),
        true,
      );
      assertNoOverlaps(layout.placements);
    }
  });

  it("keeps a promoted micro presence outside the central grid", () => {
    const ids = botIds(50);
    const exclusionFootprint = {
      x: 150,
      y: 110,
      width: 600,
      height: 340,
    };
    const layout = resolveBotGroupRoomLayout({
      botIds: ids,
      width: 900,
      height: 560,
      promotedBotId: ids[22],
      exclusionFootprint,
    });
    assert.equal(layout.promotedBotId, ids[22]);
    assert.equal(layout.placements.some(({ promoted }) => promoted), true);
    assert.equal(
      layout.placements.every(
        (placement) => !intersects(placement, exclusionFootprint),
      ),
      true,
    );
    assertNoOverlaps(layout.placements);
  });
});
