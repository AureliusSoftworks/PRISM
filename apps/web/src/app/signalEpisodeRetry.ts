import type {
  BotcastEpisode,
  BotcastEpisodeImageDescriptor,
  BotcastEpisodeResponseMode,
  BotcastSessionDurationMinutes,
} from "@localai/shared";
import {
  botcastEpisodeModelSelectionKind,
  botcastLatestImageContextV1,
} from "@localai/shared";

export type SignalEpisodeRetryImage = {
  /** The completed/cancelled booking that owns the replay-safe proxy. */
  sourceEpisodeId: string;
  imageId: string;
  descriptor: BotcastEpisodeImageDescriptor;
  replayEmoji: string;
  /** Private editable host direction loaded from the retry-only API. */
  reason: string;
};

export type SignalEpisodeRetryMetadata = {
  image: { imageId: string; reason: string } | null;
};

export type SignalEpisodeRetryDraft = {
  guestId: string;
  topic: string;
  producerBrief: string;
  guestBrief: string;
  modelId: string;
  durationMinutes: BotcastSessionDurationMinutes | null;
  /** Only archival replay proxies can follow a booking back into setup. */
  image: SignalEpisodeRetryImage | null;
  guestAvailable: boolean;
  modelUnavailable: boolean;
  modeChanged: boolean;
};

export function signalEpisodeRetryDraft(args: {
  episode: Pick<
    BotcastEpisode,
    | "id"
    | "guestBotId"
    | "topic"
    | "producerBrief"
    | "guestBrief"
    | "model"
    | "responseMode"
    | "durationMinutes"
  > &
    Partial<Pick<BotcastEpisode, "events">>;
  availableGuestIds: readonly string[];
  availableModelIds: readonly string[];
  currentResponseMode: BotcastEpisodeResponseMode;
  retryMetadata?: SignalEpisodeRetryMetadata | null;
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
  const imageContext = args.episode.events
    ? botcastLatestImageContextV1(args.episode.events)
    : null;
  // Legacy records only retain an emoji or a saved asset. Retrying them must
  // remain exactly as before: only a booking-owned archival proxy is reusable.
  const image = imageContext?.replayProxyId
    ? {
        sourceEpisodeId: args.episode.id,
        imageId: imageContext.imageId,
        descriptor: {
          kind: imageContext.kind,
          name: imageContext.name,
          mimeType: imageContext.mimeType,
        },
        replayEmoji: imageContext.replayEmoji,
        reason:
          args.retryMetadata?.image?.imageId === imageContext.imageId
            ? args.retryMetadata.image.reason
            : "",
      }
    : null;

  return {
    guestId: guestAvailable ? args.episode.guestBotId : "",
    topic: args.episode.topic,
    producerBrief: args.episode.producerBrief,
    guestBrief: args.episode.guestBrief ?? "",
    modelId: restoreModel && args.episode.model ? args.episode.model : "",
    durationMinutes: args.episode.durationMinutes,
    image,
    guestAvailable,
    modelUnavailable:
      !autoSelected &&
      args.episode.model !== null &&
      !modelAvailable,
    modeChanged: args.episode.responseMode !== args.currentResponseMode,
  };
}
