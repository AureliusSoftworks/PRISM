import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFERRED_DEBATE_FAITHFUL_REPLAY_CHECKLIST,
  DEFERRED_DEBATE_REPLAY_SURFACE,
  DEFERRED_PREMIUM_UPGRADE_SURFACES,
} from "../deferred-debate-replay.ts";

describe("deferred-debate-replay scaffolding", () => {
  it("reserves debate surface and premium upgrade seams", () => {
    assert.equal(DEFERRED_DEBATE_REPLAY_SURFACE, "debate");
    assert.ok(DEFERRED_DEBATE_FAITHFUL_REPLAY_CHECKLIST.length >= 3);
    assert.deepEqual([...DEFERRED_PREMIUM_UPGRADE_SURFACES], ["coffee", "debate"]);
  });
});
