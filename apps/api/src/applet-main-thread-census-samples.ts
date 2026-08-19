import type { DatabaseSync } from "node:sqlite";

import type { AppletSessionNoteSurface } from "./applet-session-notes.ts";

/**
 * A periodic reading of what is accumulating on the client's main thread.
 *
 * The frame-rate samples already say *whether* a session got slow. They cannot
 * say what grew while it did, and the live badge that can only helps somebody
 * watching it — which nobody is during the thirty-minute unattended table this
 * exists to support. Storing the series makes a finished session answerable
 * after the fact: if `rafPending` or `animationsRunning` climbs monotonically
 * while frame rate falls, the leak is named rather than guessed at.
 */
export interface AppletMainThreadCensusSampleV1 {
  /** Milliseconds since the session's own start, not since page load. */
  elapsedMs: number;
  capturedAt: string;
  fps: number | null;
  rafPending: number;
  intervalsLive: number;
  timeoutsPending: number;
  domElements: number | null;
  animationsRunning: number | null;
  heapMb: number | null;
  renderRates: readonly { name: string; perSecond: number }[];
}

interface AppletMainThreadCensusSampleRow {
  elapsed_ms: number;
  captured_at: string;
  fps: number | null;
  raf_pending: number;
  intervals_live: number;
  timeouts_pending: number;
  dom_elements: number | null;
  animations_running: number | null;
  heap_mb: number | null;
  render_rates_json: string;
}

/** Samples arrive batched; a runaway client must not be able to flood storage. */
export const MAX_CENSUS_SAMPLES_PER_BATCH = 240;

function readCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.round(value)));
}

function readOptionalCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100_000_000, Math.round(value)));
}

function readRenderRates(
  value: unknown,
): { name: string; perSecond: number }[] {
  if (!Array.isArray(value)) return [];
  const rates: { name: string; perSecond: number }[] = [];
  for (const entry of value.slice(0, 24)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name =
      typeof record.name === "string" ? record.name.trim().slice(0, 64) : "";
    if (!name) continue;
    rates.push({ name, perSecond: readCount(record.perSecond) });
  }
  return rates;
}

/** Parses one wire sample, or null when it carries no usable reading. */
export function readAppletMainThreadCensusSample(
  value: unknown,
): AppletMainThreadCensusSampleV1 | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.elapsedMs !== "number" ||
    !Number.isFinite(record.elapsedMs) ||
    record.elapsedMs < 0
  ) {
    return null;
  }
  const capturedAtMs = Date.parse(
    typeof record.capturedAt === "string" ? record.capturedAt : "",
  );
  const fps =
    typeof record.fps === "number" && Number.isFinite(record.fps)
      ? Math.max(0, Math.min(240, Math.round(record.fps)))
      : null;
  return {
    // Whole seconds would collapse a fast sampler's readings onto one key, and
    // sub-millisecond precision buys nothing, so store the rounded millisecond.
    elapsedMs: Math.round(record.elapsedMs),
    capturedAt: Number.isFinite(capturedAtMs)
      ? new Date(capturedAtMs).toISOString()
      : new Date().toISOString(),
    fps,
    rafPending: readCount(record.rafPending),
    intervalsLive: readCount(record.intervalsLive),
    timeoutsPending: readCount(record.timeoutsPending),
    domElements: readOptionalCount(record.domElements),
    animationsRunning: readOptionalCount(record.animationsRunning),
    heapMb:
      typeof record.heapMb === "number" && Number.isFinite(record.heapMb)
        ? Math.max(0, Math.round(record.heapMb * 100) / 100)
        : null,
    renderRates: readRenderRates(record.renderRates),
  };
}

export function recordAppletMainThreadCensusSamples(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
  samples: readonly AppletMainThreadCensusSampleV1[],
): number {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("A session is required to record a census sample.");
  }
  const insert = db.prepare(
    `INSERT INTO applet_main_thread_census_samples
       (user_id, surface, session_id, elapsed_ms, captured_at, fps,
        raf_pending, intervals_live, timeouts_pending, dom_elements,
        animations_running, heap_mb, render_rates_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, surface, session_id, elapsed_ms) DO NOTHING`,
  );
  let written = 0;
  for (const sample of samples.slice(0, MAX_CENSUS_SAMPLES_PER_BATCH)) {
    insert.run(
      userId,
      surface,
      normalizedSessionId,
      sample.elapsedMs,
      sample.capturedAt,
      sample.fps,
      sample.rafPending,
      sample.intervalsLive,
      sample.timeoutsPending,
      sample.domElements,
      sample.animationsRunning,
      sample.heapMb,
      JSON.stringify(sample.renderRates),
    );
    written += 1;
  }
  return written;
}

export function listAppletMainThreadCensusSamples(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
): AppletMainThreadCensusSampleV1[] {
  return (
    db
      .prepare(
        `SELECT elapsed_ms, captured_at, fps, raf_pending, intervals_live,
                timeouts_pending, dom_elements, animations_running, heap_mb,
                render_rates_json
           FROM applet_main_thread_census_samples
          WHERE user_id = ? AND surface = ? AND session_id = ?
          ORDER BY elapsed_ms`,
      )
      .all(
        userId,
        surface,
        sessionId.trim(),
      ) as unknown as AppletMainThreadCensusSampleRow[]
  ).map((row) => {
    let renderRates: { name: string; perSecond: number }[] = [];
    try {
      renderRates = readRenderRates(JSON.parse(row.render_rates_json));
    } catch {
      renderRates = [];
    }
    return {
      elapsedMs: row.elapsed_ms,
      capturedAt: row.captured_at,
      fps: row.fps,
      rafPending: row.raf_pending,
      intervalsLive: row.intervals_live,
      timeoutsPending: row.timeouts_pending,
      domElements: row.dom_elements,
      animationsRunning: row.animations_running,
      heapMb: row.heap_mb,
      renderRates,
    };
  });
}

/**
 * Reduces a session's series to the shape a reviewer actually reads: where the
 * frame rate ended up, and which counters grew from first sample to worst.
 * A counter that climbs and never recovers is the signature of a leak; one
 * that tracks activity and settles is not.
 */
export function summarizeAppletMainThreadCensus(
  samples: readonly AppletMainThreadCensusSampleV1[],
): {
  sampleCount: number;
  spanMs: number;
  fpsFirst: number | null;
  fpsLast: number | null;
  fpsMin: number | null;
  growth: { name: string; first: number; last: number; peak: number }[];
} | null {
  if (samples.length === 0) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const fpsReadings = samples
    .map((sample) => sample.fps)
    .filter((fps): fps is number => fps !== null);
  const counters = [
    ["rafPending", (s: AppletMainThreadCensusSampleV1) => s.rafPending],
    ["intervalsLive", (s: AppletMainThreadCensusSampleV1) => s.intervalsLive],
    ["timeoutsPending", (s: AppletMainThreadCensusSampleV1) => s.timeoutsPending],
    ["domElements", (s: AppletMainThreadCensusSampleV1) => s.domElements ?? 0],
    [
      "animationsRunning",
      (s: AppletMainThreadCensusSampleV1) => s.animationsRunning ?? 0,
    ],
    ["heapMb", (s: AppletMainThreadCensusSampleV1) => s.heapMb ?? 0],
  ] as const;
  return {
    sampleCount: samples.length,
    spanMs: Math.max(0, last.elapsedMs - first.elapsedMs),
    fpsFirst: first.fps,
    fpsLast: last.fps,
    fpsMin: fpsReadings.length > 0 ? Math.min(...fpsReadings) : null,
    growth: counters.map(([name, read]) => ({
      name,
      first: read(first),
      last: read(last),
      peak: samples.reduce((peak, sample) => Math.max(peak, read(sample)), 0),
    })),
  };
}
