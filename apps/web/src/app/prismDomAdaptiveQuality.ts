import type { PrismSceneQuality } from "./prismSceneRuntime";

export const PRISM_DOM_FRAME_FLOOR_FPS = 30;
export const PRISM_DOM_SAMPLE_WINDOW_SIZE = 12;
export const PRISM_DOM_SAMPLE_WARMUP_MS = 500;
export const PRISM_DOM_SLEEP_DELTA_MS = 250;
export const PRISM_DOM_DROP_COOLDOWN_MS = 450;
export const PRISM_DOM_RECOVERY_COOLDOWN_MS = 8_000;
export const PRISM_DOM_GOOD_WINDOWS_BEFORE_RECOVERY = 4;

const QUALITY_ORDER: readonly PrismSceneQuality[] = [
  "full",
  "balanced",
  "minimal",
];

export interface PrismDomFrameWindow {
  observedFps: number;
  p90FrameIntervalMs: number;
  belowFloor: boolean;
  recoveryHeadroom: boolean;
}

export interface PrismDomFrameSample {
  nowMs: number;
  deltaMs: number;
  foreground: boolean;
}

export interface PrismDomFrameSampleResult {
  accepted: boolean;
  ignoredReason?: "inactive" | "warmup" | "sleep-delta";
  window?: PrismDomFrameWindow;
  qualityChanged?: PrismSceneQuality;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? 0;
}

export function prismDomFrameWindow(
  frameIntervalsMs: readonly number[],
): PrismDomFrameWindow {
  if (frameIntervalsMs.length === 0) {
    return {
      observedFps: 0,
      p90FrameIntervalMs: 0,
      belowFloor: false,
      recoveryHeadroom: false,
    };
  }
  const totalMs = frameIntervalsMs.reduce((sum, value) => sum + value, 0);
  const observedFps =
    totalMs > 0 ? (frameIntervalsMs.length * 1_000) / totalMs : 0;
  const p90FrameIntervalMs = percentile(
    [...frameIntervalsMs].sort((a, b) => a - b),
    0.9,
  );
  return {
    observedFps,
    p90FrameIntervalMs,
    belowFloor:
      observedFps < PRISM_DOM_FRAME_FLOOR_FPS ||
      p90FrameIntervalMs > 1_000 / 25,
    recoveryHeadroom: observedFps >= 50 && p90FrameIntervalMs <= 24,
  };
}

/**
 * Governs costly DOM/CSS presentation independently from authored content.
 * It sheds quality quickly below 30 FPS and restores it only after sustained
 * headroom, preventing camera transitions from repeatedly crossing tiers.
 */
export class PrismDomAdaptiveQualityController {
  private qualityValue: PrismSceneQuality = "full";
  private ignoredUntilMs: number;
  private samples: number[] = [];
  private goodWindowCount = 0;
  private lastTierChangeMs = Number.NEGATIVE_INFINITY;

  constructor(nowMs = 0) {
    this.ignoredUntilMs = nowMs + PRISM_DOM_SAMPLE_WARMUP_MS;
  }

  get quality(): PrismSceneQuality {
    return this.qualityValue;
  }

  noteDiscontinuity(nowMs: number): void {
    this.samples = [];
    this.goodWindowCount = 0;
    this.ignoredUntilMs = nowMs + PRISM_DOM_SAMPLE_WARMUP_MS;
  }

  recordFrame(sample: PrismDomFrameSample): PrismDomFrameSampleResult {
    if (!sample.foreground) {
      this.noteDiscontinuity(sample.nowMs);
      return { accepted: false, ignoredReason: "inactive" };
    }
    if (sample.deltaMs > PRISM_DOM_SLEEP_DELTA_MS) {
      this.noteDiscontinuity(sample.nowMs);
      return { accepted: false, ignoredReason: "sleep-delta" };
    }
    if (sample.nowMs < this.ignoredUntilMs) {
      return { accepted: false, ignoredReason: "warmup" };
    }

    this.samples.push(Math.max(0, sample.deltaMs));
    if (this.samples.length < PRISM_DOM_SAMPLE_WINDOW_SIZE) {
      return { accepted: true };
    }

    const window = prismDomFrameWindow(this.samples);
    this.samples = [];
    let qualityChanged: PrismSceneQuality | undefined;
    if (window.belowFloor) {
      this.goodWindowCount = 0;
      if (sample.nowMs - this.lastTierChangeMs >= PRISM_DOM_DROP_COOLDOWN_MS) {
        qualityChanged = this.changeTier(1, sample.nowMs);
      }
    } else if (window.recoveryHeadroom && this.qualityValue !== "full") {
      this.goodWindowCount += 1;
      if (
        this.goodWindowCount >= PRISM_DOM_GOOD_WINDOWS_BEFORE_RECOVERY &&
        sample.nowMs - this.lastTierChangeMs >=
          PRISM_DOM_RECOVERY_COOLDOWN_MS
      ) {
        qualityChanged = this.changeTier(-1, sample.nowMs);
        this.goodWindowCount = 0;
      }
    } else {
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
    const currentIndex = QUALITY_ORDER.indexOf(this.qualityValue);
    const next = QUALITY_ORDER[
      Math.max(0, Math.min(QUALITY_ORDER.length - 1, currentIndex + direction))
    ];
    if (!next || next === this.qualityValue) return undefined;
    this.qualityValue = next;
    this.lastTierChangeMs = nowMs;
    this.samples = [];
    return next;
  }
}
