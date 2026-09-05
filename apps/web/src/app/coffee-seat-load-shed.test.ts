import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  coffeeSeatShouldSkipEmptyCupVisual,
} from "./coffee-seat-load-shed.ts";

describe("Coffee seat load shed", () => {
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
