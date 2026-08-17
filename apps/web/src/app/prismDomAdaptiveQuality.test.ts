import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_DOM_SAMPLE_WARMUP_MS,
  PRISM_DOM_SAMPLE_WINDOW_SIZE,
  PrismDomAdaptiveQualityController,
  prismDomFrameWindow,
} from "./prismDomAdaptiveQuality.ts";

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

  it("reports sustained frame pressure without proposing a quality change", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS;
    let pressureDetected = false;
    let proposedQualityChange = false;
    for (let index = 0; index < PRISM_DOM_SAMPLE_WINDOW_SIZE; index += 1) {
      nowMs += 1_000 / 24;
      const result = controller.recordFrame({
        nowMs,
        deltaMs: 1_000 / 24,
        foreground: true,
      });
      pressureDetected ||= result.window?.belowFloor === true;
      proposedQualityChange ||= "qualityChanged" in result;
    }
    assert.equal(pressureDetected, true);
    assert.equal(proposedQualityChange, false);
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
  });
});
