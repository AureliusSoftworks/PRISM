/** Foreground work owns its result, not just the visibility of its loader. */
export function refractionAbortError(): DOMException {
  return new DOMException("Refraction cancelled. Regenerate the asset to try again.", "AbortError");
}

export function isRefractionAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const fullscreenSignals = new WeakMap<AbortSignal, string>();

/** For an existing custom fullscreen ritual that already owns its run counter. */
export function createPrismRefractionController(): AbortController {
  const controller = new AbortController();
  fullscreenSignals.set(controller.signal, crypto.randomUUID());
  return controller;
}

/** Explicit opt-in for endpoints also used by ordinary fields or soft jobs. */
export function prismRefractionRequestInit(init: RequestInit = {}): RequestInit {
  const requestOwner = init.signal ? fullscreenSignals.get(init.signal) : undefined;
  if (!requestOwner) return init;
  const headers = new Headers(init.headers);
  headers.set("x-prism-refraction", "1");
  headers.set("x-prism-refraction-id", requestOwner);
  return { ...init, headers };
}

// Compatibility for synchronous UI prop chains (e.g. Avatar Studio's numeric
// randomizers). Async handlers must capture this at entry, before their first
// await, and then pass the captured signal explicitly. This is never an async
// global context and cannot leak from one awaited invocation into another.
let invocationSignal: AbortSignal | undefined;
export function currentPrismRefractionInvocationSignal(): AbortSignal | undefined {
  return invocationSignal;
}
export function invokePrismRefractionAction<T>(signal: AbortSignal, action: () => T): T {
  signal.throwIfAborted();
  const previous = invocationSignal;
  invocationSignal = signal;
  try { return action(); } finally { invocationSignal = previous; }
}

/** Race non-cooperative providers too; their eventual result must never be applied. */
export async function waitForRefraction<T>(
  signal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason ?? refractionAbortError());
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    // Install both race handlers before calling work, including synchronous
    // throws / aborts from an adapter that does not return a promise normally.
    const pending = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work(signal);
    });
    const result = await Promise.race([pending, cancelled]);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

// Session-local, bounded, and content-free. Never infer ETA from an animated bar.
// Three comparable successful runs are required; noisy samples remain unknown.
export class RefractionDurationHistory {
  private samples = new Map<string, number[]>();

  record(key: string | undefined, durationMs: number): void {
    if (!key || !Number.isFinite(durationMs) || durationMs < 1_000) return;
    const samples = [...(this.samples.get(key) ?? []), durationMs].slice(-7);
    this.samples.delete(key);
    this.samples.set(key, samples);
    if (this.samples.size > 80) this.samples.delete(this.samples.keys().next().value!);
  }

  estimate(key?: string): number | null {
    const samples = key ? this.samples.get(key) : undefined;
    if (!samples || samples.length < 3) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    if (sorted[sorted.length - 1]! > sorted[0]! * 2) return null;
    return sorted[Math.floor(sorted.length / 2)]!;
  }
}

const durationHistory = new RefractionDurationHistory();

export interface PrismRefractionRun {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly estimatedDurationMs: number | null;
  /** Includes a cancelled run until its finally, but excludes an older run. */
  ownsSlot(): boolean;
  isCurrent(): boolean;
  assertCurrent(): void;
  wait<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>;
  cancel(): void;
  /** Returns whether this run still owns cleanup. Only success trains ETA. */
  finish(success?: boolean): boolean;
}

export class PrismRefractionRunOwner {
  private current: PrismRefractionRun | null = null;
  private nextId = 0;
  private readonly changed: (run: PrismRefractionRun | null) => void;
  private readonly history: RefractionDurationHistory;
  private readonly now: () => number;

  constructor(
    changed: (run: PrismRefractionRun | null) => void,
    history = durationHistory,
    now = Date.now,
  ) { this.changed = changed; this.history = history; this.now = now; }

  begin(options: { timingKey?: string; signal?: AbortSignal } = {}): PrismRefractionRun {
    const previous = this.current;
    const controller = createPrismRefractionController();
    const forwardAbort = (): void => run.cancel();
    const run: PrismRefractionRun = {
      id: ++this.nextId,
      signal: controller.signal,
      startedAt: this.now(),
      estimatedDurationMs: this.history.estimate(options.timingKey),
      ownsSlot: () => this.current === run,
      isCurrent: () => this.current === run && !controller.signal.aborted,
      assertCurrent: () => {
        controller.signal.throwIfAborted();
        if (this.current !== run) throw refractionAbortError();
      },
      wait: async (work) => {
        run.assertCurrent();
        const result = await waitForRefraction(controller.signal, work);
        run.assertCurrent();
        return result;
      },
      cancel: () => {
        if (controller.signal.aborted) return;
        controller.abort(refractionAbortError());
        if (this.current === run) this.changed(null);
      },
      finish: (success = false) => {
        options.signal?.removeEventListener("abort", forwardAbort);
        if (this.current !== run) return false;
        if (success && !controller.signal.aborted) {
          this.history.record(options.timingKey, this.now() - run.startedAt);
        }
        this.current = null;
        this.changed(null);
        // Closing a completed/failed run also revokes any accidentally detached
        // sibling work. A captured signal never stays valid beyond its owner.
        if (!controller.signal.aborted) controller.abort(refractionAbortError());
        // Abort listeners may synchronously start a replacement.
        return this.current === null;
      },
    };
    this.current = run;
    previous?.cancel();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    if (options.signal?.aborted) run.cancel();
    else if (run.isCurrent()) this.changed(run);
    return run;
  }

  cancel(): void { this.current?.cancel(); }

  dispose(): void {
    const current = this.current;
    this.current = null;
    current?.cancel();
    current?.finish();
  }
}
