import type {
  BotcastEpisode,
  BotcastEpisodeResponseMode,
  BotcastSessionDurationMinutes,
} from "@localai/shared";
import { botcastEpisodeModelSelectionKind } from "@localai/shared";

export type SignalEpisodeRetryDraft = {
  guestId: string;
  topic: string;
  producerBrief: string;
  modelId: string;
  durationMinutes: BotcastSessionDurationMinutes | null;
  guestAvailable: boolean;
  modelUnavailable: boolean;
  modeChanged: boolean;
};

export function signalEpisodeRetryDraft(args: {
  episode: Pick<
    BotcastEpisode,
    | "guestBotId"
    | "topic"
    | "producerBrief"
    | "model"
    | "responseMode"
    | "durationMinutes"
  > &
    Partial<Pick<BotcastEpisode, "events">>;
  availableGuestIds: readonly string[];
  availableModelIds: readonly string[];
  currentResponseMode: BotcastEpisodeResponseMode;
}): SignalEpisodeRetryDraft {
  const guestAvailable = args.availableGuestIds.includes(
    args.episode.guestBotId,
  );
  const modelAvailable =
    args.episode.model === null ||
    args.availableModelIds.includes(args.episode.model);
  const selectionKind = args.episode.events
    ? botcastEpisodeModelSelectionKind({ events: args.episode.events })
    : null;
  // Legacy responseMode "auto" plus the frozen routing snapshot both mean
  // the picker should stay on Auto — never restore the concrete background model.
  const autoSelected =
    selectionKind === "auto" || args.currentResponseMode === "auto";
  const restoreModel =
    !autoSelected &&
    args.episode.model !== null &&
    modelAvailable;

  return {
    guestId: guestAvailable ? args.episode.guestBotId : "",
    topic: args.episode.topic,
    producerBrief: args.episode.producerBrief,
    modelId: restoreModel && args.episode.model ? args.episode.model : "",
    durationMinutes: args.episode.durationMinutes,
    guestAvailable,
    modelUnavailable:
      !autoSelected &&
      args.episode.model !== null &&
      !modelAvailable,
    modeChanged: args.episode.responseMode !== args.currentResponseMode,
  };
}
