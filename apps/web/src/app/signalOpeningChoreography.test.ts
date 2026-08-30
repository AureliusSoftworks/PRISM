import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signalOpeningStudioRevealTiming } from "./signalOpeningChoreography.ts";

describe("Signal opening choreography", () => {
  it("fades into the studio and leaves a quiet beat before the host speaks", () => {
    const timing = signalOpeningStudioRevealTiming({
      reducedMotion: false,
      skipped: false,
    });

    assert.equal(timing.fadeMs, 720);
    assert.ok(timing.hostEntranceDelayMs >= 1_000);
    assert.ok(timing.hostEntranceDelayMs <= 2_000);
    assert.ok(timing.hostEntranceDelayMs - timing.fadeMs >= 800);
  });

  it("preserves the quiet entrance beat without animating reduced motion", () => {
    const timing = signalOpeningStudioRevealTiming({
      reducedMotion: true,
      skipped: false,
    });

    assert.equal(timing.fadeMs, 90);
    assert.ok(timing.hostEntranceDelayMs >= 1_000);
  });

  it("keeps Skip responsive without dropping the studio establishment", () => {
    const timing = signalOpeningStudioRevealTiming({
      reducedMotion: false,
      skipped: true,
    });

    assert.equal(timing.hostEntranceDelayMs, 1_000);
    assert.ok(timing.fadeMs < timing.hostEntranceDelayMs);
  });
});
