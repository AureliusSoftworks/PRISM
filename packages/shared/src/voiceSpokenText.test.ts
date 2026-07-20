import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceSpokenText } from "./voiceSpokenText.ts";

describe("voice spoken text", () => {
  it("keeps a leaked Signal physical action off mic", () => {
    assert.equal(
      voiceSpokenText(
        "*leans back, antennae twitching* Alright, Potter—you've got me there.",
      ),
      "Alright, Potter—you've got me there.",
    );
  });

  it("removes trailing and action-only physical directions", () => {
    assert.equal(
      voiceSpokenText("That is the real answer. *folds arms*"),
      "That is the real answer.",
    );
    assert.equal(voiceSpokenText("*antennae twitching*"), "");
    assert.equal(
      voiceSpokenText("[sighs] *leans back* Welcome back."),
      "[sighs] Welcome back.",
    );
  });

  it("preserves emphasized words and non-action uses of physical verbs", () => {
    assert.equal(
      voiceSpokenText("The *important* part is trust."),
      "The important part is trust.",
    );
    assert.equal(
      voiceSpokenText("The tower *leans* left in the wind."),
      "The tower leans left in the wind.",
    );
  });
});
