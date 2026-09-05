import type { PrismMainThreadCensus } from "./prismMainThreadCensus.ts";

/**
 * Records the main-thread census for a running session so a finished one can
 * be read back.
 *
 * The badge in {@link FpsCounter} answers the same question live, but only for
 * somebody watching it, and the sessions that need answering are the long
 * unattended ones nobody watches. This keeps a series instead.
 *
 * Two constraints shape it. The recorder runs on the same main thread it is
 * measuring, so it samples on a slow cadence and posts in batches — a request
 * per reading would add the very load the series exists to explain. And it must
 * not depend on the FPS badge being switched on, because the run that matters
 * is the one started and left alone.
 */

export interface PrismCensusReading {
  elapsedMs: number;
  capturedAt: string;
  fps: number | null;
  busyMsPerSecond: number | null;
  rafPending: number;
  intervalsLive: number;
  timeoutsPending: number;
  domElements: number | null;
  animationsRunning: number | null;
  heapMb: number | null;
  renderRates: readonly { name: string; perSecond: number }[];
}

export interface PrismCensusRecorderOptions {
  surface: "coffee" | "signal" | "debate" | "story";
  sessionId: string;
  /** Session start, so elapsed time is measured from the table, not page load. */
  startedAtMs: number;
  readCensus: () => PrismMainThreadCensus;
  readFrameRate: () => { fps: number | null; busyMsPerSecond: number | null };
  post: (batch: {
    surface: string;
    sessionId: string;
    samples: PrismCensusReading[];
  }) => Promise<unknown>;
  now: () => number;
  /** Readings per flush. The default trades one request a minute for detail. */
  flushEvery?: number;
}

export const PRISM_CENSUS_SAMPLE_INTERVAL_MS = 10_000;
const DEFAULT_FLUSH_EVERY = 6;
/** A flush that keeps failing must not grow an unbounded buffer. */
const MAX_BUFFERED_READINGS = 240;

export class PrismCensusRecorder {
  readonly #options: PrismCensusRecorderOptions;
  readonly #buffer: PrismCensusReading[] = [];
  #flushing: Promise<void> | null = null;
  #stopped = false;

  constructor(options: PrismCensusRecorderOptions) {
    this.#options = options;
  }

  /** Takes one reading. Safe to call after stopping; it simply does nothing. */
  sample(): void {
    if (this.#stopped) return;
    const census = this.#options.readCensus();
    const frameRate = this.#options.readFrameRate();
    const nowMs = this.#options.now();
    this.#buffer.push({
      elapsedMs: Math.max(0, Math.round(nowMs - this.#options.startedAtMs)),
      capturedAt: new Date(nowMs).toISOString(),
      fps: frameRate.fps,
      busyMsPerSecond: frameRate.busyMsPerSecond,
      rafPending: census.rafPending,
      intervalsLive: census.intervalsLive,
      timeoutsPending: census.timeoutsPending,
      domElements: census.domElements,
      animationsRunning: census.animationsRunning,
      heapMb: census.heapMb,
      renderRates: census.renderRates.map((rate) => ({ ...rate })),
    });
    // Drop the oldest rather than the newest: the end of a degrading session is
    // where the answer is.
    while (this.#buffer.length > MAX_BUFFERED_READINGS) this.#buffer.shift();
    if (this.#buffer.length >= (this.#options.flushEvery ?? DEFAULT_FLUSH_EVERY)) {
      void this.flush();
    }
  }

  /** Sends everything buffered. Concurrent calls share one in-flight request. */
  async flush(): Promise<void> {
    if (this.#flushing) return this.#flushing;
    if (this.#buffer.length === 0) return;
    const batch = this.#buffer.splice(0, this.#buffer.length);
    this.#flushing = (async () => {
      try {
        await this.#options.post({
          surface: this.#options.surface,
          sessionId: this.#options.sessionId,
          samples: batch,
        });
      } catch {
        // Diagnostics must never break the session that produced them. Put the
        // readings back so a later flush can carry them.
        this.#buffer.unshift(...batch);
        while (this.#buffer.length > MAX_BUFFERED_READINGS) this.#buffer.shift();
      } finally {
        this.#flushing = null;
      }
    })();
    return this.#flushing;
  }

  /** Final flush; further samples are ignored. */
  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    await this.flush();
  }

  get bufferedCount(): number {
    return this.#buffer.length;
  }
}
