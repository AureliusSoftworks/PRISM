import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCoffeeSeatLayoutEntries,
  restoreCoffeeReviewSeatBotIds,
} from "./coffee-seat-layout.ts";

type TestBot = { id: string };

function botsById(ids: readonly string[]): ReadonlyMap<string, TestBot> {
  return new Map(ids.map((id) => [id, { id }]));
}

test("review layout preserves authored seat order for two through five participants", () => {
  for (let count = 2; count <= 5; count += 1) {
    const ids = Array.from({ length: count }, (_, index) => `bot-${index + 1}`);
    const entries = buildCoffeeSeatLayoutEntries(ids, botsById(ids));

    assert.deepEqual(
      entries.map(({ botId, seatIndex, layoutIndex }) => ({
        botId,
        seatIndex,
        layoutIndex,
      })),
      ids.map((botId, index) => ({
        botId,
        seatIndex: index,
        layoutIndex: index,
      })),
    );
  }
});

test("review layout compacts empty, stale, and duplicate seats without changing replay order", () => {
  const seatBotIds = [
    "alpha",
    null,
    "missing",
    "bravo",
    "alpha",
    undefined,
    "charlie",
  ];
  const map = botsById(["alpha", "bravo", "charlie"]);

  const first = buildCoffeeSeatLayoutEntries(seatBotIds, map);
  const replay = buildCoffeeSeatLayoutEntries(seatBotIds, map);

  assert.deepEqual(
    first.map(({ botId, seatIndex, layoutIndex }) => ({
      botId,
      seatIndex,
      layoutIndex,
    })),
    [
      { botId: "alpha", seatIndex: 0, layoutIndex: 0 },
      { botId: "bravo", seatIndex: 3, layoutIndex: 1 },
      { botId: "charlie", seatIndex: 6, layoutIndex: 2 },
    ],
  );
  assert.deepEqual(replay, first);
});

test("review layout restores departed bots to their authored seats", () => {
  assert.deepEqual(
    restoreCoffeeReviewSeatBotIds(
      [null, "bot-2", null, "bot-4"],
      [
        {
          v: 1,
          name: "coffeeReplayEvent",
          kind: "botDeparture",
          botId: "bot-1",
          seatIndex: 0,
          occurredAt: "2026-07-14T12:00:00.000Z",
        },
        {
          v: 1,
          name: "coffeeReplayEvent",
          kind: "botDeparture",
          botId: "bot-3",
          seatIndex: 2,
          occurredAt: "2026-07-14T12:01:00.000Z",
        },
      ],
    ),
    ["bot-1", "bot-2", "bot-3", "bot-4"],
  );
});

test("review layout does not duplicate a departed bot already in the roster", () => {
  assert.deepEqual(
    restoreCoffeeReviewSeatBotIds(
      ["bot-1", "bot-2"],
      [
        {
          v: 1,
          name: "coffeeReplayEvent",
          kind: "botDeparture",
          botId: "bot-1",
          seatIndex: 0,
          occurredAt: "2026-07-14T12:00:00.000Z",
        },
      ],
    ),
    ["bot-1", "bot-2"],
  );
});

test("desktop Coffee supplies a distinct avatar slot for every two-to-five participant layout", () => {
  const css = readFileSync(
    new URL("./page.module.css", import.meta.url),
    "utf8",
  );

  for (let count = 2; count <= 5; count += 1) {
    const coordinates: Array<{ left: number; top: number }> = [];
    for (let layoutIndex = 0; layoutIndex < count; layoutIndex += 1) {
      const selector =
        `.coffeeStage:not([data-compact="true"])\n` +
        `  .coffeeSeat[data-seat-count="${count}"][data-layout-seat="${layoutIndex}"]`;
      const ruleStart = css.indexOf(`${selector} {`);
      assert.notEqual(
        ruleStart,
        -1,
        `missing Coffee seat ${layoutIndex} of ${count}`,
      );
      const ruleEnd = css.indexOf("}", ruleStart);
      const rule = css.slice(ruleStart, ruleEnd);
      const left = Number(rule.match(/\bleft:\s*([0-9.]+)%/)?.[1]);
      const top = Number(rule.match(/\btop:\s*([0-9.]+)%/)?.[1]);
      assert.ok(Number.isFinite(left) && Number.isFinite(top));
      coordinates.push({ left, top });

      assert.match(
        css,
        new RegExp(
          String.raw`\.coffeeSeatActionAnchor\[data-seat-count="${count}"\]\[data-layout-seat="${layoutIndex}"\]`,
        ),
        `missing matching prose/nameplate anchor ${layoutIndex} of ${count}`,
      );
    }

    assert.equal(
      new Set(coordinates.map(({ left, top }) => `${left}:${top}`)).size,
      count,
      `${count}-participant layout must not stack avatars`,
    );
  }
});

test("four-bot picker preview ignores raw five-slot seat coordinates", () => {
  const css = readFileSync(
    new URL("./page.module.css", import.meta.url),
    "utf8",
  )
    .replace(/\s+/gu, " ")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")");

  for (let seatIndex = 0; seatIndex < 5; seatIndex += 1) {
    assert.match(
      css,
      new RegExp(
        String.raw`\.coffeeStage\[data-phase="selecting"\]\[data-compact="true"\]:not\(\[data-group-ready="true"\]\) \.coffeeSeat:not\(\[data-seat-count="4"\]\)\[data-seat="${seatIndex}"\]`,
      ),
      `raw picker seat ${seatIndex} must not override the four-bot visual ring`,
    );
  }
});
