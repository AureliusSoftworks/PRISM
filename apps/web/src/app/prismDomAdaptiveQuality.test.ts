import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_DOM_SAMPLE_WARMUP_MS,
  PRISM_DOM_SAMPLE_WINDOW_SIZE,
  PrismDomAdaptiveQualityController,
  prismDomFrameWindow,
} from "./prismDomAdaptiveQuality.ts";

function feedWindow(options: {
  controller: PrismDomAdaptiveQualityController;
  nowMs: number;
  intervalMs: number;
}): number {
  let nowMs = options.nowMs;
  for (let index = 0; index < PRISM_DOM_SAMPLE_WINDOW_SIZE; index += 1) {
    nowMs += options.intervalMs;
    options.controller.recordFrame({
      nowMs,
      deltaMs: options.intervalMs,
      foreground: true,
    });
  }
  return nowMs;
}

describe("adaptive DOM rendering quality", () => {
  it("recognizes sub-30 cadence and meaningful recovery headroom", () => {
    const slow = prismDomFrameWindow(Array(12).fill(1_000 / 24));
    assert.ok(slow.observedFps < 30);
    assert.equal(slow.belowFloor, true);
    assert.equal(slow.recoveryHeadroom, false);

    const fast = prismDomFrameWindow(Array(12).fill(1_000 / 60));
    assert.ok(fast.observedFps >= 50);
    assert.equal(fast.belowFloor, false);
    assert.equal(fast.recoveryHeadroom, true);
  });

  it("drops rapidly from full to balanced to minimal below 30 FPS", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS;
    nowMs = feedWindow({ controller, nowMs, intervalMs: 1_000 / 24 });
    assert.equal(controller.quality, "balanced");
    feedWindow({ controller, nowMs, intervalMs: 1_000 / 24 });
    assert.equal(controller.quality, "minimal");
  });

  it("ignores hidden-tab and long-stall deltas", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    const hidden = controller.recordFrame({
      nowMs: 1_000,
      deltaMs: 42,
      foreground: false,
    });
    assert.equal(hidden.ignoredReason, "inactive");
    const stalled = controller.recordFrame({
      nowMs: 2_000,
      deltaMs: 800,
      foreground: true,
    });
    assert.equal(stalled.ignoredReason, "sleep-delta");
    assert.equal(controller.quality, "full");
  });

  it("recovers only after sustained fast windows and cooldown", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS;
    nowMs = feedWindow({ controller, nowMs, intervalMs: 1_000 / 24 });
    nowMs = feedWindow({ controller, nowMs, intervalMs: 1_000 / 24 });
    assert.equal(controller.quality, "minimal");

    nowMs = 10_000;
    for (let index = 0; index < 3; index += 1) {
      nowMs = feedWindow({ controller, nowMs, intervalMs: 1_000 / 60 });
    }
    assert.equal(controller.quality, "minimal");
    feedWindow({ controller, nowMs, intervalMs: 1_000 / 60 });
    assert.equal(controller.quality, "balanced");
  });
});
