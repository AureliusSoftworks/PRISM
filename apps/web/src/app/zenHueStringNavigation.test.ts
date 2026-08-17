import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ZEN_HUE_DIRECTORY_MIN_ROWS,
  ZEN_HUE_DIRECTORY_ONE_ROW_COLUMNS,
  clampZenHueDirectoryState,
  stepZenHueCableHorizontalInertia,
  zenHueCableAcceleratedSliderStep,
  zenHueCableHandleClientPoint,
  zenHueCableBoundaryWhiteoutProgress,
  zenHueCableFrameElapsedSeconds,
  zenHueCableHorizontalInertiaHasSettled,
  zenHueCableTraversalFrame,
  zenHueCableTraversalStep,
  type ZenHueCableDragDirection,
  stepZenHueCableSpring,
  wrapZenHue,
  zenHueAtmospherePalette,
  zenHueAtmosphereNodeCount,
  zenHueDirectoryColumns,
  zenHueDirectoryLayout,
  zenHueGradientOverlayOpacity,
  zenHueTierForNormalizedPosition,
  zenHueTierForVerticalDrag,
  zenHueCableSpringHasSettled,
} from "./zenHueStringNavigation.ts";

describe("Zen hue string directory math", () => {
  it("maps the rendered SVG handle through xMidYMid meet letterboxing", () => {
    assert.deepEqual(
      zenHueCableHandleClientPoint({
        svgX: 500,
        svgY: 60,
        viewBoxWidth: 1_000,
        viewBoxHeight: 120,
        clientLeft: 100,
        clientTop: 200,
        clientWidth: 760,
        clientHeight: 78,
      }),
      { x: 480, y: 239 },
    );
  });

  it("accelerates horizontal cable travel and clamps it to the spectrum", () => {
    const gained = zenHueCableAcceleratedSliderStep({
      sliderValue: 180,
      deltaClientX: 100,
      surfaceWidth: 1_000,
    });
    assert.ok(gained > 180 + 35.9);
    assert.equal(
      zenHueCableAcceleratedSliderStep({
        sliderValue: 350,
        deltaClientX: 100,
        surfaceWidth: 1_000,
      }),
      359,
    );
  });

  it("carries horizontal hue momentum, loses energy, and settles", () => {
    let state = { sliderValue: 180, velocity: 240 };
    const first = stepZenHueCableHorizontalInertia(state, 1 / 60);
    assert.ok(first.sliderValue > state.sliderValue);
    assert.ok(first.velocity > 0 && first.velocity < state.velocity);
    state = first;
    for (let frame = 0; frame < 120; frame += 1) {
      state = stepZenHueCableHorizontalInertia(state, 1 / 60);
    }
    assert.equal(zenHueCableHorizontalInertiaHasSettled(state), true);

    const boundary = stepZenHueCableHorizontalInertia(
      { sliderValue: 358, velocity: 420 },
      0.032,
    );
    assert.deepEqual(boundary, { sliderValue: 359, velocity: 0 });
  });

  it("whitens only blocked overpull at the root and deepest boundaries", () => {
    const tiers = [1, 2, 3, 4, 5];
    const progress = (tier: "root" | number, deltaY: number) =>
      zenHueCableBoundaryWhiteoutProgress({
        tier,
        tiers,
        deltaY,
        deadZonePx: 34,
        fullWhitePullPx: 48,
      });

    assert.equal(progress("root", 34), 0);
    assert.equal(progress("root", 41), 0.5);
    assert.equal(progress("root", 48), 1);
    assert.equal(progress(1, -34), 0);
    assert.equal(progress(1, -41), 0.5);
    assert.equal(progress(1, -48), 1);
    assert.equal(progress(1, 48), 0);
    assert.equal(progress("root", -48), 0);
    assert.equal(progress(3, -48), 0);
    assert.equal(progress(3, 48), 0);
  });

  it("preserves a normal animation-frame duration while capping stalls", () => {
    assert.equal(zenHueCableFrameElapsedSeconds(1016, 1000), 0.016);
    assert.equal(zenHueCableFrameElapsedSeconds(1200, 1000), 0.05);
    assert.equal(zenHueCableFrameElapsedSeconds(900, 1000), 0);
  });

  it("crosses a breadth tier while held on ordinary rAF timestamps", () => {
    const tiers = [1, 2, 3, 4, 5];
    let previousMs = 1_000;
    let position = 0;
    let direction: ZenHueCableDragDirection = 0;
    for (let frameIndex = 1; frameIndex <= 20; frameIndex += 1) {
      const nowMs = 1_000 + frameIndex * 16;
      const frame = zenHueCableTraversalFrame({
        normalizedPosition: position,
        deltaY: 220,
        deadZonePx: 34,
        currentDirection: direction,
        directionLatchPx: 48,
        elapsedSeconds: zenHueCableFrameElapsedSeconds(nowMs, previousMs),
        tierCount: tiers.length,
      });
      position = frame.normalizedPosition;
      direction = frame.direction;
      previousMs = nowMs;
    }
    assert.notEqual(zenHueTierForNormalizedPosition(position, tiers), tiers[0]);
  });

  it("caps the contextual atmosphere at five nodes regardless of root size", () => {
    assert.equal(zenHueAtmosphereNodeCount(2), 2);
    assert.equal(zenHueAtmosphereNodeCount(4), 4);
    assert.equal(zenHueAtmosphereNodeCount(5), 5);
    assert.equal(zenHueAtmosphereNodeCount(25), 5);
    assert.equal(zenHueAtmosphereNodeCount("root"), 5);
    const palette = zenHueAtmospherePalette({
      tier: 2,
      visibleColors: ["#ff0000", "#ff8800", "#ffff00", "#00ff00"],
    });
    assert.equal(palette.representativeColors.length, 4);
    const narrowPalette = zenHueAtmospherePalette({
      tier: 1,
      visibleColors: ["#ff0000", "#ff8800", "#ffff00", "#00ff00"],
    });
    assert.equal(narrowPalette.representativeColors.length, 4);
    assert.deepEqual(narrowPalette.representativeColors, palette.representativeColors);
    assert.ok(palette.representativeColors.every((color) => color.startsWith("#")));
  });

  it("keeps atmosphere palette composition stable across directory tiers", () => {
    const visibleColors = [
      "#ff0000",
      "#ff8800",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#ff00ff",
    ];
    const rootPalette = zenHueAtmospherePalette({
      tier: "root",
      visibleColors,
    });
    const traversalTiers = [1, 2, 3, 4, 5] as const;
    for (const tier of traversalTiers) {
      assert.deepEqual(
        zenHueAtmospherePalette({
          tier,
          visibleColors,
        }),
        rootPalette,
      );
    }
  });

  it("fades the broad gradient monotonically from root to the one-row hue room", () => {
    const tiers = [1, 2, 3, 4, 5] as const;
    assert.equal(zenHueGradientOverlayOpacity("root", tiers), 1);
    assert.equal(zenHueGradientOverlayOpacity(5, tiers), 0.8);
    assert.equal(zenHueGradientOverlayOpacity(3, tiers), 0.4);
    assert.equal(zenHueGradientOverlayOpacity(1, tiers), 0);
    assert.equal(zenHueGradientOverlayOpacity("root", []), 1);
  });

  it("keeps a full spectrum colorful and boosts a clustered atmosphere", () => {
    const fullSpectrum = zenHueAtmospherePalette({
      tier: "root",
      visibleColors: [
        "#ff0000",
        "#ffff00",
        "#00ff00",
        "#00ffff",
        "#0000ff",
        "#ff00ff",
      ],
    });
    const clustered = zenHueAtmospherePalette({
      tier: "root",
      visibleColors: ["#ff2438", "#ff3b30", "#f04455", "#ff5263"],
    });

    assert.ok(fullSpectrum.coherence < 0.05);
    assert.ok(fullSpectrum.saturation <= 1.03);
    assert.ok(clustered.coherence > 0.95);
    assert.ok(clustered.coherence > fullSpectrum.coherence + 0.8);
    assert.ok(clustered.saturation > 1.42);
    assert.ok(clustered.saturation > fullSpectrum.saturation + 0.4);
  });

  it("derives capacities from the fixed frame down to the one-row close-up", () => {
    assert.equal(
      zenHueDirectoryColumns(1, 1200, 300, 12),
      ZEN_HUE_DIRECTORY_ONE_ROW_COLUMNS,
    );
    assert.equal(zenHueDirectoryColumns(2, 1200, 300, 12), 12);
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

  it("retains the shorter one-row tier when eleven bots are filterable", () => {
    const layout = zenHueDirectoryLayout({
      totalBots: 11,
      filterableBots: 11,
      frameWidth: 1200,
      frameHeight: 300,
      rootRows: 2,
      rootCols: 6,
      minimumColumns: 12,
    });

    assert.deepEqual(layout.tiers, [ZEN_HUE_DIRECTORY_MIN_ROWS]);
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
