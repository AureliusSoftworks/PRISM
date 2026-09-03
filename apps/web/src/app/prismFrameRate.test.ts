import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  currentPrismFrameRate,
  normalizePrismFrameRate,
  PrismFrameGapSampler,
  prismSlowFrameBreakdown,
  publishPrismFrameRate,
  resetPrismFrameRateForTests,
  subscribePrismFrameRate,
} from "./prismFrameRate.ts";

describe("PRISM frame-rate snapshots", () => {
  it("reports numeric slow-frame stages without retaining script URLs or content", () => {
    assert.deepEqual(prismSlowFrameBreakdown({
      startTime: 100, duration: 120, renderStart: 170, styleAndLayoutStart: 185,
      scripts: [{ duration: 60, forcedStyleAndLayoutDuration: 15 }],
    }), { durationMs: 120, scriptMs: 60, forcedLayoutMs: 15, renderMs: 50, styleLayoutMs: 35 });
    assert.deepEqual(prismSlowFrameBreakdown({ startTime: 100, duration: 60 }),
      { durationMs: 60, scriptMs: 0, forcedLayoutMs: 0, renderMs: 0, styleLayoutMs: 0 });
  });
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

  it("keeps true rolling gap quantiles and long-frame counts", () => {
    const sampler = new PrismFrameGapSampler(5_000);
    for (const [endedAtMs, gapMs] of [
      [16, 16],
      [32, 16],
      [48, 16],
      [108, 60],
      [148, 40],
      [448, 300],
    ] as const) {
      sampler.record(endedAtMs, gapMs);
    }
    assert.deepEqual(sampler.snapshot(448), {
      p50Ms: 28,
      p95Ms: 240,
      p99Ms: 288,
      maxMs: 300,
      over33Ms: 3,
      over50Ms: 2,
      sampledFrameCount: 6,
      sampledSpanMs: 448,
    });
  });

  it("drops expired gaps and lets visibility or suspension reset the sample", () => {
    const sampler = new PrismFrameGapSampler(5_000);
    sampler.record(300, 300);
    sampler.record(5_301, 16);
    assert.deepEqual(sampler.snapshot(5_301), {
      p50Ms: 16,
      p95Ms: 16,
      p99Ms: 16,
      maxMs: 16,
      over33Ms: 0,
      over50Ms: 0,
      sampledFrameCount: 1,
      sampledSpanMs: 16,
    });
    sampler.reset();
    assert.equal(sampler.snapshot(5_302), null);
  });
});
