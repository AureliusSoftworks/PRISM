import type { DebateSessionV1 } from "@localai/shared";

const DEBATE_REVISION_CONFLICT_PATTERN =
  /^(?:Debate changed from revision \d+ to \d+|Debate changed while .+)\. Refresh and retry\.$/u;

export function debateRequestIsRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    DEBATE_REVISION_CONFLICT_PATTERN.test(error.message)
  );
}

export type DebateArchiveOpenMutationKind =
  | "resume-spectator-bake"
  | "pause-return-recess"
  | "spectator-ready-hold";

/**
 * Archive Open owns a very small concurrency exception: a Spectator bake may
 * persist its append-only progress while the title card is still arriving.
 * Re-open only retries the exact lifecycle transition that is still valid on
 * the latest durable session; all other optimistic mutations keep failing
 * normally on a stale revision.
 */
export function debateArchiveOpenCanRebaseMutation(
  previous: DebateSessionV1,
  refreshed: DebateSessionV1,
  kind: DebateArchiveOpenMutationKind,
): boolean {
  if (
    previous.id !== refreshed.id ||
    refreshed.revision <= previous.revision
  ) {
    return false;
  }
  if (kind === "resume-spectator-bake") {
    return (
      previous.playerRole === "spectator" &&
      previous.status === "paused" &&
      refreshed.playerRole === "spectator" &&
      refreshed.status === "paused" &&
      refreshed.stepKey === previous.stepKey &&
      refreshed.pausedPresentationEventId === previous.pausedPresentationEventId &&
      refreshed.liveBake?.status !== "ready"
    );
  }
  if (kind === "spectator-ready-hold") {
    return (
      previous.playerRole === "spectator" &&
      (previous.status === "live" || previous.status === "waiting_for_player") &&
      (refreshed.status === "live" ||
        refreshed.status === "waiting_for_player" ||
        (refreshed.status === "paused" &&
          refreshed.pausedPresentationEventId == null))
    );
  }
  return (
    (previous.status === "live" || previous.status === "waiting_for_player") &&
    (refreshed.status === "live" ||
      refreshed.status === "waiting_for_player" ||
      refreshed.status === "paused")
  );
}

/**
 * A competing prep write may have already finished the lifecycle transition
 * we were about to retry. Adopt that canonical session instead of repeating
 * pause/resume and colliding with "already paused" / "not paused".
 */
export function debateArchiveOpenShouldAdoptRefreshed(
  refreshed: DebateSessionV1,
  kind: DebateArchiveOpenMutationKind,
): boolean {
  if (kind === "resume-spectator-bake") {
    return refreshed.status !== "paused" && refreshed.status !== "cancelled";
  }
  if (kind === "spectator-ready-hold") {
    return (
      refreshed.status === "paused" &&
      refreshed.pausedPresentationEventId == null
    );
  }
  return refreshed.status === "paused";
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
