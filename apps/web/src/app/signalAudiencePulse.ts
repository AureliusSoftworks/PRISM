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

export type SignalShowAudienceRankingItem = {
  id: string;
  name: string;
  updatedAt: string;
  audienceRating?: number | null;
  audienceReviewCount?: number;
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

/**
 * Returns the shared performance color for a five-point audience rating.
 * Ratings interpolate continuously from red (0) through yellow (2.5) to
 * green (5), while missing or malformed ratings remain uncolored.
 */
export function signalAudienceRatingColor(
  rating: number | null | undefined,
): string | null {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  const boundedRating = Math.max(0, Math.min(5, rating));
  const hue = Math.round((boundedRating / 5) * 120);
  return `hsl(${hue} 84% 60%)`;
}

function signalShowAudienceRating(
  show: SignalShowAudienceRankingItem,
): number | null {
  const rating = show.audienceRating;
  return typeof rating === "number" && Number.isFinite(rating)
    ? Math.max(0, Math.min(5, rating))
    : null;
}

function signalShowAudienceReviewCount(
  show: SignalShowAudienceRankingItem,
): number {
  const reviewCount = show.audienceReviewCount;
  return typeof reviewCount === "number" && Number.isFinite(reviewCount)
    ? Math.max(0, Math.round(reviewCount))
    : 0;
}

function signalShowActivityTime(show: SignalShowAudienceRankingItem): number {
  const timestamp = Date.parse(show.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Signal's show rail is a public-facing chart: average audience rating leads,
 * then review count establishes confidence. Unrated shows remain accessible
 * beneath reviewed shows and retain a deterministic recent-activity order.
 */
export function signalShowsByAudienceRating<
  T extends SignalShowAudienceRankingItem,
>(shows: readonly T[]): T[] {
  return [...shows].sort((left, right) => {
    const leftRating = signalShowAudienceRating(left);
    const rightRating = signalShowAudienceRating(right);
    if (leftRating === null && rightRating !== null) return 1;
    if (leftRating !== null && rightRating === null) return -1;
    if (leftRating !== null && rightRating !== null) {
      if (leftRating !== rightRating) return rightRating - leftRating;
      const reviewDelta =
        signalShowAudienceReviewCount(right) -
        signalShowAudienceReviewCount(left);
      if (reviewDelta !== 0) return reviewDelta;
    }
    const activityDelta =
      signalShowActivityTime(right) - signalShowActivityTime(left);
    if (activityDelta !== 0) return activityDelta;
    return (
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    );
  });
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
