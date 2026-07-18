import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPrismSceneDiagnosticsSnapshot,
  publishPrismSceneDiagnostics,
  removePrismSceneDiagnostics,
  resetPrismSceneDiagnosticsForTests,
  subscribePrismSceneDiagnostics,
} from "./prismSceneDiagnostics.ts";

describe("PRISM rendering diagnostics store", () => {
  it("publishes metrics outside the main React page and removes scene state", () => {
    resetPrismSceneDiagnosticsForTests();
    let notifications = 0;
    const unsubscribe = subscribePrismSceneDiagnostics(() => {
      notifications += 1;
    });
    publishPrismSceneDiagnostics("coffee", {
      rendererStatus: "webgl",
      lifecycle: "ambient",
      quality: "full",
      targetFps: 30,
      observedFps: 29.8,
      p50FrameIntervalMs: 33.2,
      p95FrameIntervalMs: 36.5,
      missedFramePercentage: 1.2,
      effectiveDpr: 1.5,
      objectCount: 32,
      particleCount: 28,
      contextLossCount: 0,
      tickCount: 240,
      updatedAtMs: 10,
    });
    assert.equal(getPrismSceneDiagnosticsSnapshot().sceneId, "coffee");
    assert.equal(getPrismSceneDiagnosticsSnapshot().quality, "full");
    assert.equal(notifications, 1);

    removePrismSceneDiagnostics("coffee");
    assert.equal(getPrismSceneDiagnosticsSnapshot().sceneId, null);
    assert.equal(notifications, 2);
    unsubscribe();
  });
});
