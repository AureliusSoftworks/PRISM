import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_DOM_BALANCED_FRAME_INTERVAL_MS,
  PRISM_DOM_FRAME_FLOOR_FPS,
  PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS,
  PRISM_DOM_RECOVERY_WINDOWS_PER_STEP,
  PRISM_DOM_SAMPLE_WARMUP_MS,
  PRISM_DOM_SAMPLE_WINDOW_SIZE,
  PRISM_DOM_SUSPENSION_DELTA_MS,
  PrismDomAdaptiveQualityController,
  prismDomFrameWindow,
} from "./prismDomAdaptiveQuality.ts";

describe("adaptive DOM rendering quality", () => {
  it("targets 60 FPS instead of accepting sustained 30–55 FPS", () => {
    assert.equal(PRISM_DOM_FRAME_FLOOR_FPS, 60);
    for (const fps of [24, 30, 45, 50, 55]) {
      const slow = prismDomFrameWindow(Array(12).fill(1_000 / fps));
      assert.equal(slow.belowFloor, true, `${fps} FPS must shed`);
      assert.equal(slow.recoveryHeadroom, false, `${fps} FPS must not recover`);
    }
    for (const fps of [59.94, 60, 90, 120]) {
      const fast = prismDomFrameWindow(Array(12).fill(1_000 / fps));
      assert.equal(fast.belowFloor, false, `${fps} FPS must not shed`);
      assert.equal(fast.recoveryHeadroom, true, `${fps} FPS can recover`);
    }
  });

  it("tolerates normal 60 Hz jitter but catches a slow p90 behind a fast mean", () => {
    const jitter = [16.5, 16.9, 16.6, 16.8, 16.4, 16.9];
    const stable = prismDomFrameWindow([...jitter, ...jitter]);
    assert.equal(stable.belowFloor, false);
    assert.equal(stable.recoveryHeadroom, true);
    const uneven = prismDomFrameWindow([...Array(10).fill(8), 24, 24]);
    assert.ok(uneven.observedFps > 60);
    assert.equal(uneven.belowFloor, true);
    assert.equal(uneven.recoveryHeadroom, false);
    const marginal = prismDomFrameWindow(Array(12).fill(17.3));
    assert.equal(marginal.belowFloor, false);
    assert.equal(marginal.recoveryHeadroom, false);
  });

  it("uses the same jitter-tolerant budget for frames and input-to-paint", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    assert.equal(controller.recordInteractionDelay(PRISM_DOM_BALANCED_FRAME_INTERVAL_MS).quality, "full");
    assert.equal(controller.recordFrame({ nowMs: 100, deltaMs: 18, foreground: true }).quality, "balanced");
    assert.equal(controller.recordInteractionDelay(PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS).quality, "minimal");
    const inputController = new PrismDomAdaptiveQualityController(0);
    assert.equal(inputController.recordInteractionDelay(18).quality, "balanced");
    const frameController = new PrismDomAdaptiveQualityController(0);
    assert.equal(frameController.recordFrame({ nowMs: 100, deltaMs: PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS, foreground: true }).quality, "minimal");
  });

  it("drops quality on the first over-budget frame and reaches minimal under sustained pressure", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS;
    let finalQuality = controller.currentQuality();
    for (let index = 0; index < PRISM_DOM_SAMPLE_WINDOW_SIZE; index += 1) {
      nowMs += 1_000 / 55;
      const result = controller.recordFrame({
        nowMs,
        deltaMs: 1_000 / 55,
        foreground: true,
      });
      finalQuality = result.quality;
      if (index === 0) assert.equal(finalQuality, "balanced");
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

  it("requires consecutive healthy windows, then recovers fully on a jittery 60 Hz display", () => {
    const controller = new PrismDomAdaptiveQualityController(0);
    controller.recordInteractionDelay(100);
    let nowMs = PRISM_DOM_SAMPLE_WARMUP_MS + 1;
    const recordWindow = (intervals: number[]) => {
      for (const deltaMs of intervals) {
        nowMs += deltaMs;
        controller.recordFrame({ nowMs, deltaMs, foreground: true });
      }
    };
    const healthy = Array.from({ length: PRISM_DOM_SAMPLE_WINDOW_SIZE }, (_, index) => index % 2 === 0 ? 16.5 : 16.9);
    for (let i = 0; i < PRISM_DOM_RECOVERY_WINDOWS_PER_STEP - 1; i += 1) recordWindow(healthy);
    assert.equal(controller.currentQuality(), "minimal");
    // Within the shedding tolerance, but not enough headroom to recover.
    recordWindow(Array(PRISM_DOM_SAMPLE_WINDOW_SIZE).fill(17.3));
    for (let i = 0; i < PRISM_DOM_RECOVERY_WINDOWS_PER_STEP - 1; i += 1) recordWindow(healthy);
    assert.equal(controller.currentQuality(), "minimal");
    recordWindow(healthy);
    assert.equal(controller.currentQuality(), "balanced");
    for (let i = 0; i < PRISM_DOM_RECOVERY_WINDOWS_PER_STEP; i += 1) recordWindow(healthy);
    assert.equal(controller.currentQuality(), "full");
  });
});
