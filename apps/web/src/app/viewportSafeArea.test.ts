import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPositionToViewportSafeArea,
  resolveViewportSafeAreaInsets,
} from "./viewportSafeArea.ts";

describe("viewport safe-area layout", () => {
  it("keeps content below visible top chrome", () => {
    const insets = resolveViewportSafeAreaInsets({
      viewportWidth: 1000,
      viewportHeight: 700,
      blockers: [
        {
          sides: ["top"],
          rect: { left: 0, top: 0, right: 1000, bottom: 72 },
        },
      ],
    });

    assert.deepEqual(
      clampPositionToViewportSafeArea({
        x: 20,
        y: 0,
        width: 300,
        height: 200,
        viewportWidth: 1000,
        viewportHeight: 700,
        margin: 12,
        safeAreaInsets: insets,
      }),
      { x: 20, y: 84 },
    );
  });

  it("keeps content above visible bottom chrome", () => {
    const insets = resolveViewportSafeAreaInsets({
      viewportWidth: 800,
      viewportHeight: 600,
      blockers: [
        {
          sides: ["bottom"],
          rect: { left: 0, top: 480, right: 800, bottom: 600 },
        },
      ],
    });

    assert.equal(
      clampPositionToViewportSafeArea({
        x: 24,
        y: 580,
        width: 200,
        height: 100,
        viewportWidth: 800,
        viewportHeight: 600,
        margin: 12,
        safeAreaInsets: insets,
      }).y,
      368,
    );
  });
});
