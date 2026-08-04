import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { immersiveThinkingCaption } from "./immersiveThinkingCaption.ts";

describe("immersiveThinkingCaption", () => {
  it("gives authored personas concise in-character activity captions", () => {
    const rick = immersiveThinkingCaption(
      { id: "rick-sanchez", name: "Rick Sanchez" },
      "turn-one",
    );
    const trump = immersiveThinkingCaption(
      { id: "donald-trump", name: "Donald Trump" },
      "turn-one",
    );

    assert.match(
      rick,
      /^(?:Tuning portal gun|Checking interdimensional coordinates|Ignoring safety protocols)…$/u,
    );
    assert.match(
      trump,
      /^(?:Planning next term|Drafting the headline|Sizing up the room)…$/u,
    );
  });

  it("uses persona themes locally without exposing prompts or reasoning", () => {
    const caption = immersiveThinkingCaption(
      {
        id: "custom-detective",
        name: "Mara",
        systemPrompt: "A patient detective who evaluates evidence carefully.",
      },
      "private user text that must not appear",
    );

    assert.match(
      caption,
      /^(?:Following the clues|Reconstructing the scene|Testing the alibi)…$/u,
    );
    assert.doesNotMatch(caption, /private|user text|reason/iu);
  });

  it("is stable per turn and always falls back to one short caption", () => {
    const first = immersiveThinkingCaption(
      { id: "custom", name: "Nova" },
      "turn-two",
    );
    const second = immersiveThinkingCaption(
      { id: "custom", name: "Nova" },
      "turn-two",
    );

    assert.equal(first, second);
    assert.match(first, /^.{1,48}…$/u);
  });
});
