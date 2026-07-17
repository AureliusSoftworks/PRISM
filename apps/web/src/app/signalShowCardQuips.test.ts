import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallbackSignalShowCardQuips } from "./signalShowCardQuips.ts";

describe("Signal show-card fallback quips", () => {
  it("provides four show-aware lines for a new show", () => {
    const quips = fallbackSignalShowCardQuips({
      name: "Midnight Frequency",
      episodeCount: 0,
    });

    assert.equal(quips.length, 4);
    assert.match(quips[2], /Midnight Frequency/u);
    assert.match(quips[3], /pilot/u);
  });

  it("tees up the next episode for an established show", () => {
    const quips = fallbackSignalShowCardQuips({
      name: "Midnight Frequency",
      episodeCount: 6,
    });

    assert.match(quips[3], /Episode 7/u);
  });
});
