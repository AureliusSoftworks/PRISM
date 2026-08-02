import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anthropicModelSupportsReasoningEffort,
  anthropicReasoningEffortForRequest,
  effectiveModelReasoningEffort,
  modelReasoningEffortPreferenceKey,
  modelSupportsNativeReasoningEffort,
  normalizeModelReasoningEffortPreference,
  normalizeReasoningEffort,
  openAiModelSupportsReasoningEffort,
  openAiReasoningEffortForRequest,
  openAiReasoningEffortLevels,
  reasoningEffortForRequest,
  resolveModelReasoningEffortCapability,
} from "./reasoningEffort.ts";

describe("reasoning effort helpers", () => {
  it("normalizes supported effort values", () => {
    assert.equal(normalizeReasoningEffort(undefined), "auto");
    assert.equal(normalizeReasoningEffort("HIGH"), "high");
    assert.equal(normalizeReasoningEffort(" xhigh "), "xhigh");
    assert.equal(normalizeReasoningEffort("fast"), "auto");
    assert.equal(reasoningEffortForRequest("auto"), null);
    assert.equal(reasoningEffortForRequest("none"), "none");
    assert.equal(reasoningEffortForRequest("minimal"), "minimal");
  });

  it("normalizes persisted per-model preferences without storing Default", () => {
    assert.equal(normalizeModelReasoningEffortPreference("default"), null);
    assert.equal(normalizeModelReasoningEffortPreference("auto"), null);
    assert.equal(normalizeModelReasoningEffortPreference(" HIGH "), "high");
    assert.equal(normalizeModelReasoningEffortPreference("fast"), null);
    assert.equal(
      modelReasoningEffortPreferenceKey("local", " ollama-secondary:qwen3 "),
      "local:ollama-secondary:qwen3",
    );
  });

  it("detects OpenAI reasoning models that support effort", () => {
    assert.equal(openAiModelSupportsReasoningEffort("gpt-5"), true);
    assert.equal(openAiModelSupportsReasoningEffort("gpt-5.4"), true);
    assert.equal(openAiModelSupportsReasoningEffort("gpt-5.5"), true);
    assert.equal(openAiModelSupportsReasoningEffort("o3"), true);
    assert.equal(openAiModelSupportsReasoningEffort("o4-mini"), true);
    assert.equal(openAiModelSupportsReasoningEffort("o5"), true);
  });

  it("rejects non-reasoning and incompatible model families", () => {
    assert.equal(openAiModelSupportsReasoningEffort("gpt-4o"), false);
    assert.equal(openAiModelSupportsReasoningEffort("gpt-4.1"), false);
    assert.equal(openAiModelSupportsReasoningEffort("claude-sonnet-4-6"), false);
    assert.equal(openAiModelSupportsReasoningEffort("llama3.2"), false);
    assert.equal(openAiModelSupportsReasoningEffort("o3-chat-latest"), false);
    assert.equal(openAiModelSupportsReasoningEffort("gpt-5.1-chat-latest"), false);
    assert.equal(openAiModelSupportsReasoningEffort("gpt-5-search-api"), false);
  });

  it("detects Anthropic models that expose native effort", () => {
    for (const model of [
      "claude-opus-4-5-20251101",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-sonnet-5",
      "claude-fable-5",
      "claude-mythos-preview",
      "claude-mythos-5",
    ]) {
      assert.equal(anthropicModelSupportsReasoningEffort(model), true, model);
    }
    for (const model of [
      "claude-haiku-4-5",
      "claude-sonnet-4-5-20250929",
      "claude-opus-4-1-20250805",
      "claude-test-model",
    ]) {
      assert.equal(anthropicModelSupportsReasoningEffort(model), false, model);
    }
  });

  it("maps provider-neutral PRISM effort onto each Anthropic model capability", () => {
    assert.equal(anthropicReasoningEffortForRequest("claude-opus-4-8", "minimal"), "low");
    assert.equal(anthropicReasoningEffortForRequest("claude-opus-4-8", "medium"), "medium");
    assert.equal(anthropicReasoningEffortForRequest("claude-opus-4-8", "xhigh"), "xhigh");
    assert.equal(anthropicReasoningEffortForRequest("claude-sonnet-4-6", "xhigh"), "max");
    assert.equal(anthropicReasoningEffortForRequest("claude-opus-4-5", "xhigh"), "high");
    assert.equal(anthropicReasoningEffortForRequest("claude-sonnet-4-6", "auto"), null);
    assert.equal(anthropicReasoningEffortForRequest("claude-sonnet-4-6", "none"), null);
    assert.equal(anthropicReasoningEffortForRequest("claude-haiku-4-5", "high"), null);
  });

  it("exposes one provider-aware native effort capability", () => {
    assert.equal(modelSupportsNativeReasoningEffort("openai", "gpt-5.5"), true);
    assert.equal(
      modelSupportsNativeReasoningEffort("anthropic", "claude-sonnet-4-6"),
      true
    );
    assert.equal(
      modelSupportsNativeReasoningEffort("anthropic", "claude-haiku-4-5"),
      false
    );
    assert.equal(modelSupportsNativeReasoningEffort("local", "qwen3:14b"), false);
  });

  it("exposes only distinct, real effort levels for each model", () => {
    assert.deepEqual(openAiReasoningEffortLevels("gpt-5"), [
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    assert.deepEqual(openAiReasoningEffortLevels("gpt-5.1"), [
      "none",
      "low",
      "medium",
      "high",
    ]);
    assert.deepEqual(openAiReasoningEffortLevels("gpt-5.6-sol"), [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    assert.deepEqual(openAiReasoningEffortLevels("gpt-5.5-pro"), []);
    assert.equal(openAiReasoningEffortForRequest("gpt-5", "none"), null);
    assert.equal(openAiReasoningEffortForRequest("gpt-5.6-sol", "none"), "none");
  });

  it("gates simulated effort for local and non-native online models", () => {
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "local",
        modelId: "qwen3:14b",
      }).mode,
      "unavailable",
    );
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "local",
        modelId: "qwen3:14b",
        simulatedEffortEnabled: true,
      }).mode,
      "simulated",
    );
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "openai",
        modelId: "gpt-4o",
      }).disabledReason,
      "Enable experimental simulated effort in Settings.",
    );
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "openai",
        modelId: "gpt-4o",
        simulatedEffortEnabled: true,
      }).mode,
      "simulated",
    );
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        simulatedEffortEnabled: true,
      }).mode,
      "simulated",
    );
    assert.equal(
      effectiveModelReasoningEffort({
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        preference: "minimal",
      }),
      null,
    );
    assert.equal(
      effectiveModelReasoningEffort({
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        preference: "minimal",
        simulatedEffortEnabled: true,
      }),
      "minimal",
    );
  });

  it("preserves native and fixed online effort behavior when simulation is enabled", () => {
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "openai",
        modelId: "gpt-5.6-sol",
        simulatedEffortEnabled: true,
      }).mode,
      "native",
    );
    const fixed = resolveModelReasoningEffortCapability({
      provider: "openai",
      modelId: "gpt-5.5-pro",
      simulatedEffortEnabled: true,
    });
    assert.equal(fixed.mode, "unavailable");
    assert.equal(fixed.disabledReason, "This model uses a fixed reasoning effort.");
  });
});
