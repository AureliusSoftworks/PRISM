import type { BotcastEpisodeImagePlacement, BotcastImageContextV1 } from "@localai/shared";

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
