export const PRISM_DOM_FRAME_FLOOR_FPS = 30;
export const PRISM_DOM_SAMPLE_WINDOW_SIZE = 12;
export const PRISM_DOM_SAMPLE_WARMUP_MS = 500;
export const PRISM_DOM_SLEEP_DELTA_MS = 250;

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
 * Observes DOM/CSS frame pressure without changing presentation quality.
 * Rendering diagnostics retain the cadence windows while explicit player
 * graphics settings remain the only quality control.
 */
export class PrismDomAdaptiveQualityController {
  private ignoredUntilMs: number;
  private samples: number[] = [];

  constructor(nowMs = 0) {
    this.ignoredUntilMs = nowMs + PRISM_DOM_SAMPLE_WARMUP_MS;
  }

  noteDiscontinuity(nowMs: number): void {
    this.samples = [];
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
    return {
      accepted: true,
      window,
    };
  }
}
