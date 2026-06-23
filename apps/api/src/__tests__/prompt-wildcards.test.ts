import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import {
  applyPromptWildcardValues,
  promptWildcardNames,
  resolvePromptWildcardsWithModel,
} from "../prompt-wildcards.ts";

describe("prompt wildcard resolution", () => {
  it("tracks repeated wildcard slots as independent occurrences", async () => {
    let requestedPrompt = "";
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions) {
        requestedPrompt = messages.at(-1)?.content ?? "";
        return JSON.stringify({
          NUM__1: "12",
          ADJECTIVE__1: "feral",
          NUM__2: "43",
          ADJECTIVE__2: "sleepy",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Would you rather fight {NUM} {ADJECTIVE} nuns, or {NUM} {ADJECTIVE} undertakers?",
      provider,
      generationOverrides: {},
    });

    assert.match(requestedPrompt, /NUM__1/u);
    assert.match(requestedPrompt, /NUM__2/u);
    assert.match(requestedPrompt, /ADJECTIVE__1/u);
    assert.match(requestedPrompt, /ADJECTIVE__2/u);
    assert.equal(
      result.prompt,
      "Would you rather fight 12 feral nuns, or 43 sleepy undertakers?"
    );
    assert.deepEqual(
      result.replacements.map(({ key, value, start, end }) => ({ key, value, start, end })),
      [
        { key: "NUM", value: "12", start: 23, end: 25 },
        { key: "ADJECTIVE", value: "feral", start: 26, end: 31 },
        { key: "NUM", value: "43", start: 41, end: 43 },
        { key: "ADJECTIVE", value: "sleepy", start: 44, end: 50 },
      ]
    );
  });

  it("reuses numbered wildcard references within one prompt run", async () => {
    let requestedPrompt = "";
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions) {
        requestedPrompt = messages.at(-1)?.content ?? "";
        return JSON.stringify({
          PERSON__REF_1: "Mike",
        });
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

    assert.match(requestedPrompt, /PERSON__REF_1/u);
    assert.doesNotMatch(requestedPrompt, /PERSON1__1/u);
    assert.equal(result.prompt, "A Mike saw Mike.");
    assert.deepEqual(
      result.replacements.map(({ key, value, start, end, source }) => ({
        key,
        value,
        start,
        end,
        source,
      })),
      [
        { key: "PERSON", value: "Mike", start: 2, end: 6, source: "wildcard" },
        { key: "PERSON", value: "Mike", start: 11, end: 15, source: "wildcard" },
      ]
    );
  });

  it("accepts legacy numbered response keys for referenced brace wildcards", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          PERSON1: "Mina",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "A {PERSON1} met {PERSON1}.",
      provider,
      generationOverrides: {},
    });

    assert.equal(result.prompt, "A Mina met Mina.");
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "PERSON", value: "Mina", source: "wildcard" },
        { key: "PERSON", value: "Mina", source: "wildcard" },
      ]
    );
  });

  it("sends PERSON-specific generation rules instead of relying on context grammar", async () => {
    let requestedPrompt = "";
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions) {
        requestedPrompt = messages.at(-1)?.content ?? "";
        return JSON.stringify({
          PERSON__1: "Mira",
          ADJECTIVE__1: "curious",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Write about a {ADJECTIVE} person named {PERSON}.",
      provider,
      generationOverrides: {},
    });

    assert.match(requestedPrompt, /PERSON__1/u);
    assert.match(requestedPrompt, /wildcard key PERSON/u);
    assert.match(requestedPrompt, /given first name only/u);
    assert.match(requestedPrompt, /Do not return a role, title, occupation/u);
    assert.equal(result.prompt, "Write about a curious person named Mira.");
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "ADJECTIVE", value: "curious", source: "wildcard" },
        { key: "PERSON", value: "Mira", source: "wildcard" },
      ]
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

  it("fills omitted model wildcard keys so unresolved brace tokens do not reach chat", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          ADJECTIVE__1: "bright",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Make a {ADJECTIVE} story in a {STYLE} voice.",
      provider,
      generationOverrides: {},
    });

    assert.match(result.prompt, /^Make a bright story in a .+ voice\.$/u);
    assert.doesNotMatch(result.prompt, /\{[A-Z][A-Z0-9_ ]{1,63}\}/u);
    assert.equal(result.replacements.length, 2);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "ADJECTIVE", source: "wildcard" },
        { key: "STYLE", source: "wildcard" },
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
      prompt: "Make a {ADJECTIVE} story in a {STYLE} voice.",
      provider,
      generationOverrides: {},
    });

    assert.doesNotMatch(result.prompt, /\{[A-Z][A-Z0-9_ ]{1,63}\}/u);
    assert.equal(result.replacements.length, 2);
    assert.deepEqual(
      result.replacements.map(({ key, source }) => ({ key, source })),
      [
        { key: "ADJECTIVE", source: "wildcard" },
        { key: "STYLE", source: "wildcard" },
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
      prompt: "Make a {ADJECTIVE} story.",
      provider,
      generationOverrides: {},
    });

    assert.doesNotMatch(result.prompt, /\{[A-Z][A-Z0-9_ ]{1,63}\}/u);
    assert.equal(result.replacements.length, 1);
    assert.equal(result.replacements[0]?.key, "ADJECTIVE");
  });

  it("keeps different numbered wildcard references separate", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          ADJECTIVE__REF_1: "stinky",
          ADJECTIVE__REF_2: "nostalgic",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "I hate {ADJECTIVE1} food and love {ADJECTIVE2} stars.",
      provider,
      generationOverrides: {},
    });

    assert.equal(result.prompt, "I hate stinky food and love nostalgic stars.");
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "ADJECTIVE", value: "stinky", source: "wildcard" },
        { key: "ADJECTIVE", value: "nostalgic", source: "wildcard" },
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
    assert.deepEqual(promptWildcardNames("{NUM} {NUM} {ADJECTIVE}"), [
      "NUM",
      "NUM",
      "ADJECTIVE",
    ]);
  });

  it("does not treat disabled CHARACTER tokens as wildcard runs", () => {
    assert.deepEqual(promptWildcardNames("{CHARACTER} {CHARACTER1} {PERSON} {MOOD}"), [
      "PERSON",
      "MOOD",
    ]);
  });
});
