import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  voicePerformanceTextFromAsteriskCues,
  voiceSpokenText,
} from "./voiceSpokenText.ts";

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

  it("turns starred human vocal sounds into actor performance tags", () => {
    assert.equal(
      voiceSpokenText("I have a point. *burp* Excuse me."),
      "I have a point. Excuse me.",
    );
    assert.equal(
      voicePerformanceTextFromAsteriskCues(
        "I have a point. *sighs heavily* Fine. *burp* Excuse me. *farts*",
      ),
      "I have a point. [sighs] Fine. [burps] Excuse me. [farts]",
    );
    assert.equal(
      voicePerformanceTextFromAsteriskCues(
        "*clears his throat* Listen. *laughs nervously*",
      ),
      "[clears throat] Listen. [laughs]",
    );
  });

  it("does not perform physical actions or Markdown emphasis", () => {
    assert.equal(
      voicePerformanceTextFromAsteriskCues(
        "*leans back* The *important* point remains.",
      ),
      null,
    );
  });
});
