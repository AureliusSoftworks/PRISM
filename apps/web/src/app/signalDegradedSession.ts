import type { BotcastReplayEvent } from "@localai/shared";

export const SIGNAL_DEGRADED_SESSION_TURN_THRESHOLD = 3;

function signalRecoveryTraceHadFailure(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const attempts = (value as Record<string, unknown>).attempts;
  return (
    Array.isArray(attempts) &&
    attempts.some(
      (attempt) =>
        attempt !== null &&
        typeof attempt === "object" &&
        !Array.isArray(attempt) &&
        ((attempt as Record<string, unknown>).outcome === "failed" ||
          (attempt as Record<string, unknown>).outcome === "rejected"),
    )
  );
}

/** Counts distinct on-air turns that required routing or deterministic repair. */
export function signalDegradedSessionTurnCount(
  events: readonly BotcastReplayEvent[],
): number {
  const degradedTurns = new Set<string>();
  for (const event of events) {
    if (event.kind !== "utterance") continue;
    const messageId =
      typeof event.payload.messageId === "string" && event.payload.messageId.trim()
        ? event.payload.messageId
        : event.id;
    const repair = event.payload.utteranceRepair;
    const repairedByRecovery =
      repair !== null &&
      typeof repair === "object" &&
      !Array.isArray(repair) &&
      (repair as Record<string, unknown>).source === "provider_recovery";
    const routedAfterFailure =
      signalRecoveryTraceHadFailure(event.payload.autoRecovery) ||
      signalRecoveryTraceHadFailure(event.payload.providerRecovery);
    if (
      event.payload.provider === "deterministic" ||
      repairedByRecovery ||
      routedAfterFailure
    ) {
      degradedTurns.add(messageId);
    }
  }
  return degradedTurns.size;
}

export function signalSessionIsDegraded(
  events: readonly BotcastReplayEvent[],
): boolean {
  return (
    signalDegradedSessionTurnCount(events) >=
    SIGNAL_DEGRADED_SESSION_TURN_THRESHOLD
  );
}
