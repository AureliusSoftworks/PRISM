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
  const videoElapsedMs = Math.max(
    0,
    Math.min(args.timeline.durationMs, args.videoElapsedMs),
  );
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
  const activeBeat = [...utteranceBeats]
    .reverse()
    .find(
      (beat) =>
        videoElapsedMs >= beat.startMs && videoElapsedMs < beat.endMs,
    );
  if (activeBeat?.sourceMessageId) {
    const messageIndex =
      messageIndexById.get(activeBeat.sourceMessageId) ?? firstMessageIndex;
    const message = args.messages[messageIndex];
    const fullLength = message
      ? Math.max(0, args.displayLengthForMessage(message))
      : 0;
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
  const previousBeat = [...utteranceBeats]
    .reverse()
    .find((beat) => videoElapsedMs >= beat.endMs);
  const messageIndex = previousBeat?.sourceMessageId
    ? (messageIndexById.get(previousBeat.sourceMessageId) ?? firstMessageIndex)
    : firstMessageIndex;
  const message = args.messages[messageIndex];
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
      previousBeat && message
        ? Math.max(0, args.displayLengthForMessage(message))
        : 0,
    activeSpeakerId: null,
  };
}
