import type { DebateSessionV1 } from "@localai/shared";

const DEBATE_REVISION_CONFLICT_PATTERN =
  /^(?:Debate changed from revision \d+ to \d+|Debate changed while .+)\. Refresh and retry\.$/u;

export function debateRequestIsRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    DEBATE_REVISION_CONFLICT_PATTERN.test(error.message)
  );
}

function automaticAdvanceFloorSnapshot(session: DebateSessionV1): string {
  const floor: Partial<DebateSessionV1> = { ...session };
  delete floor.revision;
  delete floor.updatedAt;
  // Live exhibit art and the scoreless case board can finish in the
  // background without changing who owns the floor.
  delete floor.evidence;
  delete floor.caseBoard;
  delete floor.synopsis;
  delete floor.events;
  return JSON.stringify({
    floor,
    // Delayed case-board history is transcript housekeeping, not a new turn.
    events: session.events.filter((event) => event.kind !== "case_board"),
  });
}

/**
 * A stale automatic advance is safe to retry once only when the refreshed
 * session still describes the exact same live floor. If another action moved
 * the proceeding, the client must adopt that canonical result instead.
 */
export function debateCanRetryStaleAutomaticAdvance(
  previous: DebateSessionV1,
  refreshed: DebateSessionV1,
): boolean {
  return (
    previous.id === refreshed.id &&
    refreshed.revision > previous.revision &&
    automaticAdvanceFloorSnapshot(previous) ===
      automaticAdvanceFloorSnapshot(refreshed)
  );
}
