export class SignalAdvanceOperationBusyError extends Error {
  public constructor() {
    super("A Signal advance is already running for this episode.");
    this.name = "SignalAdvanceOperationBusyError";
  }
}

export class SignalAdvanceOperationSupersededError extends Error {
  public constructor() {
    super("Signal advance superseded by a newer run.");
    this.name = "SignalAdvanceOperationSupersededError";
  }
}

export class SignalAdvanceOperationTimeoutError extends Error {
  public readonly timeoutMs: number;

  public constructor(timeoutMs: number) {
    super("Signal advance timed out.");
    this.name = "SignalAdvanceOperationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface SignalAdvanceOperationRun {
  key: string;
  runId: number;
  controller: AbortController;
}

/**
 * Owns the one mutable Signal advance for an episode. Interruptions may
 * replace that owner; ordinary advances cannot. Identity-checked cleanup keeps
 * a stale run from deleting or recovering the newer run that replaced it.
 */
export class SignalAdvanceOperationRegistry {
  readonly #active = new Map<string, SignalAdvanceOperationRun>();
  #nextRunId = 0;

  public begin(key: string, options: { preempt: boolean }): SignalAdvanceOperationRun {
    const current = this.#active.get(key);
    if (current && !options.preempt) {
      throw new SignalAdvanceOperationBusyError();
    }
    if (current) {
      current.controller.abort(new SignalAdvanceOperationSupersededError());
    }
    const run: SignalAdvanceOperationRun = {
      key,
      runId: ++this.#nextRunId,
      controller: new AbortController(),
    };
    this.#active.set(key, run);
    return run;
  }

  public isCurrent(run: SignalAdvanceOperationRun): boolean {
    return this.#active.get(run.key) === run;
  }

  public finish(run: SignalAdvanceOperationRun): void {
    if (this.isCurrent(run)) this.#active.delete(run.key);
  }

  /** Cancels the current owned run without letting stale cleanup touch a successor. */
  public cancel(key: string, reason?: unknown): boolean {
    const current = this.#active.get(key);
    if (!current) return false;
    current.controller.abort(
      reason ?? new DOMException("Signal advance cancelled.", "AbortError"),
    );
    this.#active.delete(key);
    return true;
  }

  public async run<T>(
    run: SignalAdvanceOperationRun,
    work: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const boundedTimeoutMs = Math.max(1, Math.round(timeoutMs));
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let rejectCancellation!: (reason?: unknown) => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const rejectForAbort = (): void => {
      rejectCancellation(
        run.controller.signal.reason ??
          new DOMException("Signal advance cancelled.", "AbortError"),
      );
    };
    if (run.controller.signal.aborted) rejectForAbort();
    else {
      run.controller.signal.addEventListener("abort", rejectForAbort, {
        once: true,
      });
    }
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new SignalAdvanceOperationTimeoutError(boundedTimeoutMs);
        run.controller.abort(error);
        reject(error);
      }, boundedTimeoutMs);
    });
    try {
      return await Promise.race([
        Promise.resolve().then(() => work(run.controller.signal)),
        cancellation,
        timeout,
      ]);
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      run.controller.signal.removeEventListener("abort", rejectForAbort);
    }
  }
}
