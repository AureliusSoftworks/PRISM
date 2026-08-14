import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  currentPrismFrameRate,
  normalizePrismFrameRate,
  publishPrismFrameRate,
  resetPrismFrameRateForTests,
  subscribePrismFrameRate,
} from "./prismFrameRate.ts";

describe("PRISM frame-rate snapshots", () => {
  it("keeps one rounded, bounded live snapshot", () => {
    resetPrismFrameRateForTests();
    assert.equal(normalizePrismFrameRate(59.6), 60);
    assert.equal(normalizePrismFrameRate(Number.NaN), null);
    assert.equal(normalizePrismFrameRate(0), null);
    assert.equal(normalizePrismFrameRate(999), 240);
    publishPrismFrameRate(58.7, "2026-08-14T19:00:00.000Z");
    assert.deepEqual(currentPrismFrameRate(), {
      fps: 59,
      sampledAt: "2026-08-14T19:00:00.000Z",
    });
  });

  it("notifies FPS consumers without requiring another animation loop", () => {
    resetPrismFrameRateForTests();
    const observed: Array<number | null> = [];
    const unsubscribe = subscribePrismFrameRate((snapshot) =>
      observed.push(snapshot?.fps ?? null),
    );
    publishPrismFrameRate(60);
    unsubscribe();
    publishPrismFrameRate(30);
    assert.deepEqual(observed, [null, 60]);
  });
});
