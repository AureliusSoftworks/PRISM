export const PRISM_DOM_FRAME_FLOOR_FPS = 60;
export const PRISM_DOM_SAMPLE_WINDOW_SIZE = 12;
export const PRISM_DOM_SAMPLE_WARMUP_MS = 500;
export const PRISM_DOM_SUSPENSION_DELTA_MS = 10_000;
const PRISM_DOM_FRAME_BUDGET_MS = 1_000 / PRISM_DOM_FRAME_FLOOR_FPS;
// A nominal 60 Hz display (including 59.94 Hz) has timestamp jitter. Do not
// shed effects for rounding noise or require a faster display to recover.
export const PRISM_DOM_BALANCED_FRAME_INTERVAL_MS = PRISM_DOM_FRAME_BUDGET_MS + 1;
export const PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS = PRISM_DOM_FRAME_BUDGET_MS * 2;
const PRISM_DOM_RECOVERY_MEAN_INTERVAL_MS = PRISM_DOM_FRAME_BUDGET_MS + 0.25;
export const PRISM_DOM_RECOVERY_WINDOWS_PER_STEP = 20;

export type PrismDomRuntimeQuality = "full" | "balanced" | "minimal";

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
  ignoredReason?: "inactive" | "warmup" | "suspension-delta";
  window?: PrismDomFrameWindow;
  quality: PrismDomRuntimeQuality;
  qualityChanged: boolean;
}

export interface PrismDomInteractionSampleResult {
  quality: PrismDomRuntimeQuality;
  qualityChanged: boolean;
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
  const meanFrameIntervalMs = totalMs / frameIntervalsMs.length;
  const p90FrameIntervalMs = percentile(
    [...frameIntervalsMs].sort((a, b) => a - b),
    0.9,
  );
  return {
    observedFps,
    p90FrameIntervalMs,
    belowFloor:
      meanFrameIntervalMs > PRISM_DOM_BALANCED_FRAME_INTERVAL_MS ||
      p90FrameIntervalMs > PRISM_DOM_BALANCED_FRAME_INTERVAL_MS,
    recoveryHeadroom:
      observedFps > 0 &&
      meanFrameIntervalMs <= PRISM_DOM_RECOVERY_MEAN_INTERVAL_MS &&
      p90FrameIntervalMs <= PRISM_DOM_BALANCED_FRAME_INTERVAL_MS,
  };
}

/** Performance-first quality governor. Player graphics settings remain the
 * authored ceiling; this runtime floor only sheds optional presentation work
 * when a frame or interaction misses the jitter-tolerant 60 FPS budget. */
export class PrismDomAdaptiveQualityController {
  private ignoredUntilMs: number;
  private samples: number[] = [];
  private quality: PrismDomRuntimeQuality = "full";
  private recoveryWindows = 0;

  constructor(nowMs = 0) {
    this.ignoredUntilMs = nowMs + PRISM_DOM_SAMPLE_WARMUP_MS;
  }

  noteDiscontinuity(nowMs: number): void {
    this.samples = [];
    this.recoveryWindows = 0;
    this.ignoredUntilMs = nowMs + PRISM_DOM_SAMPLE_WARMUP_MS;
  }

  currentQuality(): PrismDomRuntimeQuality {
    return this.quality;
  }

  recordInteractionDelay(
    delayMs: number,
  ): PrismDomInteractionSampleResult {
    return this.applyImmediatePressure(delayMs);
  }

  private setQuality(next: PrismDomRuntimeQuality): boolean {
    if (this.quality === next) return false;
    this.quality = next;
    this.recoveryWindows = 0;
    return true;
  }

  private applyImmediatePressure(
    intervalMs: number,
  ): PrismDomInteractionSampleResult {
    if (intervalMs >= PRISM_DOM_MINIMAL_FRAME_INTERVAL_MS) {
      return {
        quality: "minimal",
        qualityChanged: this.setQuality("minimal"),
      };
    }
    if (
      intervalMs > PRISM_DOM_BALANCED_FRAME_INTERVAL_MS &&
      this.quality === "full"
    ) {
      return {
        quality: "balanced",
        qualityChanged: this.setQuality("balanced"),
      };
    }
    return { quality: this.quality, qualityChanged: false };
  }

  private recoverOneStep(): boolean {
    if (this.quality === "minimal") return this.setQuality("balanced");
    if (this.quality === "balanced") return this.setQuality("full");
    this.recoveryWindows = 0;
    return false;
  }

  recordFrame(sample: PrismDomFrameSample): PrismDomFrameSampleResult {
    if (!sample.foreground) {
      this.noteDiscontinuity(sample.nowMs);
      return {
        accepted: false,
        ignoredReason: "inactive",
        quality: this.quality,
        qualityChanged: false,
      };
    }
    if (sample.deltaMs > PRISM_DOM_SUSPENSION_DELTA_MS) {
      this.noteDiscontinuity(sample.nowMs);
      return {
        accepted: false,
        ignoredReason: "suspension-delta",
        quality: this.quality,
        qualityChanged: false,
      };
    }
    const immediatePressure = this.applyImmediatePressure(sample.deltaMs);
    if (sample.nowMs < this.ignoredUntilMs) {
      return {
        accepted: false,
        ignoredReason: "warmup",
        ...immediatePressure,
      };
    }

    this.samples.push(Math.max(0, sample.deltaMs));
    if (this.samples.length < PRISM_DOM_SAMPLE_WINDOW_SIZE) {
      return { accepted: true, ...immediatePressure };
    }

    const window = prismDomFrameWindow(this.samples);
    this.samples = [];
    let qualityChanged = immediatePressure.qualityChanged;
    if (window.belowFloor) {
      this.recoveryWindows = 0;
      qualityChanged = this.setQuality("minimal") || qualityChanged;
    } else if (window.recoveryHeadroom && this.quality !== "full") {
      this.recoveryWindows += 1;
      if (this.recoveryWindows >= PRISM_DOM_RECOVERY_WINDOWS_PER_STEP) {
        qualityChanged = this.recoverOneStep() || qualityChanged;
      }
    } else {
      this.recoveryWindows = 0;
    }
    return {
      accepted: true,
      window,
      quality: this.quality,
      qualityChanged,
    };
  }
}
