import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  catalogWithGlobalPickerVisibility,
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
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" },
    ],
    defaults: {
      local: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
      online: "gpt-4o-mini",
    },
    ...overrides,
  };
}

function assertAutoRoute(
  resolved: ReturnType<typeof resolveAutoModel>,
  provider: "local" | "openai" | "anthropic",
  model: string,
  lane: "local" | "online",
): void {
  assert.equal(resolved.provider, provider);
  assert.equal(resolved.model, model);
  assert.equal(resolved.usedRequiredLocalFallback, false);
  assert.equal(resolved.autoRoute?.provider, provider);
  assert.equal(resolved.autoRoute?.model, model);
  assert.equal(resolved.autoRoute?.lane, lane);
}

describe("resolveAutoModel", () => {
  it("uses an explicit picker override before a saved preference", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      explicitModelOverride: "gpt-4o",
      preferredModel: "gpt-4.1-mini",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assert.deepEqual(resolved, {
      provider: "openai",
      model: "gpt-4o",
      usedRequiredLocalFallback: false,
    });
  });

  it("preserves an already-selected picker-hidden fixed model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      explicitModelOverride: "gpt-4o",
      hiddenModelIds: [],
      catalog: catalog({
        online: [{ id: "gpt-4o", label: "GPT 4o", provider: "openai", showInGlobalPicker: false }],
      }),
    });
    assert.deepEqual(resolved, {
      provider: "openai",
      model: "gpt-4o",
      usedRequiredLocalFallback: false,
    });
  });

  it("routes a light request to the cheapest suitable visible model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      preferredModel: "gpt-4.1-mini",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
  });

  it("keeps an enabled picker-hidden model in Auto's candidate pool", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      hiddenModelIds: [],
      catalog: catalog({
        online: [
          {
            id: "gpt-4o-mini",
            label: "GPT 4o Mini",
            provider: "openai",
            isDefault: true,
            showInGlobalPicker: false,
          },
        ],
      }),
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
  });

  it("keeps picker-hidden enabled models eligible for Turbo Auto", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      hiddenModelIds: [],
      catalog: catalog({
        online: [
          {
            id: "gpt-4o-mini",
            label: "GPT 4o Mini",
            provider: "openai",
            isDefault: true,
            showInGlobalPicker: false,
          },
          { id: "gpt-4o", label: "GPT 4o", provider: "openai" },
        ],
      }),
      turboOnly: true,
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
  });

  it("excludes disabled models even when their picker annotation is visible", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      hiddenModelIds: ["gpt-4o-mini"],
      catalog: catalog({
        online: [
          {
            id: "gpt-4o-mini",
            label: "GPT 4o Mini",
            provider: "openai",
            isDefault: true,
            showInGlobalPicker: true,
          },
          { id: "gpt-4o", label: "GPT 4o", provider: "openai" },
        ],
      }),
      turboOnly: true,
    });

    assert.equal(resolved.model, "gpt-4o");
  });

  it("skips hidden saved preferences before contextual Auto chooses the next visible model", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      preferredModel: "gpt-4o-mini",
      hiddenModelIds: ["gpt-4o-mini"],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "openai", "gpt-4.1-mini", "online");
  });

  it("does not let an Anthropic saved default override balanced online Auto", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      preferredModel: "claude-sonnet-4-6",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
  });

  it("routes a stale Claude override through Anthropic even when the catalog is unavailable", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      explicitModelOverride: "claude-sonnet-4-6",
      hiddenModelIds: [],
      catalog: catalog({ online: [] }),
    });

    assert.deepEqual(resolved, {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      usedRequiredLocalFallback: false,
    });
  });

  it("does not let an online model preference escalate a local request", () => {
    const resolved = resolveAutoModel({
      provider: "local",
      explicitModelOverride: "claude-sonnet-4-6",
      preferredModel: "gpt-4o",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "local", REQUIRED_PRIMARY_LOCAL_MODEL_ID, "local");
  });

  it("ignores a hidden explicit override from a stale client", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      explicitModelOverride: "gpt-4o-mini",
      hiddenModelIds: ["gpt-4o-mini"],
      catalog: catalog(),
    });

    assert.equal(resolved.model, "gpt-4.1-mini");
    assert.equal(resolved.autoRoute?.model, "gpt-4.1-mini");
  });

  it("keeps balanced online Auto independent of a stale provider preference", () => {
    const resolved = resolveAutoModel({
      provider: "anthropic",
      explicitModelOverride: "gpt-5.3-chat-latest",
      preferredModel: "gpt-4o-mini",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
  });

  it("keeps balanced online Auto independent of a stale Anthropic preference", () => {
    const resolved = resolveAutoModel({
      provider: "anthropic",
      explicitModelOverride: "gpt-4o-mini",
      preferredModel: "claude-opus-4-8",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
  });

  it("uses the only visible online candidate when OpenAI models are hidden", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      hiddenModelIds: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
      catalog: catalog(),
    });

    assertAutoRoute(resolved, "anthropic", "claude-sonnet-4-6", "online");
  });

  it("keeps contextual Auto on Turbo-capable ONLINE candidates when Turbo is enabled", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      hiddenModelIds: [],
      catalog: catalog(),
      turboOnly: true,
    });

    assertAutoRoute(resolved, "openai", "gpt-4o-mini", "online");
    assert.notEqual(resolved.provider, "anthropic");
  });

  it("can route Auto Turbo through eligible Claude Opus Fast models", () => {
    const resolved = resolveAutoModel({
      provider: "anthropic",
      lane: "online",
      hiddenModelIds: [],
      catalog: catalog({
        online: [
          { id: "claude-opus-4-8", label: "Opus 4.8", provider: "anthropic" },
          { id: "claude-sonnet-5", label: "Sonnet 5", provider: "anthropic" },
        ],
      }),
      turboOnly: true,
    });

    assertAutoRoute(resolved, "anthropic", "claude-opus-4-8", "online");
  });
});

describe("catalogWithGlobalPickerVisibility", () => {
  it("defaults old settings to visible and annotates only picker-hidden ids", () => {
    const allVisible = catalogWithGlobalPickerVisibility(catalog(), []);
    assert.ok(
      [...allVisible.local, ...allVisible.online].every(
        (model) => model.showInGlobalPicker,
      ),
    );

    const hiddenFromPicker = catalogWithGlobalPickerVisibility(catalog(), [
      "gpt-4o-mini",
    ]);
    assert.equal(
      hiddenFromPicker.online.find((model) => model.id === "gpt-4o-mini")
        ?.showInGlobalPicker,
      false,
    );
    assert.equal(
      hiddenFromPicker.online.find((model) => model.id === "gpt-4o")
        ?.showInGlobalPicker,
      true,
    );
  });
});

describe("sanitizeHiddenModelIds", () => {
  it("keeps the required chat fallback visible but allows non-chat support models to hide", () => {
    assert.deepEqual(
      sanitizeHiddenModelIds([
        REQUIRED_LOCAL_MODELS.chat,
        REQUIRED_LOCAL_MODELS.embedding,
        "gpt-4o-mini",
        "gpt-4o-mini",
        "  ",
      ]),
      [REQUIRED_LOCAL_MODELS.embedding, "gpt-4o-mini"]
    );
  });
});
