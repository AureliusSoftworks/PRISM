import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS,
  signalHostCueRedirectProbability,
  signalHostCueShouldRedirect,
} from "./signalHostCueTiming.ts";

describe("Signal live host cue timing", () => {
  it("strongly favors early redirects and fades them out before the line ends", () => {
    assert.equal(signalHostCueRedirectProbability(0), 0.9);
    assert.equal(signalHostCueRedirectProbability(0.2), 0.9);
    assert.equal(signalHostCueRedirectProbability(0.5), 0.55);
    assert.ok(signalHostCueRedirectProbability(0.65) < 0.2);
    assert.equal(
      signalHostCueRedirectProbability(
        SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS,
      ),
      0,
    );
    assert.equal(signalHostCueRedirectProbability(0.95), 0);
  });

  it("requires audience-heard words and keeps late cues for the next turn", () => {
    assert.equal(
      signalHostCueShouldRedirect({
        progress: 0.12,
        spokenContent: "",
        randomValue: 0,
      }),
      false,
    );
    assert.equal(
      signalHostCueShouldRedirect({
        progress: 0.12,
        spokenContent: "I think ",
        randomValue: 0.89,
      }),
      true,
    );
    assert.equal(
      signalHostCueShouldRedirect({
        progress: 0.12,
        spokenContent: "I think ",
        randomValue: 0.91,
      }),
      false,
    );
    assert.equal(
      signalHostCueShouldRedirect({
        progress: 0.8,
        spokenContent: "I think the point is already clear.",
        randomValue: 0,
      }),
      false,
    );
  });
});
