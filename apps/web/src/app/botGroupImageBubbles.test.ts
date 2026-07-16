import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botGroupImageBubblePlan,
  type BotGroupImageBubbleRecord,
} from "./botGroupImageBubbles.ts";

function image(
  id: string,
  botId: string | null,
  overrides: Partial<BotGroupImageBubbleRecord> = {},
): BotGroupImageBubbleRecord {
  return {
    id,
    botId,
    createdAt: `2026-07-14T12:00:${id.padStart(2, "0")}.000Z`,
    displayUrl: `/api/images/${id}/file`,
    hasLocalFile: true,
    purpose: "gallery",
    ...overrides,
  };
}

const members = ["bot-a", "bot-b", "bot-c"];
const records = [
  image("1", "bot-a"),
  image("2", "bot-a"),
  image("3", "bot-a"),
  image("4", "bot-b"),
  image("5", "bot-b"),
  image("6", "bot-c"),
  image("7", "bot-c"),
];

describe("bot group image bubble eligibility", () => {
  it("fails closed for nonmembers, private rows, remote-only rows, and non-gallery purposes", () => {
    const plan = botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "compact",
      viewport: { width: 1440, height: 900 },
      memberBotIds: members,
      privateImageIds: ["private"],
      failedImageIds: ["failed"],
      images: [
        image("member", "bot-a"),
        image("outsider", "bot-z"),
        image("private", "bot-b"),
        image("failed", "bot-c"),
        image("remote", "bot-a", { hasLocalFile: false }),
        image("wallpaper", "bot-b", { purpose: "wallpaper" }),
        image("profile", "bot-c", { purpose: "bot_profile_picture" }),
        image("missing-bot", null),
      ],
    });
    assert.deepEqual(plan.map(({ imageId }) => imageId), ["member"]);
  });

  it("deduplicates malformed rows and rejects invalid surface inputs", () => {
    const duplicatePlan = botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "compact",
      viewport: { width: 1280, height: 720 },
      memberBotIds: members,
      images: [image("same", "bot-a"), image("same", "bot-b")],
    });
    assert.equal(duplicatePlan.length, 1);
    assert.deepEqual(
      botGroupImageBubblePlan({
        groupId: " ",
        variant: "compact",
        viewport: { width: 1280, height: 720 },
        memberBotIds: members,
        images: records,
      }),
      [],
    );
    assert.deepEqual(
      botGroupImageBubblePlan({
        groupId: "group-1",
        variant: "compact",
        viewport: { width: Number.NaN, height: 720 },
        memberBotIds: members,
        images: records,
      }),
      [],
    );
  });
});

describe("bot group image bubble determinism", () => {
  it("is stable across input ordering and balances the first pass across member bots", () => {
    const input = {
      groupId: "group-1",
      variant: "compact" as const,
      viewport: { width: 1440, height: 900 },
      memberBotIds: members,
    };
    const first = botGroupImageBubblePlan({ ...input, images: records });
    const reversed = botGroupImageBubblePlan({
      ...input,
      memberBotIds: [...members].reverse(),
      images: [...records].reverse(),
    });
    assert.deepEqual(first, reversed);
    assert.equal(first.length, 6);
    assert.deepEqual(
      new Set(first.slice(0, 3).map(({ botId }) => botId)),
      new Set(members),
    );
  });

  it("keeps placement and motion values bounded", () => {
    for (const placement of botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "compact",
      viewport: { width: 1920, height: 1080 },
      memberBotIds: members,
      images: records,
    })) {
      assert.ok(placement.xPercent >= 0 && placement.xPercent <= 100);
      assert.ok(placement.yPercent >= 0 && placement.yPercent <= 100);
      assert.ok(placement.sizePx >= 40 && placement.sizePx <= 72);
      assert.ok(placement.tiltDeg >= -5 && placement.tiltDeg <= 5);
      assert.ok(placement.floatDelayMs >= -5_000 && placement.floatDelayMs <= 0);
      assert.ok(
        placement.floatDurationMs >= 7_000 &&
          placement.floatDurationMs <= 11_000,
      );
    }
  });

  it("prefers each bot's newest eligible image before older rows", () => {
    const plan = botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "compact",
      viewport: { width: 800, height: 600 },
      memberBotIds: ["bot-a"],
      images: [
        image("old", "bot-a", { createdAt: "2026-01-01T00:00:00.000Z" }),
        image("new", "bot-a", { createdAt: "2026-07-14T00:00:00.000Z" }),
      ],
    });
    assert.deepEqual(plan.map(({ imageId }) => imageId), ["new", "old"]);
  });
});

describe("bot group image bubble density and collision safety", () => {
  it("uses four to six compact bubbles and two to four waiting-room bubbles", () => {
    const compactCounts = [
      { width: 800, height: 600, count: 4 },
      { width: 1280, height: 720, count: 4 },
      { width: 1920, height: 1080, count: 6 },
    ];
    for (const { width, height, count } of compactCounts) {
      assert.equal(
        botGroupImageBubblePlan({
          groupId: "group-1",
          variant: "compact",
          viewport: { width, height },
          memberBotIds: members,
          images: records,
        }).length,
        count,
      );
    }
    const waitingCounts = [
      { width: 900, height: 560, count: 2 },
      { width: 1280, height: 720, count: 2 },
      { width: 1920, height: 1080, count: 4 },
    ];
    for (const { width, height, count } of waitingCounts) {
      assert.equal(
        botGroupImageBubblePlan({
          groupId: "group-1",
          variant: "waiting",
          viewport: { width, height },
          memberBotIds: members,
          images: records,
        }).length,
        count,
      );
    }
  });

  it("keeps the short waiting-room row inside its clipped surface", () => {
    const surfaceHeight = 280;
    const inset = 8;
    const plan = botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "waiting",
      viewport: { width: 900, height: 560 },
      memberBotIds: members,
      images: records,
    });
    assert.equal(plan.length, 2);
    for (const placement of plan) {
      const centerY = (placement.yPercent / 100) * surfaceHeight;
      assert.ok(centerY - placement.sizePx / 2 - inset >= 0);
      assert.ok(centerY + placement.sizePx / 2 + inset <= surfaceHeight);
      assert.ok(placement.sizePx >= 44);
    }
    assert.deepEqual(
      plan.map(({ xPercent }) => xPercent),
      [6, 94],
    );
  });

  it("returns spatial DOM order without overlapping bubble hit boxes", () => {
    for (const variant of ["compact", "waiting"] as const) {
      const viewport = { width: 1920, height: 1080 };
      const plan = botGroupImageBubblePlan({
        groupId: "group-1",
        variant,
        viewport,
        memberBotIds: members,
        images: records,
      });
      const surface =
        variant === "waiting"
          ? { width: 1120, height: 520 }
          : { width: 1040, height: 260 };
      for (let index = 1; index < plan.length; index += 1) {
        const previous = plan[index - 1]!;
        const current = plan[index]!;
        assert.ok(
          current.yPercent > previous.yPercent ||
            (current.yPercent === previous.yPercent &&
              current.xPercent >= previous.xPercent),
        );
      }
      for (let leftIndex = 0; leftIndex < plan.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < plan.length;
          rightIndex += 1
        ) {
          const left = plan[leftIndex]!;
          const right = plan[rightIndex]!;
          const dx =
            ((left.xPercent - right.xPercent) / 100) * surface.width;
          const dy =
            ((left.yPercent - right.yPercent) / 100) * surface.height;
          assert.ok(
            Math.hypot(dx, dy) >=
              left.sizePx / 2 + right.sizePx / 2 + 10,
          );
        }
      }
    }
  });

  it("drops waiting slots that collide with a visible presence", () => {
    const baseline = botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "waiting",
      viewport: { width: 1920, height: 1080 },
      memberBotIds: members,
      images: records,
    });
    assert.equal(baseline.length, 4);
    const blocked = baseline[0]!;
    const withCollision = botGroupImageBubblePlan({
      groupId: "group-1",
      variant: "waiting",
      viewport: { width: 1920, height: 1080 },
      memberBotIds: members,
      images: records,
      occupiedPresences: [
        {
          botId: "blocking-bot",
          role: "anchor",
          xPercent: blocked.xPercent,
          yPercent: blocked.yPercent,
          scale: 1,
        },
      ],
    });
    assert.ok(
      withCollision.every(
        (placement) =>
          placement.xPercent !== blocked.xPercent ||
          placement.yPercent !== blocked.yPercent,
      ),
    );
    assert.ok(withCollision.length <= 4);
  });
});
