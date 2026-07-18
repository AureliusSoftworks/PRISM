import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRISM_SCENE_SAMPLE_WINDOW_SIZE,
  PrismAdaptiveQualityController,
  prismSceneQualityConfig,
  prismSceneTimingWindow,
  resolvePrismSceneActivity,
  type PrismSceneActivity,
} from "./prismSceneRuntime.ts";

function recordWindow(options: {
  controller: PrismAdaptiveQualityController;
  nowMs: number;
  deltaMs: number;
  activity?: PrismSceneActivity;
}): { nowMs: number; qualityChanged?: string } {
  let nowMs = options.nowMs;
  let qualityChanged: string | undefined;
  for (let index = 0; index < PRISM_SCENE_SAMPLE_WINDOW_SIZE; index += 1) {
    nowMs += options.deltaMs;
    const result = options.controller.recordFrame({
      nowMs,
      deltaMs: options.deltaMs,
      activity: options.activity ?? "interactive",
      foreground: true,
    });
    qualityChanged = result.qualityChanged ?? qualityChanged;
  }
  return { nowMs, qualityChanged };
}

describe("PRISM adaptive scene runtime", () => {
  it("uses the approved three automatic tiers", () => {
    assert.deepEqual(prismSceneQualityConfig("full", false, 2), {
      quality: "full",
      dprCap: 1.5,
      effectiveDpr: 1.5,
      particleCount: 28,
      continuousMotion: true,
    });
    assert.deepEqual(prismSceneQualityConfig("balanced", false, 2), {
      quality: "balanced",
      dprCap: 1,
      effectiveDpr: 1,
      particleCount: 16,
      continuousMotion: true,
    });
    assert.deepEqual(prismSceneQualityConfig("minimal", false, 2), {
      quality: "minimal",
      dprCap: 0.75,
      effectiveDpr: 0.75,
      particleCount: 0,
      continuousMotion: false,
    });
  });

  it("keeps full-resolution static atmosphere under reduced motion", () => {
    assert.deepEqual(prismSceneQualityConfig("minimal", true, 2), {
      quality: "minimal",
      dprCap: 1.5,
      effectiveDpr: 1.5,
      particleCount: 0,
      continuousMotion: false,
    });
    assert.equal(
      resolvePrismSceneActivity({
        requested: "interactive",
        foreground: true,
        reducedMotion: true,
        quality: "full",
      }),
      "settled",
    );
  });

  it("suspends hidden scenes and leaves explicit settled scenes static", () => {
    assert.equal(
      resolvePrismSceneActivity({
        requested: "interactive",
        foreground: false,
        reducedMotion: false,
        quality: "full",
      }),
      "suspended",
    );
    assert.equal(
      resolvePrismSceneActivity({
        requested: "settled",
        foreground: true,
        reducedMotion: false,
        quality: "full",
      }),
      "settled",
    );
  });

  it("steps down only after two consecutive bad windows", () => {
    const controller = new PrismAdaptiveQualityController(0);
    let nowMs = 2_001;
    let result = recordWindow({ controller, nowMs, deltaMs: 40 });
    nowMs = result.nowMs;
    assert.equal(controller.quality, "full");
    assert.equal(result.qualityChanged, undefined);

    result = recordWindow({ controller, nowMs, deltaMs: 40 });
    assert.equal(result.qualityChanged, "balanced");
    assert.equal(controller.quality, "balanced");
  });

  it("steps up after four good windows once the cooldown has elapsed", () => {
    const controller = new PrismAdaptiveQualityController(0);
    let nowMs = 2_001;
    nowMs = recordWindow({ controller, nowMs, deltaMs: 40 }).nowMs;
    const down = recordWindow({ controller, nowMs, deltaMs: 40 });
    nowMs = down.nowMs;
    assert.equal(controller.quality, "balanced");

    nowMs += 10_001;
    controller.noteDiscontinuity(nowMs);
    nowMs += 2_001;
    for (let index = 0; index < 3; index += 1) {
      nowMs = recordWindow({ controller, nowMs, deltaMs: 16 }).nowMs;
      assert.equal(controller.quality, "balanced");
    }
    const up = recordWindow({ controller, nowMs, deltaMs: 16 });
    assert.equal(up.qualityChanged, "full");
    assert.equal(controller.quality, "full");
  });

  it("ignores initialization, resume, target-change, and sleep-sized samples", () => {
    const controller = new PrismAdaptiveQualityController(100);
    assert.equal(
      controller.recordFrame({
        nowMs: 1_000,
        deltaMs: 16,
        activity: "interactive",
        foreground: true,
      }).ignoredReason,
      "warmup",
    );
    assert.equal(
      controller.recordFrame({
        nowMs: 2_500,
        deltaMs: 16,
        activity: "ambient",
        foreground: true,
      }).ignoredReason,
      "target-changed",
    );
    assert.equal(
      controller.recordFrame({
        nowMs: 5_000,
        deltaMs: 251,
        activity: "ambient",
        foreground: true,
      }).ignoredReason,
      "sleep-delta",
    );
    assert.equal(controller.pendingSampleCount, 0);
    assert.equal(
      controller.recordFrame({
        nowMs: 6_000,
        deltaMs: 33,
        activity: "ambient",
        foreground: true,
      }).ignoredReason,
      "warmup",
    );
  });

  it("computes p50, p95, observed FPS, and missed-frame percentage", () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      index < 88 ? 16 : 30,
    );
    const window = prismSceneTimingWindow(samples, 60);
    assert.equal(window.p50FrameIntervalMs, 16);
    assert.equal(window.p95FrameIntervalMs, 30);
    assert.equal(window.missedFramePercentage, 12);
    assert.equal(window.bad, true);
    assert.ok(window.observedFps > 50 && window.observedFps < 60);
  });
});
