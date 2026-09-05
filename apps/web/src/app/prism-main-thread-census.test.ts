import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatPrismMainThreadCensus,
  installPrismMainThreadCensus,
  prismMainThreadCensus,
  resetPrismMainThreadCensusCountersForTests,
} from "./prismMainThreadCensus.ts";

type Scheduled = { id: number; fire: () => void };

function fakeWindow() {
  let nextId = 1;
  const rafQueue: Scheduled[] = [];
  const timeoutQueue: Scheduled[] = [];
  const intervals = new Set<number>();
  const win = {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextId++;
      rafQueue.push({ id, fire: () => callback(0) });
      return id;
    },
    cancelAnimationFrame(id: number): void {
      const index = rafQueue.findIndex((entry) => entry.id === id);
      if (index >= 0) rafQueue.splice(index, 1);
    },
    setInterval(): number {
      const id = nextId++;
      intervals.add(id);
      return id;
    },
    clearInterval(id: number): void {
      intervals.delete(id);
    },
    setTimeout(handler: () => void): number {
      const id = nextId++;
      timeoutQueue.push({ id, fire: handler });
      return id;
    },
    clearTimeout(id: number): void {
      const index = timeoutQueue.findIndex((entry) => entry.id === id);
      if (index >= 0) timeoutQueue.splice(index, 1);
    },
  };
  return {
    win,
    flushRaf(): void {
      const pending = rafQueue.splice(0, rafQueue.length);
      for (const entry of pending) entry.fire();
    },
    flushTimeouts(): void {
      const pending = timeoutQueue.splice(0, timeoutQueue.length);
      for (const entry of pending) entry.fire();
    },
  };
}

describe("prism main-thread census", () => {
  it("counts a self-rescheduling loop as exactly one outstanding frame", () => {
    // This is the whole point of the readout. Coffee decays monotonically and
    // never recovers through a silent table, so the question is whether the
    // number of concurrently running loops climbs with session length. One
    // healthy loop must read as 1 forever, however many frames it runs.
    const harness = fakeWindow();
    (globalThis as { window?: unknown }).window = harness.win;
    resetPrismMainThreadCensusCountersForTests();
    installPrismMainThreadCensus();

    let running = true;
    const step = (): void => {
      if (!running) return;
      (globalThis as unknown as { window: typeof harness.win }).window.requestAnimationFrame(step);
    };
    (globalThis as unknown as { window: typeof harness.win }).window.requestAnimationFrame(step);
    assert.equal(prismMainThreadCensus().rafPending, 1);
    for (let frame = 0; frame < 20; frame += 1) {
      harness.flushRaf();
      assert.equal(prismMainThreadCensus().rafPending, 1);
    }
    running = false;
    harness.flushRaf();
    assert.equal(prismMainThreadCensus().rafPending, 0);

    // Two loops read as two. A leak is exactly this, repeated.
    (globalThis as unknown as { window: typeof harness.win }).window.requestAnimationFrame(() => undefined);
    (globalThis as unknown as { window: typeof harness.win }).window.requestAnimationFrame(() => undefined);
    assert.equal(prismMainThreadCensus().rafPending, 2);
    harness.flushRaf();
    assert.equal(prismMainThreadCensus().rafPending, 0);
    delete (globalThis as { window?: unknown }).window;
  });

  it("does not double-count a cancelled frame or a cleared timer", () => {
    const harness = fakeWindow();
    (globalThis as { window?: unknown }).window = harness.win;
    resetPrismMainThreadCensusCountersForTests();
    installPrismMainThreadCensus();
    const win = (globalThis as unknown as { window: typeof harness.win }).window;

    const frame = win.requestAnimationFrame(() => undefined);
    win.cancelAnimationFrame(frame);
    win.cancelAnimationFrame(frame);
    assert.equal(prismMainThreadCensus().rafPending, 0);

    const timer = win.setTimeout(() => undefined);
    win.clearTimeout(timer);
    win.clearTimeout(timer);
    assert.equal(prismMainThreadCensus().timeoutsPending, 0);

    const interval = win.setInterval();
    assert.equal(prismMainThreadCensus().intervalsLive, 1);
    win.clearInterval(interval);
    win.clearInterval(interval);
    assert.equal(prismMainThreadCensus().intervalsLive, 0);
    delete (globalThis as { window?: unknown }).window;
  });

  it("releases a timeout when it fires, not only when it is cleared", () => {
    const harness = fakeWindow();
    (globalThis as { window?: unknown }).window = harness.win;
    resetPrismMainThreadCensusCountersForTests();
    installPrismMainThreadCensus();
    const win = (globalThis as unknown as { window: typeof harness.win }).window;

    win.setTimeout(() => undefined);
    win.setTimeout(() => undefined);
    assert.equal(prismMainThreadCensus().timeoutsPending, 2);
    harness.flushTimeouts();
    assert.equal(prismMainThreadCensus().timeoutsPending, 0);
    delete (globalThis as { window?: unknown }).window;
  });

  it("renders a terse badge line and omits what the engine cannot report", () => {
    assert.equal(
      formatPrismMainThreadCensus({
        rafPending: 3,
        intervalsLive: 6,
        timeoutsPending: 12,
        domElements: 4231,
        animationsRunning: 47,
        heapMb: 180,
        renderRates: [{ name: "home", perSecond: 214 }],
      }),
      "raf 3 · int 6 · tmo 12 · dom 4.2k · anim 47 · heap 180MB · home 214/s",
    );
    assert.equal(
      formatPrismMainThreadCensus({
        rafPending: 1,
        intervalsLive: 0,
        timeoutsPending: 0,
        domElements: 900,
        animationsRunning: null,
        heapMb: null,
        renderRates: [],
      }),
      "raf 1 · int 0 · tmo 0 · dom 900",
    );
  });
});
