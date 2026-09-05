import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { askQuestionOptionsArePromptFragments } from "./askQuestionDisplay.ts";

describe("AskQuestion display validation", () => {
  it("rejects comma-split fragments from an open-ended question", () => {
    const prompt =
      "As we begin, what's one rumor or piece of history you've always found intriguing that you'd like to explore further?";

    assert.equal(
      askQuestionOptionsArePromptFragments(prompt, {
        prompt,
        options: [
          { label: "As we begin" },
          { label: "what's one rumor" },
        ],
      }),
      true,
    );
  });

  it("keeps explicit alternatives whose labels are mentioned in the prompt", () => {
    const prompt = "As we begin, would you rather explore a rumor or a legend?";

    assert.equal(
      askQuestionOptionsArePromptFragments(prompt, {
        prompt,
        options: [{ label: "A rumor" }, { label: "A legend" }],
      }),
      false,
    );
  });
});
