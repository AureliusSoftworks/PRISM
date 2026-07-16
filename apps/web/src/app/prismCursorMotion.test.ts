import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prismCursorMotionStep } from "./prismCursorMotion.ts";

describe("PRISM custom cursor settling", () => {
  it("eases toward the pointer until it reaches the snap distance", () => {
    const moving = prismCursorMotionStep(
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      0.34,
      0.2,
    );
    assert.equal(moving.settled, false);
    assert.ok(Math.abs(moving.x - 3.4) < Number.EPSILON * 4);
    assert.ok(Math.abs(moving.y - 6.8) < Number.EPSILON * 8);

    const settled = prismCursorMotionStep(
      { x: 9.9, y: 19.9 },
      { x: 10, y: 20 },
      0.34,
      0.2,
    );
    assert.deepEqual(settled, { x: 10, y: 20, settled: true });
  });
});
