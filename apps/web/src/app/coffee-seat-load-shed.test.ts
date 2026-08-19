import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  coffeeSeatShouldDropRenderedSize,
  coffeeSeatShouldSkipEmptyCupVisual,
} from "./coffee-seat-load-shed.ts";

describe("Coffee seat load shed", () => {
  it("drops Full HD materials on any live table below 24 FPS", () => {
    assert.equal(
      coffeeSeatShouldDropRenderedSize({ fps: 18, currentlyShedding: false }),
      true,
    );
    // Sparse tables shed too: review 8e012a9d ran a two-bot table at 2-5 FPS
    // with no mitigation reachable behind the old crowd gate.
    assert.equal(
      coffeeSeatShouldDropRenderedSize({ fps: 48, currentlyShedding: false }),
      false,
    );
    assert.equal(
      coffeeSeatShouldDropRenderedSize({ fps: null, currentlyShedding: false }),
      false,
    );
  });

  it("stays shed for the session so the seats cannot oscillate", () => {
    // Review 2253b390: three seated bots, frame rate bouncing across both
    // thresholds during arrivals, avatars flickering. Recovered frames are the
    // shed's own effect, so re-promoting restarts the loop at any seat count.
    for (const fps of [30, 45, 60]) {
      assert.equal(
        coffeeSeatShouldDropRenderedSize({ fps, currentlyShedding: true }),
        true,
      );
    }
    assert.equal(
      coffeeSeatShouldDropRenderedSize({ fps: null, currentlyShedding: true }),
      true,
    );
  });

  it("skips empty-cup frowns during pileup on a four-or-more seat table", () => {
    assert.equal(
      coffeeSeatShouldSkipEmptyCupVisual({
        seatedCount: 5,
        pileup: true,
        loadShedding: false,
      }),
      true,
    );
    assert.equal(
      coffeeSeatShouldSkipEmptyCupVisual({
        seatedCount: 3,
        pileup: true,
        loadShedding: false,
      }),
      false,
    );
    assert.equal(
      coffeeSeatShouldSkipEmptyCupVisual({
        seatedCount: 2,
        pileup: false,
        loadShedding: true,
      }),
      true,
    );
  });
});
