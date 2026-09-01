import type { BotcastEpisode, BotcastMessage } from "@localai/shared";

/**
 * Server tension is authoritative immediately so it can shape the next turn.
 * The audience-facing meter, however, must not react to a Producer click
 * before the host has actually delivered the line that carries that pressure.
 */
export function signalEpisodeBeforeResponseIsHeard(args: {
  previousEpisode: BotcastEpisode;
  committedEpisode: BotcastEpisode;
  responseMessage: BotcastMessage | null;
}): BotcastEpisode {
  const { previousEpisode, committedEpisode, responseMessage } = args;
  const tensionChanged =
    previousEpisode.tensionStage !== committedEpisode.tensionStage ||
    previousEpisode.warningCount !== committedEpisode.warningCount;
  const statusChanged = previousEpisode.status !== committedEpisode.status;
  const hostCarriesTension =
    responseMessage?.speakerRole === "host" && tensionChanged;
  const responseCarriesCompletion = responseMessage !== null && statusChanged;
  if (!hostCarriesTension && !responseCarriesCompletion) {
    return committedEpisode;
  }
  return {
    ...committedEpisode,
    ...(hostCarriesTension
      ? {
          tensionStage: previousEpisode.tensionStage,
          warningCount: previousEpisode.warningCount,
        }
      : {}),
    // A final Host sign-off or Guest coda is still live presentation.
    // Publishing completed before that response is heard clears both chairs,
    // stops camera-direction capture, and can truncate the faithful ending.
    ...(responseCarriesCompletion ? { status: previousEpisode.status } : {}),
  };
}
