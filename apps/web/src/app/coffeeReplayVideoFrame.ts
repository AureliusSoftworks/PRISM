import type { ReplayTimelineV1 } from "@localai/shared";

export type CoffeeReplayVideoPhase = "title" | "table" | "end";

export interface CoffeeReplayVideoFrameState {
  videoElapsedMs: number;
  phase: CoffeeReplayVideoPhase;
  messageIndex: number;
  visibleLength: number;
  activeSpeakerId: string | null;
}

export function coffeeReplayVideoFrameState<T extends { id: string }>(args: {
  messages: readonly T[];
  timeline: ReplayTimelineV1;
  videoElapsedMs: number;
  displayLengthForMessage: (message: T) => number;
}): CoffeeReplayVideoFrameState {
  return createCoffeeReplayVideoFrameSampler(args)(args.videoElapsedMs);
}

/** Rebuild only when the saved messages/timeline change, never per audio frame. */
export function createCoffeeReplayVideoFrameSampler<T extends { id: string }>(args: {
  messages: readonly T[];
  timeline: ReplayTimelineV1;
  displayLengthForMessage: (message: T) => number;
}): (elapsedMs: number) => CoffeeReplayVideoFrameState {
  const messageIndexById = new Map(
    args.messages.map((message, index) => [message.id, index]),
  );
  const utteranceBeats = args.timeline.beats
    .filter(
      (beat) =>
        beat.kind === "utterance" &&
        beat.sourceMessageId &&
        messageIndexById.has(beat.sourceMessageId),
    )
    .sort((left, right) => left.startMs - right.startMs);
  const endBeat = args.timeline.beats.find((beat) => beat.kind === "end");
  const firstMessageIndex =
    utteranceBeats.length > 0
      ? (messageIndexById.get(utteranceBeats[0]!.sourceMessageId!) ?? 0)
      : 0;
  // A prefix maximum lets an inactive interval terminate the backwards search
  // without skipping an earlier, still-audible overlapping speaker.
  const latestEndMs: number[] = [];
  let latestEnd = -Infinity;
  for (const beat of utteranceBeats) {
    latestEnd = Math.max(latestEnd, beat.endMs);
    latestEndMs.push(latestEnd);
  }
  const lengths = new Map<number, number>();
  const displayLengthAt = (index: number): number => {
    if (!lengths.has(index)) {
      const message = args.messages[index];
      lengths.set(index, message ? Math.max(0, args.displayLengthForMessage(message)) : 0);
    }
    return lengths.get(index)!;
  };
  return (elapsedMs) => {
    const videoElapsedMs = Math.max(0, Math.min(args.timeline.durationMs, elapsedMs));
    let low = 0;
    let high = utteranceBeats.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (utteranceBeats[middle]!.startMs <= videoElapsedMs) low = middle + 1;
      else high = middle;
    }
    let activeBeat: (typeof utteranceBeats)[number] | undefined;
    for (let index = low - 1; index >= 0; index -= 1) {
      if (latestEndMs[index]! <= videoElapsedMs) break;
      const beat = utteranceBeats[index]!;
      if (videoElapsedMs < beat.endMs) {
        activeBeat = beat;
        break;
      }
    }
    if (activeBeat?.sourceMessageId) {
      const messageIndex =
        messageIndexById.get(activeBeat.sourceMessageId) ?? firstMessageIndex;
      const fullLength = displayLengthAt(messageIndex);
      const progress =
        (videoElapsedMs - activeBeat.startMs) /
        Math.max(1, activeBeat.endMs - activeBeat.startMs);
      return {
        videoElapsedMs,
        phase: "table",
        messageIndex,
        visibleLength: Math.min(
          fullLength,
          Math.max(0, Math.round(fullLength * progress)),
        ),
        activeSpeakerId: activeBeat.speakerId,
      };
    }
    const previousBeat = utteranceBeats[low - 1];
    const messageIndex = previousBeat?.sourceMessageId
      ? (messageIndexById.get(previousBeat.sourceMessageId) ?? firstMessageIndex)
      : firstMessageIndex;
    return {
      videoElapsedMs,
      phase:
        endBeat && videoElapsedMs >= endBeat.startMs
          ? "end"
          : previousBeat
            ? "table"
            : "title",
      messageIndex,
      visibleLength:
        previousBeat ? displayLengthAt(messageIndex) : 0,
      activeSpeakerId: null,
    };
  };
}
