import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeSeatShouldDropRenderedSize,
  coffeeSeatShouldSkipEmptyCupVisual,
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

  it("stays shed until FPS recovers past 42", () => {
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 30,
        seatedCount: 5,
        currentlyShedding: true,
      }),
      true,
    );
    assert.equal(
      coffeeSeatShouldDropRenderedSize({
        fps: 45,
        seatedCount: 5,
        currentlyShedding: true,
      }),
      false,
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
