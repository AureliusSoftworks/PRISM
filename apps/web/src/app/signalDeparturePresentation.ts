import {
  botcastDepartureMessageIdForRole,
  type BotcastEpisode,
  type BotcastMessage,
  type BotcastSpeakerRole,
} from "@localai/shared";

/** A baked departure becomes visible only after its authored final line airs. */
export function signalDepartureRoleAfterPresentedMessage(args: {
  episode: Pick<BotcastEpisode, "events">;
  message: Pick<BotcastMessage, "id" | "speakerRole">;
}): BotcastSpeakerRole | null {
  return botcastDepartureMessageIdForRole(
    args.episode.events,
    args.message.speakerRole,
  ) === args.message.id
    ? args.message.speakerRole
    : null;
}
