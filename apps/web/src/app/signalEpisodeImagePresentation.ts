import {
  botcastImageContextForMessageV1,
  botcastLatestImageContextV1,
  botcastPreSessionImageShouldPresentOnNextTurnV1,
  type BotcastEpisodeImagePlacement,
  type BotcastImageContextV1,
  type BotcastProducerCue,
  type SignalVisualRecognitionV1,
} from "@localai/shared";

export function signalPreSessionEpisodeImageCueForNextTurn(args: {
  episodeId: string;
  messages: readonly { speakerRole: "host" | "guest" }[];
  pendingImage: {
    episodeId: string;
    imageId: string;
    preSessionReveal?: boolean;
  } | null;
  imageContext: Pick<BotcastImageContextV1, "imageId"> | null;
  higherPriorityCuePending: boolean;
}): BotcastProducerCue | null {
  if (
    args.higherPriorityCuePending ||
    args.imageContext ||
    args.pendingImage?.preSessionReveal !== true ||
    args.pendingImage.episodeId !== args.episodeId ||
    !botcastPreSessionImageShouldPresentOnNextTurnV1({
      episodeId: args.episodeId,
      imageId: args.pendingImage.imageId,
      messages: args.messages,
    })
  ) {
    return null;
  }
  return { kind: "present_image", imageId: args.pendingImage.imageId };
}

/**
 * Identity is an exceptional bot-image result, not a status surface for every
 * ordinary prop or picture. Failed inspection is therefore silent unless the
 * matcher actually found a procedural-avatar subject to explain.
 */
export function signalVisualIdentityNotice(
  recognition: SignalVisualRecognitionV1 | null | undefined,
): string | null {
  if (recognition?.status !== "resolved" || recognition.subjects.length === 0) {
    return null;
  }
  const namedSubjects = recognition.subjects.filter(
    (subject) => subject.recognizedBotId,
  ).length;
  return namedSubjects > 0
    ? `Visual identity inspection complete: ${namedSubjects} subject${namedSubjects === 1 ? "" : "s"} passed color, glyph, and face.`
    : "A bot-like subject was found, but no identity passed color, glyph, and face.";
}

export function signalPendingEpisodeImageCueIsAwaitingHostTurn(args: {
  episodeId: string;
  pendingCue: Pick<BotcastProducerCue, "kind" | "imageId"> | null;
  pendingImage: { episodeId: string; imageId: string } | null;
  imageContext: Pick<BotcastImageContextV1, "imageId"> | null;
}): boolean {
  return Boolean(
    !args.imageContext &&
      args.pendingCue?.kind === "present_image" &&
      args.pendingCue.imageId &&
      args.pendingImage?.episodeId === args.episodeId &&
      args.pendingImage.imageId === args.pendingCue.imageId,
  );
}

export function signalQueuedProducerCueIsServerOwned(args: {
  requestedCue: BotcastProducerCue | undefined;
  queuedCue: BotcastProducerCue | null;
}): boolean {
  return Boolean(
    args.requestedCue &&
      // Ordinary Producer cues have already been persisted before advance.
      // An image cue cannot become server-owned until the same request carries
      // its ephemeral bytes and creates the durable image context.
      args.requestedCue.kind !== "present_image" &&
      args.requestedCue === args.queuedCue,
  );
}

export function signalEpisodeImageScale(
  placement: Readonly<BotcastEpisodeImagePlacement>,
  kind: BotcastImageContextV1["kind"],
): number {
  return kind === "item" ? placement.itemScale : placement.photoScale;
}

export function signalEpisodeStageImageContext(args: {
  events: Parameters<typeof botcastLatestImageContextV1>[0];
  activeMessageId: string | null;
}): BotcastImageContextV1 | null {
  const latest = botcastLatestImageContextV1(args.events);
  if (args.activeMessageId) {
    return botcastImageContextForMessageV1(args.events, args.activeMessageId);
  }
  return latest?.phase === "presented" || latest?.phase === "discussing"
    ? latest
    : null;
}

export function signalEpisodeImageIsVisible(args: {
  hasImageContext: boolean;
  replay: boolean;
  activeMessageId: string | null;
  speakingMessageId: string | null;
}): boolean {
  if (!args.hasImageContext) return false;

  // Faithful replay owns its active utterance through the saved timeline, not
  // the live speech state. Requiring speakingMessageId here made every saved
  // item/photo disappear even though its message-linked lifecycle survived.
  if (args.replay) return args.activeMessageId !== null;

  return (
    args.activeMessageId === null ||
    args.speakingMessageId === args.activeMessageId
  );
}
