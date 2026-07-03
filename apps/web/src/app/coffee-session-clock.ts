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
  return endsAtMs + tickMs;
}
