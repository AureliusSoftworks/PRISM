import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as frameRate from "./prismFrameRate.ts";

for (const supportsSlowFrames of [false, true]) {
test(`governor visibility and observer lifecycle (LoAF=${supportsSlowFrames})`, () => {
  frameRate.resetPrismFrameRateForTests();
  let now = 0;
  let nextId = 0;
  let cleanup: (() => void) | undefined;
  const frames = new Map<number, (at: number) => void>();
  const visibilityListeners = new Set<() => void>();
  const qualityFrames: number[] = [];
  type SlowEntry = { startTime: number; duration: number };
  let deliverSlowFrames: ((entries: SlowEntry[]) => void) | undefined;
  let observerDisconnected = false;
  let observerDrains = 0;
  class SlowObserver {
    static supportedEntryTypes = ["long-animation-frame"];
    constructor(callback: (list: { getEntries: () => SlowEntry[] }) => void) {
      deliverSlowFrames = (entries) => callback({ getEntries: () => entries });
    }
    observe(options: { type: string; buffered: boolean }) {
      assert.equal(options.type, "long-animation-frame");
      assert.equal(options.buffered, false);
    }
    takeRecords() { observerDrains++; return []; }
    disconnect() { observerDisconnected = true; }
  }
  const document = {
    visibilityState: "visible",
    documentElement: { dataset: {} },
    addEventListener: (_type: string, fn: () => void) => visibilityListeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => visibilityListeners.delete(fn),
  };
  const exports = {} as { PrismAdaptiveDomQualityGovernor: () => void };
  const compiled = ts.transpileModule(readFileSync(new URL("./PrismAdaptiveDomQualityGovernor.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "react") return { useEffect: (effect: () => () => void) => { cleanup = effect(); } };
      if (name === "./prismFrameRate") return frameRate;
      if (name === "./replayAudioMasterCapture") return { nudgePrismRenderThrottleRecovery() {} };
      if (name === "./prismDomAdaptiveQuality") return {
        PrismDomAdaptiveQualityController: class {
          currentQuality() { return "full"; }
          noteDiscontinuity() {}
          recordFrame({ deltaMs }: { deltaMs: number }) { qualityFrames.push(deltaMs); return { qualityChanged: false }; }
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    performance: { now: () => now },
    PerformanceObserver: supportsSlowFrames ? SlowObserver : undefined,
    document,
    window: {
      requestAnimationFrame: (fn: (at: number) => void) => { frames.set(++nextId, fn); return nextId; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      setInterval: () => 1,
      clearInterval() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const step = (gap: number) => {
    now += gap;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(now));
  };
  exports.PrismAdaptiveDomQualityGovernor();
  for (let i = 0; i < 25; i++) step(8);
  deliverSlowFrames?.(Array.from({ length: 10 }, (_, i) => ({ startTime: now, duration: 60 + i })));
  for (let i = 0; i < 25; i++) step(8);
  assert.equal(frameRate.currentPrismFrameRate()?.slowFrames?.length, supportsSlowFrames ? 8 : undefined);
  if (supportsSlowFrames) assert.equal(frameRate.currentPrismFrameRate()?.slowFrames?.[0].durationMs, 62);
  document.visibilityState = "hidden";
  visibilityListeners.forEach((fn) => fn());
  deliverSlowFrames?.([{ startTime: now, duration: 900 }]);
  now += 2_000; // No callbacks at all while hidden.
  document.visibilityState = "visible";
  visibilityListeners.forEach((fn) => fn());
  // A callback already queued before becoming visible must not repopulate it.
  deliverSlowFrames?.([{ startTime: now - 100, duration: 150 }, { startTime: now, duration: 10_001 }]);
  for (let i = 0; i < 25; i++) step(8);
  assert.equal(frameRate.currentPrismFrameRate()?.slowFrames?.length, supportsSlowFrames ? 0 : undefined);
  assert.equal(frameRate.currentPrismFrameRate()?.frameStats?.maxMs, 8);
  assert.equal(Math.max(...qualityFrames), 8);
  step(300);
  assert.equal(frameRate.currentPrismFrameRate()?.frameStats?.maxMs, 300);
  assert.equal(frameRate.currentPrismFrameRate()?.frameStats?.over50Ms, 1);
  step(10_001);
  for (let i = 0; i < 25; i++) step(8);
  assert.equal(frameRate.currentPrismFrameRate()?.frameStats?.maxMs, 8);
  cleanup?.();
  assert.equal(visibilityListeners.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(observerDisconnected, supportsSlowFrames);
  if (supportsSlowFrames) assert.equal(observerDrains, 2);
});
}
