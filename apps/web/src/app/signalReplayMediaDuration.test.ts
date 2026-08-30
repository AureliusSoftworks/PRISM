import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signalReplayElementDurationMs } from "./signalReplayMediaDuration.ts";

describe("signalReplayElementDurationMs", () => {
  it("accepts a finite browser media duration", () => {
    assert.equal(signalReplayElementDurationMs(97.555), 97_555);
  });

  it("rejects indefinite and empty WebM metadata", () => {
    assert.equal(signalReplayElementDurationMs(Number.POSITIVE_INFINITY), null);
    assert.equal(signalReplayElementDurationMs(Number.NaN), null);
    assert.equal(signalReplayElementDurationMs(0), null);
  });
});
