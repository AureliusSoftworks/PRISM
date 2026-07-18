import type { BotcastEpisodeSummary } from "@localai/shared";

export type SignalAudienceEpisode = Pick<
  BotcastEpisodeSummary,
  | "id"
  | "guestBotId"
  | "topic"
  | "status"
  | "completedAt"
  | "createdAt"
  | "personaReview"
>;

export type SignalFeaturedReview = {
  quote: string;
  listener: string;
};

export type SignalAudienceReview = {
  episodeId: string;
  episodeNumber: number;
  topic: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export type SignalAudienceSnapshot = {
  totalViews: number;
  rating: number | null;
  ratingConfidence: "none" | "early" | "established";
  reviewCount: number;
  featuredReview: SignalFeaturedReview | null;
};

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
      return (
        leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id)
      );
    });
}

function reviewsFromCompletedEpisodes(
  episodes: readonly SignalAudienceEpisode[],
): SignalAudienceReview[] {
  return episodes
    .flatMap((episode, index) => {
      const review = episode.personaReview;
      if (!review) return [];
      return [
        {
          episodeId: episode.id,
          episodeNumber: index + 1,
          topic: episode.topic,
          reviewerName: review.reviewerName,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
        },
      ];
    })
    .reverse();
}

export function signalAudienceReviews(
  episodes: readonly SignalAudienceEpisode[],
): SignalAudienceReview[] {
  return reviewsFromCompletedEpisodes(completedSignalAudienceEpisodes(episodes));
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
      ratingConfidence: "none",
      reviewCount: 0,
      featuredReview: null,
    };
  }

  const totalViews = completedEpisodes.reduce((total, episode, index) => {
    const episodeSeed = `${args.showId}:${episode.id}:${episode.guestBotId}:${episode.topic}`;
    const baseViews =
      180 + Math.round(stableUnitValue(`${episodeSeed}:views`) * 720);
    const growthMultiplier = 1 + Math.min(index, 10) * 0.1;
    return total + Math.round(baseViews * growthMultiplier);
  }, 0);
  const reviews = reviewsFromCompletedEpisodes(completedEpisodes);
  const reviewCount = reviews.length;
  const rating =
    reviewCount === 0
      ? null
      : Number(
          (
            reviews.reduce((total, review) => total + review.rating, 0) /
            reviewCount
          ).toFixed(1),
        );
  const latestReview = reviews[0] ?? null;

  return {
    totalViews,
    rating,
    ratingConfidence:
      reviewCount === 0 ? "none" : reviewCount < 5 ? "early" : "established",
    reviewCount,
    featuredReview: latestReview
      ? { quote: latestReview.comment, listener: latestReview.reviewerName }
      : null,
  };
}
