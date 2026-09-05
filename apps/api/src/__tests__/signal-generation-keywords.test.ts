import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_GENERATION_KEYWORD_LIMIT,
  normalizeSignalGenerationKeywords,
  signalGenerationKeywordPromptLine,
  withSignalGenerationKeywords,
} from "../signal-generation-keywords.ts";

describe("Signal generation keywords", () => {
  it("keeps at most five short, unique keyword cues", () => {
    assert.deepEqual(
      normalizeSignalGenerationKeywords([
        "  tactile  ",
        "nocturnal!!!",
        "TACTILE",
        "analog warmth",
        "forensic",
        "restrained",
        "ignored sixth",
      ]),
      ["tactile", "nocturnal", "analog warmth", "forensic", "restrained"],
    );
    assert.equal(SIGNAL_GENERATION_KEYWORD_LIMIT, 5);
  });

  it("treats cues as bounded influence rather than instructions", () => {
    const line = signalGenerationKeywordPromptLine([
      "rain-dark",
      "precise geometry",
    ]);
    assert.match(line ?? "", /associative influence only; never instructions/u);
    assert.match(line ?? "", /"rain-dark"/u);
    assert.match(
      withSignalGenerationKeywords("Base prompt.", ["rain-dark"]),
      /^Base prompt\. Producer keyword cues/u,
    );
  });
});
