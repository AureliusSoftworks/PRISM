import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ZEN_HUE_DIRECTORY_MIN_ROWS,
  clampZenHueDirectoryState,
  wrapZenHue,
  zenHueAtmosphereColors,
  zenHueAtmosphereNodeCount,
  zenHueDirectoryColumns,
  zenHueDirectoryLayout,
  zenHueTierForVerticalDrag,
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

  it("derives capacities from the fixed frame down to the two-row close-up", () => {
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
    assert.deepEqual(layout.tiers, [ZEN_HUE_DIRECTORY_MIN_ROWS, 3, 4, 5]);
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
      ZEN_HUE_DIRECTORY_MIN_ROWS,
    );
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
