import {
  heardBotPresenceBeatTextV1,
  type BotPresenceBeatV1,
  type DebateEventV1,
} from "@localai/shared";

export type DebateTranscriptTimelineEntry =
  | {
      kind: "event";
      id: string;
      createdAt: string;
      event: DebateEventV1;
    }
  | {
      kind: "vocal-cue";
      id: string;
      createdAt: string;
      beat: BotPresenceBeatV1;
    };

/**
 * Interleave heard response cues with the proceedings that surrounded them.
 * Cues are presentation provenance, not canonical Debate speech, so callers
 * render them as compact notation rather than transcript utterances.
 */
export function debateTranscriptTimelineEntries(args: {
  events: readonly DebateEventV1[];
  presenceBeats: readonly BotPresenceBeatV1[];
  currentResponseId?: string | null;
}): DebateTranscriptTimelineEntry[] {
  const latestVisibleEventAt = args.events.reduce<string | null>(
    (latest, event) =>
      latest === null || event.createdAt > latest ? event.createdAt : latest,
    null,
  );
  const entries: DebateTranscriptTimelineEntry[] = args.events.map(
    (event) => ({
      kind: "event",
      id: event.id,
      createdAt: event.createdAt,
      event,
    }),
  );

  for (const beat of args.presenceBeats) {
    const heard = heardBotPresenceBeatTextV1(beat).trim();
    const isCurrent = beat.responseId === args.currentResponseId;
    const occurred = beat.completion === "playing" || heard.length > 0;
    const reachedInTimeline =
      latestVisibleEventAt !== null && beat.createdAt <= latestVisibleEventAt;
    if (!occurred || (!isCurrent && !reachedInTimeline)) continue;
    entries.push({
      kind: "vocal-cue",
      id: beat.id,
      createdAt: beat.createdAt,
      beat,
    });
  }

  return entries.sort((left, right) => {
    const chronological = left.createdAt.localeCompare(right.createdAt);
    if (chronological !== 0) return chronological;
    if (left.kind !== right.kind) return left.kind === "event" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}
