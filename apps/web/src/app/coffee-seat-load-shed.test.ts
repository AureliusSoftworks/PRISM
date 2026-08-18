import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeSeatShouldDropRenderedSize,
  coffeeSeatShouldSkipEmptyCupVisual,
  stageShouldDropRenderedSize,
} from "./coffee-seat-load-shed.ts";

describe("Coffee seat load shed", () => {
  it("drops Full HD materials only on a crowded table below 24 FPS", () => {
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 18,
        seatedCount: 5,
        currentlyShedding: false,
      }),
      true,
    );
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 18,
        seatedCount: 2,
        currentlyShedding: false,
      }),
      false,
    );
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 48,
        seatedCount: 5,
        currentlyShedding: false,
      }),
      false,
    );
  });

  it("keeps a crowded table shed even when the shed itself recovers FPS", () => {
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 30,
        seatedCount: 5,
        currentlyShedding: true,
      }),
      true,
    );
    // Recovered frames while still crowded are the shed's own effect;
    // re-promoting here restarts the HD↔Mini swap loop.
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 45,
        seatedCount: 5,
        currentlyShedding: true,
      }),
      true,
    );
  });

  it("returns to Full HD once the crowd is gone and frames are smooth", () => {
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 45,
        seatedCount: 3,
        currentlyShedding: true,
      }),
      false,
    );
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 30,
        seatedCount: 3,
        currentlyShedding: true,
      }),
      true,
    );
  });

  it("sheds Signal and Debate stages below 24 FPS and stays shed all session", () => {
    assert.equal(
      stageShouldDropRenderedSize({ fps: 18, currentlyShedding: false }),
      true,
    );
    assert.equal(
      stageShouldDropRenderedSize({ fps: 48, currentlyShedding: false }),
      false,
    );
    assert.equal(
      stageShouldDropRenderedSize({ fps: null, currentlyShedding: false }),
      false,
    );
    // A stage has no crowd to thin, so once shed it never re-promotes
    // mid-session — not even at a recovered 60 FPS.
    assert.equal(
      stageShouldDropRenderedSize({ fps: 60, currentlyShedding: true }),
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
