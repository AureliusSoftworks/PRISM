import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signalVoiceProgressHeartbeatAdvanced } from "./signalVoiceProgressWatchdog.ts";

describe("Signal voice progress watchdog", () => {
  it("does not let repeated partial Premium timestamps postpone recovery", () => {
    assert.equal(
      signalVoiceProgressHeartbeatAdvanced({
        previousElapsedMs: 120,
        elapsedMs: 120,
      }),
      false,
    );
    assert.equal(
      signalVoiceProgressHeartbeatAdvanced({
        previousElapsedMs: 120,
        elapsedMs: 119,
      }),
      false,
    );
  });

  it("rearams recovery only for real audible-clock progress", () => {
    assert.equal(
      signalVoiceProgressHeartbeatAdvanced({
        previousElapsedMs: 120,
        elapsedMs: 121,
      }),
      true,
    );
    assert.equal(
      signalVoiceProgressHeartbeatAdvanced({
        previousElapsedMs: 120,
        elapsedMs: Number.NaN,
      }),
      false,
    );
  });
});
