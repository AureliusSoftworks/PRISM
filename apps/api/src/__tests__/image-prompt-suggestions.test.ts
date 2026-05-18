import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../providers.ts";
import type { ProviderMessage } from "../providers.ts";
import {
  extractJsonObjectPayload,
  inferBotImagePromptSuggestions,
  inferRandomImageSceneLine,
  parseImagePromptSuggestionsPayload,
  parseRandomImagePromptPayload,
} from "../image-prompt-suggestions.ts";

describe("parseImagePromptSuggestionsPayload", () => {
  it("parses plain JSON suggestions", () => {
    const raw = JSON.stringify({
      suggestions: ["a moonlit pier", "neon alley after rain", "three empty chairs"],
    });
    const out = parseImagePromptSuggestionsPayload(raw);
    assert.deepEqual(out, ["a moonlit pier", "neon alley after rain", "three empty chairs"]);
  });

  it("parses fenced ```json blocks", () => {
    const raw =
      "```json\n" +
      '{"suggestions":["one scene","two scene","three scene","four scene","five scene"]}\n' +
      "```";
    const out = parseImagePromptSuggestionsPayload(raw);
    assert.equal(out.length, 5);
    assert.equal(out[0], "one scene");
  });

  it("extracts JSON object from surrounding prose via brace slice", () => {
    const raw = 'Here you go:\n{"suggestions":["only"]}\nThanks.';
    assert.equal(extractJsonObjectPayload(raw), '{"suggestions":["only"]}');
    assert.deepEqual(parseImagePromptSuggestionsPayload(raw), ["only"]);
  });

  it("dedupes and caps count", () => {
    const raw = JSON.stringify({
      suggestions: ["x", "x", "b", "c", "d", "e", "f"],
    });
    const out = parseImagePromptSuggestionsPayload(raw);
    assert.deepEqual(out, ["x", "b", "c", "d", "e"]);
  });

  it("truncates very long strings", () => {
    const long = "word ".repeat(80).trim();
    const raw = JSON.stringify({ suggestions: [long] });
    const out = parseImagePromptSuggestionsPayload(raw);
    assert.ok(out[0]!.length <= 163);
    assert.ok(out[0]!.endsWith("..."));
  });

  it("returns empty array on malformed JSON", () => {
    assert.deepEqual(parseImagePromptSuggestionsPayload("not json"), []);
  });
});

describe("inferBotImagePromptSuggestions", () => {
  it("returns parsed suggestions from provider output", async () => {
    const mockProvider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[]) {
        assert.ok(messages.some((m) => m.role === "system"));
        return '{"suggestions":["alpha","beta","gamma","delta","epsilon"]}';
      },
      async embedText() {
        return [];
      },
    };
    const out = await inferBotImagePromptSuggestions(mockProvider, {
      botName: "Test Bot",
      systemPrompt: "You are helpful.",
    });
    assert.deepEqual(out, ["alpha", "beta", "gamma", "delta", "epsilon"]);
  });

  it("returns empty array when provider throws", async () => {
    const mockProvider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("ollama down");
      },
      async embedText() {
        return [];
      },
    };
    const out = await inferBotImagePromptSuggestions(mockProvider, {
      botName: "X",
      systemPrompt: "",
    });
    assert.deepEqual(out, []);
  });
});

describe("parseRandomImagePromptPayload", () => {
  it("parses JSON prompt field", () => {
    assert.equal(
      parseRandomImagePromptPayload('{"prompt":"Wide shot of tide pools at dawn."}'),
      "Wide shot of tide pools at dawn."
    );
  });

  it("falls back to first non-empty line", () => {
    assert.equal(parseRandomImagePromptPayload("  Amber fog over empty docks. "), "Amber fog over empty docks.");
  });
});

describe("inferRandomImageSceneLine", () => {
  it("returns parsed prompt string", async () => {
    const mockProvider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return '{"prompt":"Silhouetted reef against violet sunset."}';
      },
      async embedText() {
        return [];
      },
    };
    const out = await inferRandomImageSceneLine(mockProvider, {});
    assert.equal(out, "Silhouetted reef against violet sunset.");
  });
});
