import type {
  BotcastEpisodeImagePlacement,
  BotcastImageContextV1,
  BotcastProducerCue,
} from "@localai/shared";

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
