import {
  PrismAdaptiveQualityController,
  PrismWebGlRecoveryController,
  prismSceneActivityTargetFps,
  prismSceneQualityConfig,
  resolvePrismSceneActivity,
  type PrismSceneActivity,
  type PrismSceneDiagnosticsSnapshot,
  type PrismSceneQualityConfig,
  type PrismSceneTimingWindow,
} from "./prismSceneRuntime.ts";
import {
  getPrismVisualLifecycleSnapshot,
  subscribePrismVisualLifecycle,
  type PrismVisualLifecycleSnapshot,
} from "./prismVisualLifecycle.ts";
import {
  publishPrismSceneDiagnostics,
  removePrismSceneDiagnostics,
} from "./prismSceneDiagnostics.ts";

export type PrismPixiModule = typeof import("pixi.js");
export type PrismPixiApplication = import("pixi.js").Application;

export interface PrismSceneHostFrame {
  deltaMs: number;
  quality: PrismSceneQualityConfig;
}

export interface PrismSceneHostReadyContext {
  pixi: PrismPixiModule;
  app: PrismPixiApplication;
  quality: PrismSceneQualityConfig;
}

export interface PrismSceneHostOptions {
  sceneId: string;
  container: HTMLElement;
  activity: PrismSceneActivity;
  onReady?: (context: PrismSceneHostReadyContext) => void | Promise<void>;
  onTick?: (frame: PrismSceneHostFrame) => void;
  onResize?: (width: number, height: number) => void;
  onQualityChange?: (quality: PrismSceneQualityConfig) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void | Promise<void>;
  onContextReady?: () => void;
  onFallback?: (error: unknown) => void;
  pixiLoader?: () => Promise<PrismPixiModule>;
  now?: () => number;
  devicePixelRatio?: () => number;
}

function defaultDiagnostics(nowMs: number): Omit<
  PrismSceneDiagnosticsSnapshot,
  "sceneId"
> {
  return {
    rendererStatus: "initializing",
    lifecycle: "suspended",
    quality: "full",
    targetFps: 0,
    observedFps: 0,
    p50FrameIntervalMs: 0,
    p95FrameIntervalMs: 0,
    missedFramePercentage: 0,
    effectiveDpr: 1,
    objectCount: 0,
    particleCount: 0,
    contextLossCount: 0,
    tickCount: 0,
    updatedAtMs: nowMs,
  };
}

export class PrismSceneHost {
  private readonly options: PrismSceneHostOptions;
  private readonly now: () => number;
  private readonly devicePixelRatio: () => number;
  private readonly adaptiveQuality: PrismAdaptiveQualityController;
  private readonly recovery = new PrismWebGlRecoveryController();
  private requestedActivity: PrismSceneActivity;
  private effectiveActivity: PrismSceneActivity = "suspended";
  private lifecycle: PrismVisualLifecycleSnapshot;
  private diagnostics: Omit<PrismSceneDiagnosticsSnapshot, "sceneId">;
  private qualityConfig: PrismSceneQualityConfig;
  private app: PrismPixiApplication | null = null;
  private pixi: PrismPixiModule | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeLifecycle: (() => void) | null = null;
  private removeWindowResize: (() => void) | null = null;
  private destroyed = false;
  private fallbackRetained = false;
  private lastDiagnosticsPublishMs = Number.NEGATIVE_INFINITY;

  constructor(options: PrismSceneHostOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.devicePixelRatio =
      options.devicePixelRatio ??
      (() => (typeof window === "undefined" ? 1 : window.devicePixelRatio));
    const nowMs = this.now();
    this.adaptiveQuality = new PrismAdaptiveQualityController(nowMs);
    this.lifecycle = getPrismVisualLifecycleSnapshot();
    this.requestedActivity = options.activity;
    this.qualityConfig = prismSceneQualityConfig(
      this.adaptiveQuality.quality,
      this.lifecycle.reducedMotion,
      this.devicePixelRatio(),
    );
    this.diagnostics = defaultDiagnostics(nowMs);
    this.diagnostics.effectiveDpr = this.qualityConfig.effectiveDpr;
    this.diagnostics.particleCount = this.qualityConfig.particleCount;
    this.publishDiagnostics(true);
  }

  async initialize(): Promise<boolean> {
    if (this.destroyed) return false;
    try {
      const pixi = await (this.options.pixiLoader ?? (() => import("pixi.js")))();
      if (this.destroyed) return false;
      const app = new pixi.Application();
      const { width, height } = this.measure();
      await app.init({
        width,
        height,
        resolution: this.qualityConfig.effectiveDpr,
        autoDensity: true,
        autoStart: false,
        sharedTicker: false,
        antialias: true,
        backgroundAlpha: 0,
        clearBeforeRender: true,
        preference: ["webgl"],
        powerPreference: "high-performance",
        webgl: {
          preferWebGLVersion: 2,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        },
      });
      if (this.destroyed) {
        app.destroy({ removeView: true }, true);
        return false;
      }
      this.pixi = pixi;
      this.app = app;
      this.canvas = app.canvas as HTMLCanvasElement;
      this.canvas.dataset.prismSceneCanvas = this.options.sceneId;
      this.canvas.style.position = "absolute";
      this.canvas.style.inset = "0";
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.canvas.style.display = "block";
      this.canvas.style.pointerEvents = "none";
      this.options.container.appendChild(this.canvas);
      this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.addEventListener(
        "webglcontextrestored",
        this.handleContextRestored,
      );
      app.ticker.add(this.handleTick);
      this.attachLifecycle();
      this.attachResize();
      await this.options.onReady?.({
        pixi,
        app,
        quality: this.qualityConfig,
      });
      if (this.destroyed) return false;
      this.diagnostics.rendererStatus = "webgl";
      this.applyResize(true);
      this.reconcileActivity(true);
      this.publishDiagnostics(true);
      return true;
    } catch (error) {
      this.enterFallback(error);
      return false;
    }
  }

  setActivity(activity: PrismSceneActivity): void {
    if (this.requestedActivity === activity) return;
    this.requestedActivity = activity;
    this.adaptiveQuality.noteDiscontinuity(this.now());
    this.reconcileActivity(true);
  }

  invalidate(): void {
    if (this.destroyed || !this.app || this.effectiveActivity === "suspended") {
      return;
    }
    this.app.render();
    this.publishDiagnostics(true);
  }

  setObjectCount(objectCount: number): void {
    this.diagnostics.objectCount = Math.max(0, Math.round(objectCount));
    this.publishDiagnostics(false);
  }

  get application(): PrismPixiApplication | null {
    return this.app;
  }

  get quality(): PrismSceneQualityConfig {
    return this.qualityConfig;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachRuntime();
    if (!this.fallbackRetained) {
      this.diagnostics.rendererStatus = "destroyed";
      this.diagnostics.lifecycle = "suspended";
      this.publishDiagnostics(true);
    }
    removePrismSceneDiagnostics(this.options.sceneId);
  }

  private readonly handleTick = (ticker: import("pixi.js").Ticker): void => {
    if (this.destroyed || !this.app) return;
    const nowMs = this.now();
    const result = this.adaptiveQuality.recordFrame({
      nowMs,
      deltaMs: ticker.elapsedMS,
      activity: this.effectiveActivity,
      foreground: this.lifecycle.lifecycle === "foreground",
    });
    if (result.qualityChanged) {
      this.applyQuality();
      this.reconcileActivity(true);
    }
    if (result.window) this.applyTimingWindow(result.window);
    this.options.onTick?.({
      deltaMs: ticker.elapsedMS,
      quality: this.qualityConfig,
    });
    this.diagnostics.tickCount += 1;
    this.publishDiagnostics(false);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.destroyed) return;
    this.recovery.contextLost();
    this.app?.stop();
    this.effectiveActivity = "suspended";
    this.diagnostics.rendererStatus = "context-lost";
    this.diagnostics.lifecycle = "suspended";
    this.diagnostics.contextLossCount = this.recovery.contextLossCount;
    this.options.onContextLost?.();
    this.publishDiagnostics(true);
  };

  private readonly handleContextRestored = (): void => {
    if (this.destroyed || !this.recovery.beginRestore()) {
      this.enterFallback(new Error("WebGL context recovery exhausted"));
      return;
    }
    void Promise.resolve()
      .then(() => this.options.onContextRestored?.())
      .then(() => {
        if (this.destroyed) return;
        this.recovery.restoreSucceeded();
        this.diagnostics.rendererStatus = "webgl";
        this.adaptiveQuality.noteDiscontinuity(this.now());
        this.applyResize(true);
        this.reconcileActivity(true);
        this.options.onContextReady?.();
        this.publishDiagnostics(true);
      })
      .catch((error) => {
        this.recovery.restoreFailed();
        this.enterFallback(error);
      });
  };

  private attachLifecycle(): void {
    this.unsubscribeLifecycle = subscribePrismVisualLifecycle(() => {
      const previous = this.lifecycle;
      this.lifecycle = getPrismVisualLifecycleSnapshot();
      const resumed =
        previous.lifecycle !== "foreground" &&
        this.lifecycle.lifecycle === "foreground";
      const motionChanged =
        previous.reducedMotion !== this.lifecycle.reducedMotion;
      if (resumed || motionChanged) {
        this.adaptiveQuality.noteDiscontinuity(this.now());
      }
      if (motionChanged) this.applyQuality();
      this.reconcileActivity(true);
    });
  }

  private attachResize(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.applyResize(false));
      this.resizeObserver.observe(this.options.container);
      return;
    }
    if (typeof window !== "undefined") {
      const handleResize = (): void => this.applyResize(false);
      window.addEventListener("resize", handleResize);
      this.removeWindowResize = () =>
        window.removeEventListener("resize", handleResize);
    }
  }

  private measure(): { width: number; height: number } {
    const rect = this.options.container.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width || this.options.container.clientWidth)),
      height: Math.max(
        1,
        Math.round(rect.height || this.options.container.clientHeight),
      ),
    };
  }

  private applyResize(force: boolean): void {
    if (!this.app || this.destroyed) return;
    const { width, height } = this.measure();
    const dpr = prismSceneQualityConfig(
      this.adaptiveQuality.quality,
      this.lifecycle.reducedMotion,
      this.devicePixelRatio(),
    ).effectiveDpr;
    const sizeChanged =
      this.app.screen.width !== width ||
      this.app.screen.height !== height ||
      this.app.renderer.resolution !== dpr;
    if (!force && !sizeChanged) return;
    this.app.renderer.resize(width, height, dpr);
    this.qualityConfig = { ...this.qualityConfig, effectiveDpr: dpr };
    this.diagnostics.effectiveDpr = dpr;
    this.options.onResize?.(width, height);
    this.adaptiveQuality.noteDiscontinuity(this.now());
    if (this.effectiveActivity !== "suspended") this.app.render();
    this.publishDiagnostics(true);
  }

  private applyQuality(): void {
    this.qualityConfig = prismSceneQualityConfig(
      this.adaptiveQuality.quality,
      this.lifecycle.reducedMotion,
      this.devicePixelRatio(),
    );
    this.diagnostics.quality = this.adaptiveQuality.quality;
    this.diagnostics.effectiveDpr = this.qualityConfig.effectiveDpr;
    this.diagnostics.particleCount = this.qualityConfig.particleCount;
    if (this.app) {
      const { width, height } = this.measure();
      this.app.renderer.resize(
        width,
        height,
        this.qualityConfig.effectiveDpr,
      );
    }
    this.options.onQualityChange?.(this.qualityConfig);
    this.publishDiagnostics(true);
  }

  private reconcileActivity(renderStatic: boolean): void {
    if (!this.app || this.destroyed || this.recovery.state !== "ready") return;
    const next = resolvePrismSceneActivity({
      requested: this.requestedActivity,
      foreground: this.lifecycle.lifecycle === "foreground",
      reducedMotion: this.lifecycle.reducedMotion,
      quality: this.adaptiveQuality.quality,
    });
    if (next !== this.effectiveActivity) {
      this.effectiveActivity = next;
      this.adaptiveQuality.noteDiscontinuity(this.now());
    }
    this.diagnostics.lifecycle = next;
    this.diagnostics.targetFps = prismSceneActivityTargetFps(next);
    if (next === "ambient" || next === "interactive") {
      this.app.ticker.maxFPS = prismSceneActivityTargetFps(next);
      this.app.start();
    } else {
      this.app.stop();
      if (next === "settled" && renderStatic) this.app.render();
    }
    this.publishDiagnostics(true);
  }

  private applyTimingWindow(window: PrismSceneTimingWindow): void {
    this.diagnostics.observedFps = window.observedFps;
    this.diagnostics.p50FrameIntervalMs = window.p50FrameIntervalMs;
    this.diagnostics.p95FrameIntervalMs = window.p95FrameIntervalMs;
    this.diagnostics.missedFramePercentage = window.missedFramePercentage;
  }

  private enterFallback(error: unknown): void {
    if (this.destroyed && !this.fallbackRetained) return;
    this.fallbackRetained = true;
    this.detachRuntime();
    this.diagnostics.rendererStatus = "fallback";
    this.diagnostics.lifecycle = "suspended";
    this.diagnostics.targetFps = 0;
    this.diagnostics.contextLossCount = this.recovery.contextLossCount;
    this.options.onFallback?.(error);
    this.publishDiagnostics(true);
  }

  private detachRuntime(): void {
    this.unsubscribeLifecycle?.();
    this.unsubscribeLifecycle = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.removeWindowResize?.();
    this.removeWindowResize = null;
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.removeEventListener(
        "webglcontextrestored",
        this.handleContextRestored,
      );
    }
    if (this.app) {
      this.app.ticker.remove(this.handleTick);
      this.app.stop();
      this.app.destroy(
        { removeView: true },
        {
          children: true,
          texture: true,
          textureSource: true,
          context: true,
        },
      );
    }
    this.canvas?.remove();
    this.canvas = null;
    this.app = null;
    this.pixi = null;
  }

  private publishDiagnostics(force: boolean): void {
    const nowMs = this.now();
    if (!force && nowMs - this.lastDiagnosticsPublishMs < 500) return;
    this.lastDiagnosticsPublishMs = nowMs;
    this.diagnostics.updatedAtMs = nowMs;
    publishPrismSceneDiagnostics(this.options.sceneId, this.diagnostics);
  }
}
