import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyOnlineModelChoice,
  combinedOnlineModelOptions,
  filterVisibleModelOptions,
  filterVisibleOnlineModelOptions,
  inferOnlineProviderForModelChoice,
  nextResponseMode,
  resolveModelChoiceForResponseMode,
  responseModeForProvider,
  type ProviderModeModelOption,
} from "./providerMode.ts";

const openAiModels: ProviderModeModelOption[] = [
  { id: "gpt-4o-mini", provider: "openai" },
  { id: "gpt-4o", provider: "openai" },
];

const anthropicModels: ProviderModeModelOption[] = [
  { id: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "claude-opus-4-1", provider: "anthropic" },
];

const localModels: ProviderModeModelOption[] = [
  { id: "llama3.2", provider: "local" },
  { id: "mistral:latest", provider: "local" },
];

describe("provider mode helpers", () => {
  it("maps provider ids onto a binary Local/Online response mode", () => {
    assert.equal(responseModeForProvider("local"), "local");
    assert.equal(responseModeForProvider("openai"), "online");
    assert.equal(responseModeForProvider("anthropic"), "online");
    assert.equal(nextResponseMode("local"), "online");
    assert.equal(nextResponseMode("online"), "local");
  });

  it("combines OpenAI and Anthropic model lists without hiding provider identity", () => {
    const combined = combinedOnlineModelOptions(openAiModels, anthropicModels);
    assert.deepEqual(
      combined.map((model) => `${model.provider}:${model.id}`),
      [
        "openai:gpt-4o-mini",
        "openai:gpt-4o",
        "anthropic:claude-sonnet-4-6",
        "anthropic:claude-opus-4-1",
      ]
    );
  });

  it("infers the online provider from a concrete selected model", () => {
    const combined = combinedOnlineModelOptions(openAiModels, anthropicModels);
    assert.equal(
      inferOnlineProviderForModelChoice("claude-sonnet-4-6", combined),
      "anthropic"
    );
    assert.equal(
      inferOnlineProviderForModelChoice("gpt-4o-mini", combined),
      "openai"
    );
  });

  it("uses the first visible online provider for Auto", () => {
    assert.equal(
      inferOnlineProviderForModelChoice(
        "auto",
        combinedOnlineModelOptions(openAiModels, anthropicModels),
        "anthropic"
      ),
      "openai"
    );
    assert.equal(
      inferOnlineProviderForModelChoice(
        "auto",
        combinedOnlineModelOptions([], anthropicModels),
        "openai"
      ),
      "anthropic"
    );
  });

  it("filters hidden online model ids before Auto fallback resolves", () => {
    const visible = filterVisibleOnlineModelOptions(
      combinedOnlineModelOptions(openAiModels, anthropicModels),
      ["gpt-4o-mini", "gpt-4o"]
    );
    assert.deepEqual(
      visible.map((model) => model.id),
      ["claude-sonnet-4-6", "claude-opus-4-1"]
    );
    assert.equal(inferOnlineProviderForModelChoice("auto", visible), "anthropic");
  });

  it("filters hidden model ids across local and online option lists", () => {
    const visible = filterVisibleModelOptions(
      [...localModels, ...openAiModels, ...anthropicModels],
      ["mistral:latest", "gpt-4o", "claude-opus-4-1"]
    );
    assert.deepEqual(
      visible.map((model) => `${model.provider}:${model.id}`),
      [
        "local:llama3.2",
        "openai:gpt-4o-mini",
        "anthropic:claude-sonnet-4-6",
      ]
    );
  });

  it("resolves legacy state with both online provider slots populated", () => {
    const combined = combinedOnlineModelOptions(openAiModels, anthropicModels);
    assert.deepEqual(
      resolveModelChoiceForResponseMode({
        responseMode: "online",
        providerPreference: "anthropic",
        choices: {
          openai: "gpt-4o",
          anthropic: "claude-opus-4-1",
        },
        onlineOptions: combined,
      }),
      { provider: "anthropic", modelChoice: "claude-opus-4-1" }
    );
    assert.deepEqual(
      resolveModelChoiceForResponseMode({
        responseMode: "online",
        providerPreference: "openai",
        choices: {
          openai: "gpt-4o",
          anthropic: "claude-opus-4-1",
        },
        onlineOptions: combined,
      }),
      { provider: "openai", modelChoice: "gpt-4o" }
    );
  });

  it("clears the competing online slot when a concrete model is picked", () => {
    const combined = combinedOnlineModelOptions(openAiModels, anthropicModels);
    assert.deepEqual(
      applyOnlineModelChoice({
        currentChoices: {
          local: "llama3.2",
          openai: "gpt-4o",
          anthropic: "auto",
        },
        nextChoice: "claude-sonnet-4-6",
        onlineOptions: combined,
        providerPreference: "openai",
      }),
      {
        provider: "anthropic",
        choices: {
          local: "llama3.2",
          openai: "auto",
          anthropic: "claude-sonnet-4-6",
        },
      }
    );
  });
});
