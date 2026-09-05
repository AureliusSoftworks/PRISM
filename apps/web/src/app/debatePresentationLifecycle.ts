/** Give up only when voice never starts. Long spoken lines must outlast this. */
export const DEBATE_PRESENTATION_STALL_TIMEOUT_MS = 12_000;
/** Slow TTS can take this long before the first heard sample. */
export const DEBATE_PRESENTATION_FIRST_VOICE_STALL_MS = 45_000;
/** Extra room after the spoken estimate so slow TTS does not jump the line. */
export const DEBATE_PRESENTATION_COMPLETION_GRACE_MS = 8_000;
/** Hard ceiling so a hung callback cannot hide a finished Debate forever. */
export const DEBATE_PRESENTATION_CALLBACK_MAX_MS = 90_000;

/** @deprecated Use DEBATE_PRESENTATION_STALL_TIMEOUT_MS; kept as the default stall floor. */
export const DEBATE_PRESENTATION_CALLBACK_TIMEOUT_MS =
  DEBATE_PRESENTATION_STALL_TIMEOUT_MS;

/**
 * Wait at least the stall floor, and at least the spoken estimate plus grace,
 * so a 20–60s line is not cut off by the 12s hung-callback safety net.
 */
export function debatePresentationCallbackTimeoutMs(
  estimatedDurationMs: number,
): number {
  const estimate = Math.max(0, Math.round(estimatedDurationMs));
  return Math.min(
    DEBATE_PRESENTATION_CALLBACK_MAX_MS,
    Math.max(
      DEBATE_PRESENTATION_STALL_TIMEOUT_MS,
      Math.round(estimate * 1.25) + DEBATE_PRESENTATION_COMPLETION_GRACE_MS,
    ),
  );
}

/**
 * Presentation is best-effort after a Debate event has persisted. Resolve a
 * stalled voice callback as an unplayed line so the deterministic reveal path
 * can finish, including on throttled or low-frame-rate clients.
 */
export interface DebatePresentationCallbackOptions {
  stallMs?: number;
  maxMs?: number;
  lastProgressAtMs?: () => number;
}

export function settleDebatePresentationCallback(
  playback: Promise<boolean> | undefined,
  timeoutMsOrOptions:
    | number
    | DebatePresentationCallbackOptions = DEBATE_PRESENTATION_CALLBACK_TIMEOUT_MS,
): Promise<boolean> {
  if (!playback) return Promise.resolve(false);
  const options =
    typeof timeoutMsOrOptions === "number"
      ? { stallMs: timeoutMsOrOptions }
      : timeoutMsOrOptions;
  const stallMs = Math.max(
    1,
    Math.round(options.stallMs ?? DEBATE_PRESENTATION_CALLBACK_TIMEOUT_MS),
  );
  const maxMs = Math.max(
    stallMs,
    Math.round(options.maxMs ?? DEBATE_PRESENTATION_CALLBACK_MAX_MS),
  );
  const lastProgressAtMs = options.lastProgressAtMs;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const startedAt = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const finish = (played: boolean): void => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
      resolve(played);
    };
    if (lastProgressAtMs) {
      intervalId = setInterval(() => {
        if (settled) return;
        const now = Date.now();
        if (now - startedAt >= maxMs) {
          finish(false);
          return;
        }
        const lastProgress = lastProgressAtMs();
        const voiceHasStarted = Number.isFinite(lastProgress) && lastProgress > 0;
        // Before the first heard sample, a slow TTS start is not a stall.
        // After voice has started, wait for onEnd or the hard ceiling.
        if (!voiceHasStarted && now - startedAt >= stallMs) finish(false);
      }, 250);
    } else {
      timeoutId = setTimeout(() => finish(false), stallMs);
    }
    void playback.then(
      (played) => finish(played),
      () => finish(false),
    );
  });
}
