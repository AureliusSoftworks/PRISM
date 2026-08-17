import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botcastHostTurnAddressesAskAboutCue,
  botcastHostTurnAddressesProducerCue,
  botcastHostTurnIncludesDirectQuote,
  botcastHostUtteranceIsGenericStall,
  botcastUtteranceContainsScreenplayLabels,
  botcastUtteranceIsNearDuplicate,
} from "../botcast-utterance-quality.ts";

const POE_LOOP =
  "The mechanisms underlie our ability to make decisions in real-time, even when we appear rational, but they are not the rational ones. They are the ones that whisper in the ear of the unconscious, the ones that shape the mind like a shadow upon a wall. And in that revelation, we are all but prisoners of our own thoughts.";

const FREUD_SCREENPLAY =
  '"Something feels... off. Not just in the air, but in the way we\'re here. You know what I mean?" **Action:** *leans slightly forward, eyes scanning the room with a quiet intensity.* **Spoken Line:** "Something feels... off. Not just in the air, but in the way we\'re here. You know what I mean?"';

describe("botcast utterance quality", () => {
  it("rejects labeled Action / Spoken Line screenplay scaffolding", () => {
    assert.equal(botcastUtteranceContainsScreenplayLabels(FREUD_SCREENPLAY), true);
    assert.equal(botcastUtteranceContainsScreenplayLabels("**Action:**"), true);
    assert.equal(botcastUtteranceContainsScreenplayLabels("**Spoken Line**:"), true);
    assert.equal(
      botcastUtteranceContainsScreenplayLabels(
        "**Stage Direction:** *taps the table* Then we continue.",
      ),
      true,
    );
  });

  it("accepts ordinary speech that mentions action without a screenplay label", () => {
    assert.equal(
      botcastUtteranceContainsScreenplayLabels(
        "The action that follows is the cost somebody has to live with.",
      ),
      false,
    );
    assert.equal(
      botcastUtteranceContainsScreenplayLabels(
        "*leans in a little* What did that dream actually cost you?",
      ),
      false,
    );
  });

  it("rejects a guest re-airing the same substantive answer", () => {
    assert.equal(botcastUtteranceIsNearDuplicate(POE_LOOP, [POE_LOOP]), true);
    assert.equal(
      botcastUtteranceIsNearDuplicate(
        `${POE_LOOP} [exhales]`,
        [POE_LOOP],
      ),
      true,
    );
    assert.equal(
      botcastUtteranceIsNearDuplicate(
        "The mechanisms underlie our ability to make decisions in real-time, even when we appear rational, but they are not the rational ones. They are the ones that whisper in the ear of the unconscious",
        [POE_LOOP],
      ),
      true,
    );
  });

  it("accepts a guest advancing with a fresh claim", () => {
    assert.equal(
      botcastUtteranceIsNearDuplicate(
        "I begin with the first irreversible choice: the tale that answers the living, and the cost borne by the person who has to read it.",
        [POE_LOOP],
      ),
      false,
    );
    assert.equal(botcastUtteranceIsNearDuplicate("Yes I am.", [POE_LOOP]), false);
  });

  it("rejects a generic host stall question", () => {
    assert.equal(
      botcastHostUtteranceIsGenericStall("What would you like to explore next?"),
      true,
    );
  });

  it("accepts a specific host follow-up", () => {
    assert.equal(
      botcastHostUtteranceIsGenericStall(
        "What mechanisms underlie our ability to make decisions in real-time, even when we appear rational?",
      ),
      false,
    );
  });

  it("treats an unrelated complete host line as missing the producer cue", () => {
    assert.equal(
      botcastHostTurnAddressesAskAboutCue(
        "Something feels off. Not just in the air, but in the way we're here. You know what I mean?",
        "why he keeps repeating himself.",
      ),
      false,
    );
  });

  it("treats a paraphrased host question as delivering the producer cue", () => {
    assert.equal(
      botcastHostTurnAddressesAskAboutCue(
        "You keep saying the same thing. What is the cost of repeating that answer?",
        "why he keeps repeating himself.",
      ),
      true,
    );
    assert.equal(
      botcastHostTurnAddressesAskAboutCue(
        "So tell me straight: what is written in that famous notebook of yours?",
        "what is written in the notebook",
      ),
      true,
    );
  });

  it("requires the producer direct quote instead of a euphemism or overlapping word", () => {
    assert.equal(
      botcastHostTurnIncludesDirectQuote(
        "How did it feel to have the F-bomb dropped on you?",
        "fuck you",
      ),
      false,
    );
    assert.equal(
      botcastHostTurnIncludesDirectQuote(
        "The producer said fuck you — how did that land?",
        "fuck you",
      ),
      true,
    );
    assert.equal(
      botcastHostTurnAddressesProducerCue(
        "Now, about that colorful message from our elusive Producer.",
        {
          detail: "how he feels about being told this from the Producer",
          directQuote: "Fuck you, you fucking piece of goddam shit. Bitch.",
        },
      ),
      false,
    );
    assert.equal(
      botcastHostTurnAddressesProducerCue(
        'Vex, the Producer said "Fuck you, you fucking piece of goddam shit. Bitch." How did that feel?',
        {
          detail: "how he feels about being told this from the Producer",
          directQuote: "Fuck you, you fucking piece of goddam shit. Bitch.",
        },
      ),
      true,
    );
    const story = [
      "In the village of Spudwick, potatoes were considered extremely boring.",
      "His name was Gerald.",
      "But somewhere beneath its skin, it was already planning Tuesday.",
    ].join(" ");
    assert.equal(
      botcastHostTurnIncludesDirectQuote(
        `The Producer sent this in: ${story}`,
        story,
      ),
      true,
    );
    assert.equal(
      botcastHostTurnIncludesDirectQuote(
        "The Producer sent in a charming potato story about Gerald.",
        story,
      ),
      false,
    );
  });
});
