import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveCoffeeReplayActionPopoverPlacement,
  type CoffeeReplayActionPopoverRect,
} from "./coffee-replay-action-popover.ts";

const stage: CoffeeReplayActionPopoverRect = {
  left: 100,
  top: 80,
  right: 1100,
  bottom: 780,
  width: 1000,
  height: 700,
};

function anchor(left: number, top: number): CoffeeReplayActionPopoverRect {
  return {
    left,
    top,
    right: left + 100,
    bottom: top + 100,
    width: 100,
    height: 100,
  };
}

const viewport = { width: 1200, height: 900 };
const panelSize = { width: 260, height: 240 };
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("anchors beside left and right seats when their outward side fits", () => {
  const leftSeat = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(400, 350),
    stageRect: stage,
    panelSize,
    viewport,
  });
  const rightSeat = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(700, 350),
    stageRect: stage,
    panelSize,
    viewport,
  });

  assert.equal(leftSeat.side, "left");
  assert.equal(rightSeat.side, "right");
  assert.ok(leftSeat.left + panelSize.width < 400);
  assert.ok(rightSeat.left > 800);
});

test("anchors above and below head and foot seats", () => {
  const headSeat = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(550, 342),
    stageRect: stage,
    panelSize,
    viewport,
  });
  const footSeat = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(550, 418),
    stageRect: stage,
    panelSize,
    viewport,
  });

  assert.equal(headSeat.side, "above");
  assert.equal(footSeat.side, "below");
});

test("falls back to another side when the outward side cannot fit", () => {
  const placement = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(118, 310),
    stageRect: stage,
    panelSize,
    viewport,
  });

  assert.notEqual(placement.side, "left");
  assert.ok(placement.left >= 110);
});

test("clamps narrow-window panels and long content inside stage and viewport", () => {
  const placement = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(250, 180),
    stageRect: {
      left: -20,
      top: 40,
      right: 390,
      bottom: 650,
      width: 410,
      height: 610,
    },
    panelSize: { width: 520, height: 900 },
    viewport: { width: 375, height: 620 },
  });

  assert.equal(placement.maxWidth, 355);
  assert.equal(placement.maxHeight, 560);
  assert.ok(placement.left >= 10);
  assert.ok(placement.top >= 50);
  assert.ok(placement.left + placement.maxWidth <= 365);
  assert.ok(placement.top + placement.maxHeight <= 610);
});

test("keeps the pointer aligned after edge clamping", () => {
  const placement = resolveCoffeeReplayActionPopoverPlacement({
    anchorRect: anchor(120, 90),
    stageRect: stage,
    panelSize,
    viewport,
  });

  const pointerAxis =
    placement.side === "left" || placement.side === "right"
      ? panelSize.height
      : panelSize.width;
  assert.ok(placement.pointerOffset >= 18);
  assert.ok(placement.pointerOffset <= pointerAxis - 18);
});

test("keeps every two-to-five-seat placement bounded at wide and narrow sizes", () => {
  const layouts: Record<number, ReadonlyArray<readonly [number, number]>> = {
    2: [
      [25, 50],
      [75, 50],
    ],
    3: [
      [50, 11],
      [26, 69],
      [74, 69],
    ],
    4: [
      [24, 34],
      [76, 34],
      [76, 74],
      [24, 74],
    ],
    5: [
      [50, 11],
      [21, 40],
      [79, 40],
      [29, 83],
      [71, 83],
    ],
  };
  const scenarios = [
    {
      stage: { left: 100, top: 80, width: 1000, height: 700 },
      viewport: { width: 1200, height: 900 },
      anchorSize: 160,
    },
    {
      stage: { left: 0, top: 40, width: 700, height: 560 },
      viewport: { width: 700, height: 640 },
      anchorSize: 120,
    },
  ] as const;

  for (const scenario of scenarios) {
    const stageRect = {
      ...scenario.stage,
      right: scenario.stage.left + scenario.stage.width,
      bottom: scenario.stage.top + scenario.stage.height,
    };
    for (const [count, coordinates] of Object.entries(layouts)) {
      for (const [leftPercent, topPercent] of coordinates) {
        const centerX =
          stageRect.left + (stageRect.width * leftPercent) / 100;
        const centerY = stageRect.top + (stageRect.height * topPercent) / 100;
        const placement = resolveCoffeeReplayActionPopoverPlacement({
          anchorRect: {
            left: centerX - scenario.anchorSize / 2,
            right: centerX + scenario.anchorSize / 2,
            top: centerY - scenario.anchorSize / 2,
            bottom: centerY + scenario.anchorSize / 2,
            width: scenario.anchorSize,
            height: scenario.anchorSize,
          },
          stageRect,
          panelSize: { width: 280, height: 320 },
          viewport: scenario.viewport,
        });
        const renderedWidth = Math.min(280, placement.maxWidth);
        const renderedHeight = Math.min(320, placement.maxHeight);
        assert.ok(
          placement.left >= Math.max(10, stageRect.left + 10),
          `${count}-seat panel crossed the left bound`,
        );
        assert.ok(
          placement.top >= Math.max(10, stageRect.top + 10),
          `${count}-seat panel crossed the top bound`,
        );
        assert.ok(
          placement.left + renderedWidth <=
            Math.min(scenario.viewport.width - 10, stageRect.right - 10),
          `${count}-seat panel crossed the right bound`,
        );
        assert.ok(
          placement.top + renderedHeight <=
            Math.min(scenario.viewport.height - 10, stageRect.bottom - 10),
          `${count}-seat panel crossed the bottom bound`,
        );
      }
    }
  }
});

test("wires one moving dialog to the selected replay seat", () => {
  assert.match(pageSource, /data-bot-id=\{bot\.id\}/);
  assert.match(pageSource, /aria-haspopup=\{replayActionReviewEnabled \? "dialog"/);
  assert.match(pageSource, /aria-expanded=\{[\s\S]*?replayActionPopoverSelected/);
  assert.match(pageSource, /aria-controls=\{[\s\S]*?replayActionPopoverId/);
  assert.match(pageSource, /ref=\{coffeeReplayActionPanelRef\}/);
  assert.match(pageSource, /role="dialog"/);
  assert.match(pageSource, /data-placement=\{[\s\S]*?coffeeReplayActionPanelPlacement\?\.side/);
  assert.match(pageSource, /--coffee-replay-action-pointer-offset/);
  assert.doesNotMatch(
    pageSource,
    /coffeeReplayActionPanelBotId[\s\S]{0,120}\.map\(/,
    "the UI should reuse one panel instead of stacking one per selection",
  );
});

test("remeasures on replay, resize, scroll, and panel content changes", () => {
  assert.match(pageSource, /resolveCoffeeReplayActionPopoverPlacement\(\{/);
  assert.match(pageSource, /coffeeReplayMessageIndex/);
  assert.match(pageSource, /new ResizeObserver\(scheduleMeasure\)/);
  assert.match(pageSource, /addEventListener\("resize", scheduleMeasure\)/);
  assert.match(
    pageSource,
    /addEventListener\("scroll", scheduleMeasure, true\)/,
  );
});

test("supports focus, Escape, outside dismissal, and a visible seat association", () => {
  assert.match(pageSource, /event\.detail === 0/);
  assert.match(
    pageSource,
    /coffeeReplayActionPanelCloseButtonRef\.current\?\.focus\(\)/,
  );
  assert.match(pageSource, /if \(event\.key !== "Escape"\) return/);
  assert.match(pageSource, /dismissCoffeeReplayActionPanel\(\)/);
  assert.match(
    pageSource,
    /document\.addEventListener\("pointerdown", handlePointerDown, true\)/,
  );
  assert.match(
    cssSource,
    /\.coffeeReplayActionPanel\[data-placement="above"\]::after[\s\S]*?\.coffeeReplayActionPanel\[data-placement="right"\]::after/,
  );
  assert.match(
    cssSource,
    /\.coffeeSeat\[data-actions-popover-anchor="true"\] \.coffeeSeatGlowPill/,
  );
});
