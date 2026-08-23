import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_EXTRA_RESPONSE_PAUSE_MAX_MS,
  SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS,
  signalExtraResponsePauseMs,
} from "./signalResponseCadence.ts";

describe("Signal response cadence", () => {
  it("keeps the extra presentation pause inclusive and deterministic", () => {
    assert.equal(signalExtraResponsePauseMs(() => 0), SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS);
    assert.equal(signalExtraResponsePauseMs(() => 1), SIGNAL_EXTRA_RESPONSE_PAUSE_MAX_MS);
    assert.equal(signalExtraResponsePauseMs(() => 0.5), 3_000);
    assert.equal(signalExtraResponsePauseMs(() => -1), SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS);
    assert.equal(signalExtraResponsePauseMs(() => Number.NaN), SIGNAL_EXTRA_RESPONSE_PAUSE_MIN_MS);
  });
});
