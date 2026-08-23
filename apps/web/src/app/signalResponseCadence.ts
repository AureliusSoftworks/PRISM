export const SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS = 1_000;
export const SIGNAL_EXTRA_RESPONSE_PAUSE_MAX_MS = 5_000;

/** Public presentation time only; provider generation is already complete. */
export function signalExtraResponsePauseMs(
  random: () => number = Math.random,
): number {
  const value = random();
  const sample = Number.isFinite(value) ? value : 0;
  return Math.round(
    SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS +
      Math.max(0, Math.min(1, sample)) *
        (SIGNAL_EXTRA_RESPONSE_PAUSE_MAX_MS - SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS),
  );
}

export function waitForSignalResponseCadence(
  durationMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => finish(true), Math.max(0, durationMs));
    const onAbort = (): void => finish(false);
    function finish(completed: boolean): void {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(completed);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
