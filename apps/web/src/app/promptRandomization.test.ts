import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collapseDeletedPromptWildcardDeckReferences,
  maskBuiltInWildcardSlotsForPending,
  promptContainsBuiltInWildcardSlots,
  promptInsertionStartsSentence,
  formatPromptShortcutInsertion,
  resolveBuiltInPromptWildcardInvocations,
  resolvePromptRandomizationGroups,
  splitPromptRandomizationOptions,
  withSentenceCasedPromptInsertion,
} from "./promptRandomization.ts";

describe("withSentenceCasedPromptInsertion", () => {
  it("capitalizes sentence-start insertions without lowercasing mid-sentence insertions", () => {
    assert.equal(withSentenceCasedPromptInsertion("moldy phrase", ""), "Moldy phrase");
    assert.equal(withSentenceCasedPromptInsertion("moldy phrase", "Wait. "), "Moldy phrase");
    assert.equal(withSentenceCasedPromptInsertion("moldy phrase", "a random "), "moldy phrase");
    assert.equal(withSentenceCasedPromptInsertion("Moldy phrase", "a random "), "Moldy phrase");
    assert.equal(promptInsertionStartsSentence("line one\n"), true);
  });

  it("does not mangle acronyms or the pronoun I mid-sentence", () => {
    assert.equal(withSentenceCasedPromptInsertion("PRISM memory", "ask "), "PRISM memory");
    assert.equal(withSentenceCasedPromptInsertion("I remember this", "and "), "I remember this");
  });
});

describe("formatPromptShortcutInsertion", () => {
  it("lowercases inline prompt shortcuts and lets surrounding punctuation win", () => {
    assert.equal(
      formatPromptShortcutInsertion("Say you are a chicken.", "First, ", ", then "),
      "say you are a chicken"
    );
    assert.equal(
      formatPromptShortcutInsertion("Say you are a pig.", "First, say this, then ", "."),
      "say you are a pig"
    );
  });

  it("preserves sentence-start capitalization, acronyms, and standalone I", () => {
    assert.equal(formatPromptShortcutInsertion("say hello.", "", ""), "Say hello.");
    assert.equal(formatPromptShortcutInsertion("PRISM memory", "ask ", ""), "PRISM memory");
    assert.equal(formatPromptShortcutInsertion("I remember this", "and ", ""), "I remember this");
  });
});

describe("splitPromptRandomizationOptions", () => {
  it("splits pipe options and trims whitespace", () => {
    assert.deepEqual(splitPromptRandomizationOptions(" apple | banana | grape "), [
      "apple",
      "banana",
      "grape",
    ]);
  });

  it("keeps escaped pipes inside an option", () => {
    assert.deepEqual(splitPromptRandomizationOptions("apple\\|banana|grape"), [
      "apple\\|banana",
      "grape",
    ]);
  });
});

describe("resolvePromptRandomizationGroups", () => {
  it("returns the resolved prompt and selected option ranges", () => {
    assert.deepEqual(
      resolvePromptRandomizationGroups("Pick {apple|banana|grape} with {red|green}.", {
        random: () => 0.5,
      }),
      {
        prompt: "Pick banana with green.",
        replacements: [
          { key: "OPTION", value: "banana", start: 5, end: 11 },
          { key: "OPTION", value: "green", start: 17, end: 22 },
        ],
      }
    );
  });

  it("leaves non-option braces alone", () => {
    assert.deepEqual(resolvePromptRandomizationGroups("Make a {ADJECTIVE} apple."), {
      prompt: "Make a {ADJECTIVE} apple.",
      replacements: [],
    });
  });

  it("resolves named wildcard decks and tracks their ranges", () => {
    assert.deepEqual(
      resolvePromptRandomizationGroups("Tell me about !randomShit with {spicy|gentle} {ADJECTIVE}.", {
        decks: [
          {
            name: "randomShit",
            values: ["lemon", "potato", "chicken"],
          },
        ],
        random: () => 0,
      }),
      {
        prompt: "Tell me about lemon with spicy {ADJECTIVE}.",
        replacements: [
          { key: "RANDOMSHIT", value: "lemon", start: 14, end: 19 },
          { key: "OPTION", value: "spicy", start: 25, end: 30 },
        ],
      }
    );
  });

  it("uses deck aliases case-insensitively", () => {
    assert.deepEqual(
      resolvePromptRandomizationGroups("Pick !RS.", {
        decks: [
          {
            name: "randomShit",
            aliases: ["rs"],
            values: ["potato"],
          },
        ],
      }),
      {
        prompt: "Pick potato.",
        replacements: [{ key: "RANDOMSHIT", value: "potato", start: 5, end: 11 }],
      }
    );
  });

  it("resolves known deck prefixes when text touches the wildcard chip", () => {
    assert.deepEqual(
      resolvePromptRandomizationGroups("Pick !nameson.", {
        decks: [
          {
            name: "name",
            values: ["Alex"],
          },
        ],
      }),
      {
        prompt: "Pick Alexson.",
        replacements: [{ key: "NAME", value: "Alex", start: 5, end: 9 }],
      }
    );
  });

  it("preserves authored capitalization for custom names that touch prose", () => {
    assert.deepEqual(
      resolvePromptRandomizationGroups('lastname "!nameson"', {
        decks: [
          {
            name: "name",
            values: ["Heath"],
          },
        ],
      }),
      {
        prompt: 'lastname "Heathson"',
        replacements: [{ key: "NAME", value: "Heath", start: 10, end: 15 }],
      }
    );
  });

  it("prefers the longest deck name when touching prose", () => {
    assert.deepEqual(
      resolvePromptRandomizationGroups("Pick !nameson.", {
        decks: [
          {
            name: "name",
            values: ["Alex"],
          },
          {
            name: "nameson",
            values: ["Morgan"],
          },
        ],
      }),
      {
        prompt: "Pick Morgan.",
        replacements: [{ key: "NAMESON", value: "Morgan", start: 5, end: 11 }],
      }
    );
  });

  it("sentence-cases deck and option replacements by placement", () => {
    const result = resolvePromptRandomizationGroups(
      "!mood begins. a !mood follows. Then. {soft|LOUD} lands.",
      {
        decks: [
          {
            name: "mood",
            values: ["moldy"],
          },
        ],
        random: () => 0,
      }
    );

    assert.equal(result.prompt, "Moldy begins. a moldy follows. Then. Soft lands.");
    assert.deepEqual(
      result.replacements.map((replacement) => ({
        value: replacement.value,
        text: result.prompt.slice(replacement.start, replacement.end),
      })),
      [
        { value: "Moldy", text: "Moldy" },
        { value: "moldy", text: "moldy" },
        { value: "Soft", text: "Soft" },
      ]
    );
  });
});

describe("resolveBuiltInPromptWildcardInvocations", () => {
  it("converts built-in bang wildcard invocations to deferred brace slots", () => {
    assert.deepEqual(
      resolveBuiltInPromptWildcardInvocations("Make a !adjective apple and !plural-noun."),
      {
        prompt: "Make a {ADJECTIVE} apple and {PLURAL NOUN}.",
        replacements: [],
      }
    );
  });

  it("preserves existing custom wildcard replacement ranges", () => {
    const deckResolution = resolvePromptRandomizationGroups("Ask !mood about !adjective.", {
      decks: [{ name: "mood", values: ["glowing"] }],
      random: () => 0,
    });

    assert.deepEqual(
      resolveBuiltInPromptWildcardInvocations(
        deckResolution.prompt,
        deckResolution.replacements
      ),
      {
        prompt: "Ask glowing about {ADJECTIVE}.",
        replacements: [{ key: "MOOD", value: "glowing", start: 4, end: 11 }],
      }
    );
  });

  it("leaves unknown bang tokens untouched", () => {
    assert.deepEqual(resolveBuiltInPromptWildcardInvocations("Ask !mystery now."), {
      prompt: "Ask !mystery now.",
      replacements: [],
    });
  });
});

describe("pending built-in wildcard slot masking", () => {
  it("detects known brace slots without treating option groups as true wildcards", () => {
    assert.equal(promptContainsBuiltInWildcardSlots("Make it {ADJECTIVE}."), true);
    assert.equal(promptContainsBuiltInWildcardSlots("Pick {red|green}."), false);
    assert.equal(promptContainsBuiltInWildcardSlots("Keep {MOOD RING} unknown."), false);
  });

  it("masks only known built-in brace slots for optimistic canvas placeholders", () => {
    assert.equal(
      maskBuiltInWildcardSlotsForPending(
        "A {PLURAL NOUN} with {red|green} {ADJECTIVE}.",
        "{LOADING}"
      ),
      "A {LOADING} with {red|green} {LOADING}."
    );
  });
});

describe("collapseDeletedPromptWildcardDeckReferences", () => {
  it("replaces deleted deck invocations with a stable brace fallback", () => {
    assert.equal(
      collapseDeletedPromptWildcardDeckReferences("Write about !moods today.", {
        name: "moods",
        values: ["joyful", "grim"],
      }),
      "Write about {moods} today."
    );
  });

  it("collapses aliases to the deleted deck's primary name", () => {
    assert.equal(
      collapseDeletedPromptWildcardDeckReferences("Mix !tone and !other.", {
        name: "moods",
        aliases: ["tone"],
        values: ["joyful"],
      }),
      "Mix {moods} and !other."
    );
  });

  it("keeps touching prose after collapsed deck prefixes", () => {
    assert.equal(
      collapseDeletedPromptWildcardDeckReferences("Mix !nameson.", {
        name: "name",
        values: ["Alex"],
      }),
      "Mix {name}son."
    );
  });
});
