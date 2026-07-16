export type PrismSceneActivity =
  | "suspended"
  | "settled"
  | "ambient"
  | "interactive";

export type PrismSceneQuality = "full" | "balanced" | "minimal";

export type PrismSceneRendererStatus =
  | "uninitialized"
  | "initializing"
  | "webgl"
  | "context-lost"
  | "fallback"
  | "destroyed";

export interface PrismSceneDiagnosticsSnapshot {
  sceneId: string | null;
  rendererStatus: PrismSceneRendererStatus;
  lifecycle: PrismSceneActivity;
  quality: PrismSceneQuality;
  targetFps: number;
  observedFps: number;
  p50FrameIntervalMs: number;
  p95FrameIntervalMs: number;
  missedFramePercentage: number;
  effectiveDpr: number;
  objectCount: number;
  particleCount: number;
  contextLossCount: number;
  tickCount: number;
  updatedAtMs: number;
}

export interface PrismSceneQualityConfig {
  quality: PrismSceneQuality;
  dprCap: number;
  effectiveDpr: number;
  particleCount: number;
  continuousMotion: boolean;
}

export interface PrismSceneTimingWindow {
  targetFps: number;
  observedFps: number;
  p50FrameIntervalMs: number;
  p95FrameIntervalMs: number;
  missedFramePercentage: number;
  bad: boolean;
  good: boolean;
}

export interface PrismSceneFrameSample {
  nowMs: number;
  deltaMs: number;
  activity: PrismSceneActivity;
  foreground: boolean;
}

export interface PrismSceneFrameSampleResult {
  accepted: boolean;
  ignoredReason?:
    | "inactive"
    | "warmup"
    | "sleep-delta"
    | "target-changed";
  window?: PrismSceneTimingWindow;
  qualityChanged?: PrismSceneQuality;
}

export type PrismWebGlRecoveryState =
  | "ready"
  | "context-lost"
  | "recovering"
  | "fallback";

export class PrismWebGlRecoveryController {
  private stateValue: PrismWebGlRecoveryState = "ready";
  private restoreAttempts = 0;
  private lossCountValue = 0;

  get state(): PrismWebGlRecoveryState {
    return this.stateValue;
  }

  get contextLossCount(): number {
    return this.lossCountValue;
  }

  contextLost(): void {
    this.lossCountValue += 1;
    this.stateValue = "context-lost";
  }

  beginRestore(): boolean {
    if (this.stateValue !== "context-lost" || this.restoreAttempts >= 1) {
      this.stateValue = "fallback";
      return false;
    }
    this.restoreAttempts += 1;
    this.stateValue = "recovering";
    return true;
  }

  restoreSucceeded(): void {
    if (this.stateValue === "recovering") this.stateValue = "ready";
  }

  restoreFailed(): void {
    this.stateValue = "fallback";
  }
}

export const PRISM_SCENE_QUALITY_ORDER: readonly PrismSceneQuality[] = [
  "full",
  "balanced",
  "minimal",
];

export const PRISM_SCENE_QUALITY_CONFIG: Readonly<
  Record<PrismSceneQuality, Omit<PrismSceneQualityConfig, "effectiveDpr">>
> = {
  full: {
    quality: "full",
    dprCap: 1.5,
    particleCount: 28,
    continuousMotion: true,
  },
  balanced: {
    quality: "balanced",
    dprCap: 1,
    particleCount: 16,
    continuousMotion: true,
  },
  minimal: {
    quality: "minimal",
    dprCap: 0.75,
    particleCount: 0,
    continuousMotion: false,
  },
};

export const PRISM_SCENE_SAMPLE_WINDOW_SIZE = 120;
export const PRISM_SCENE_SAMPLE_WARMUP_MS = 2_000;
export const PRISM_SCENE_SLEEP_DELTA_MS = 250;
export const PRISM_SCENE_TIER_COOLDOWN_MS = 10_000;

export function prismSceneActivityTargetFps(
  activity: PrismSceneActivity,
): number {
  if (activity === "interactive") return 60;
  if (activity === "ambient") return 30;
  return 0;
}

export function prismSceneQualityConfig(
  quality: PrismSceneQuality,
  reducedMotion: boolean,
  devicePixelRatio = 1,
): PrismSceneQualityConfig {
  const configured = reducedMotion
    ? PRISM_SCENE_QUALITY_CONFIG.full
    : PRISM_SCENE_QUALITY_CONFIG[quality];
  const dpr = Number.isFinite(devicePixelRatio)
    ? Math.max(0.5, devicePixelRatio)
    : 1;
  return {
    ...configured,
    quality,
    effectiveDpr: Math.min(dpr, configured.dprCap),
    particleCount: reducedMotion ? 0 : configured.particleCount,
    continuousMotion: reducedMotion ? false : configured.continuousMotion,
  };
}

export function resolvePrismSceneActivity(options: {
  requested: PrismSceneActivity;
  foreground: boolean;
  reducedMotion: boolean;
  quality: PrismSceneQuality;
  mounted?: boolean;
}): PrismSceneActivity {
  if (options.mounted === false || !options.foreground) return "suspended";
  if (
    options.requested === "suspended" ||
    options.requested === "settled" ||
    options.reducedMotion
  ) {
    return options.requested === "suspended" ? "suspended" : "settled";
  }
  return options.requested;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? 0;
}

export function prismSceneTimingWindow(
  frameIntervalsMs: readonly number[],
  targetFps: number,
): PrismSceneTimingWindow {
  if (frameIntervalsMs.length === 0 || targetFps <= 0) {
    return {
      targetFps,
      observedFps: 0,
      p50FrameIntervalMs: 0,
      p95FrameIntervalMs: 0,
      missedFramePercentage: 0,
      bad: false,
      good: false,
    };
  }
  const targetIntervalMs = 1_000 / targetFps;
  const sorted = [...frameIntervalsMs].sort((a, b) => a - b);
  const totalMs = frameIntervalsMs.reduce((sum, value) => sum + value, 0);
  const p50FrameIntervalMs = percentile(sorted, 0.5);
  const p95FrameIntervalMs = percentile(sorted, 0.95);
  const missedFrames = frameIntervalsMs.filter(
    (value) => value > targetIntervalMs * 1.5,
  ).length;
  const missedFramePercentage =
    (missedFrames / frameIntervalsMs.length) * 100;
  const bad =
    p95FrameIntervalMs > targetIntervalMs * 1.35 ||
    missedFramePercentage > 10;
  const good =
    !bad &&
    p95FrameIntervalMs <= targetIntervalMs * 1.15 &&
    missedFramePercentage <= 5;
  return {
    targetFps,
    observedFps: totalMs > 0 ? (frameIntervalsMs.length * 1_000) / totalMs : 0,
    p50FrameIntervalMs,
    p95FrameIntervalMs,
    missedFramePercentage,
    bad,
    good,
  };
}

export class PrismAdaptiveQualityController {
  private qualityValue: PrismSceneQuality = "full";
  private ignoredUntilMs: number;
  private activeTargetFps = 0;
  private samples: number[] = [];
  private badWindowCount = 0;
  private goodWindowCount = 0;
  private lastTierChangeMs = Number.NEGATIVE_INFINITY;

  constructor(nowMs = 0) {
    this.ignoredUntilMs = nowMs + PRISM_SCENE_SAMPLE_WARMUP_MS;
  }

  get quality(): PrismSceneQuality {
    return this.qualityValue;
  }

  get pendingSampleCount(): number {
    return this.samples.length;
  }

  noteDiscontinuity(nowMs: number): void {
    this.samples = [];
    this.activeTargetFps = 0;
    this.ignoredUntilMs = nowMs + PRISM_SCENE_SAMPLE_WARMUP_MS;
  }

  recordFrame(sample: PrismSceneFrameSample): PrismSceneFrameSampleResult {
    const targetFps = prismSceneActivityTargetFps(sample.activity);
    if (!sample.foreground || targetFps === 0) {
      return { accepted: false, ignoredReason: "inactive" };
    }
    if (sample.deltaMs > PRISM_SCENE_SLEEP_DELTA_MS) {
      this.noteDiscontinuity(sample.nowMs);
      return { accepted: false, ignoredReason: "sleep-delta" };
    }
    if (this.activeTargetFps !== 0 && this.activeTargetFps !== targetFps) {
      this.noteDiscontinuity(sample.nowMs);
      this.activeTargetFps = targetFps;
      return { accepted: false, ignoredReason: "target-changed" };
    }
    this.activeTargetFps = targetFps;
    if (sample.nowMs < this.ignoredUntilMs) {
      return { accepted: false, ignoredReason: "warmup" };
    }
    this.samples.push(sample.deltaMs);
    if (this.samples.length < PRISM_SCENE_SAMPLE_WINDOW_SIZE) {
      return { accepted: true };
    }

    const window = prismSceneTimingWindow(this.samples, targetFps);
    this.samples = [];
    let qualityChanged: PrismSceneQuality | undefined;

    if (window.bad) {
      this.badWindowCount += 1;
      this.goodWindowCount = 0;
      if (this.badWindowCount >= 2) {
        qualityChanged = this.changeTier(1, sample.nowMs);
        this.badWindowCount = 0;
      }
    } else if (window.good) {
      this.goodWindowCount += 1;
      this.badWindowCount = 0;
      if (this.goodWindowCount >= 4) {
        qualityChanged = this.changeTier(-1, sample.nowMs);
        this.goodWindowCount = 0;
      }
    } else {
      this.badWindowCount = 0;
      this.goodWindowCount = 0;
    }

    return {
      accepted: true,
      window,
      ...(qualityChanged ? { qualityChanged } : {}),
    };
  }

  private changeTier(
    direction: -1 | 1,
    nowMs: number,
  ): PrismSceneQuality | undefined {
    if (nowMs - this.lastTierChangeMs < PRISM_SCENE_TIER_COOLDOWN_MS) {
      return undefined;
    }
    const currentIndex = PRISM_SCENE_QUALITY_ORDER.indexOf(this.qualityValue);
    const nextIndex = Math.max(
      0,
      Math.min(PRISM_SCENE_QUALITY_ORDER.length - 1, currentIndex + direction),
    );
    const next = PRISM_SCENE_QUALITY_ORDER[nextIndex];
    if (!next || next === this.qualityValue) return undefined;
    this.qualityValue = next;
    this.lastTierChangeMs = nowMs;
    this.noteDiscontinuity(nowMs);
    return next;
  }
}
