import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
});
