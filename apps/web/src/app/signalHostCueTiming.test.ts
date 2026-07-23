import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIGNAL_FOLLOWING_TURN_PREFETCH_PROGRESS } from "./signalHostCueTiming.ts";

describe("Signal live host cue timing", () => {
  it("prefetches the following turn only after most of the active line", () => {
    assert.equal(SIGNAL_FOLLOWING_TURN_PREFETCH_PROGRESS, 0.72);
  });
});
