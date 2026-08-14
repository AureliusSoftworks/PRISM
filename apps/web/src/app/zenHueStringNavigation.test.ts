import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ZEN_HUE_DIRECTORY_MIN_ROWS,
  clampZenHueDirectoryState,
  zenHueCableTraversalFrame,
  zenHueCableTraversalStep,
  type ZenHueCableDragDirection,
  stepZenHueCableSpring,
  wrapZenHue,
  zenHueAtmosphereColors,
  zenHueAtmosphereNodeCount,
  zenHueDirectoryColumns,
  zenHueDirectoryLayout,
  zenHueTierForNormalizedPosition,
  zenHueTierForVerticalDrag,
  zenHueCableSpringHasSettled,
} from "./zenHueStringNavigation.ts";

describe("Zen hue string directory math", () => {
  it("caps the contextual atmosphere at five nodes regardless of root size", () => {
    assert.equal(zenHueAtmosphereNodeCount(2), 2);
    assert.equal(zenHueAtmosphereNodeCount(4), 4);
    assert.equal(zenHueAtmosphereNodeCount(5), 5);
    assert.equal(zenHueAtmosphereNodeCount(25), 5);
    assert.equal(zenHueAtmosphereNodeCount("root"), 5);
    assert.deepEqual(
      zenHueAtmosphereColors({
        tier: 2,
        visibleColors: ["red", "orange", "yellow", "green"],
        rootColors: ["p", "r", "i", "s", "m"],
      }),
      ["red", "green"],
    );
    assert.deepEqual(
      zenHueAtmosphereColors({
        tier: "root",
        visibleColors: ["cyan"],
        rootColors: ["p", "r", "i", "s", "m", "extra"],
      }),
      ["p", "r", "i", "s", "m"],
    );
  });

  it("derives capacities from the fixed frame down to the one-row close-up", () => {
    assert.equal(zenHueDirectoryColumns(3, 1200, 300, 12), 12);
    const layout = zenHueDirectoryLayout({
      totalBots: 122,
      filterableBots: 120,
      frameWidth: 1200,
      frameHeight: 300,
      rootRows: 6,
      rootCols: 21,
      minimumColumns: 12,
    });
    assert.deepEqual(layout.tiers, [ZEN_HUE_DIRECTORY_MIN_ROWS, 2, 3, 4, 5]);
  });

  it("keeps root outside the integer directory ladder and clamps stale tiers", () => {
    const layout = {
      rootRows: 6,
      rootCols: 21,
      tiers: [2, 3, 4, 5] as const,
    };
    assert.deepEqual(
      clampZenHueDirectoryState({ hueAnchor: 721, tier: 99 }, layout),
      { hueAnchor: 1, tier: 5 },
    );
    assert.deepEqual(
      clampZenHueDirectoryState({ hueAnchor: null, tier: 3 }, layout),
      { hueAnchor: null, tier: "root" },
    );
    assert.deepEqual(
      clampZenHueDirectoryState(
        { hueAnchor: 180, tier: 3 },
        { rootRows: 3, rootCols: 12, tiers: [] },
      ),
      { hueAnchor: null, tier: "root" },
    );
  });

  it("uses wide low-tier detents, hysteresis, and bounded root traversal", () => {
    const tiers = [2, 3, 4, 5, 6, 7] as const;
    assert.equal(
      zenHueTierForVerticalDrag({
        startTier: 3,
        previousTier: 3,
        tiers,
        deltaY: 4,
      }),
      3,
    );
    const broad = zenHueTierForVerticalDrag({
      startTier: 3,
      previousTier: 3,
      tiers,
      deltaY: 240,
    });
    assert.equal(broad, "root");
    assert.equal(
      zenHueTierForVerticalDrag({
        startTier: "root",
        previousTier: "root",
        tiers,
        deltaY: -300,
      }),
      2,
    );
  });

  it("lets one full yank cross every available depth regardless of library size", () => {
    const tiers = Array.from({ length: 62 }, (_, index) => index + 2);
    assert.equal(
      zenHueTierForVerticalDrag({
        startTier: "root",
        previousTier: "root",
        tiers,
        deltaY: -10_000,
        travelPx: 220,
        deadZonePx: 18,
        hysteresisPx: 14,
      }),
      2,
    );
    assert.equal(
      zenHueTierForVerticalDrag({
        startTier: 2,
        previousTier: 2,
        tiers,
        deltaY: 10_000,
        travelPx: 220,
        deadZonePx: 18,
        hysteresisPx: 14,
      }),
      "root",
    );
  });

  it("ignores small opposite-motion nudges until crossing the opposite threshold", () => {
    const tiers = [2, 3, 4, 5] as const;
    const dragDirection: {
      direction: ZenHueCableDragDirection;
    } = { direction: 0 };

    const first = zenHueCableTraversalStep({
      deltaY: -120,
      deadZonePx: 24,
      currentDirection: dragDirection.direction,
      directionLatchPx: 48,
    });
    dragDirection.direction = first.direction;
    assert.equal(first.direction, -1);
    assert.ok(first.deltaY < 0);
    const blocked = zenHueCableTraversalStep({
      deltaY: 40,
      deadZonePx: 24,
      currentDirection: dragDirection.direction,
      directionLatchPx: 48,
    });
    dragDirection.direction = blocked.direction;
    assert.equal(blocked.direction, -1);
    assert.equal(blocked.deltaY, 0);
    const reversed = zenHueCableTraversalStep({
      deltaY: -60,
      deadZonePx: 24,
      currentDirection: dragDirection.direction,
      directionLatchPx: 48,
    });
    dragDirection.direction = reversed.direction;
    assert.equal(reversed.direction, -1);
    assert.ok(reversed.deltaY < 0);
    const released = zenHueCableTraversalStep({
      deltaY: 100,
      deadZonePx: 24,
      currentDirection: dragDirection.direction,
      directionLatchPx: 48,
    });
    assert.equal(released.direction, 1);
    assert.ok(released.deltaY > 0);

    const nextTier = zenHueTierForVerticalDrag({
      startTier: 4,
      previousTier: 4,
      tiers,
      deltaY: released.deltaY * 8,
      travelPx: 220,
      deadZonePx: 24,
      hysteresisPx: 14,
    });
    assert.equal(nextTier, "root");
  });

  it("boosts travel speed with stronger vertical pull", () => {
    const mild = zenHueCableTraversalStep({
      deltaY: 24 + 20,
      deadZonePx: 24,
      currentDirection: 1,
      directionLatchPx: 48,
    });
    const strong = zenHueCableTraversalStep({
      deltaY: 24 + 140,
      deadZonePx: 24,
      currentDirection: 1,
      directionLatchPx: 48,
      pullScalePx: 170,
      pullBoost: 1.85,
    });
    assert.ok(Math.abs(strong.deltaY) > Math.abs(mild.deltaY));
    assert.ok(strong.normalizedPull > mild.normalizedPull);
    assert.equal(strong.pullBoost > 1, true);
    const mildFrame = zenHueCableTraversalFrame({
      normalizedPosition: 0.5,
      deltaY: 54,
      deadZonePx: 34,
      currentDirection: 1,
      directionLatchPx: 48,
      elapsedSeconds: 1 / 60,
      tierCount: 500,
    });
    const strongFrame = zenHueCableTraversalFrame({
      normalizedPosition: 0.5,
      deltaY: 240,
      deadZonePx: 34,
      currentDirection: 1,
      directionLatchPx: 48,
      elapsedSeconds: 1 / 60,
      tierCount: 500,
    });
    assert.ok(Math.abs(strongFrame.tierSpeed) > Math.abs(mildFrame.tierSpeed));
    const edgeFrame = zenHueCableTraversalFrame({
      normalizedPosition: 0.5,
      deltaY: 35,
      deadZonePx: 34,
      currentDirection: 1,
      directionLatchPx: 48,
      elapsedSeconds: 1 / 60,
      tierCount: 500,
    });
    assert.ok(Math.abs(edgeFrame.tierSpeed) < Math.abs(mildFrame.tierSpeed));
    assert.ok(
      Math.abs(edgeFrame.normalizedPosition - 0.5) <
        Math.abs(mildFrame.normalizedPosition - 0.5),
    );
    const deeperLadder = zenHueCableTraversalFrame({
      normalizedPosition: 1,
      deltaY: 240,
      deadZonePx: 34,
      currentDirection: 1,
      directionLatchPx: 48,
      elapsedSeconds: 1 / 60,
      tierCount: 5_000,
    });
    assert.ok(Math.abs(deeperLadder.tierSpeed) > Math.abs(strongFrame.tierSpeed));
  });

  it("integrates a stationary held pull over time", () => {
    const first = zenHueCableTraversalFrame({
      normalizedPosition: 1,
      deltaY: -160,
      deadZonePx: 34,
      currentDirection: 0,
      directionLatchPx: 48,
      elapsedSeconds: 1 / 60,
      tierCount: 20,
    });
    const held = zenHueCableTraversalFrame({
      normalizedPosition: first.normalizedPosition,
      deltaY: -160,
      deadZonePx: 34,
      currentDirection: first.direction,
      directionLatchPx: 48,
      elapsedSeconds: 1 / 60,
      tierCount: 20,
    });
    assert.ok(held.normalizedPosition < first.normalizedPosition);
    assert.equal(zenHueTierForNormalizedPosition(held.normalizedPosition, [1, 2, 3]), "root");
  });

  it("keeps full-pull root-to-deepest duration nearly equal across directory sizes", () => {
    const durationToDeepest = (tierCount: number): number => {
      let position = 1;
      let direction: ZenHueCableDragDirection = 0;
      let elapsed = 0;
      while (position > 0 && elapsed < 4) {
        const frame = zenHueCableTraversalFrame({
          normalizedPosition: position,
          deltaY: -1_000,
          deadZonePx: 34,
          currentDirection: direction,
          directionLatchPx: 48,
          elapsedSeconds: 1 / 120,
          tierCount,
        });
        position = frame.normalizedPosition;
        direction = frame.direction;
        elapsed += 1 / 120;
      }
      return elapsed;
    };
    const hundredBots = durationToDeepest(10);
    const hundredThousandBots = durationToDeepest(10_000);
    assert.ok(Math.abs(hundredBots - hundredThousandBots) <= 1 / 120);
  });

  it("keeps one-row layouts and stale tiers clamped", () => {
    const layout = zenHueDirectoryLayout({
      totalBots: 100_000,
      filterableBots: 100_000,
      frameWidth: 1200,
      frameHeight: 300,
      rootRows: 8,
      rootCols: 32,
      minimumColumns: 1,
    });
    assert.equal(layout.tiers[0], 1);
    assert.deepEqual(
      clampZenHueDirectoryState({ hueAnchor: 180, tier: -20 }, layout),
      { hueAnchor: 180, tier: 1 },
    );
  });

  it("snaps a taut cable home without mutating traversal state", () => {
    let spring = { displacement: 48, velocity: 0 };
    let frames = 0;
    for (let frame = 0; frame < 90 && !zenHueCableSpringHasSettled(spring); frame += 1) {
      spring = stepZenHueCableSpring(spring, 1 / 60);
      frames = frame + 1;
    }
    assert.ok(zenHueCableSpringHasSettled(spring));
    assert.ok(frames <= 60);
  });

  it("wraps hue in either direction", () => {
    assert.equal(wrapZenHue(361), 1);
    assert.equal(wrapZenHue(-1), 359);
  });

  it("keeps 36, 122, and 1,000 bot layouts bounded by the same frame", () => {
    const cases = [
      { totalBots: 36, rootRows: 3, rootCols: 12 },
      { totalBots: 122, rootRows: 6, rootCols: 21 },
      { totalBots: 1_000, rootRows: 16, rootCols: 63 },
    ];
    const startedAt = performance.now();
    for (const sample of cases) {
      const layout = zenHueDirectoryLayout({
        ...sample,
        filterableBots: sample.totalBots,
        frameWidth: 1200,
        frameHeight: 300,
        minimumColumns: 12,
      });
      assert.equal(layout.rootRows, sample.rootRows);
      assert.ok(
        layout.tiers.every(
          (rows) => rows >= ZEN_HUE_DIRECTORY_MIN_ROWS && rows < sample.rootRows,
        ),
      );
    }
    assert.ok(performance.now() - startedAt < 20);
  });
});
