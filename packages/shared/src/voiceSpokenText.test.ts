import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collapseRemovedCueWhitespace,
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
      null,
    );
  });

  it("trusts PRISM's separate Action field without muting Markdown emphasis", () => {
    const explicitAction = { leadingMarkedAction: true } as const;
    assert.equal(
      voiceSpokenText(
        "*DOES A BACKFLIP THROUGH CONFETTI* The *important* part remains.",
        explicitAction,
      ),
      "The important part remains.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*DOES A BACKFLIP THROUGH CONFETTI* The *important* part remains.",
        explicitAction,
      ),
      null,
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*LAUGHS* The *important* part remains.",
        explicitAction,
      ),
      "[laughs] The important part remains.",
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
      voicePerformanceTextFromActionCues("*LAUGHS* That was funny."),
      "[laughs] That was funny.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues("Trololo *breath* lololin' Terry"),
      "Trololo [exhales] lololin' Terry",
    );
    assert.equal(
      voiceSpokenText("Trololo *breaths* lololin' Terry"),
      "Trololo lololin' Terry",
    );
    assert.equal(
      voiceSpokenText("Look *gasp* at *scream* me! *dance*"),
      "Look at me!",
    );
    assert.equal(
      voiceSpokenText("*speaks loudly* The record is clear."),
      "The record is clear.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*says loudly* The record is clear.",
      ),
      "[speaks loudly] The record is clear.",
    );
  });

  it("repairs duplicate punctuation around a removed inline performance cue", () => {
    assert.equal(collapseRemovedCueWhitespace("Okay,  ,"), "Okay,");
    assert.equal(voiceSpokenText("Okay, [burps],"), "Okay,");
    assert.equal(
      voicePerformanceTextFromActionCues("Okay, [burps],"),
      "Okay [burps],",
    );
  });

  it("performs physical actions without treating Markdown emphasis as a cue", () => {
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*leans back* The *important* point remains.",
      ),
      null,
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

  it("leaves PRISM-bundled bodily Foley out when local playback is guaranteed", () => {
    const localFoley = { omitLocalFoleyTags: true } as const;
    assert.equal(
      voicePerformanceTextFromActionCues(
        "*LAUGHS* That was funny. *FARTS* Excuse me.",
        localFoley,
      ),
      "[laughs] That was funny. Excuse me.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "[coughs] Still speaking. *burps* Sorry.",
        localFoley,
      ),
      "Still speaking. Sorry.",
    );
  });

  it("keeps trailing winks and pause-bridged directions off mic", () => {
    // "*wink*" at the end of a sentence is a stage direction, never a word.
    assert.equal(
      voiceSpokenText("The war effort was tanking *wink*."),
      "The war effort was tanking.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "The war effort was tanking *wink*.",
      ),
      null,
    );
    // A direction bridging two spoken pauses is stagecraft, not emphasis.
    assert.equal(
      voiceSpokenText("No response is needed for your... *pauses* ...bluntness."),
      "No response is needed for your...bluntness.",
    );
    assert.equal(
      voicePerformanceTextFromActionCues(
        "No response is needed for your... *pauses* ...bluntness.",
      ),
      null,
    );
  });

  it("treats bracketed and asterisked actions as one actor-performance stream", () => {
    const text = "Look [gasp] at *scream* me! [dance]";
    assert.equal(voiceSpokenText(text), "Look at me!");
    assert.equal(
      voicePerformanceTextFromActionCues(text),
      "Look [gasps] at [screams] me!",
    );
  });

  it("keeps bot-mention markdown out of the action syntax", () => {
    const text = "[Ada](prism-bot://bot-ada), *waves* hello.";
    assert.equal(voiceSpokenText(text), "[Ada](prism-bot://bot-ada), hello.");
    assert.equal(
      voicePerformanceTextFromActionCues(text),
      null,
    );
  });

  it("drops unsupported bracket actions instead of risking literal speech", () => {
    assert.equal(
      voicePerformanceTextFromActionCues(
        "[leans back] Welcome. [explosion] Still here.",
      ),
      null,
    );
    assert.equal(
      voicePerformanceTextFromActionCues("[sarcastic] Obviously."),
      "[sarcastic] Obviously.",
    );
  });
});
