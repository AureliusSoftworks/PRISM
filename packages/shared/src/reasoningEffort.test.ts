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
  reasoningGenerationBudgetMs,
  reasoningEffortForRequest,
  resolveModelReasoningEffortCapability,
  simulatedPsychicAnswerGuidanceMaxChars,
  simulatedPsychicPlanningMaxTokens,
  simulatedPsychicPrivateArtifactMaxChars,
  simulatedPsychicPrivatePassMaxTokens,
  simulatedPsychicScratchpadMaxChars,
  simulatedSurfacePreparationMaxTokens,
  simulatedSurfacePreparationNoteMaxChars,
  getSimulatedEffortBudgetProfile,
  simulatedEffortUsesThriftyPrompting,
  withSimulatedEffortBudgetProfile,
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

  it("keeps simulated-effort token budgets thrifty at low tiers and richer at high", () => {
    assert.equal(getSimulatedEffortBudgetProfile(), "thrifty");
    assert.equal(simulatedSurfacePreparationMaxTokens("minimal"), 72);
    assert.equal(simulatedSurfacePreparationMaxTokens("low"), 96);
    assert.equal(simulatedSurfacePreparationMaxTokens("medium"), 140);
    assert.equal(simulatedSurfacePreparationMaxTokens("high"), 220);
    assert.equal(simulatedSurfacePreparationMaxTokens("xhigh"), 320);
    assert.ok(
      simulatedSurfacePreparationNoteMaxChars("medium") <
        simulatedSurfacePreparationNoteMaxChars("high"),
    );
    assert.ok(
      simulatedPsychicPlanningMaxTokens("low") <
        simulatedPsychicPlanningMaxTokens("high"),
    );
    assert.equal(simulatedPsychicPrivatePassMaxTokens("medium", "audit"), 260);
    assert.equal(simulatedPsychicPrivatePassMaxTokens("high", "draft"), 640);
    assert.equal(simulatedPsychicPrivatePassMaxTokens("xhigh", "draft"), 1_000);
    assert.ok(
      simulatedPsychicScratchpadMaxChars("medium") <
        simulatedPsychicScratchpadMaxChars("xhigh"),
    );
    assert.ok(
      simulatedPsychicAnswerGuidanceMaxChars("low") <
        simulatedPsychicAnswerGuidanceMaxChars("high"),
    );
    assert.equal(simulatedPsychicPrivateArtifactMaxChars("medium"), 1_200);
    assert.equal(simulatedPsychicPrivateArtifactMaxChars("xhigh"), 3_200);
  });

  it("restores legacy simulated budgets for eval A/B", async () => {
    await withSimulatedEffortBudgetProfile("legacy", async () => {
      assert.equal(getSimulatedEffortBudgetProfile(), "legacy");
      assert.equal(simulatedEffortUsesThriftyPrompting(), false);
      assert.equal(simulatedSurfacePreparationMaxTokens("minimal"), 120);
      assert.equal(simulatedSurfacePreparationMaxTokens("high"), 220);
      assert.equal(simulatedSurfacePreparationNoteMaxChars("low"), 1_800);
      assert.equal(simulatedPsychicPlanningMaxTokens("medium"), 560);
      assert.equal(simulatedPsychicPrivatePassMaxTokens("high", "draft"), 900);
      assert.equal(simulatedPsychicScratchpadMaxChars("minimal"), 4_000);
      assert.equal(simulatedPsychicAnswerGuidanceMaxChars("low"), 1_400);
      assert.equal(simulatedPsychicPrivateArtifactMaxChars("medium"), 3_200);
    });
    assert.equal(getSimulatedEffortBudgetProfile(), "thrifty");
    assert.equal(simulatedEffortUsesThriftyPrompting(), true);
  });

  it("budgets one complete generation attempt by effort", () => {
    assert.equal(reasoningGenerationBudgetMs("none"), 60_000);
    assert.equal(reasoningGenerationBudgetMs("minimal"), 60_000);
    assert.equal(reasoningGenerationBudgetMs("low"), 60_000);
    assert.equal(reasoningGenerationBudgetMs("medium"), 120_000);
    assert.equal(reasoningGenerationBudgetMs("high"), 180_000);
    assert.equal(reasoningGenerationBudgetMs("xhigh"), 300_000);
    assert.equal(reasoningGenerationBudgetMs("auto"), 180_000);
    assert.equal(reasoningGenerationBudgetMs(undefined), 180_000);
    assert.equal(
      reasoningGenerationBudgetMs(undefined, {
        provider: "openai",
        modelId: "gpt-5.5",
      }),
      180_000,
    );
    assert.equal(
      reasoningGenerationBudgetMs(undefined, {
        provider: "local",
        modelId: "llama3.2",
      }),
      60_000,
    );
    assert.equal(
      reasoningGenerationBudgetMs(undefined, {
        provider: "openai",
        modelId: "gpt-4o",
      }),
      60_000,
    );
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
    const localSimulated = resolveModelReasoningEffortCapability({
      provider: "local",
      modelId: "qwen3:14b",
      simulatedEffortEnabled: true,
    });
    assert.equal(localSimulated.mode, "simulated");
    assert.equal(localSimulated.supportsNone, true);
    assert.deepEqual(localSimulated.levels, [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
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
    assert.equal(
      effectiveModelReasoningEffort({
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        preference: "none",
        simulatedEffortEnabled: true,
      }),
      "none",
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
