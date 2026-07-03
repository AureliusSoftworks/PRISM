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

  it("routes an Anthropic saved online default through Anthropic", () => {
    assert.deepEqual(
      resolveAutoModel({
        provider: "openai",
        botPreferredModel: "claude-sonnet-4-6",
        hiddenModelIds: [],
        catalog,
      }),
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        usedRequiredLocalFallback: false,
      }
    );
  });

  it("keeps local requests local when an online model leaks in", () => {
    assert.deepEqual(
      resolveAutoModel({
        provider: "local",
        explicitModelOverride: "claude-sonnet-4-6",
        hiddenModelIds: [],
        catalog,
      }),
      {
        provider: "local",
        model: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
        usedRequiredLocalFallback: false,
      }
    );
  });
});
