import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatSignalAudienceViews,
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
    assert.ok(first.rating !== null && first.rating >= 3.8 && first.rating <= 4.9);
    assert.ok(first.reviewCount >= 1);
    assert.ok(first.reviewCount / first.totalViews >= 0.009);
    assert.ok(first.reviewCount / first.totalViews <= 0.031);
    assert.ok(first.featuredReview?.quote);
    assert.ok(first.featuredReview?.listener);
  });

  it("grows across completed episodes regardless of input order", () => {
    const episodes = [episode("1"), episode("2"), episode("3")];
    const singleEpisode = signalAudienceSnapshot({
      showId: "show-growing",
      episodes: episodes.slice(0, 1),
    });
    const forward = signalAudienceSnapshot({ showId: "show-growing", episodes });
    const reversed = signalAudienceSnapshot({
      showId: "show-growing",
      episodes: [...episodes].reverse(),
    });

    assert.ok(forward.totalViews > singleEpisode.totalViews);
    assert.ok(forward.reviewCount > singleEpisode.reviewCount);
    assert.deepEqual(forward, reversed);
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
