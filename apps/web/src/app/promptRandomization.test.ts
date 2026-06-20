import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePromptRandomizationGroups,
  splitPromptRandomizationOptions,
} from "./promptRandomization.ts";

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
});
