import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  voicePerformanceTextFromActionCues,
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

  it("keeps Zen presentation gestures out of spoken dialogue", () => {
    const text =
      "*offers a hopeful half-smile* Oh! Hello there... goodness, I don't believe we've met.";
    assert.equal(
      voiceSpokenText(text),
      "Oh! Hello there... goodness, I don't believe we've met.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(text),
      "[offers a hopeful half-smile] Oh! Hello there... goodness, I don't believe we've met.",
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
      "Welcome back.",
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
      voicePerformanceTextFromActionCues("*yells* Like this!"),
      "[shouts] Like this!",
    );
    assert.equal(
      voiceSpokenText("I have a point. *burp* Excuse me."),
      "I have a point. Excuse me.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "I have a point. *sighs heavily* Fine. *burp* Excuse me. *farts*",
      ),
      "I have a point. [sighs] Fine. [burps] Excuse me. [farts]",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*clears his throat* Listen. *laughs nervously*",
      ),
      "[clears throat] Listen. [laughs]",
    );
    assert.equal(
      voiceSpokenText("Look *gasp* at *scream* me! *dance*"),
      "Look at me!",
    );
  });

  it("performs physical actions without treating Markdown emphasis as a cue", () => {
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*leans back* The *important* point remains.",
      ),
      "[leans back] The important point remains.",
    );
  });

  it("survives nested quoted asterisks and burst-out laughter", () => {
    // Nested inner marks must not shred the outer action block.
    const nested = '*belches with an audible "*burp*"* I think we\'re close.';
    assert.equal(voiceSpokenText(nested), "I think we're close.");
    assert.equal(
      voicePerformanceTextFromActionCues(nested),
      "[burps] I think we're close.",
    );
    assert.equal(
      voiceSpokenText("Oh boy. *Bursts into laughter* This is good."),
      "Oh boy. This is good.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "Oh boy. *Bursts into laughter* This is good.",
      ),
      "Oh boy. [laughs] This is good.",
    );
  });

  it("keeps trailing winks and pause-bridged directions off mic", () => {
    // "*wink*" at the end of a sentence is a stage direction, never a word.
    assert.equal(
      voiceSpokenText("The war effort was tanking *wink*."),
      "The war effort was tanking .",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "The war effort was tanking *wink*.",
      ),
      "The war effort was tanking [wink].",
    );
    // A direction bridging two spoken pauses is stagecraft, not emphasis.
    assert.equal(
      voiceSpokenText("No response is needed for your... *pauses* ...bluntness."),
      "No response is needed for your... ...bluntness.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "No response is needed for your... *pauses* ...bluntness.",
      ),
      "No response is needed for your... [pauses] ...bluntness.",
    );
  });

  it("treats bracketed and asterisked actions as one actor-performance stream", () => {
    const text = "Look [gasp] at *scream* me! [dance]";
    assert.equal(voiceSpokenText(text), "Look at me!");
    assert.equal(
      voicePerformanceTextFromActionCues(text),
      "Look [gasp] at [screams] me! [dance]",
    );
  });

  it("keeps bot-mention markdown out of the action syntax", () => {
    const text = "[Ada](prism-bot://bot-ada), *waves* hello.";
    assert.equal(voiceSpokenText(text), "[Ada](prism-bot://bot-ada), hello.");
    assert.equal(
      voicePerformanceTextFromActionCues(text),
      "[Ada](prism-bot://bot-ada), [waves] hello.",
    );
  });
});
