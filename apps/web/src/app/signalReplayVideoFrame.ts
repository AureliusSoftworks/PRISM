import {
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastGuestHasDepartedAt,
  botcastHostHasDepartedAt,
  botcastListenerReactionForMessage,
  botcastReplayTimeline,
  resolveListenerReactionAtMs,
  type BotcastEpisode,
  type ReplayTimelineV1,
} from "@localai/shared";

export interface SignalReplayVideoFrameState {
  videoElapsedMs: number;
  eventElapsedMs: number;
  messageIndex: number;
  activeMessageIndexes: number[];
  messageStartMs: number;
  messageEndMs: number;
  shot: "left" | "right" | "wide";
  guestDeparted: boolean;
  hostDeparted: boolean;
}

function videoContentBounds(timeline: ReplayTimelineV1): {
  startMs: number;
  endMs: number;
} {
  const utterances = timeline.beats.filter((beat) => beat.kind === "utterance");
  const endBeat = timeline.beats.find((beat) => beat.kind === "end");
  return {
    startMs: utterances.at(0)?.startMs ?? 0,
    endMs: endBeat?.startMs ?? timeline.durationMs,
  };
}

/** Maps the rendered-video clock back onto Signal's persisted event clock. */
export function signalReplayVideoEventElapsedMs(args: {
  episode: BotcastEpisode;
  timeline: ReplayTimelineV1;
  videoElapsedMs: number;
}): number {
  const bounds = videoContentBounds(args.timeline);
  const directorTimeline = botcastReplayTimeline(
    args.episode.messages,
    args.episode.events,
  );
  const persistedRuntimeMs =
    args.episode.runtimeMs ??
    Date.parse(args.episode.completedAt ?? args.episode.updatedAt) -
      Date.parse(args.episode.startedAt);
  const runtimeMs = Math.max(
    1,
    Number.isFinite(persistedRuntimeMs)
      ? persistedRuntimeMs
      : directorTimeline.durationMs,
  );
  if (args.videoElapsedMs <= bounds.startMs) return 0;
  if (args.videoElapsedMs >= bounds.endMs) return runtimeMs;
  const utterances = args.timeline.beats.filter(
    (beat) => beat.kind === "utterance",
  );
  const activeBeat = utterances.find(
    (beat) =>
      args.videoElapsedMs >= beat.startMs && args.videoElapsedMs < beat.endMs,
  );
  if (activeBeat?.sourceMessageId) {
    const messageIndex = args.episode.messages.findIndex(
      (message) => message.id === activeBeat.sourceMessageId,
    );
    if (messageIndex >= 0) {
      const originalStartMs =
        directorTimeline.messageStartMs[messageIndex] ?? 0;
      const originalEndMs =
        directorTimeline.messageEndMs[messageIndex] ?? originalStartMs;
      const progress =
        (args.videoElapsedMs - activeBeat.startMs) /
        Math.max(1, activeBeat.endMs - activeBeat.startMs);
      return Math.max(
        0,
        Math.min(
          runtimeMs,
          originalStartMs + (originalEndMs - originalStartMs) * progress,
        ),
      );
    }
  }
  let previousBeat: (typeof utterances)[number] | undefined;
  for (const beat of utterances) {
    if (beat.endMs <= args.videoElapsedMs) previousBeat = beat;
  }
  const nextBeat = utterances.find(
    (beat) => beat.startMs > args.videoElapsedMs,
  );
  const originalBoundary = (
    beat: (typeof utterances)[number] | undefined,
    edge: "start" | "end",
  ): number | null => {
    if (!beat?.sourceMessageId) return null;
    const index = args.episode.messages.findIndex(
      (message) => message.id === beat.sourceMessageId,
    );
    if (index < 0) return null;
    return edge === "start"
      ? (directorTimeline.messageStartMs[index] ?? null)
      : (directorTimeline.messageEndMs[index] ?? null);
  };
  const originalStartMs = originalBoundary(previousBeat, "end") ?? 0;
  const originalEndMs = originalBoundary(nextBeat, "start") ?? runtimeMs;
  const videoStartMs = previousBeat?.endMs ?? bounds.startMs;
  const videoEndMs = nextBeat?.startMs ?? bounds.endMs;
  const progress =
    (args.videoElapsedMs - videoStartMs) /
    Math.max(1, videoEndMs - videoStartMs);
  return Math.max(
    0,
    Math.min(
      runtimeMs,
      originalStartMs + (originalEndMs - originalStartMs) * progress,
    ),
  );
}

/**
 * Produces the exact stage state needed by the hidden faithful-video renderer.
 * Speech follows the frozen replay-audio timeline while cameras and departures
 * follow the persisted Signal production clock.
 */
export function signalReplayVideoFrameState(args: {
  episode: BotcastEpisode;
  timeline: ReplayTimelineV1;
  videoElapsedMs: number;
}): SignalReplayVideoFrameState {
  const videoElapsedMs = Math.max(
    0,
    Math.min(args.timeline.durationMs, args.videoElapsedMs),
  );
  const eventElapsedMs = signalReplayVideoEventElapsedMs({
    ...args,
    videoElapsedMs,
  });
  const activeBeats = args.timeline.beats.filter(
    (beat) =>
      beat.kind === "utterance" &&
      videoElapsedMs >= beat.startMs &&
      videoElapsedMs < beat.endMs,
  );
  const activeMessageIndexes = args.episode.messages.flatMap((message, index) =>
    activeBeats.some((beat) => beat.sourceMessageId === message.id) ? [index] : [],
  );
  const primaryBeat =
    activeBeats.find((beat) => beat.channel !== "crosstalk") ??
    activeBeats.at(-1) ??
    null;
  const messageIndex = primaryBeat?.sourceMessageId
    ? args.episode.messages.findIndex(
        (message) => message.id === primaryBeat.sourceMessageId,
      )
    : -1;
  const activeMessage =
    messageIndex >= 0 ? (args.episode.messages[messageIndex] ?? null) : null;
  const messageStartMs = primaryBeat?.startMs ?? videoElapsedMs;
  const messageEndMs = primaryBeat?.endMs ?? videoElapsedMs + 1;
  const baseShot = botcastCameraShotAt({
    events: args.episode.events,
    elapsedMs: eventElapsedMs,
  });
  const listenerReactionPlan = activeMessage
    ? botcastListenerReactionForMessage(args.episode.events, activeMessage.id)
    : null;
  const reactionAtMs =
    activeMessage && listenerReactionPlan
      ? resolveListenerReactionAtMs({
          text: activeMessage.content,
          durationMs: Math.max(1, messageEndMs - messageStartMs),
          targetProgress: listenerReactionPlan.targetProgress,
        })
      : null;
  const reactionCameraActive = Boolean(
    activeMessage &&
      listenerReactionPlan?.cameraCutEligible &&
      reactionAtMs !== null &&
      botcastCameraModeAt({
        events: args.episode.events,
        elapsedMs: eventElapsedMs,
      }) === "auto" &&
      videoElapsedMs - messageStartMs >= reactionAtMs &&
      videoElapsedMs - messageStartMs <= reactionAtMs + 1_200,
  );
  const shot = reactionCameraActive
    ? listenerReactionPlan?.listenerBotId === args.episode.hostBotId
      ? "left"
      : "right"
    : baseShot;
  return {
    videoElapsedMs,
    eventElapsedMs,
    messageIndex,
    activeMessageIndexes,
    messageStartMs,
    messageEndMs,
    shot,
    guestDeparted: botcastGuestHasDepartedAt(
      args.episode.events,
      eventElapsedMs,
    ),
    hostDeparted: botcastHostHasDepartedAt(
      args.episode.events,
      eventElapsedMs,
    ),
  };
}
