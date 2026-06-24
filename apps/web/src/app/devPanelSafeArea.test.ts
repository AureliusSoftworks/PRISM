import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampDevPanelPositionToSafeArea,
  clampDevPanelRectToSafeArea,
  resolveDevPanelSafeAreaInsets,
  type DevPanelSafeAreaBlocker,
} from "./devPanelSafeArea.ts";

describe("dev panel safe-area layout", () => {
  it("keeps panels below top chrome", () => {
    const insets = resolveDevPanelSafeAreaInsets({
      viewportWidth: 1000,
      viewportHeight: 700,
      blockers: [
        {
          sides: ["top"],
          rect: { left: 0, top: 0, right: 1000, bottom: 72 },
        },
      ],
    });

    const position = clampDevPanelPositionToSafeArea({
      x: 20,
      y: 0,
      panelWidth: 300,
      panelHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 700,
      margin: 12,
      safeAreaInsets: insets,
    });

    assert.equal(position.y, 84);
  });

  it("keeps panels to the right of left chrome", () => {
    const insets = resolveDevPanelSafeAreaInsets({
      viewportWidth: 1000,
      viewportHeight: 700,
      blockers: [
        {
          sides: ["left"],
          rect: { left: 0, top: 0, right: 248, bottom: 700 },
        },
      ],
    });

    const position = clampDevPanelPositionToSafeArea({
      x: 0,
      y: 90,
      panelWidth: 280,
      panelHeight: 180,
      viewportWidth: 1000,
      viewportHeight: 700,
      margin: 14,
      safeAreaInsets: insets,
    });

    assert.equal(position.x, 262);
  });

  it("keeps panels above bottom chrome", () => {
    const insets = resolveDevPanelSafeAreaInsets({
      viewportWidth: 800,
      viewportHeight: 600,
      blockers: [
        {
          sides: ["bottom"],
          rect: { left: 0, top: 480, right: 800, bottom: 600 },
        },
      ],
    });

    const position = clampDevPanelPositionToSafeArea({
      x: 24,
      y: 580,
      panelWidth: 200,
      panelHeight: 100,
      viewportWidth: 800,
      viewportHeight: 600,
      margin: 12,
      safeAreaInsets: insets,
    });

    assert.equal(position.y, 368);
  });

  it("keeps oversized panels reachable while prioritizing the top safe edge", () => {
    const blockers: DevPanelSafeAreaBlocker[] = [
      { sides: ["top"], rect: { left: 0, top: 0, right: 500, bottom: 100 } },
      { sides: ["bottom"], rect: { left: 0, top: 220, right: 500, bottom: 400 } },
    ];
    const insets = resolveDevPanelSafeAreaInsets({
      viewportWidth: 500,
      viewportHeight: 400,
      blockers,
    });

    const position = clampDevPanelPositionToSafeArea({
      x: 40,
      y: 390,
      panelWidth: 260,
      panelHeight: 200,
      viewportWidth: 500,
      viewportHeight: 400,
      margin: 12,
      safeAreaInsets: insets,
    });

    assert.equal(position.y, 200);
  });

  it("clamps stored panel rect size and position together", () => {
    const insets = resolveDevPanelSafeAreaInsets({
      viewportWidth: 1000,
      viewportHeight: 700,
      blockers: [
        { sides: ["top"], rect: { left: 0, top: 0, right: 1000, bottom: 72 } },
        { sides: ["bottom"], rect: { left: 0, top: 576, right: 1000, bottom: 700 } },
      ],
    });

    const rect = clampDevPanelRectToSafeArea({
      rect: { x: 0, y: 0, width: 800, height: 600 },
      viewportWidth: 1000,
      viewportHeight: 700,
      margin: 12,
      minWidth: 240,
      minHeight: 180,
      maxWidth: 420,
      maxHeight: 900,
      safeAreaInsets: insets,
    });

    assert.deepEqual(rect, {
      x: 12,
      y: 84,
      width: 420,
      height: 480,
    });
  });
});
