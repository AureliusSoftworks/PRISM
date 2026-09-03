export interface PrismFrameRateSnapshot {
  fps: number;
  sampledAt: string;
  /** Main-thread long-task time in the sampling window, normalized to ms/s. */
  longTaskMsPerSecond?: number;
  /** Recent visible rAF gaps, retained only in memory for local diagnostics. */
  frameStats?: PrismFrameGapStats;
  /** Content-free browser breakdowns of recent slow frames, when supported. */
  slowFrames?: readonly PrismSlowFrame[];
}

export interface PrismSlowFrame {
  durationMs: number;
  scriptMs: number;
  forcedLayoutMs: number;
  renderMs: number;
  styleLayoutMs: number;
}

export function prismSlowFrameBreakdown(entry: {
  startTime: number;
  duration: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  scripts?: readonly { duration: number; forcedStyleAndLayoutDuration?: number }[];
}): PrismSlowFrame {
  const end = entry.startTime + entry.duration;
  const bounded = (value: number): number =>
    roundFrameGap(Number.isFinite(value) ? Math.max(0, Math.min(entry.duration, value)) : 0);
  return {
    durationMs: bounded(entry.duration),
    scriptMs: bounded((entry.scripts ?? []).reduce((sum, script) => sum + script.duration, 0)),
    forcedLayoutMs: bounded((entry.scripts ?? []).reduce((sum, script) => sum + (script.forcedStyleAndLayoutDuration ?? 0), 0)),
    renderMs: bounded(entry.renderStart ? end - entry.renderStart : 0),
    styleLayoutMs: bounded(entry.styleAndLayoutStart ? end - entry.styleAndLayoutStart : 0),
  };
}

export interface PrismFrameGapStats {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  over33Ms: number;
  over50Ms: number;
  sampledFrameCount: number;
  sampledSpanMs: number;
}

interface PrismFrameGapSample {
  endedAtMs: number;
  gapMs: number;
}

/** A bounded, visible-frame-only sampler. Callers reset it on hidden/suspended
 * clocks so sleep and tab thaw do not become synthetic frame stalls. */
export class PrismFrameGapSampler {
  private readonly samples: PrismFrameGapSample[] = [];
  private readonly windowMs: number;

  constructor(windowMs = 5_000) {
    this.windowMs = windowMs;
  }

  reset(): void {
    this.samples.length = 0;
  }

  record(endedAtMs: number, gapMs: number): void {
    if (!Number.isFinite(endedAtMs) || !Number.isFinite(gapMs) || gapMs <= 0) {
      return;
    }
    this.samples.push({ endedAtMs, gapMs });
    this.trim(endedAtMs);
  }

  snapshot(nowMs: number): PrismFrameGapStats | null {
    this.trim(nowMs);
    if (this.samples.length === 0) return null;
    const sortedGaps = this.samples.map(({ gapMs }) => gapMs).sort((a, b) => a - b);
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    return {
      p50Ms: roundFrameGap(quantile(sortedGaps, 0.5)),
      p95Ms: roundFrameGap(quantile(sortedGaps, 0.95)),
      p99Ms: roundFrameGap(quantile(sortedGaps, 0.99)),
      maxMs: roundFrameGap(last ? Math.max(...sortedGaps) : 0),
      over33Ms: this.samples.filter(({ gapMs }) => gapMs > 33.4).length,
      over50Ms: this.samples.filter(({ gapMs }) => gapMs > 50).length,
      sampledFrameCount: this.samples.length,
      sampledSpanMs: roundFrameGap(last.endedAtMs - (first.endedAtMs - first.gapMs)),
    };
  }

  private trim(nowMs: number): void {
    const cutoffMs = nowMs - this.windowMs;
    while (this.samples[0]?.endedAtMs < cutoffMs) this.samples.shift();
  }
}

function quantile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const index = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex] ?? 0;
  const upper = sortedValues[upperIndex] ?? lower;
  return lower + (upper - lower) * (index - lowerIndex);
}

function roundFrameGap(value: number): number {
  return Math.round(value * 10) / 10;
}

type PrismFrameRateListener = (snapshot: PrismFrameRateSnapshot | null) => void;

let latestSnapshot: PrismFrameRateSnapshot | null = null;
const listeners = new Set<PrismFrameRateListener>();

export function normalizePrismFrameRate(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.min(240, Math.round(value)));
}

export function publishPrismFrameRate(
  fps: number,
  sampledAt = new Date().toISOString(),
  longTaskMsPerSecond?: number,
  frameStats?: PrismFrameGapStats | null,
  slowFrames?: readonly PrismSlowFrame[],
): PrismFrameRateSnapshot | null {
  const normalized = normalizePrismFrameRate(fps);
  if (normalized === null) return null;
  latestSnapshot = {
    fps: normalized,
    sampledAt,
    ...(longTaskMsPerSecond !== undefined &&
    Number.isFinite(longTaskMsPerSecond)
      ? { longTaskMsPerSecond: Math.max(0, Math.round(longTaskMsPerSecond)) }
      : {}),
    ...(frameStats ? { frameStats } : {}),
    ...(slowFrames ? { slowFrames } : {}),
  };
  listeners.forEach((listener) => listener(latestSnapshot));
  return latestSnapshot;
}

export function currentPrismFrameRate(): PrismFrameRateSnapshot | null {
  return latestSnapshot;
}

export function subscribePrismFrameRate(
  listener: PrismFrameRateListener,
): () => void {
  listeners.add(listener);
  listener(latestSnapshot);
  return () => listeners.delete(listener);
}

export function resetPrismFrameRateForTests(): void {
  latestSnapshot = null;
  listeners.forEach((listener) => listener(null));
}
