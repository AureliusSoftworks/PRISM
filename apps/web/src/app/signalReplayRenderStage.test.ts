import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  waitForSignalReplayRenderStage,
  withSignalReplayCaptureTimeout,
} from "./signalReplayRenderStage.ts";

describe("Signal replay render stage", () => {
  it("waits for React to mount the hidden Studio instead of sampling its ref early", async () => {
    let frames = 0;
    const stage = { id: "signal-replay-stage" };
    const resolved = await waitForSignalReplayRenderStage(
      () => (frames >= 3 ? stage : null),
      {
        maxFrames: 5,
        nextFrame: async () => {
          frames += 1;
        },
      },
    );

    assert.equal(resolved, stage);
    assert.equal(frames, 3);
  });

  it("fails an indefinitely stalled capture with a retryable error", async () => {
    await assert.rejects(
      withSignalReplayCaptureTimeout(
        "Signal studio frame capture",
        new Promise<never>(() => undefined),
        1,
      ),
      /Signal studio frame capture timed out\. Retry the episode video render\./u,
    );
  });
});
