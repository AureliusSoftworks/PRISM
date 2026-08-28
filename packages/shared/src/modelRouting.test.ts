import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  clampOnlineAutoProviderBias,
  formatOnlineAutoProviderBiasLabel,
  formatOnlineAutoProviderWeightsLabel,
  normalizeOnlineAutoProviderWeights,
  defaultHiddenModelIdsForCatalog,
  isCommonOnlineChatModel,
  normalizeAutoRouteDecisionV1,
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
      { id: "gpt-oss:120b-cloud", provider: "ollama_cloud" as const },
      { id: "qwen3-coder:480b-cloud", provider: "ollama_cloud" as const },
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
        { id: "claude-mythos-5", provider: "anthropic" as const },
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
      "claude-mythos-5",
    ]);
  });

  it("keeps optional Mythos hidden until it is manually enabled", () => {
    const catalog = {
      local: [],
      online: [
        { id: "claude-sonnet-4-6", provider: "anthropic" as const },
        { id: "claude-mythos-5", provider: "anthropic" as const },
      ],
    };
    const hidden = defaultHiddenModelIdsForCatalog(catalog);
    assert.deepEqual(hidden, ["claude-mythos-5"]);
    assert.notEqual(
      resolveAutoModel({
        provider: "anthropic",
        lane: "online",
        hiddenModelIds: hidden,
        catalog,
        routingContext: { research: true, highStakes: true },
      }).model,
      "claude-mythos-5",
    );
    assert.equal(
      resolveAutoModel({
        provider: "anthropic",
        lane: "online",
        explicitModelOverride: "claude-mythos-5",
        hiddenModelIds: [],
        catalog,
      }).model,
      "claude-mythos-5",
    );
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

  it("treats Ollama Cloud as ONLINE and excludes it from structured output", () => {
    const cloudCatalog = {
      local: [{ id: REQUIRED_PRIMARY_LOCAL_MODEL_ID }],
      online: [
        {
          id: "minimax-m2.5:cloud",
          provider: "ollama_cloud" as const,
          supportsStructuredOutput: false,
        },
        { id: "gpt-4o-mini", provider: "openai" as const },
      ],
    };
    const foreground = resolveAutoModel({
      provider: "ollama_cloud",
      lane: "online",
      explicitModelOverride: "minimax-m2.5:cloud",
      hiddenModelIds: [],
      catalog: cloudCatalog,
    });
    assert.equal(foreground.provider, "ollama_cloud");
    assert.equal(foreground.model, "minimax-m2.5:cloud");

    const structured = resolveAutoModel({
      provider: "ollama_cloud",
      lane: "online",
      explicitModelOverride: "minimax-m2.5:cloud",
      hiddenModelIds: [],
      catalog: cloudCatalog,
      routingContext: { structuredOutput: true },
      priceForModel: () => ({ inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
    });
    assert.equal(structured.provider, "openai");
    assert.equal(structured.model, "gpt-4o-mini");
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
    assert.equal(first.autoRoute?.reasoningEffort, "xhigh");
  });

  it("reserves XHigh for score 7+ and clamps to each model capability", () => {
    const route = (modelId: string, toolUse: boolean) =>
      resolveAutoModel({
        provider: "anthropic",
        lane: "online",
        hiddenModelIds: [],
        catalog: {
          local: [],
          online: [{ id: modelId, provider: "anthropic" as const }],
        },
        routingContext: {
          surface: "signal",
          structuredOutput: true,
          research: true,
          highStakes: true,
          toolUse,
        },
        priceForModel: () => ({ inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
      });

    assert.equal(route("claude-opus-4-8", false).autoRoute?.reasoningEffort, "high");
    assert.equal(route("claude-opus-4-8", true).autoRoute?.reasoningEffort, "xhigh");
    assert.equal(route("claude-opus-4-5", true).autoRoute?.reasoningEffort, "high");
    assert.equal(route("claude-sonnet-4-6", true).autoRoute?.reasoningEffort, "xhigh");
  });

  it("accepts serialized Auto XHigh decisions", () => {
    assert.equal(
      normalizeAutoRouteDecisionV1({
        v: 1,
        lane: "online",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        reasoningEffort: "xhigh",
        reasonCodes: ["deep_request"],
      })?.reasoningEffort,
      "xhigh",
    );
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

  describe("onlineAutoProviderBias", () => {
    const nearTieCatalog = {
      local: [{ id: REQUIRED_PRIMARY_LOCAL_MODEL_ID }],
      online: [
        { id: "gpt-4o-mini", provider: "openai" as const },
        { id: "claude-haiku-4-5", provider: "anthropic" as const },
      ],
    };
    const equalPrice = () => ({
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 1,
    });
    const lightContext = { surface: "chat", inputText: "Hello" };

    it("matches unbiased ranking when bias is 0", () => {
      const unbiased = resolveAutoModel({
        provider: "openai",
        lane: "online",
        hiddenModelIds: [],
        catalog: nearTieCatalog,
        onlineAutoProviderBias: 0,
        routingContext: lightContext,
        priceForModel: equalPrice,
      });
      const omitted = resolveAutoModel({
        provider: "openai",
        lane: "online",
        hiddenModelIds: [],
        catalog: nearTieCatalog,
        routingContext: lightContext,
        priceForModel: equalPrice,
      });
      assert.deepEqual(unbiased, omitted);
      // Equal cost/latency: alphabetical provider tie-break favors anthropic.
      assert.equal(unbiased.provider, "anthropic");
      assert.equal(unbiased.model, "claude-haiku-4-5");
    });

    it("leans OpenAI on near-ties when bias is negative", () => {
      const resolved = resolveAutoModel({
        provider: "openai",
        lane: "online",
        hiddenModelIds: [],
        catalog: nearTieCatalog,
        onlineAutoProviderBias: -1,
        routingContext: lightContext,
        priceForModel: equalPrice,
      });
      assert.equal(resolved.provider, "openai");
      assert.equal(resolved.model, "gpt-4o-mini");
    });

    it("leans Anthropic on near-ties when bias is positive", () => {
      const resolved = resolveAutoModel({
        provider: "openai",
        lane: "online",
        hiddenModelIds: [],
        catalog: nearTieCatalog,
        onlineAutoProviderBias: 1,
        routingContext: lightContext,
        priceForModel: equalPrice,
      });
      assert.equal(resolved.provider, "anthropic");
      assert.equal(resolved.model, "claude-haiku-4-5");
    });

    it("still yields to a clearly cheaper other provider at full lean", () => {
      const catalog = {
        local: [{ id: REQUIRED_PRIMARY_LOCAL_MODEL_ID }],
        online: [
          { id: "gpt-4o-mini", provider: "openai" as const },
          { id: "claude-haiku-4-5", provider: "anthropic" as const },
        ],
      };
      const resolved = resolveAutoModel({
        provider: "openai",
        lane: "online",
        hiddenModelIds: [],
        catalog,
        // Max Anthropic lean — OpenAI remains vastly cheaper.
        onlineAutoProviderBias: 1,
        routingContext: lightContext,
        priceForModel: (provider) =>
          provider === "openai"
            ? { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.1 }
            : { inputUsdPerMillion: 50_000, outputUsdPerMillion: 50_000 },
      });
      assert.equal(resolved.provider, "openai");
      assert.equal(resolved.model, "gpt-4o-mini");
    });

    it("ignores provider bias for LOCAL Auto", () => {
      const localCatalog = {
        local: [
          { id: REQUIRED_PRIMARY_LOCAL_MODEL_ID },
          { id: "mistral:latest" },
        ],
        online: [
          { id: "gpt-4o-mini", provider: "openai" as const },
          { id: "claude-haiku-4-5", provider: "anthropic" as const },
        ],
      };
      const withBias = resolveAutoModel({
        provider: "local",
        lane: "local",
        hiddenModelIds: [],
        catalog: localCatalog,
        onlineAutoProviderBias: 1,
        routingContext: lightContext,
      });
      const withoutBias = resolveAutoModel({
        provider: "local",
        lane: "local",
        hiddenModelIds: [],
        catalog: localCatalog,
        routingContext: lightContext,
      });
      assert.equal(withBias.provider, "local");
      assert.deepEqual(withBias, withoutBias);
    });
  });
});

describe("clampOnlineAutoProviderBias", () => {
  it("clamps and defaults invalid values", () => {
    assert.equal(clampOnlineAutoProviderBias(0), 0);
    assert.equal(clampOnlineAutoProviderBias(-1), -1);
    assert.equal(clampOnlineAutoProviderBias(1), 1);
    assert.equal(clampOnlineAutoProviderBias(-2), -1);
    assert.equal(clampOnlineAutoProviderBias(2), 1);
    assert.equal(clampOnlineAutoProviderBias(Number.NaN), 0);
    assert.equal(clampOnlineAutoProviderBias("nope"), 0);
    assert.equal(clampOnlineAutoProviderBias(null), 0);
  });

  it("formats lean labels for Settings", () => {
    assert.equal(formatOnlineAutoProviderBiasLabel(0), "Balanced");
    assert.equal(formatOnlineAutoProviderBiasLabel(0.02), "Balanced");
    assert.equal(formatOnlineAutoProviderBiasLabel(-0.4), "Lean OpenAI 40%");
    assert.equal(formatOnlineAutoProviderBiasLabel(1), "Lean Anthropic 100%");
  });
});

describe("ONLINE Auto provider weights", () => {
  it("defaults to equal thirds and migrates the legacy lean with a Cloud baseline", () => {
    assert.deepEqual(normalizeOnlineAutoProviderWeights(null), {
      v: 1,
      openai: 1 / 3,
      anthropic: 1 / 3,
      ollama_cloud: 1 / 3,
    });
    assert.deepEqual(normalizeOnlineAutoProviderWeights(null, -1), {
      v: 1,
      openai: 2 / 3,
      anthropic: 0,
      ollama_cloud: 1 / 3,
    });
  });

  it("normalizes arbitrary values and formats a stable 100 percent summary", () => {
    const weights = normalizeOnlineAutoProviderWeights({
      openai: 2,
      anthropic: 1,
      ollama_cloud: 1,
    });
    assert.deepEqual(weights, {
      v: 1,
      openai: 0.5,
      anthropic: 0.25,
      ollama_cloud: 0.25,
    });
    assert.equal(
      formatOnlineAutoProviderWeightsLabel(weights),
      "OpenAI 50% · Anthropic 25% · Ollama Cloud 25%",
    );
  });

  it("makes Ollama Cloud win an otherwise equal three-way ranking at its vertex", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      lane: "online",
      hiddenModelIds: [],
      catalog: {
        local: [],
        online: [
          { id: "gpt-4o-mini", provider: "openai" },
          { id: "claude-haiku-4-5", provider: "anthropic" },
          { id: "gpt-oss:120b-cloud", provider: "ollama_cloud" },
        ],
      },
      onlineAutoProviderWeights: {
        v: 1,
        openai: 0,
        anthropic: 0,
        ollama_cloud: 1,
      },
      routingContext: { surface: "chat", inputText: "Hello" },
      priceForModel: () => ({ inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
    });
    assert.equal(resolved.provider, "ollama_cloud");
  });
});
