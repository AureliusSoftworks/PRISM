import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS,
  PRISM_DOM_RECOVERY_WINDOWS_PER_STEP,
  PRISM_DOM_SAMPLE_WARMUP_MS,
  PRISM_DOM_SAMPLE_WINDOW_SIZE,
  PRISM_DOM_SUSPENSION_DELTA_MS,
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

  it("drops quality on the first over-budget frame and reaches minimal under sustained pressure", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS;
    let finalQuality = controller.currentQuality();
    for (let index = 0; index < PRISM_DOM_SAMPLE_WINDOW_SIZE; index += 1) {
      nowMs += 1_000 / 24;
      const result = controller.recordFrame({
        nowMs,
        deltaMs: 1_000 / 24,
        foreground: true,
      });
      finalQuality = result.quality;
    }
    assert.equal(finalQuality, "minimal");
  });

  it("treats a visible stall as pressure and ignores only actual suspension", () => {
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
    assert.equal(stalled.quality, "minimal");
    assert.equal(stalled.ignoredReason, undefined);
    const suspended = controller.recordFrame({
      nowMs: PRISM_DOM_SUSPENSION_DELTA_MS + 3_000,
      deltaMs: PRISM_DOM_SUSPENSION_DELTA_MS + 1,
      foreground: true,
    });
    assert.equal(suspended.ignoredReason, "suspension-delta");
  });

  it("protects input-to-paint immediately and recovers with long hysteresis", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    const input = controller.recordInteractionDelay(
      PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS,
    );
    assert.equal(input.quality, "minimal");
    assert.equal(input.qualityChanged, true);

    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS + 1;
    for (
      let windowIndex = 0;
      windowIndex < PRISM_DOM_RECOVERY_WINDOWS_PER_STEP;
      windowIndex += 1
    ) {
      for (
        let frameIndex = 0;
        frameIndex < PRISM_DOM_SAMPLE_WINDOW_SIZE;
        frameIndex += 1
      ) {
        nowMs += 1_000 / 60;
        controller.recordFrame({
          nowMs,
          deltaMs: 1_000 / 60,
          foreground: true,
        });
      }
    }
    assert.equal(controller.currentQuality(), "balanced");
  });
});
