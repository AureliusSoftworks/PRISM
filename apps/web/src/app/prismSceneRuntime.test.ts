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
}): { nowMs: number; bad: boolean; good: boolean; proposedChange: boolean } {
  let nowMs = options.nowMs;
  let bad = false;
  let good = false;
  let proposedChange = false;
  for (let index = 0; index < PRISM_SCENE_SAMPLE_WINDOW_SIZE; index += 1) {
    nowMs += options.deltaMs;
    const result = options.controller.recordFrame({
      nowMs,
      deltaMs: options.deltaMs,
      activity: options.activity ?? "interactive",
      foreground: true,
    });
    bad ||= result.window?.bad === true;
    good ||= result.window?.good === true;
    proposedChange ||= "qualityChanged" in result;
  }
  return { nowMs, bad, good, proposedChange };
}

describe("PRISM scene runtime", () => {
  it("uses the approved three player-selected tiers", () => {
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

  it("keeps reduced motion static without raising a Low quality ceiling", () => {
    assert.deepEqual(prismSceneQualityConfig("minimal", true, 2), {
      quality: "minimal",
      dprCap: 0.75,
      effectiveDpr: 0.75,
      particleCount: 0,
      continuousMotion: false,
    });
    assert.equal(
      resolvePrismSceneActivity({
        requested: "interactive",
        foreground: true,
        reducedMotion: true,
        qualityCeiling: "full",
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
        qualityCeiling: "full",
      }),
      "suspended",
    );
    assert.equal(
      resolvePrismSceneActivity({
        requested: "settled",
        foreground: true,
        reducedMotion: false,
        qualityCeiling: "full",
      }),
      "settled",
    );
    assert.equal(
      resolvePrismSceneActivity({
        requested: "ambient",
        foreground: true,
        reducedMotion: false,
        qualityCeiling: "minimal",
      }),
      "settled",
    );
    assert.equal(
      resolvePrismSceneActivity({
        requested: "ambient",
        foreground: true,
        reducedMotion: false,
        qualityCeiling: "full",
      }),
      "ambient",
      "an explicit High ceiling keeps ambient sampling active",
    );
  });

  it("reports bad and good windows without changing the rendered tier", () => {
    const controller = new PrismAdaptiveQualityController(0);
    let nowMs = 2_001;
    const slow = recordWindow({ controller, nowMs, deltaMs: 40 });
    nowMs = slow.nowMs;
    assert.equal(slow.bad, true);
    assert.equal(slow.proposedChange, false);
    assert.equal(controller.quality, "full");
    controller.noteDiscontinuity(nowMs);
    nowMs += 2_001;
    const fast = recordWindow({ controller, nowMs, deltaMs: 16 });
    assert.equal(fast.good, true);
    assert.equal(fast.proposedChange, false);
    assert.equal(controller.quality, "full");
  });

  it("keeps balanced and minimal as fixed player-selected tiers", () => {
    const medium = new PrismAdaptiveQualityController(0, "balanced");
    let nowMs = 2_001;
    nowMs = recordWindow({ controller: medium, nowMs, deltaMs: 40 }).nowMs;
    nowMs = recordWindow({ controller: medium, nowMs, deltaMs: 40 }).nowMs;
    assert.equal(medium.quality, "balanced");

    const low = new PrismAdaptiveQualityController(0, "minimal");
    nowMs = 2_001;
    recordWindow({ controller: low, nowMs, deltaMs: 16 });
    assert.equal(low.quality, "minimal");
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
