import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HOME_BASE_RADIAL_HOLD_MS,
  HOME_BASE_RADIAL_TARGET_RADIUS_PX,
  homeBaseRadialRayGeometry,
  homeBaseRadialTargetAtPoint,
  homeBaseRadialTargetLayout,
  resolveHomeBaseRadialTargetRadius,
  nextHomeBaseRadialTargetIndex,
  transitionHomeBaseRadialGesture,
  type HomeBaseRadialGestureState,
} from "./homeBaseRadialLauncher.ts";

describe("Home Base radial launcher", () => {
  it("uses an intentional hold and preserves a short source click", () => {
    assert.ok(HOME_BASE_RADIAL_HOLD_MS >= 350);
    const pressed = transitionHomeBaseRadialGesture(
      { phase: "idle" },
      { type: "press", pointerId: 7 },
    );
    assert.deepEqual(pressed.state, { phase: "pressing", pointerId: 7 });
    const released = transitionHomeBaseRadialGesture(pressed.state, {
      type: "release",
      targetId: null,
      sourceInside: true,
    });
    assert.deepEqual(released, {
      state: { phase: "idle" },
      effect: "activate-source",
    });
  });

  it("selects a held target exactly once and cancels every invalid release", () => {
    const pressed = transitionHomeBaseRadialGesture<string>(
      { phase: "idle" },
      { type: "press", pointerId: 3 },
    ).state;
    const open = transitionHomeBaseRadialGesture(pressed, {
      type: "hold",
      pointerId: 3,
    }).state;
    assert.deepEqual(open, {
      phase: "open",
      pointerId: 3,
      highlightedId: null,
    });
    const aimed = transitionHomeBaseRadialGesture(open, {
      type: "aim",
      targetId: "coffee",
    }).state;
    const selected = transitionHomeBaseRadialGesture(aimed, {
      type: "release",
      targetId: "coffee",
      sourceInside: false,
    });
    assert.equal(selected.effect, "select-target");
    assert.deepEqual(selected.state, {
      phase: "igniting",
      selectedId: "coffee",
    });
    assert.equal(
      transitionHomeBaseRadialGesture(selected.state, {
        type: "release",
        targetId: "coffee",
        sourceInside: false,
      }).effect,
      null,
    );
    for (const event of [
      { type: "release", targetId: null, sourceInside: false } as const,
      { type: "cancel" } as const,
    ]) {
      assert.deepEqual(transitionHomeBaseRadialGesture(open, event).state, {
        phase: "idle",
      });
    }
  });

  it("maps a lower half layout with larger, safe launcher span", () => {
    const ids = ["coffee", "debate", "signal", "slate"] as const;
    const layout = homeBaseRadialTargetLayout(
      ids,
      { x: 500, y: 400 },
      { width: 1_000, height: 800 },
    );
    assert.deepEqual(layout.map(({ id }) => id), ids);
    assert.equal(layout.length, ids.length);
    const xValues = layout.map((target) => target.x);
    const yValues = layout.map((target) => target.y);
    assert.ok(yValues.every((y) => y >= 400 - 0.0001));
    assert.ok(yValues.some((y) => y > 400));
    assert.ok(xValues.some((x) => x < 500));
    assert.ok(xValues.some((x) => x > 500));
    assert.ok(Math.max(...xValues) - Math.min(...xValues) > 520);
    assert.ok(Math.max(...yValues) - Math.min(...yValues) > 180);
    assert.ok(new Set(layout.map(({ angle }) => angle.toFixed(4))).size === ids.length);
    assert.ok(layout.every(({ angle }) => angle >= 0 && angle <= Math.PI));
    assert.equal(
      homeBaseRadialTargetAtPoint(layout, {
        x: layout[2]!.x,
        y: layout[2]!.y,
      }),
      "signal",
    );
    assert.equal(homeBaseRadialTargetAtPoint(layout, { x: 1, y: 1 }), null);
  });

  it("reduces target radius on constrained viewports while staying usable", () => {
    const clampedRadius = resolveHomeBaseRadialTargetRadius(640, 320, {
      x: 320,
      y: 240,
    });
    assert.ok(clampedRadius > 0);
    assert.ok(clampedRadius < HOME_BASE_RADIAL_TARGET_RADIUS_PX);
    assert.equal(
      homeBaseRadialTargetAtPoint(
        [{ id: "coffee", angle: 0, x: 320, y: 240 }],
        { x: 320, y: 240 },
        clampedRadius,
      ),
      "coffee",
    );
  });

  it("adds stacked rows when one lower arc cannot hold all targets", () => {
    const ids = [
      "coffee",
      "debate",
      "signal",
      "slate",
      "chat",
      "zen",
      "story",
      "botcast",
      "music",
      "video",
      "feed",
      "games",
      "maps",
      "notes",
      "pulse",
      "echo",
    ] as const;
    const layout = homeBaseRadialTargetLayout(
      ids,
      { x: 600, y: 320 },
      { width: 1_320, height: 840 },
    );
    assert.equal(layout.length, ids.length);
    assert.ok(
      new Set(layout.map((target) => target.y.toFixed(0))).size >= 2,
      "Expected multi-row launch geometry for crowded layouts",
    );
    assert.ok(layout.every(({ angle }) => angle >= 0 && angle <= Math.PI));
    assert.ok(layout.some(({ y }) => y > 360));
    assert.ok(layout.some(({ x }) => x < 600));
    assert.ok(layout.length === ids.length);
  });

  it("tapers the aim ray more strongly over distance", () => {
    const short = homeBaseRadialRayGeometry(
      { x: 100, y: 100 },
      { x: 160, y: 100 },
    );
    const long = homeBaseRadialRayGeometry(
      { x: 100, y: 100 },
      { x: 360, y: 100 },
    );
    assert.ok(short.sourceWidth > short.targetWidth);
    assert.ok(short.targetWidth > long.targetWidth);
    assert.match(long.points, /^\d+\.\d{2},\d+\.\d{2}/u);
  });

  it("ends an aimed beam before the hollow target orb", () => {
    const trimmed = homeBaseRadialRayGeometry(
      { x: 100, y: 100 },
      { x: 360, y: 100 },
      HOME_BASE_RADIAL_TARGET_RADIUS_PX,
    );
    assert.equal(
      trimmed.endDistance,
      trimmed.distance - HOME_BASE_RADIAL_TARGET_RADIUS_PX,
    );
    assert.match(trimmed.points, /276\.00,/u);
    assert.doesNotMatch(trimmed.points, /360\.00,/u);
  });

  it("wraps keyboard focus and gives keyboard selection the same state path", () => {
    assert.equal(nextHomeBaseRadialTargetIndex(0, 4, -1), 3);
    assert.equal(nextHomeBaseRadialTargetIndex(3, 4, 1), 0);
    const open = transitionHomeBaseRadialGesture<string>(
      { phase: "idle" },
      { type: "open-keyboard", initialId: "coffee" },
    ).state as HomeBaseRadialGestureState<string>;
    const selected = transitionHomeBaseRadialGesture(open, {
      type: "select",
      targetId: "coffee",
    });
    assert.equal(selected.effect, "select-target");
    assert.equal(selected.state.phase, "igniting");
  });
});
