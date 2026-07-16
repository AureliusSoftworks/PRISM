export type CoffeeSessionClockPhase =
  | "selecting"
  | "preview"
  | "topic"
  | "arriving"
  | "live"
  | "finished";

export function coffeeSessionClockShouldTick(
  conversationId: string | null | undefined,
  phase: CoffeeSessionClockPhase
): boolean {
  return conversationId != null && (phase === "arriving" || phase === "live");
}

export function coffeeSessionEndsAtAfterPausedClockTick(
  endsAtMs: number | null | undefined,
  tickMs = 1000
): number | null {
  if (typeof endsAtMs !== "number" || !Number.isFinite(endsAtMs)) return null;
  const elapsedMs = Number.isFinite(tickMs) ? Math.max(0, tickMs) : 0;
  return endsAtMs + elapsedMs;
}

export interface CoffeeSessionClockReconciliation {
  elapsedMs: number;
  nextEndsAtMs: number | null;
  shouldFinish: boolean;
  shouldUpdate: boolean;
}

/**
 * Reconciles Coffee against elapsed wall time after a normal tick, focus
 * restoration, or system sleep. Paused sessions keep their remaining time;
 * active expired sessions finish without attempting to replay missed turns.
 */
export function reconcileCoffeeSessionClock(args: {
  previousTickAtMs: number;
  nowMs: number;
  endsAtMs: number | null | undefined;
  countdownPaused: boolean;
  minimumElapsedMs?: number;
}): CoffeeSessionClockReconciliation {
  const nowMs = Number.isFinite(args.nowMs) ? args.nowMs : 0;
  const previousTickAtMs = Number.isFinite(args.previousTickAtMs)
    ? Math.min(args.previousTickAtMs, nowMs)
    : nowMs;
  const elapsedMs = Math.max(0, nowMs - previousTickAtMs);
  const minimumElapsedMs = Number.isFinite(args.minimumElapsedMs)
    ? Math.max(0, args.minimumElapsedMs ?? 0)
    : 0;
  const currentEndsAtMs =
    typeof args.endsAtMs === "number" && Number.isFinite(args.endsAtMs)
      ? args.endsAtMs
      : null;

  if (elapsedMs < minimumElapsedMs) {
    return {
      elapsedMs,
      nextEndsAtMs: currentEndsAtMs,
      shouldFinish: false,
      shouldUpdate: false,
    };
  }

  const nextEndsAtMs = args.countdownPaused
    ? coffeeSessionEndsAtAfterPausedClockTick(currentEndsAtMs, elapsedMs)
    : currentEndsAtMs;
  return {
    elapsedMs,
    nextEndsAtMs,
    shouldFinish:
      !args.countdownPaused &&
      nextEndsAtMs !== null &&
      nowMs >= nextEndsAtMs,
    shouldUpdate: true,
  };
}
