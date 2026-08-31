import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomBotPickerPlacements } from "./botPickerPlacement.ts";

describe("randomBotPickerPlacements", () => {
  it("fills only distinct bots visible in the active grid", () => {
    const placements = randomBotPickerPlacements({
      visibleBotIds: ["visible-a", "visible-b", "visible-a", "hidden-c"],
      placementCount: 2,
      excludedBotIds: ["hidden-c"],
      random: () => 0,
    });
    assert.deepEqual(placements, ["visible-b", "visible-a"]);
    assert.ok(placements?.every((id) => id.startsWith("visible-")));
  });

  it("refuses an incomplete reroll instead of duplicating a seat", () => {
    assert.equal(
      randomBotPickerPlacements({
        visibleBotIds: ["only-bot"],
        placementCount: 2,
      }),
      null,
    );
  });
});
