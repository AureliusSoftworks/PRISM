import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampAdjustmentPadPoint,
  createAdjustmentPadCoordinateAdapter,
} from "./adjustmentPadModel.ts";

describe("AdjustmentPad semantic adapter", () => {
  const adapter = createAdjustmentPadCoordinateAdapter({
    x: { min: -1, max: 1, step: 0.1, inverted: true },
    y: { min: -2, max: 2, step: 0.5 },
    valueText: (value) => `x ${value.x}, y ${value.y}`,
  });

  it("maps semantic values into normalized visual coordinates", () => {
    assert.deepEqual(adapter.toPoint({ x: 0.5, y: -1 }), {
      x: 0.25,
      y: 0.25,
    });
    assert.deepEqual(adapter.fromPoint({ x: 0.75, y: 0.75 }, { x: 0, y: 0 }), {
      x: -0.5,
      y: 1,
    });
  });

  it("nudges in visual directions while honoring inverted semantics", () => {
    assert.deepEqual(adapter.nudge({ x: 0, y: 0 }, "left", 1), {
      x: 0.1,
      y: 0,
    });
    assert.deepEqual(adapter.nudge({ x: 0, y: 0 }, "up", 1), {
      x: 0,
      y: -0.5,
    });
  });

  it("clamps the visual surface and supplies semantic value text", () => {
    assert.deepEqual(clampAdjustmentPadPoint({ x: 1.8, y: -0.4 }), {
      x: 1,
      y: 0,
    });
    assert.equal(adapter.valueText({ x: 0.2, y: -0.5 }), "x 0.2, y -0.5");
  });
});
