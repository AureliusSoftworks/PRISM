import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateWildcardDeckValueIssues,
  formatWildcardDeckValuesText,
  normalizeWildcardDeckNameInput,
  normalizeWildcardDeckValueList,
  normalizeWildcardDecks,
  uniqueWildcardDeckNameForList,
} from "./wildcardDecks.ts";

describe("wildcard deck helpers", () => {
  it("normalizes deck names while preserving typed casing", () => {
    assert.equal(normalizeWildcardDeckNameInput("!randomShit"), "randomShit");
    assert.equal(normalizeWildcardDeckNameInput("plural noun"), "plural-noun");
  });

  it("normalizes deck values from text or arrays", () => {
    assert.deepEqual(
      normalizeWildcardDeckValueList("lemon\n potato \nlemon\n\nchicken"),
      ["lemon", "potato", "chicken"]
    );
    assert.deepEqual(
      normalizeWildcardDeckValueList("lemon, potato;chicken\tpear"),
      ["lemon", "potato", "chicken", "pear"]
    );
  });

  it("formats chip values back to newline storage", () => {
    assert.equal(
      formatWildcardDeckValuesText(["lemon", "potato; chicken", "lemon"]),
      "lemon\npotato\nchicken"
    );
  });

  it("finds duplicate deck values with the same normalization as saving", () => {
    assert.deepEqual(
      findDuplicateWildcardDeckValueIssues("lemon\nPotato\n  lemon  \npotato"),
      [
        { value: "lemon", firstValue: "lemon", index: 2, firstIndex: 0 },
        { value: "potato", firstValue: "Potato", index: 3, firstIndex: 1 },
      ]
    );
  });

  it("rejects persisted decks with no usable values", () => {
    assert.deepEqual(normalizeWildcardDecks([{ name: "empty", values: [" ", ""] }]), []);
  });

  it("dedupes decks and aliases case-insensitively", () => {
    const decks = normalizeWildcardDecks([
      {
        id: "wildcard:1",
        name: "randomShit",
        description: "Chaotic food words",
        values: ["lemon", "potato"],
        aliases: ["rs", "randomShit"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "wildcard:2",
        name: "RandomShit",
        values: ["ignored"],
      },
    ]);
    assert.equal(decks.length, 1);
    assert.deepEqual(decks[0]?.aliases, ["rs"]);
    assert.deepEqual(decks[0]?.values, ["lemon", "potato"]);
  });

  it("creates unique names against deck names and aliases", () => {
    const decks = normalizeWildcardDecks([
      { id: "wildcard:1", name: "deck", values: ["a"], aliases: ["alt"] },
    ]);
    assert.equal(uniqueWildcardDeckNameForList("alt", decks, "wildcard:new"), "alt-2");
  });
});
