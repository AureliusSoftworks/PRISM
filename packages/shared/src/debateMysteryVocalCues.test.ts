import assert from "node:assert/strict";
import test from "node:test";

import { DEBATE_MYSTERY_VOCAL_CUES_V1 } from "./debateMysteryV2.ts";

test("the vocal bank is a small, fixed set of short cues of both kinds with unique ids", () => {
  assert.equal(DEBATE_MYSTERY_VOCAL_CUES_V1.length, 8);
  assert.equal(new Set(DEBATE_MYSTERY_VOCAL_CUES_V1.map((cue) => cue.id)).size, 8);
  assert.ok(DEBATE_MYSTERY_VOCAL_CUES_V1.some((cue) => cue.kind === "lead_in"));
  assert.ok(DEBATE_MYSTERY_VOCAL_CUES_V1.some((cue) => cue.kind === "listening"));
  for (const cue of DEBATE_MYSTERY_VOCAL_CUES_V1) {
    assert.ok(cue.text.length <= 8, `a cue is a grunt, not a line: ${cue.text}`);
  }
});
