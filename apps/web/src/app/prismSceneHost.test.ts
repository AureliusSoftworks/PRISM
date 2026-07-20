import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PrismSceneHost,
  type PrismPixiModule,
} from "./PrismSceneHost.ts";
import {
  PrismAdaptiveQualityController,
  PrismWebGlRecoveryController,
} from "./prismSceneRuntime.ts";

class FakeSceneCanvas extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  removed = false;

  remove(): void {
    this.removed = true;
  }
}

class FakeSceneApplication {
  static latest: FakeSceneApplication | null = null;

  readonly canvas = new FakeSceneCanvas();
  readonly stage = {};
  readonly resizeCalls: Array<[number, number, number]> = [];
  readonly ticker = {
    maxFPS: 0,
    added: 0,
    removed: 0,
    add: () => {
      this.ticker.added += 1;
    },
    remove: () => {
      this.ticker.removed += 1;
    },
  };
  readonly renderer = {
    resolution: 1,
    resize: (width: number, height: number, resolution: number) => {
      this.screen.width = width;
      this.screen.height = height;
      this.renderer.resolution = resolution;
      this.resizeCalls.push([width, height, resolution]);
    },
  };
  readonly screen = { width: 1, height: 1 };
  destroyed = false;
  started = 0;
  stopped = 0;
  rendered = 0;

  constructor() {
    FakeSceneApplication.latest = this;
  }

  async init(options: {
    width: number;
    height: number;
    resolution: number;
  }): Promise<void> {
    this.screen.width = options.width;
    this.screen.height = options.height;
    this.renderer.resolution = options.resolution;
  }

  render(): void {
    this.rendered += 1;
  }

  start(): void {
    this.started += 1;
  }

  stop(): void {
    this.stopped += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeSceneResizeObserver {
  static latest: FakeSceneResizeObserver | null = null;
  private readonly callback: ResizeObserverCallback;
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeSceneResizeObserver.latest = this;
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function fakePixiLoader(): Promise<PrismPixiModule> {
  return Promise.resolve({
    Application: FakeSceneApplication,
  } as unknown as PrismPixiModule);
}

describe("PRISM WebGL recovery", () => {
  it("allows one restoration attempt and falls back after it is exhausted", () => {
    const recovery = new PrismWebGlRecoveryController();
    recovery.contextLost();
    assert.equal(recovery.contextLossCount, 1);
    assert.equal(recovery.state, "context-lost");
    assert.equal(recovery.beginRestore(), true);
    recovery.restoreSucceeded();
    assert.equal(recovery.state, "ready");

    recovery.contextLost();
    assert.equal(recovery.contextLossCount, 2);
    assert.equal(recovery.beginRestore(), false);
    assert.equal(recovery.state, "fallback");
  });

  it("retains fallback when the first recovery fails", () => {
    const recovery = new PrismWebGlRecoveryController();
    recovery.contextLost();
    assert.equal(recovery.beginRestore(), true);
    recovery.restoreFailed();
    assert.equal(recovery.state, "fallback");
  });

  it("resizes the renderer and releases ticker, observer, canvas, and app", async () => {
    const previousResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: FakeSceneResizeObserver,
    });
    const bounds = { width: 640, height: 360 };
    const appended: FakeSceneCanvas[] = [];
    const container = {
      clientWidth: bounds.width,
      clientHeight: bounds.height,
      getBoundingClientRect: () => ({ ...bounds }),
      appendChild: (node: FakeSceneCanvas) => appended.push(node),
    } as unknown as HTMLElement;
    const resizeEvents: Array<[number, number]> = [];
    const host = new PrismSceneHost({
      sceneId: "unit-scene",
      container,
      activity: "settled",
      pixiLoader: fakePixiLoader,
      devicePixelRatio: () => 2,
      onResize: (width, height) => resizeEvents.push([width, height]),
    });

    try {
      assert.equal(await host.initialize(), true);
      const app = FakeSceneApplication.latest;
      const observer = FakeSceneResizeObserver.latest;
      assert.ok(app);
      assert.ok(observer);
      assert.equal(app.ticker.added, 1);
      assert.equal(appended.length, 1);
      assert.deepEqual(resizeEvents.at(-1), [640, 360]);
      assert.deepEqual(app.resizeCalls.at(-1), [640, 360, 1.5]);

      bounds.width = 960;
      bounds.height = 540;
      observer.trigger();
      assert.deepEqual(resizeEvents.at(-1), [960, 540]);
      assert.deepEqual(app.resizeCalls.at(-1), [960, 540, 1.5]);

      host.destroy();
      assert.equal(observer.disconnected, true);
      assert.equal(app.ticker.removed, 1);
      assert.equal(app.destroyed, true);
      assert.equal(app.canvas.removed, true);
    } finally {
      host.destroy();
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: previousResizeObserver,
      });
    }
  });

  it("notifies fallback and destroys the renderer when restoration fails", async () => {
    const previousResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: FakeSceneResizeObserver,
    });
    const container = {
      clientWidth: 640,
      clientHeight: 360,
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
      appendChild: () => undefined,
    } as unknown as HTMLElement;
    let contextLost = 0;
    let fallback = 0;
    const host = new PrismSceneHost({
      sceneId: "unit-recovery",
      container,
      activity: "ambient",
      pixiLoader: fakePixiLoader,
      onContextLost: () => {
        contextLost += 1;
      },
      onContextRestored: () => {
        throw new Error("rebuild failed");
      },
      onFallback: () => {
        fallback += 1;
      },
    });

    try {
      assert.equal(await host.initialize(), true);
      const app = FakeSceneApplication.latest;
      assert.ok(app);
      app.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      assert.equal(contextLost, 1);
      app.canvas.dispatchEvent(new Event("webglcontextrestored"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(fallback, 1);
      assert.equal(app.destroyed, true);
      assert.equal(app.canvas.removed, true);
    } finally {
      host.destroy();
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: previousResizeObserver,
      });
    }
  });

  it("settles fixed Low scenes without preventing adaptive High recovery sampling", async () => {
    const previousResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: FakeSceneResizeObserver,
    });
    const container = {
      clientWidth: 640,
      clientHeight: 360,
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
      appendChild: () => undefined,
    } as unknown as HTMLElement;
    let nowMs = 0;
    const host = new PrismSceneHost({
      sceneId: "unit-low-quality",
      container,
      activity: "ambient",
      qualityCeiling: "full",
      pixiLoader: fakePixiLoader,
      now: () => nowMs,
    });

    try {
      assert.equal(await host.initialize(), true);
      const app = FakeSceneApplication.latest;
      assert.ok(app);
      (
        host as unknown as {
          lifecycle: {
            lifecycle: "foreground";
            visible: boolean;
            focused: boolean;
            pageHidden: boolean;
            reducedMotion: boolean;
            revision: number;
          };
        }
      ).lifecycle = {
        lifecycle: "foreground",
        visible: true,
        focused: true,
        pageHidden: false,
        reducedMotion: false,
        revision: 1,
      };
      host.setActivity("interactive");
      assert.equal(app.started > 0, true);
      const controller = (
        host as unknown as { adaptiveQuality: PrismAdaptiveQualityController }
      ).adaptiveQuality;
      nowMs = 2_001;
      const recordBadWindows = (count: number): void => {
        for (let windowIndex = 0; windowIndex < count; windowIndex += 1) {
          for (
            let sampleIndex = 0;
            sampleIndex < 120;
            sampleIndex += 1
          ) {
            nowMs += 40;
            controller.recordFrame({
              nowMs,
              deltaMs: 40,
              activity: "interactive",
              foreground: true,
            });
          }
        }
      };
      recordBadWindows(2);
      assert.equal(controller.quality, "balanced");
      nowMs += 10_001;
      controller.noteDiscontinuity(nowMs);
      nowMs += 2_001;
      recordBadWindows(2);
      assert.equal(controller.quality, "minimal");

      const stoppedBeforeAdaptiveReconcile = app.stopped;
      host.setActivity("ambient");
      assert.equal(
        app.stopped,
        stoppedBeforeAdaptiveReconcile,
        "an adaptively minimal High scene must keep its ticker alive",
      );

      host.setQualityCeiling("minimal");
      assert.equal(
        app.stopped,
        stoppedBeforeAdaptiveReconcile + 1,
        "switching to fixed Low must settle even when effective quality was already minimal",
      );
      assert.equal(app.rendered > 0, true, "Low still renders invalidations");
    } finally {
      host.destroy();
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: previousResizeObserver,
      });
    }
  });
});
