import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botcastGuestUtteranceIsGenericStall,
  botcastHostTurnAddressesAskAboutCue,
  botcastHostTurnAddressesProducerCue,
  botcastHostTurnIncludesDirectQuote,
  botcastHostUtteranceIsGenericStall,
  botcastHostUtteranceNeedsInterviewQuestion,
  botcastRecoveryUtteranceIsNearDuplicate,
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

  it("rejects a repeated recovery question behind a reshuffled first-contact alias", () => {
    assert.equal(
      botcastRecoveryUtteranceIsNearDuplicate(
        "Hello—I'm Drew. At what point does that stop being a claim and become a choice with a cost?",
        [
          "Hello—I'm Nyx Emberveil. At what point does that stop being a claim and become a choice with a cost?",
        ],
      ),
      true,
    );
  });

  it("accepts a fresh recovery question after a reshuffled first-contact alias", () => {
    assert.equal(
      botcastRecoveryUtteranceIsNearDuplicate(
        "Hello—I'm Drew. Which consequence is easiest to ignore, and who benefits from ignoring it?",
        [
          "Hello—I'm Nyx Emberveil. At what point does that stop being a claim and become a choice with a cost?",
        ],
      ),
      false,
    );
  });

  it("rejects the observed Signal abstract-answer loop while preserving a concrete advance", () => {
    const earlier =
      "Ah, your words dance like colors in a storm, swirling and shifting with unknown meaning. Let us anchor ourselves in the clarity of choice, toll, and consequence, for therein lies the truth we seek amidst the chaos.";
    const repeated =
      "Ah, amidst the swirling storm of your words, let us return to the heart of clarity: the choices we make, the toll they take, and the consequences we carry forward. In these reflections lies the truth we seek, even in the midst of chaos.";
    const concreteAdvance =
      "A wheat field gives me a usable rule: bend every yellow stroke in the worker's direction, so the labor remains visible without making hardship decorative.";

    assert.equal(botcastUtteranceIsNearDuplicate(repeated, [earlier]), true);
    assert.equal(
      botcastUtteranceIsNearDuplicate(concreteAdvance, [earlier]),
      false,
    );
  });

  it("rejects a generic host stall question", () => {
    assert.equal(
      botcastHostUtteranceIsGenericStall("What would you like to explore next?"),
      true,
    );
    assert.equal(
      botcastHostUtteranceIsGenericStall(
        "The signal is clear we need to move forward",
      ),
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

  it("requires an ordinary host turn to return the floor with a question", () => {
    assert.equal(
      botcastHostUtteranceNeedsInterviewQuestion(
        "I love your energy right now.",
      ),
      true,
    );
    assert.equal(
      botcastHostUtteranceNeedsInterviewQuestion(
        "That is a sharp distinction. Who pays for it?",
      ),
      false,
    );
    assert.equal(
      botcastHostUtteranceNeedsInterviewQuestion(
        "That keeps the energy up, doesn't it? But the tradeoff is still vague.",
      ),
      true,
    );
  });

  it("rejects vague guest reactions as primary answers", () => {
    assert.equal(botcastGuestUtteranceIsGenericStall("That is optimistic."), true);
    assert.equal(botcastGuestUtteranceIsGenericStall("I mean it's over"), true);
    assert.equal(botcastGuestUtteranceIsGenericStall("Hello, Oz"), true);
    assert.equal(botcastGuestUtteranceIsGenericStall("Let us continue."), true);
    assert.equal(
      botcastGuestUtteranceIsGenericStall(
        "Hello, Drew. I’m Oz; I think there may be some crossed wires. What subject would you prefer to begin with?",
      ),
      true,
    );
    assert.equal(
      botcastGuestUtteranceIsGenericStall(
        "Responsiveness preserves agency when someone must act quickly.",
      ),
      false,
    );
    assert.equal(
      botcastGuestUtteranceIsGenericStall(
        "Hello, Cookie. I’m Rowan; a proper repair is simple: use the corrected name consistently and let trust rebuild.",
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
