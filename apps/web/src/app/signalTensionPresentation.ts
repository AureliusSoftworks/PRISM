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
  if (!tensionChanged || responseMessage?.speakerRole !== "host") {
    return committedEpisode;
  }
  return {
    ...committedEpisode,
    tensionStage: previousEpisode.tensionStage,
    warningCount: previousEpisode.warningCount,
  };
}
