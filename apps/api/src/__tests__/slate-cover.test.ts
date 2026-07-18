import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeSlateProjectCoverPrompt } from "../slate-cover.ts";

describe("Slate project covers", () => {
  it("turns project truth into artwork-only portrait direction", () => {
    const prompt = composeSlateProjectCoverPrompt({
      title: "The Glass City",
      spark: "A city calls its architect home.",
      premise: "An architect returns to the city that learned her name.",
      voice: "Luminous architectural gothic with intimate first-person prose.",
    });

    assert.match(prompt, /The Glass City/u);
    assert.match(prompt, /city that learned her name/u);
    assert.match(prompt, /Luminous architectural gothic/u);
    assert.match(prompt, /PRISM/u);
    assert.match(prompt, /no title, letters, words, typography/u);
    assert.match(prompt, /Portrait 2:3/u);
  });

  it("falls back to the spark without inventing project metadata", () => {
    const prompt = composeSlateProjectCoverPrompt({
      title: "Untitled Story",
      spark: "A red door appears at low tide.",
      premise: "",
      voice: "",
    });

    assert.match(prompt, /A red door appears at low tide/u);
    assert.match(prompt, /Infer a distinctive literary tone/u);
  });
});
