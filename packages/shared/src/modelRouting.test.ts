import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  defaultHiddenModelIdsForCatalog,
  isCommonOnlineChatModel,
  reconcileHiddenModelIdsForCatalog,
  resolveAutoModel,
} from "./modelRouting.ts";

describe("default online model visibility", () => {
  it("keeps common OpenAI and Anthropic aliases visible by default", () => {
    for (const model of [
      { id: "gpt-5", provider: "openai" as const },
      { id: "gpt-5-chat-latest", provider: "openai" as const },
      { id: "gpt-5.3-chat-latest", provider: "openai" as const },
      { id: "gpt-5-mini", provider: "openai" as const },
      { id: "gpt-4.1", provider: "openai" as const },
      { id: "gpt-4.1-mini", provider: "openai" as const },
      { id: "gpt-4o", provider: "openai" as const },
      { id: "gpt-4o-mini", provider: "openai" as const },
      { id: "chatgpt-4o-latest", provider: "openai" as const },
      { id: "o3", provider: "openai" as const },
      { id: "o4-mini", provider: "openai" as const },
      { id: "o5-mini", provider: "openai" as const },
      { id: "claude-sonnet-4-6", provider: "anthropic" as const },
      { id: "claude-opus-4-8", provider: "anthropic" as const },
      { id: "claude-haiku-4-5", provider: "anthropic" as const },
      { id: "claude-3-5-sonnet-latest", provider: "anthropic" as const },
    ]) {
      assert.equal(isCommonOnlineChatModel(model), true, model.id);
    }
  });

  it("hides local non-chat stacks, dated snapshots, nano, and other edge models by default", () => {
    const catalog = {
      local: [
        { id: "llama3.2" },
        { id: "llava:latest" },
        { id: "nomic-embed-text" },
      ],
      online: [
        { id: "gpt-4o-mini", provider: "openai" as const },
        { id: "gpt-4o-2024-08-06", provider: "openai" as const },
        { id: "gpt-4.1-nano", provider: "openai" as const },
        { id: "gpt-5-nano", provider: "openai" as const },
        { id: "gpt-5.1-codex", provider: "openai" as const },
        { id: "gpt-5.2-pro", provider: "openai" as const },
        { id: "gpt-4o-mini-search-preview", provider: "openai" as const },
        { id: "claude-sonnet-4-6", provider: "anthropic" as const },
        { id: "claude-sonnet-4-5-20250929", provider: "anthropic" as const },
        { id: "claude-3-5-haiku-latest", provider: "anthropic" as const },
        { id: "claude-test-model", provider: "anthropic" as const },
      ],
    };

    assert.deepEqual(defaultHiddenModelIdsForCatalog(catalog), [
      "llava:latest",
      "nomic-embed-text",
      "gpt-4o-2024-08-06",
      "gpt-4.1-nano",
      "gpt-5-nano",
      "gpt-5.1-codex",
      "gpt-5.2-pro",
      "gpt-4o-mini-search-preview",
      "claude-sonnet-4-5-20250929",
      "claude-3-5-haiku-latest",
      "claude-test-model",
    ]);
  });

  it("unhides stale default-hidden chat aliases after visibility rules change", () => {
    const catalog = {
      local: [
        { id: "llama3.2" },
        { id: "llava:latest" },
        { id: "nomic-embed-text:latest" },
      ],
      online: [
        { id: "gpt-5.2-chat-latest", provider: "openai" as const },
        { id: "gpt-5.4", provider: "openai" as const },
        { id: "gpt-5.4-mini", provider: "openai" as const },
        { id: "gpt-5.4-pro", provider: "openai" as const },
        { id: "gpt-5.6-sol", provider: "openai" as const },
        { id: "gpt-5.6-terra", provider: "openai" as const },
        { id: "gpt-5.6-luna", provider: "openai" as const },
        { id: "gpt-5-search-api", provider: "openai" as const },
        { id: "claude-opus-4-7", provider: "anthropic" as const },
        { id: "claude-fable-5", provider: "anthropic" as const },
      ],
    };

    assert.deepEqual(
      reconcileHiddenModelIdsForCatalog(
        [
          "gpt-5.2-chat-latest",
          "gpt-5.4",
          "gpt-5.4-mini",
          "gpt-5.4-pro",
          "gpt-5.6-sol",
          "gpt-5.6-terra",
          "gpt-5.6-luna",
          "gpt-5-search-api",
          "claude-opus-4-7",
          "claude-fable-5",
          "llava:latest",
          "nomic-embed-text:latest",
          "custom-hidden-model",
        ],
        catalog
      ),
      [
        "gpt-5.4-pro",
        "gpt-5-search-api",
        "claude-fable-5",
        "llava:latest",
        "nomic-embed-text:latest",
        "custom-hidden-model",
      ]
    );
  });
});

describe("resolveAutoModel", () => {
  const catalog = {
    local: [
      { id: REQUIRED_PRIMARY_LOCAL_MODEL_ID },
      { id: "mistral:latest" },
    ],
    online: [
      { id: "gpt-4o-mini", provider: "openai" as const },
      { id: "gpt-4o", provider: "openai" as const },
      { id: "claude-sonnet-4-6", provider: "anthropic" as const },
    ],
  };

  it("ignores the retired account default and chooses the lightest suitable online model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      preferredModel: "claude-sonnet-4-6",
      hiddenModelIds: [],
      catalog,
      routingContext: { surface: "chat", inputText: "Hello" },
      priceForModel: () => ({ inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
    });
    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.model, "gpt-4o-mini");
    assert.equal(resolved.autoRoute?.reasoningEffort, "none");
    assert.equal(resolved.autoRoute?.lane, "online");
  });

  it("keeps local requests local when an online model leaks in", () => {
    const resolved = resolveAutoModel({
      provider: "local",
      lane: "local",
      explicitModelOverride: "claude-sonnet-4-6",
      hiddenModelIds: [],
      catalog,
    });
    assert.equal(resolved.provider, "local");
    assert.ok(catalog.local.some((model) => model.id === resolved.model));
    assert.equal(resolved.autoRoute?.lane, "local");
  });

  it("lets a concrete model bypass contextual Auto", () => {
    assert.deepEqual(
      resolveAutoModel({
        provider: "anthropic",
        lane: "online",
        explicitModelOverride: "claude-sonnet-4-6",
        hiddenModelIds: [],
        catalog,
        routingContext: { research: true, highStakes: true },
      }),
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        usedRequiredLocalFallback: false,
      },
    );
  });

  it("escalates capability for structured research and uses stable cost tie-breaking", () => {
    const expanded = {
      ...catalog,
      online: [
        ...catalog.online,
        { id: "gpt-5.6-sol", provider: "openai" as const },
        { id: "claude-opus-4-8", provider: "anthropic" as const },
      ],
    };
    const input = {
      provider: "openai" as const,
      lane: "online" as const,
      hiddenModelIds: [],
      catalog: expanded,
      routingContext: {
        surface: "debate",
        structuredOutput: true,
        research: true,
        highStakes: true,
        inputTokens: 12_000,
      },
      priceForModel: () => ({
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 1,
      }),
    };
    const first = resolveAutoModel(input);
    const second = resolveAutoModel(input);
    assert.equal(first.model, "claude-opus-4-8");
    assert.deepEqual(second, first);
    assert.ok(first.autoRoute?.reasonCodes.includes("research"));
    assert.ok(first.autoRoute?.reasonCodes.includes("long_context"));
    assert.notEqual(first.autoRoute?.reasoningEffort, "xhigh");
  });

  it("can escalate model and effort as one frozen Debate record grows", () => {
    const debateCatalog = {
      local: [],
      online: [
        { id: "gpt-5", provider: "openai" as const },
        { id: "gpt-5.6-sol", provider: "openai" as const },
      ],
    };
    const route = (inputTokens: number) =>
      resolveAutoModel({
        provider: "openai",
        lane: "online",
        hiddenModelIds: [],
        catalog: debateCatalog,
        routingContext: {
          surface: "debate",
          structuredOutput: true,
          highStakes: true,
          inputTokens,
        },
        priceForModel: () => ({
          inputUsdPerMillion: 1,
          outputUsdPerMillion: 1,
        }),
      });

    const opening = route(1_600);
    const deepRecord = route(9_000);
    assert.equal(opening.model, "gpt-5");
    assert.equal(opening.autoRoute?.reasoningEffort, "medium");
    assert.equal(deepRecord.model, "gpt-5.6-sol");
    assert.equal(deepRecord.autoRoute?.reasoningEffort, "high");
    assert.ok(deepRecord.autoRoute?.reasonCodes.includes("long_context"));
  });

  it("never falls from an empty ONLINE lane into a local model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      hiddenModelIds: [],
      catalog: { local: [{ id: "qwen3:9b" }], online: [] },
    });
    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.model, "gpt-4o-mini");
    assert.equal(resolved.autoRoute, undefined);
  });
});
