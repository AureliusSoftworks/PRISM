import {
  debateResolvedEvidenceText,
  type DebateEventV1,
  type DebateSessionListItemV1,
  type DebateSessionV1,
} from "@localai/shared";

type DebateJuryRecordSession = Pick<
  DebateSessionV1,
  "id" | "motion" | "playerRole" | "jury" | "events" | "evidence"
>;

type DebateArchivedJuryRecord = Pick<
  DebateSessionListItemV1,
  "status" | "juryEnabled" | "playerRole"
>;

export function debateArchivedJuryRecordIsCopyable(
  session: DebateArchivedJuryRecord,
): boolean {
  return (
    session.status === "completed" &&
    session.juryEnabled &&
    session.playerRole !== "participant"
  );
}

export function debateEventIsJuryComment(event: DebateEventV1): boolean {
  return (
    event.speakerKind === "juror" &&
    (event.kind === "jury_deliberation" || event.kind === "reaction")
  );
}

export function debateEventIsJurySidebarComment(event: DebateEventV1): boolean {
  return (
    debateEventIsJuryComment(event) &&
    event.kind === "jury_deliberation" &&
    event.stepKey.startsWith("jury_sidebar_")
  );
}

export function debateJuryCommentEvents(
  session: DebateJuryRecordSession,
): DebateEventV1[] {
  if (session.playerRole === "participant") return [];
  return session.events
    .filter(debateEventIsJuryComment)
    .sort((left, right) => left.sequence - right.sequence);
}

/** Comments the player has already reached — never spoil a Spectator bake. */
export function debateHeardJuryCommentEvents(
  session: DebateJuryRecordSession,
  heardThroughSequence: number | null,
  options?: { revealAll?: boolean },
): DebateEventV1[] {
  if (options?.revealAll) return debateJuryCommentEvents(session);
  if (heardThroughSequence == null) return [];
  return debateJuryCommentEvents(session).filter(
    (event) => event.sequence <= heardThroughSequence,
  );
}

export function debateLatestPendingJuryComment(
  session: DebateJuryRecordSession,
  playedEventIds: ReadonlySet<string>,
): DebateEventV1 | null {
  if (
    session.playerRole === "participant" ||
    session.jury.phase !== "waiting"
  ) {
    return null;
  }
  const latest = [...session.events]
    .reverse()
    .find(debateEventIsJurySidebarComment);
  if (!latest || playedEventIds.has(latest.id)) return null;
  return latest;
}

export function debateJuryCommentKindLabel(event: DebateEventV1): string {
  if (event.kind === "reaction") return "Vocal reaction";
  return debateEventIsJurySidebarComment(event)
    ? "Between-turn thought"
    : "Jury deliberation";
}

export function debateJuryCommentSpeakerName(
  session: DebateJuryRecordSession,
  event: DebateEventV1,
): string {
  return (
    session.jury.jurors.find((juror) => juror.id === event.speakerBotId)
      ?.name ?? "Juror"
  );
}

export function debateJuryCommentClockLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatDebateJuryRecord(
  session: DebateJuryRecordSession,
): string {
  if (session.playerRole === "participant") {
    return "Jury record sealed for participants.";
  }
  const comments = debateJuryCommentEvents(session);
  return [
    "# PRISM Debate — Jury Record",
    "",
    `- Session: ${session.id}`,
    `- Motion: ${session.motion.motion}`,
    "",
    "Timestamped comments",
    "",
    ...(comments.length > 0
      ? comments.flatMap((event) => [
          `[${event.createdAt}] ${debateJuryCommentSpeakerName(session, event)} · ${debateJuryCommentKindLabel(event)}`,
          debateResolvedEvidenceText(event.content, session.evidence),
          "",
        ])
      : ["No juror comments were recorded."]),
  ]
    .join("\n")
    .trim();
}
