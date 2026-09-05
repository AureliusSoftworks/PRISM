import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCoffeeGroupSetupSuggestionV1,
  type CoffeeGroupSetupSuggestionV1,
} from "./coffeeGroupSetup.ts";

describe("normalizeCoffeeGroupSetupSuggestionV1", () => {
  it("accepts a complete New Coffee Group draft", () => {
    const suggestion = normalizeCoffeeGroupSetupSuggestionV1(
      {
        name: "Surreal-Simplicity",
        ethos:
          "They gather when dream logic and quiet craft need the same table.",
        groupBotIds: ["bot-a", "bot-b", "bot-c", null, null],
        coffeeSettings: {
          tableEnergy: "theatre",
          crossTalk: "chatty",
          responseLength: "detailed",
        },
        starterTopics: [
          "What would you paint if nobody was watching?",
          "Which dream keeps interrupting breakfast?",
          "Is simplicity a disguise for something stranger?",
        ],
        notes: "Keep the table playful.",
      },
      ["bot-a", "bot-b", "bot-c", "bot-d"],
    );
    assert.ok(suggestion);
    assert.equal(suggestion.name, "Surreal-Simplicity");
    assert.equal(suggestion.groupBotIds.filter(Boolean).length, 3);
    assert.equal(suggestion.starterTopics.length, 3);
    assert.equal(suggestion.coffeeSettings.tableEnergy, "theatre");
  });

  it("rejects unknown bots and thin casts", () => {
    assert.equal(
      normalizeCoffeeGroupSetupSuggestionV1(
        {
          name: "Too Thin",
          ethos: "Only one guest showed up to the cafe.",
          groupBotIds: ["bot-a"],
          starterTopics: ["Hello?", "Anyone?"],
        },
        ["bot-a", "bot-b"],
      ),
      null,
    );
    assert.equal(
      normalizeCoffeeGroupSetupSuggestionV1(
        {
          name: "Mystery Guests",
          ethos: "Invented strangers do not belong in the Library.",
          groupBotIds: ["ghost-1", "ghost-2"],
          starterTopics: ["Who are you?", "Where from?"],
        },
        ["bot-a", "bot-b"],
      ),
      null,
    );
  });

  it("pads seats to five and drops duplicate roster ids", () => {
    const suggestion = normalizeCoffeeGroupSetupSuggestionV1(
      {
        name: "Trio Table",
        ethos: "Three voices are enough when the contrast is sharp.",
        groupBotIds: ["bot-a", "bot-a", "bot-b", "bot-c"],
        starterTopics: ["Open with a quiet dare.", "Trade one unfinished idea."],
      } satisfies Partial<CoffeeGroupSetupSuggestionV1>,
      ["bot-a", "bot-b", "bot-c"],
    );
    assert.ok(suggestion);
    assert.deepEqual(suggestion.groupBotIds, [
      "bot-a",
      "bot-b",
      "bot-c",
      null,
      null,
    ]);
  });
});
