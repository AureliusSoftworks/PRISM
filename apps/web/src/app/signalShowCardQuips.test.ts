import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackSignalShowCardBlurbs,
  signalShowCardBlurbs,
} from "./signalShowCardQuips.ts";

describe("Signal show-card fallback quips", () => {
  it("uses only the two approved canned lines until personalization exists", () => {
    const blurbs = fallbackSignalShowCardBlurbs();

    assert.deepEqual(blurbs, [
      "Episode 4: Now with 12% more dramatic pause.",
      "Guest chair's open. Bring me someone interesting",
    ]);
  });

  it("cycles the persisted personalized batch instead of mixing in fallbacks", () => {
    const blurbs = signalShowCardBlurbs({
      dashboardBlurbs: [
        "I brought the questions. The easy answers declined the invitation.",
        "The mic is on. Plausible deniability is not.",
      ],
    });

    assert.deepEqual(blurbs, [
      "I brought the questions. The easy answers declined the invitation.",
      "The mic is on. Plausible deniability is not.",
    ]);
  });

  it("reduces every hard-muted host blurb to the one canonical utterance", () => {
    const blurbs = signalShowCardBlurbs(
      {
        dashboardBlurbs: [
          "Even silence has a punchline.",
          "Tonight, I let the pause do the talking.",
        ],
      },
      true,
    );

    assert.deepEqual(blurbs, ["..."]);
  });
});
