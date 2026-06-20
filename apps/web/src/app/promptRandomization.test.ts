import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collapseDeletedPromptWildcardDeckReferences,
  promptInsertionStartsSentence,
  resolvePromptRandomizationGroups,
  splitPromptRandomizationOptions,
  withSentenceCasedPromptInsertion,
} from "./promptRandomization.ts";

describe("withSentenceCasedPromptInsertion", () => {
  it("capitalizes sentence-start insertions and lowercases mid-sentence insertions", () => {
    assert.equal(withSentenceCasedPromptInsertion("moldy phrase", ""), "Moldy phrase");
    assert.equal(withSentenceCasedPromptInsertion("moldy phrase", "Wait. "), "Moldy phrase");
    assert.equal(withSentenceCasedPromptInsertion("Moldy phrase", "a random "), "moldy phrase");
    assert.equal(promptInsertionStartsSentence("line one\n"), true);
  });

  it("does not mangle acronyms or the pronoun I mid-sentence", () => {
    assert.equal(withSentenceCasedPromptInsertion("PRISM memory", "ask "), "PRISM memory");
    assert.equal(withSentenceCasedPromptInsertion("I remember this", "and "), "I remember this");
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
});
