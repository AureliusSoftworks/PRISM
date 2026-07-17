import type { BotcastEpisodeSummary } from "@localai/shared";

export type SignalAudienceEpisode = Pick<
  BotcastEpisodeSummary,
  | "id"
  | "guestBotId"
  | "topic"
  | "status"
  | "completedAt"
  | "createdAt"
>;

export type SignalFeaturedReview = {
  quote: string;
  listener: string;
};

export type SignalAudienceSnapshot = {
  totalViews: number;
  rating: number | null;
  reviewCount: number;
  featuredReview: SignalFeaturedReview | null;
};

const SIGNAL_FEATURED_REVIEW_QUOTES = [
  "I came for the guest and stayed for the host.",
  "Sharp questions, and the guest actually had room to answer.",
  "The last exchange alone was worth the episode.",
  "A little chaotic, but I could not stop listening.",
  "This show keeps finding the question behind the question.",
  "The chemistry surprised me. I am in for the next one.",
] as const;

const SIGNAL_LISTENER_NAMES = [
  "After Hours Listener",
  "First Train Listener",
  "Night Shift Listener",
  "Signal Regular",
  "Studio Headphones",
  "Window Seat Listener",
] as const;

const compactAudienceNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableUnitValue(seed: string): number {
  return stableHash(seed) / 0xffffffff;
}

function completedSignalAudienceEpisodes(
  episodes: readonly SignalAudienceEpisode[],
): SignalAudienceEpisode[] {
  return episodes
    .filter((episode) => episode.status === "completed")
    .sort((left, right) => {
      const leftTime = left.completedAt ?? left.createdAt;
      const rightTime = right.completedAt ?? right.createdAt;
      return leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id);
    });
}

export function formatSignalAudienceViews(totalViews: number): string {
  return compactAudienceNumber.format(Math.max(0, Math.round(totalViews)));
}

export function signalAudienceSnapshot(args: {
  showId: string;
  episodes: readonly SignalAudienceEpisode[];
}): SignalAudienceSnapshot {
  const completedEpisodes = completedSignalAudienceEpisodes(args.episodes);
  if (completedEpisodes.length === 0) {
    return {
      totalViews: 0,
      rating: null,
      reviewCount: 0,
      featuredReview: null,
    };
  }

  const totalViews = completedEpisodes.reduce((total, episode, index) => {
    const episodeSeed = `${args.showId}:${episode.id}:${episode.guestBotId}:${episode.topic}`;
    const baseViews = 180 + Math.round(stableUnitValue(`${episodeSeed}:views`) * 720);
    const growthMultiplier = 1 + Math.min(index, 10) * 0.1;
    return total + Math.round(baseViews * growthMultiplier);
  }, 0);
  const reviewRate = 0.01 + stableUnitValue(`${args.showId}:review-rate`) * 0.02;
  const reviewCount = Math.max(1, Math.round(totalViews * reviewRate));
  const ratingAverage = completedEpisodes.reduce((total, episode) => {
    const episodeSeed = `${args.showId}:${episode.id}:${episode.guestBotId}:${episode.topic}`;
    return total + stableUnitValue(`${episodeSeed}:rating`);
  }, 0) / completedEpisodes.length;
  const rating = Math.min(4.9, Number((3.8 + ratingAverage * 1.1).toFixed(1)));
  const latestEpisode = completedEpisodes.at(-1)!;
  const reviewSeed = `${args.showId}:${latestEpisode.id}:${latestEpisode.guestBotId}:${latestEpisode.topic}:review`;
  const quoteIndex = stableHash(`${reviewSeed}:quote`) % SIGNAL_FEATURED_REVIEW_QUOTES.length;
  const listenerIndex = stableHash(`${reviewSeed}:listener`) % SIGNAL_LISTENER_NAMES.length;

  return {
    totalViews,
    rating,
    reviewCount,
    featuredReview: {
      quote: SIGNAL_FEATURED_REVIEW_QUOTES[quoteIndex]!,
      listener: SIGNAL_LISTENER_NAMES[listenerIndex]!,
    },
  };
}
