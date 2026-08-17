import {
  debateEventIsAtmosphericVocalFoley,
  debateEventIsTranscriptHousekeeping,
  type DebateEventV1,
  type DebateSessionV1,
} from "@localai/shared";

export type DebateTurnCheckpointV1 = {
  id: string;
  label: string;
  eventId: string;
  sequence: number;
  stepKey: string;
};

type DebateTurnCheckpointBucket = {
  id: string;
  label: string;
  match: (stepKey: string) => boolean;
};

const DEBATE_TURN_CHECKPOINT_BUCKETS: readonly DebateTurnCheckpointBucket[] = [
  {
    id: "intro",
    label: "Intro",
    match: (stepKey) =>
      stepKey === "intro" || stepKey === "turnabout_intro",
  },
  {
    id: "opening_for",
    label: "For opening",
    match: (stepKey) =>
      stepKey === "opening_for" ||
      stepKey === "opening_for_player" ||
      stepKey === "turnabout_testimony_for",
  },
  {
    id: "opening_against",
    label: "Against opening",
    match: (stepKey) =>
      stepKey === "opening_against" ||
      stepKey === "opening_against_player" ||
      stepKey === "turnabout_testimony_against",
  },
  {
    id: "challenge_for",
    label: "For challenge",
    match: (stepKey) =>
      stepKey.startsWith("challenge_for") ||
      stepKey === "challenge_judge_question" ||
      stepKey === "turnabout_spectator_press",
  },
  {
    id: "challenge_against",
    label: "Against challenge",
    match: (stepKey) =>
      stepKey.startsWith("challenge_against") ||
      stepKey === "challenge_opponent_prompt" ||
      stepKey === "challenge_opponent_answer",
  },
  {
    id: "rebuttal_for",
    label: "For rebuttal",
    match: (stepKey) =>
      stepKey === "moderator_to_rebuttal" ||
      stepKey.startsWith("rebuttal_for"),
  },
  {
    id: "rebuttal_against",
    label: "Against rebuttal",
    match: (stepKey) => stepKey.startsWith("rebuttal_against"),
  },
  {
    id: "closing_for",
    label: "For closing",
    match: (stepKey) =>
      stepKey === "closing_for" || stepKey === "closing_for_player",
  },
  {
    id: "closing_against",
    label: "Against closing",
    match: (stepKey) =>
      stepKey === "closing_against" || stepKey === "closing_against_player",
  },
  {
    id: "jury",
    label: "Jury",
    match: (stepKey) =>
      stepKey.startsWith("jury_initial_") ||
      stepKey.startsWith("jury_deliberation_") ||
      stepKey.startsWith("jury_final_") ||
      stepKey === "jury_moderator_ballot" ||
      stepKey === "moderator_to_jury",
  },
  {
    id: "verdict",
    label: "Verdict",
    match: (stepKey) =>
      stepKey === "jury_verdict" ||
      stepKey === "verdict" ||
      stepKey === "completed",
  },
];

function debateTurnCheckpointEventEligible(event: DebateEventV1): boolean {
  if (debateEventIsTranscriptHousekeeping(event)) return false;
  if (debateEventIsAtmosphericVocalFoley(event)) return false;
  if (event.stepKey.startsWith("jury_sidebar_")) return false;
  if (
    event.kind === "phase" ||
    event.kind === "case_board" ||
    event.kind === "error" ||
    event.kind === "silence"
  ) {
    return false;
  }
  return typeof event.content === "string" && event.content.trim().length > 0;
}

/**
 * One chapter per major floor turn, anchored to the first spoken event in that
 * bucket. Bake-ahead may already contain later turns; the title card can start
 * the viewer at any of them without regenerating the proceeding.
 */
export function debateTurnCheckpointsFromSession(
  session: Pick<DebateSessionV1, "events">,
): DebateTurnCheckpointV1[] {
  const eligible = session.events
    .filter(debateTurnCheckpointEventEligible)
    .slice()
    .sort((left, right) => left.sequence - right.sequence);
  const checkpoints: DebateTurnCheckpointV1[] = [];
  const usedIds = new Set<string>();
  for (const event of eligible) {
    const bucket = DEBATE_TURN_CHECKPOINT_BUCKETS.find((candidate) =>
      candidate.match(event.stepKey),
    );
    if (!bucket || usedIds.has(bucket.id)) continue;
    usedIds.add(bucket.id);
    checkpoints.push({
      id: bucket.id,
      label: bucket.label,
      eventId: event.id,
      sequence: event.sequence,
      stepKey: event.stepKey,
    });
  }
  return checkpoints;
}

/** Latest chapter whose start is at or before the viewer's bookmark. */
export function debateTurnCheckpointForEventId(
  checkpoints: readonly DebateTurnCheckpointV1[],
  eventId: string | null | undefined,
  events: readonly DebateEventV1[],
): DebateTurnCheckpointV1 | null {
  if (!eventId || checkpoints.length === 0) return checkpoints[0] ?? null;
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) {
    return checkpoints.find((checkpoint) => checkpoint.eventId === eventId) ??
      checkpoints[0] ??
      null;
  }
  let current: DebateTurnCheckpointV1 | null = null;
  for (const checkpoint of checkpoints) {
    if (checkpoint.sequence <= event.sequence) current = checkpoint;
    else break;
  }
  return current ?? checkpoints[0] ?? null;
}

export function debateTurnCheckpointEvent(
  session: Pick<DebateSessionV1, "events">,
  eventId: string | null | undefined,
): DebateEventV1 | null {
  if (!eventId) return null;
  return session.events.find((event) => event.id === eventId) ?? null;
}
