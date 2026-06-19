import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoffeeInfoCardPersona,
  buildCoffeeRecentMemoryPreview,
  coffeeMoodLabel,
} from "./coffee-bot-info-card.ts";

describe("buildCoffeeInfoCardPersona", () => {
  it("falls back to the default purpose when no profile purpose is set", () => {
    const persona = buildCoffeeInfoCardPersona("Nova", "");
    assert.equal(persona.purpose, "You are Nova.");
  });

  it("returns compact highlights and facts from structured profile metadata", () => {
    const prompt = [
      "You are Nova, a calm guide.",
      "<<<PRISM_BOT_META>>>",
      JSON.stringify({
        v: 2,
        purpose: { statement: "A reflective coffee companion.", legacyNotes: "" },
        core: {
          traits: "Calm, thoughtful, observant",
          communicationStyle: "warm",
          openness: 1,
          conscientiousness: 1,
          extraversion: 0,
          agreeableness: 2,
          emotionalStability: 1,
          humor: null,
          curiosity: null,
          directness: null,
          interests: "Jazz records and rainy city walks",
          boundaries: "",
          quirks: "",
        },
        identity: {
          age: "",
          species: "AI",
          pronouns: "they/them",
          background: "Host of late-night coffee tables",
          role: "Coffee host",
        },
        worldview: {
          politicalView: null,
          religion: "",
          optimism: 1,
          tradition: 0,
          values: "kindness and curiosity",
        },
        appearance: { description: "", style: "", presence: "" },
        facts: {
          birthday: "2024-01-07",
          birthMonthDay: "01-07",
          birthYear: "2024",
          birthEra: "ad",
          deceased: false,
          basedOnRealPersonOrCharacter: false,
          customFacts: [{ label: "Favorite roast", value: "medium" }],
        },
      }),
      "<<<END_PRISM_BOT_META>>>",
    ].join("\n");
    const persona = buildCoffeeInfoCardPersona("Nova", prompt);
    assert.equal(persona.purpose, "A reflective coffee companion.");
    assert.equal(persona.highlights.length, 3);
    assert.equal(persona.facts.length > 0, true);
  });
});

describe("coffeeMoodLabel", () => {
  it("returns a human-readable mood label", () => {
    assert.equal(coffeeMoodLabel("joyful"), "Joyful");
    assert.equal(coffeeMoodLabel("strained"), "Strained");
  });
});

describe("buildCoffeeRecentMemoryPreview", () => {
  it("sorts newest-first, hides about-you rows, and applies limit", () => {
    const preview = buildCoffeeRecentMemoryPreview(
      [
        {
          id: "m1",
          text: "You like jasmine tea.",
          createdAt: "2026-05-20T10:00:00.000Z",
          source: "direct",
        },
        {
          id: "m2",
          text: "You prefer quiet mornings.",
          createdAt: "2026-05-21T10:00:00.000Z",
          source: "inferred",
        },
        {
          id: "m3",
          text: "You prefer to be called Jared.",
          createdAt: "2026-05-22T10:00:00.000Z",
          source: "about_you",
        },
      ],
      1
    );
    assert.deepEqual(preview.map((memory) => memory.id), ["m2"]);
  });
});
