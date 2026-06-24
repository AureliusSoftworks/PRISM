import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import {
  applyPromptWildcardValues,
  generateScriptedPromptWildcardValue,
  promptWildcardNames,
  resolvePromptWildcardsWithModel,
} from "../prompt-wildcards.ts";
import { SCRIPTED_PROMPT_NOUN_PAIRS } from "../prompt-wildcard-seeds.ts";

describe("prompt wildcard resolution", () => {
  it("scripted built-in wildcard generation avoids used values when possible", () => {
    const usedValues = new Set<string>();
    const first = generateScriptedPromptWildcardValue("PERSON", usedValues);
    const second = generateScriptedPromptWildcardValue("PERSON", usedValues);
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);
    const num = Number(generateScriptedPromptWildcardValue("NUM"));
    assert.equal(Number.isInteger(num) && num >= 1 && num <= 10, true);
  });

  it("resolves built-in wildcard slots without calling the provider", async () => {
    let providerCalls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(_messages: ProviderMessage[], _options?: GenerateOptions) {
        providerCalls += 1;
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Would you rather fight {#} {ADJECTIVE} nuns, or {NUM} {ADJECTIVE} undertakers?",
      provider,
      generationOverrides: {},
    });

    assert.equal(providerCalls, 0);
    assert.doesNotMatch(result.prompt, /\{(?:#\d*|[A-Z][A-Z0-9_ ]{1,63})\}/u);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "NUM", source: "wildcard" },
        { key: "ADJECTIVE", source: "wildcard" },
        { key: "NUM", source: "wildcard" },
        { key: "ADJECTIVE", source: "wildcard" },
      ]
    );
    for (const replacement of result.replacements.filter(({ key }) => key === "NUM")) {
      assert.match(replacement.value, /^\d+$/u);
      const value = Number(replacement.value);
      assert.equal(Number.isInteger(value) && value >= 1 && value <= 10, true);
    }
  });

  it("accepts the visible number wildcard and NUM alias with the same range", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "{#}{#}.{#} and {NUM} and {number}.",
      provider,
      generationOverrides: {},
    });

    assert.match(result.prompt, /^\d+\.\d+ and \d+ and \d+\.$/u);
    assert.deepEqual(
      result.replacements.map(({ key }) => key),
      ["NUM", "NUM", "NUM", "NUM", "NUM"]
    );
    for (const replacement of result.replacements) {
      const value = Number(replacement.value);
      assert.equal(Number.isInteger(value) && value >= 1 && value <= 10, true);
    }
  });

  it("does not treat lowercase custom brace text as a model-filled wildcard", () => {
    assert.deepEqual(promptWildcardNames("{number} {word} {MOOD}"), ["NUM", "MOOD"]);
  });

  it("reuses numbered wildcard references within one prompt run", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "A {PERSON1} saw {PERSON1}.",
      provider,
      generationOverrides: {},
    });

    assert.equal(result.replacements.length, 2);
    assert.equal(result.replacements[0]?.key, "PERSON");
    assert.equal(result.replacements[1]?.key, "PERSON");
    assert.equal(result.replacements[0]?.value, result.replacements[1]?.value);
    assert.equal(result.prompt, `A ${result.replacements[0]?.value} saw ${result.replacements[0]?.value}.`);
  });

  it("accepts legacy numbered response keys for referenced custom brace wildcards", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          MOOD1: "wistful",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "{MOOD1} rain and {MOOD1} windows.",
      provider,
      generationOverrides: {},
    });

    assert.equal(result.prompt, "wistful rain and wistful windows.");
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "MOOD", value: "wistful", source: "wildcard" },
        { key: "MOOD", value: "wistful", source: "wildcard" },
      ]
    );
  });

  it("generates NAME with scripted first names only", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Write about a {ADJECTIVE} person named {NAME}.",
      provider,
      generationOverrides: {},
    });

    const name = result.replacements.find(({ key }) => key === "NAME");
    assert.ok(name);
    assert.match(name.value, /^[A-Z][A-Za-z]+$/u);
    assert.doesNotMatch(name.value, /\s/u);
  });

  it("resolves searchable-only built-ins without calling the provider", async () => {
    let providerCalls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        providerCalls += 1;
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "A {TREASURE} in {LIGHTING} beside {SECRET} inside a {CONTAINER}.",
      provider,
      generationOverrides: {},
    });

    assert.equal(providerCalls, 0);
    assert.doesNotMatch(result.prompt, /\{[A-Z][A-Z0-9_ ]{1,63}\}/u);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "TREASURE", source: "wildcard" },
        { key: "LIGHTING", source: "wildcard" },
        { key: "SECRET", source: "wildcard" },
        { key: "CONTAINER", source: "wildcard" },
      ]
    );
  });

  it("generates nouns with script values instead of sticky model examples", async () => {
    let providerCalls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        providerCalls += 1;
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Hide the {NOUN}.",
      provider,
      generationOverrides: {},
    });

    assert.equal(providerCalls, 0);
    assert.match(result.prompt, /^Hide the .+\.$/u);
    assert.equal(result.replacements[0]?.key, "NOUN");
    for (const sticky of ["lantern", "subway", "rumor", "chessboard", "stinky"]) {
      assert.doesNotMatch(result.prompt, new RegExp(sticky, "iu"));
    }
  });

  it("avoids repeated built-in values within one prompt run when the pool allows it", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "{NOUN} {NOUN} {NOUN} {NOUN} {NOUN} {NOUN} {NOUN} {NOUN}",
      provider,
      generationOverrides: {},
    });

    const values = result.replacements.map(({ value }) => value.toLowerCase());
    assert.equal(values.length, 8);
    assert.equal(new Set(values).size, values.length);
  });

  it("uses the same source row for linked singular and plural nouns", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "One {NOUN1}; many {PLURAL_NOUN1}.",
      provider,
      generationOverrides: {},
    });
    const singular = result.replacements.find(({ key }) => key === "NOUN");
    const plural = result.replacements.find(({ key }) => key === "PLURAL_NOUN");

    assert.ok(singular);
    assert.ok(plural);
    assert.ok(
      SCRIPTED_PROMPT_NOUN_PAIRS.some(
        (pair) => pair.singular === singular.value && pair.plural === plural.value
      )
    );
  });

  it("normalizes quick plural noun typing before resolving wildcards", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("provider should not be called for built-in wildcards");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "One {NOUN4}; many {NOUN4}s.",
      provider,
      generationOverrides: {},
    });
    const singular = result.replacements.find(({ key }) => key === "NOUN");
    const plural = result.replacements.find(({ key }) => key === "PLURAL_NOUN");

    assert.ok(singular);
    assert.ok(plural);
    assert.doesNotMatch(result.prompt, /\{NOUN4\}s/u);
    assert.ok(
      SCRIPTED_PROMPT_NOUN_PAIRS.some(
        (pair) => pair.singular === singular.value && pair.plural === plural.value
      )
    );
  });

  it("reuses numbered uppercase brace slots beyond the built-in list", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          MOOD__REF_1: "wistful",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "{MOOD1} rain and {MOOD1} windows.",
      provider,
      generationOverrides: {},
    });

    assert.equal(result.prompt, "wistful rain and wistful windows.");
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "MOOD", value: "wistful", source: "wildcard" },
        { key: "MOOD", value: "wistful", source: "wildcard" },
      ]
    );
  });

  it("passes scripted built-in values into custom wildcard model context", async () => {
    let requestedPrompt = "";
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions) {
        requestedPrompt = messages.at(-1)?.content ?? "";
        return JSON.stringify({
          MOOD__1: "wistful",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "A {NOUN} feels {MOOD}.",
      provider,
      generationOverrides: {},
    });

    assert.doesNotMatch(requestedPrompt, /\{NOUN\}/u);
    assert.doesNotMatch(requestedPrompt, /NOUN__1/u);
    assert.match(requestedPrompt, /wildcard key MOOD/u);
    assert.match(result.prompt, /^A .+ feels wistful\.$/u);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "NOUN", source: "wildcard" },
        { key: "MOOD", source: "wildcard" },
      ]
    );
  });

  it("fills omitted model wildcard keys so unresolved brace tokens do not reach chat", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          MOOD__1: "bright",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Make a {MOOD} story in a {TEXTURE} voice.",
      provider,
      generationOverrides: {},
    });

    assert.match(result.prompt, /^Make a bright story in a .+ voice\.$/u);
    assert.doesNotMatch(result.prompt, /\{(?:#\d*|[A-Z][A-Z0-9_ ]{1,63})\}/u);
    assert.equal(result.replacements.length, 2);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "MOOD", source: "wildcard" },
        { key: "TEXTURE", source: "wildcard" },
      ]
    );
  });

  it("uses local fallbacks when wildcard generation fails", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("model unavailable");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Make a {MOOD} story in a {TEXTURE} voice.",
      provider,
      generationOverrides: {},
    });

    assert.doesNotMatch(result.prompt, /\{(?:#\d*|[A-Z][A-Z0-9_ ]{1,63})\}/u);
    assert.equal(result.replacements.length, 2);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "MOOD", source: "wildcard" },
        { key: "TEXTURE", source: "wildcard" },
      ]
    );
  });

  it("uses local fallbacks when wildcard generation returns the wrong JSON shape", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify("not an object");
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Make a {MOOD} story.",
      provider,
      generationOverrides: {},
    });

    assert.doesNotMatch(result.prompt, /\{(?:#\d*|[A-Z][A-Z0-9_ ]{1,63})\}/u);
    assert.equal(result.replacements.length, 1);
    assert.equal(result.replacements[0]?.key, "MOOD");
  });

  it("keeps different numbered wildcard references separate", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          MOOD__REF_1: "stormy",
          MOOD__REF_2: "hushed",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "I saw {MOOD1} doors and {MOOD2} windows.",
      provider,
      generationOverrides: {},
    });

    assert.equal(result.prompt, "I saw stormy doors and hushed windows.");
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "MOOD", value: "stormy", source: "wildcard" },
        { key: "MOOD", value: "hushed", source: "wildcard" },
      ]
    );
  });

  it("preserves resolved deck replacements around true wildcard slots", () => {
    const result = applyPromptWildcardValues(
      "Pick lemon with {ADJECTIVE}.",
      new Map([["ADJECTIVE__1", "bright"]]),
      [{ key: "FOOD", value: "lemon", start: 5, end: 10, source: "deck" }]
    );

    assert.deepEqual(result, {
      prompt: "Pick lemon with bright.",
      replacements: [
        { key: "FOOD", value: "lemon", start: 5, end: 10, source: "deck" },
        { key: "ADJECTIVE", value: "bright", start: 16, end: 22, source: "wildcard" },
      ],
    });
  });

  it("reports repeated wildcard names so callers still detect a wildcard run", () => {
    assert.deepEqual(promptWildcardNames("{#} {NUM} {number} {ADJECTIVE} {NOUN1}s"), [
      "NUM",
      "NUM",
      "NUM",
      "ADJECTIVE",
      "PLURAL_NOUN",
    ]);
  });

  it("does not treat disabled CHARACTER tokens as wildcard runs", () => {
    assert.deepEqual(promptWildcardNames("{CHARACTER} {CHARACTER1} {PERSON} {MOOD}"), [
      "PERSON",
      "MOOD",
    ]);
  });
});
