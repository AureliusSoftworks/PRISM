import assert from "node:assert/strict";
import test from "node:test";
import {
  debateMysteryAccusationMatchesV2,
  debateMysteryTheoryAccusedSeatIdsV2,
  debateMysteryTheoryWithAccusedSeatIdsV2,
} from "./debateMysteryV2.ts";
import type { DebateMysteryTheoryV1 } from "./debateMystery.ts";

const legacyTheory: DebateMysteryTheoryV1 = {
  culpritSeatId: "suspect-1",
  accompliceSeatId: "suspect-2",
  method: "",
  motive: "",
  opportunity: "",
  evidenceIds: [],
  testimonyIds: [],
};

test("charge-agnostic accusations read legacy defendant aliases", () => {
  assert.deepEqual(
    debateMysteryTheoryAccusedSeatIdsV2(legacyTheory),
    ["suspect-1", "suspect-2"],
  );
});

test("new accusations write ordered defendants and legacy aliases together", () => {
  const theory = debateMysteryTheoryWithAccusedSeatIdsV2(
    legacyTheory,
    ["suspect-3", "suspect-4", "suspect-3"],
  );
  assert.deepEqual(theory.accusedSeatIds, ["suspect-3", "suspect-4"]);
  assert.equal(theory.culpritSeatId, "suspect-3");
  assert.equal(theory.accompliceSeatId, "suspect-4");
});

test("a legacy alias edit wins over stale explicit defendants", () => {
  assert.deepEqual(
    debateMysteryTheoryAccusedSeatIdsV2({
      ...legacyTheory,
      accusedSeatIds: ["suspect-1", "suspect-2"],
      culpritSeatId: "suspect-3",
      accompliceSeatId: null,
    }),
    ["suspect-3"],
  );
});

test("accusation correctness requires the exact responsible set in any order", () => {
  assert.equal(
    debateMysteryAccusationMatchesV2(
      ["suspect-4", "suspect-1"],
      ["suspect-1", "suspect-4"],
    ),
    true,
  );
  assert.equal(
    debateMysteryAccusationMatchesV2(["suspect-1"], ["suspect-1", "suspect-4"]),
    false,
  );
  assert.equal(
    debateMysteryAccusationMatchesV2(["suspect-1", "suspect-3"], ["suspect-1"]),
    false,
  );
});
