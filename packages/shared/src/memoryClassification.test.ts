import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMemoryCategoryFromText,
  memoryQualifiesLongTerm,
} from "./memoryClassification.ts";

describe("classifyMemoryCategoryFromText", () => {
  it("treats bot-export persona lines starting with You as general, not user", () => {
    assert.equal(
      classifyMemoryCategoryFromText("You remember returning to Hogwarts to teach."),
      "general"
    );
    assert.equal(classifyMemoryCategoryFromText("You want a fair referee."), "general");
    assert.equal(classifyMemoryCategoryFromText("You believe OWLs measure preparation."), "general");
  });

  it("still classifies clear user preference lines as user", () => {
    assert.equal(classifyMemoryCategoryFromText("You like green tea."), "user");
    assert.equal(classifyMemoryCategoryFromText("You prefer short answers."), "user");
    assert.equal(classifyMemoryCategoryFromText("You want to learn Python."), "user");
    assert.equal(classifyMemoryCategoryFromText("You want me to use plain language."), "user");
    assert.equal(classifyMemoryCategoryFromText("You live on land."), "user");
    assert.equal(classifyMemoryCategoryFromText("Your favorite color is blue."), "user");
    assert.equal(classifyMemoryCategoryFromText("The user prefers dark mode."), "user");
    assert.equal(classifyMemoryCategoryFromText("Jared prefers kind people."), "user");
    assert.equal(classifyMemoryCategoryFromText("Jared lives on land."), "user");
  });

  it("detects bot-relation memories", () => {
    assert.equal(
      classifyMemoryCategoryFromText("Another bot mentioned you like tea."),
      "bot_relation"
    );
  });
});

describe("memoryQualifiesLongTerm", () => {
  it("keeps compiled persona memories below 95 percent in the orb layer", () => {
    assert.equal(
      memoryQualifiesLongTerm({
        confidence: 0.9,
        certainty: 0.9,
        durability: 0.9,
        source: "compiled",
      }),
      false
    );
  });

  it("allows direct durable memories at 90 percent and compiled memories at 95 percent", () => {
    assert.equal(
      memoryQualifiesLongTerm({
        confidence: 0.9,
        certainty: 0.9,
        durability: 0.5,
        source: "direct",
      }),
      true
    );
    assert.equal(
      memoryQualifiesLongTerm({
        confidence: 0.95,
        certainty: 0.95,
        durability: 0.2,
        source: "compiled",
      }),
      true
    );
  });
});
