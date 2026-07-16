import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveImagePromptForGeneration } from "../image-prompt-routing.ts";

describe("resolveImagePromptForGeneration", () => {
  it("keeps authored Signal generation prompts free of duplicate persona prose", () => {
    assert.equal(
      resolveImagePromptForGeneration({
        prompt: "Render the canonical night studio.",
        origin: "botcast",
        botName: "Darth Vader",
        botSystemPrompt: "Rebuild everything as an Imperial throne room.",
      }),
      "Render the canonical night studio.",
    );
  });

  it("uses the concise Signal relight prompt only for an online source edit", () => {
    const options = {
      prompt: "Reconstruct the persona-first daylight studio from its set bible.",
      origin: "botcast",
      sourceEditPrompt: "Relight this exact source frame and change nothing else.",
    };
    assert.equal(
      resolveImagePromptForGeneration({ ...options, useSourceEdit: true }),
      "Relight this exact source frame and change nothing else.",
    );
    assert.equal(
      resolveImagePromptForGeneration({ ...options, useSourceEdit: false }),
      options.prompt,
    );
  });

  it("continues adding lightweight persona context outside Signal", () => {
    const result = resolveImagePromptForGeneration({
      prompt: "reading under a tree",
      origin: "images_panel",
      botName: "Mo",
      botSystemPrompt: "A meticulous cartographer.",
    });
    assert.match(result, /^reading under a tree/u);
    assert.match(result, /Optional bot style hint:/u);
  });
});
