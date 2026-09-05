import {
  botcastImageHistoryV1,
  botcastImageContextByIdV1,
  botcastPendingImageContextV1,
  botcastPreviousImageContextV1,
  botcastActiveImageContextV1,
  type BotcastEpisode,
} from "@localai/shared";

/** Merge only image events into staged on-air state, never release unheard turns. */
export function mergeSignalEpisodeImageEvents(base: BotcastEpisode, other: BotcastEpisode): BotcastEpisode {
  if (base.id !== other.id) return base;
  const events = new Map(base.events.map((event) => [event.id, event]));
  for (const event of other.events) if (event.kind === "image_context" && !events.has(event.id)) events.set(event.id, event);
  // Preserve React's no-op state update semantics for clock/cue effects that
  // return the current episode. Reallocating here causes a render loop.
  if (events.size === base.events.length) return base;
  return { ...base, events: [...events.values()].sort((a, b) => a.sequence - b.sequence) };
}

export function signalEpisodeOriginalIds(episode: Pick<BotcastEpisode, "events">): string[] {
  const history = botcastImageHistoryV1(episode.events);
  const current = [...history].reverse().find((image) => image.hostIntroductionMessageId);
  const previous = current ? botcastPreviousImageContextV1(episode.events, current.imageId) : null;
  const pending = botcastPendingImageContextV1(episode.events);
  return [current?.imageId, previous?.imageId, pending?.imageId].filter((id): id is string => Boolean(id));
}

export function signalEpisodeImagesForTurn(episode: Pick<BotcastEpisode, "events">, cueImageId?: string) {
  const current = cueImageId
    ? botcastImageContextByIdV1(episode.events, cueImageId)
    : botcastActiveImageContextV1(episode.events);
  return { current, previous: current ? botcastPreviousImageContextV1(episode.events, current.imageId) : null };
}

export function signalEpisodeImageProxyUrl(episodeId: string, imageId: string): string {
  return `/api/botcast/episodes/${encodeURIComponent(episodeId)}/image-proxy?imageId=${encodeURIComponent(imageId)}`;
}
