import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collapseDeletedPromptWildcardDeckReferences,
  isStandaloneWildcardComposerDraft,
  maskBuiltInWildcardSlotsForPending,
  maskModelFilledWildcardSlotsForPending,
  pendingWildcardOptimisticMessageContent,
  promptContainsBuiltInWildcardSlots,
  promptContainsModelFilledWildcardSlots,
  promptInsertionStartsSentence,
  formatPromptShortcutInsertion,
  resendDraftTextForMessage,
  resolveBuiltInPromptWildcardInvocations,
  resolvePromptRandomizationGroups,
  splitPromptRandomizationOptions,
  withSentenceCasedPromptInsertion,
} from "./promptRandomization.ts";

describe("pendingWildcardOptimisticMessageContent", () => {
  it("uses the raw draft while wildcard resolution is pending", () => {
    assert.equal(
      pendingWildcardOptimisticMessageContent({
        rawDraft: "Tell !animals about {ADJECTIVE}.",
        resolvedDisplayContent: "Tell cat about {ADJECTIVE}.",
        pendingWildcardResolution: true,
      }),
      "Tell !animals about {ADJECTIVE}."
    );
  });

  it("does not leak locally resolved deck or option values while pending", () => {
    const content = pendingWildcardOptimisticMessageContent({
      rawDraft: "Tell !animals about {red|green} {STYLE}.",
      resolvedDisplayContent: "Tell cat about green {STYLE}.",
      pendingWildcardResolution: true,
    });

    assert.equal(content.includes("cat"), false);
    assert.equal(content.includes("{LOADING}"), false);
    assert.equal(content, "Tell !animals about {red|green} {STYLE}.");
  });

  it("keeps prompt shortcut sends collapsed to the user-authored invocation while pending", () => {
    assert.equal(
      pendingWildcardOptimisticMessageContent({
        rawDraft: "Tell me a wild /story",
        resolvedDisplayContent: "Tell me a wild write a story about a cat in a {STYLE} voice.",
        pendingWildcardResolution: true,
      }),
      "Tell me a wild /story"
    );
  });

  it("uses the resolved display content once there is no pending wildcard work", () => {
    assert.equal(
      pendingWildcardOptimisticMessageContent({
        rawDraft: "Tell !animals about {red|green}.",
        resolvedDisplayContent: "Tell cat about green.",
        pendingWildcardResolution: false,
      }),
      "Tell cat about green."
    );
  });
});

describe("resendDraftTextForMessage", () => {
  it("uses the wildcard template so resend regenerates placeholders", () => {
    assert.equal(
      resendDraftTextForMessage({
        content: "Tell cat about green.",
        promptWildcardTemplate: "Tell !animals about {red|green}.",
      }),
      "Tell !animals about {red|green}."
    );
  });

  it("falls back through prompt shortcut, alias, and visible content", () => {
    assert.equal(
      resendDraftTextForMessage({
        content: "Expanded text",
        commandAliasOriginalText: "/alias",
        promptShortcutTemplate: "/story {PLACE}",
      }),
      "/story {PLACE}"
    );
    assert.equal(
      resendDraftTextForMessage({
        content: "Expanded text",
        commandAliasOriginalText: "/alias",
      }),
      "/alias"
    );
    assert.equal(resendDraftTextForMessage({ content: " Plain text " }), "Plain text");
  });
});

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
          { key: "OPTION", value: "banana", start: 5, end: 11, source: "option" },
          { key: "OPTION", value: "green", start: 17, end: 22, source: "option" },
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
          { key: "RANDOMSHIT", value: "lemon", start: 14, end: 19, source: "deck" },
          { key: "OPTION", value: "spicy", start: 25, end: 30, source: "option" },
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
        replacements: [
          { key: "RANDOMSHIT", value: "potato", start: 5, end: 11, source: "deck" },
        ],
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
        replacements: [{ key: "NAME", value: "Alex", start: 5, end: 9, source: "deck" }],
      }
    );
  });

  it("keeps bang syntax deck-only, including text that resembles old numbered built-ins", () => {
    const deckResolution = resolvePromptRandomizationGroups("Pick !person and !person1.", {
      decks: [
        {
          name: "person",
          values: ["Alex"],
        },
      ],
      random: () => 0,
    });

    assert.deepEqual(deckResolution, {
      prompt: "Pick Alex and Alex1.",
      replacements: [
        { key: "PERSON", value: "Alex", start: 5, end: 9, source: "deck" },
        { key: "PERSON", value: "Alex", start: 14, end: 18, source: "deck" },
      ],
    });
    assert.deepEqual(
      resolveBuiltInPromptWildcardInvocations(
        deckResolution.prompt,
        deckResolution.replacements
      ),
      {
        prompt: "Pick Alex and Alex1.",
        replacements: [
          { key: "PERSON", value: "Alex", start: 5, end: 9, source: "deck" },
          { key: "PERSON", value: "Alex", start: 14, end: 18, source: "deck" },
        ],
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
        replacements: [{ key: "NAME", value: "Heath", start: 10, end: 15, source: "deck" }],
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
        replacements: [
          { key: "NAMESON", value: "Morgan", start: 5, end: 11, source: "deck" },
        ],
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
  it("leaves deprecated built-in bang wildcard invocations untouched", () => {
    assert.deepEqual(
      resolveBuiltInPromptWildcardInvocations("Make a !adjective apple and !plural-noun."),
      {
        prompt: "Make a !adjective apple and !plural-noun.",
        replacements: [],
      }
    );
  });

  it("leaves deprecated numbered built-in bang wildcard references untouched", () => {
    assert.deepEqual(
      resolveBuiltInPromptWildcardInvocations(
        "Make !person1 meet !person1 near !plural-noun2."
      ),
      {
        prompt: "Make !person1 meet !person1 near !plural-noun2.",
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
        prompt: "Ask glowing about !adjective.",
        replacements: [{ key: "MOOD", value: "glowing", start: 4, end: 11, source: "deck" }],
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
    assert.equal(promptContainsBuiltInWildcardSlots("Make it {ADJECTIVE1}."), true);
    assert.equal(promptContainsBuiltInWildcardSlots("Make it {CHARACTER}."), false);
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
    assert.equal(
      maskBuiltInWildcardSlotsForPending(
        "A {PLURAL NOUN1} with {red|green} {ADJECTIVE2}.",
        "{LOADING}"
      ),
      "A {LOADING} with {red|green} {LOADING}."
    );
  });

  it("detects model-filled uppercase brace slots beyond the built-in list", () => {
    assert.equal(promptContainsModelFilledWildcardSlots("Make it {WORD}."), true);
    assert.equal(promptContainsModelFilledWildcardSlots("Make it {MOOD RING}."), true);
    assert.equal(promptContainsModelFilledWildcardSlots("Make it {CHARACTER}."), false);
    assert.equal(promptContainsModelFilledWildcardSlots("Make it {CHARACTER1}."), false);
    assert.equal(promptContainsModelFilledWildcardSlots("Pick {red|green}."), false);
    assert.equal(promptContainsModelFilledWildcardSlots("Keep {word} literal."), false);
  });

  it("masks model-filled brace slots for optimistic canvas placeholders", () => {
    assert.equal(
      maskModelFilledWildcardSlotsForPending(
        "A {WORD} with {red|green}, {CHARACTER}, and {MOOD RING}.",
        "{LOADING}"
      ),
      "A {LOADING} with {red|green}, {CHARACTER}, and {LOADING}."
    );
  });
});

describe("isStandaloneWildcardComposerDraft", () => {
  it("recognizes one-off bang wildcard calls", () => {
    assert.equal(isStandaloneWildcardComposerDraft("!individually"), true);
    assert.equal(isStandaloneWildcardComposerDraft(" !plural-noun. "), true);
  });

  it("recognizes one-off uppercase brace wildcard calls", () => {
    assert.equal(isStandaloneWildcardComposerDraft("{WORD}"), true);
    assert.equal(isStandaloneWildcardComposerDraft("{MOOD RING}!"), true);
    assert.equal(isStandaloneWildcardComposerDraft("{CHARACTER}"), false);
  });

  it("recognizes one-off hardcoded option groups", () => {
    assert.equal(isStandaloneWildcardComposerDraft("{red|green}"), true);
    assert.equal(isStandaloneWildcardComposerDraft("{ soft | sharp }."), true);
  });

  it("ignores wildcard calls embedded in prose", () => {
    assert.equal(isStandaloneWildcardComposerDraft("tell me about !topic"), false);
    assert.equal(isStandaloneWildcardComposerDraft("use {WORD} here"), false);
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
