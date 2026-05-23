import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  resolveAutoModel,
  sanitizeHiddenModelIds,
} from "../model-routing.ts";
import type { ModelCatalog } from "../providers.ts";

function catalog(overrides: Partial<ModelCatalog> = {}): ModelCatalog {
  return {
    local: [
      {
        id: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
        label: "Llama3.2",
        provider: "local",
        isDefault: true,
        localHost: "primary",
      },
      { id: "mistral:latest", label: "Mistral", provider: "local", localHost: "primary" },
    ],
    online: [
      { id: "gpt-4o-mini", label: "GPT 4o Mini", provider: "openai", isDefault: true },
      { id: "gpt-4o", label: "GPT 4o", provider: "openai" },
      { id: "gpt-4.1-mini", label: "GPT 4.1 Mini", provider: "openai" },
    ],
    defaults: {
      local: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
      online: "gpt-4o-mini",
    },
    ...overrides,
  };
}

describe("resolveAutoModel", () => {
  it("uses an explicit picker override before a bot preferred model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      explicitModelOverride: "gpt-4o",
      botPreferredModel: "gpt-4.1-mini",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assert.deepEqual(resolved, {
      provider: "openai",
      model: "gpt-4o",
      usedRequiredLocalFallback: false,
    });
  });

  it("uses a visible bot preferred model before catalog fallbacks", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      botPreferredModel: "gpt-4.1-mini",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assert.deepEqual(resolved, {
      provider: "openai",
      model: "gpt-4.1-mini",
      usedRequiredLocalFallback: false,
    });
  });

  it("skips hidden bot preferred and default models before choosing the next visible model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      botPreferredModel: "gpt-4o-mini",
      hiddenModelIds: ["gpt-4o-mini"],
      catalog: catalog(),
    });

    assert.deepEqual(resolved, {
      provider: "openai",
      model: "gpt-4o",
      usedRequiredLocalFallback: false,
    });
  });

  it("ignores a hidden explicit override from a stale client", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      explicitModelOverride: "gpt-4o-mini",
      hiddenModelIds: ["gpt-4o-mini"],
      catalog: catalog(),
    });

    assert.equal(resolved.model, "gpt-4o");
  });

  it("falls back to the required primary local model when every provider model is hidden", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      hiddenModelIds: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
      catalog: catalog(),
    });

    assert.deepEqual(resolved, {
      provider: "local",
      model: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
      usedRequiredLocalFallback: true,
    });
  });
});

describe("sanitizeHiddenModelIds", () => {
  it("never persists required local models as hidden", () => {
    assert.deepEqual(
      sanitizeHiddenModelIds([
        REQUIRED_LOCAL_MODELS.chat,
        REQUIRED_LOCAL_MODELS.embedding,
        "gpt-4o-mini",
        "gpt-4o-mini",
        "  ",
      ]),
      ["gpt-4o-mini"]
    );
  });
});
