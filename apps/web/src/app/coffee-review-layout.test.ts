import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_LIVE_PLAYER_SEAT_MAX_TOP_PERCENT,
  coffeeLivePlayerSeatPosition,
  coffeeReviewBotPosition,
  coffeeReviewParticipantLayout,
} from "./coffee-review-layout.ts";

describe("Coffee review participant layout", () => {
  for (const botCount of [2, 3, 4, 5]) {
    it(`evenly distributes ${botCount} bots and the player`, () => {
      const layout = coffeeReviewParticipantLayout(botCount);
      const angles = [layout.player, ...layout.bots]
        .map((position) => position.angleDeg)
        .sort((a, b) => a - b);
      const gaps = angles.map((angle, index) => {
        const next = angles[(index + 1) % angles.length]!;
        return (next - angle + 360) % 360;
      });
      const expectedGap = 360 / (botCount + 1);

      assert.equal(layout.player.angleDeg, 90);
      assert.equal(layout.bots.length, botCount);
      assert.ok(gaps.every((gap) => Math.abs(gap - expectedGap) < 0.000_001));
    });
  }

  it("keeps each full-ring bot seat stable when another participant is hidden", () => {
    const before = Array.from({ length: 5 }, (_, index) =>
      coffeeReviewBotPosition(5, index),
    );
    const visibleLayoutIndexes = [0, 2, 4];
    const after = visibleLayoutIndexes.map((index) =>
      coffeeReviewBotPosition(5, index),
    );

    assert.deepEqual(after, visibleLayoutIndexes.map((index) => before[index]));
  });

  it("keeps layout identity ordered from the top row toward the bottom row", () => {
    const five = coffeeReviewParticipantLayout(5).bots;

    assert.equal(five[0]?.angleDeg, 270);
    assert.ok((five[1]?.leftPercent ?? 100) < 50);
    assert.ok((five[2]?.leftPercent ?? 0) > 50);
    assert.ok((five[3]?.leftPercent ?? 100) < 50);
    assert.ok((five[4]?.leftPercent ?? 0) > 50);
  });

  it("draws small tables on a tighter ring so seats hug the table", () => {
    const twoBot = coffeeReviewParticipantLayout(2);
    const fiveBot = coffeeReviewParticipantLayout(5);
    const radialX = (position: { leftPercent: number }) =>
      Math.abs(position.leftPercent - 50);
    const twoBotMax = Math.max(...twoBot.bots.map(radialX));
    const fiveBotMax = Math.max(...fiveBot.bots.map(radialX));
    // A duo's seats sit meaningfully closer to the table than a full ring's.
    assert.ok(twoBotMax < fiveBotMax * 0.82);
    // The player contracts on the same scale so the circle stays a circle.
    assert.ok(twoBot.player.topPercent < fiveBot.player.topPercent);
  });

  it("lifts the live player seat above the composer; replay keeps the circle", () => {
    const layout = coffeeReviewParticipantLayout(4);
    // The pure circle parks the player low enough to sit under the composer.
    assert.ok(layout.player.topPercent > COFFEE_LIVE_PLAYER_SEAT_MAX_TOP_PERCENT);
    const live = coffeeLivePlayerSeatPosition(layout);
    assert.equal(live.topPercent, COFFEE_LIVE_PLAYER_SEAT_MAX_TOP_PERCENT);
    assert.equal(live.leftPercent, layout.player.leftPercent);
    assert.equal(live.angleDeg, layout.player.angleDeg);
  });
});
