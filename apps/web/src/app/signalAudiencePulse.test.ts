import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS } from "@localai/shared";

import {
  formatSignalAudienceViews,
  signalAudienceReviews,
  signalNextAudienceReviewRefreshDelayMs,
  signalAudienceSnapshot,
  type SignalAudienceEpisode,
} from "./signalAudiencePulse.ts";

function episode(
  id: string,
  overrides: Partial<SignalAudienceEpisode> = {},
): SignalAudienceEpisode {
  return {
    id,
    guestBotId: `guest-${id}`,
    topic: `Topic ${id}`,
    status: "completed",
    completedAt: `2026-07-${id.padStart(2, "0")}T18:00:00.000Z`,
    createdAt: `2026-07-${id.padStart(2, "0")}T17:00:00.000Z`,
    personaReview: {
      reviewerBotId: `reviewer-${id}`,
      reviewerName: `Persona ${id}`,
      rating: 3.5,
      comment: `Reaction ${id}`,
      createdAt: `2026-07-${id.padStart(2, "0")}T18:01:00.000Z`,
    },
    ...overrides,
  };
}

describe("Signal audience pulse", () => {
  it("keeps an unreleased show empty and ignores live episodes", () => {
    const snapshot = signalAudienceSnapshot({
      showId: "show-new",
      episodes: [episode("1", { status: "live", completedAt: null })],
    });

    assert.deepEqual(snapshot, {
      totalViews: 0,
      rating: null,
      ratingConfidence: "none",
      reviewCount: 0,
      featuredReview: null,
    });
  });

  it("builds a stable bounded snapshot after a completed episode", () => {
    const episodes = [episode("1")];
    const first = signalAudienceSnapshot({ showId: "show-one", episodes });
    const second = signalAudienceSnapshot({ showId: "show-one", episodes });

    assert.deepEqual(first, second);
    assert.ok(first.totalViews >= 180 && first.totalViews <= 900);
    assert.equal(first.rating, 3.5);
    assert.equal(first.ratingConfidence, "early");
    assert.equal(first.reviewCount, 1);
    assert.deepEqual(first.featuredReview, {
      quote: "Reaction 1",
      listener: "Persona 1",
    });
  });

  it("grows across completed episodes regardless of input order", () => {
    const episodes = [episode("1"), episode("2"), episode("3")];
    const singleEpisode = signalAudienceSnapshot({
      showId: "show-growing",
      episodes: episodes.slice(0, 1),
    });
    const forward = signalAudienceSnapshot({
      showId: "show-growing",
      episodes,
    });
    const reversed = signalAudienceSnapshot({
      showId: "show-growing",
      episodes: [...episodes].reverse(),
    });

    assert.ok(forward.totalViews > singleEpisode.totalViews);
    assert.ok(forward.reviewCount > singleEpisode.reviewCount);
    assert.equal(forward.reviewCount, 3);
    assert.deepEqual(forward, reversed);
  });

  it("keeps ratings empty until a persona review exists and establishes them at five", () => {
    const waiting = signalAudienceSnapshot({
      showId: "show-waiting",
      episodes: [episode("1", { personaReview: null })],
    });
    const established = signalAudienceSnapshot({
      showId: "show-established",
      episodes: ["1", "2", "3", "4", "5"].map((id) => episode(id)),
    });

    assert.equal(waiting.totalViews > 0, true);
    assert.equal(waiting.rating, null);
    assert.equal(waiting.reviewCount, 0);
    assert.equal(waiting.ratingConfidence, "none");
    assert.equal(waiting.featuredReview, null);
    assert.equal(established.reviewCount, 5);
    assert.equal(established.ratingConfidence, "established");
  });

  it("returns saved listener reviews newest-first with their episode ratings", () => {
    const reviews = signalAudienceReviews([
      episode("3", { personaReview: null }),
      episode("2", {
        personaReview: {
          reviewerBotId: "reviewer-2",
          reviewerName: "Second Listener",
          rating: 4.5,
          comment: "The questions kept getting better.",
          createdAt: "2026-07-02T18:01:00.000Z",
        },
      }),
      episode("1"),
      episode("4", { status: "live", completedAt: null }),
    ]);

    assert.deepEqual(reviews, [
      {
        episodeId: "2",
        episodeNumber: 2,
        topic: "Topic 2",
        reviewerName: "Second Listener",
        rating: 4.5,
        comment: "The questions kept getting better.",
        createdAt: "2026-07-02T18:01:00.000Z",
      },
      {
        episodeId: "1",
        episodeNumber: 1,
        topic: "Topic 1",
        reviewerName: "Persona 1",
        rating: 3.5,
        comment: "Reaction 1",
        createdAt: "2026-07-01T18:01:00.000Z",
      },
    ]);
  });

  it("refreshes at the next four-hour review threshold", () => {
    const nowMs = Date.parse("2026-07-02T20:00:00.000Z");
    assert.equal(
      signalNextAudienceReviewRefreshDelayMs(
        [
          episode("1", {
            completedAt: "2026-07-02T18:00:00.000Z",
            personaReview: null,
          }),
          episode("2", {
            completedAt: "2026-07-02T16:00:00.000Z",
            personaReview: null,
          }),
          episode("3", {
            completedAt: "2026-07-02T19:00:00.000Z",
            personaReview: {
              reviewerBotId: "already-visible",
              reviewerName: "Already Visible",
              rating: 4,
              comment: "This one is already here.",
              createdAt: "2026-07-02T19:01:00.000Z",
            },
          }),
        ],
        nowMs,
      ),
      BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS - 2 * 60 * 60 * 1_000,
    );
  });

  it("lets guest and topic identity change the temporary audience", () => {
    const baseline = signalAudienceSnapshot({
      showId: "show-variation",
      episodes: [episode("1")],
    });
    const changedBooking = signalAudienceSnapshot({
      showId: "show-variation",
      episodes: [
        episode("1", {
          guestBotId: "guest-headliner",
          topic: "A completely different conversation",
        }),
      ],
    });

    assert.notDeepEqual(baseline, changedBooking);
  });

  it("formats audience totals compactly", () => {
    assert.equal(formatSignalAudienceViews(842), "842");
    assert.equal(formatSignalAudienceViews(1_240), "1.2K");
    assert.equal(formatSignalAudienceViews(18_400), "18.4K");
  });
});
