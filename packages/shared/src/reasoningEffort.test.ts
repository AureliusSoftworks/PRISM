import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anthropicModelSupportsReasoningEffort,
  anthropicReasoningEffortForRequest,
  effectiveModelReasoningEffort,
  modelReasoningEffortPreferenceKey,
  modelSupportsNativeReasoningEffort,
  modelSupportsTurboMode,
  normalizeModelReasoningEffortPreference,
  normalizeProviderReasoningEffort,
  normalizeReasoningEffort,
  openAiModelSupportsReasoningEffort,
  openAiModelSupportsMaxReasoningEffort,
  openAiReasoningEffortForRequest,
  openAiReasoningEffortLevels,
  reasoningGenerationBudgetMs,
  reasoningEffortForRequest,
  resolveModelReasoningEffortCapability,
  simulatedPsychicAnswerGuidanceMaxChars,
  simulatedPsychicPlanningMaxTokens,
  simulatedPsychicPrivateArtifactMaxChars,
  simulatedEffortLadderPasses,
  simulatedPsychicPrivatePassMaxTokens,
  simulatedPsychicScratchpadMaxChars,
  simulatedSurfacePreparationMaxTokens,
  simulatedSurfacePreparationNoteMaxChars,
  getSimulatedEffortBudgetProfile,
  simulatedEffortUsesThriftyPrompting,
  withSimulatedEffortBudgetProfile,
} from "./reasoningEffort.ts";

describe("reasoning effort helpers", () => {
  it("gates Turbo to online models with OpenAI Priority processing", () => {
    for (const modelId of [
      "gpt-5.6",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.4-mini",
      "gpt-5.2-2025-12-11",
      "gpt-4.1-mini",
      "gpt-4o-2024-11-20",
      "o3",
      "o4-mini",
    ]) {
      assert.equal(modelSupportsTurboMode("openai", modelId), true, modelId);
    }
    for (const modelId of [
      "gpt-5.5-pro",
      "gpt-5-search-api",
      "gpt-4o-audio-preview",
      "text-embedding-3-large",
    ]) {
      assert.equal(modelSupportsTurboMode("openai", modelId), false, modelId);
    }
    assert.equal(modelSupportsTurboMode("anthropic", "claude-opus-4-8"), false);
    assert.equal(modelSupportsTurboMode("local", "gpt-5.6-sol"), false);
  });

  it("normalizes supported effort values", () => {
    assert.equal(normalizeReasoningEffort(undefined), "auto");
    assert.equal(normalizeReasoningEffort("HIGH"), "high");
    assert.equal(normalizeReasoningEffort(" xhigh "), "xhigh");
    assert.equal(normalizeReasoningEffort("fast"), "auto");
    assert.equal(reasoningEffortForRequest("auto"), null);
    assert.equal(reasoningEffortForRequest("none"), "none");
    assert.equal(reasoningEffortForRequest("minimal"), "minimal");
    assert.equal(normalizeProviderReasoningEffort(" MAX "), "max");
    assert.equal(normalizeModelReasoningEffortPreference("max"), null);
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
    assert.equal(simulatedPsychicPlanningMaxTokens("minimal"), 300);
    assert.equal(simulatedPsychicPlanningMaxTokens("low"), 340);
    assert.ok(
      simulatedPsychicPlanningMaxTokens("minimal") <
        simulatedPsychicPlanningMaxTokens("low"),
    );
    assert.equal(simulatedPsychicPrivatePassMaxTokens("medium", "audit"), 320);
    assert.equal(simulatedPsychicPrivatePassMaxTokens("high", "draft"), 800);
    assert.equal(simulatedPsychicPrivatePassMaxTokens("xhigh", "draft"), 1_200);
    assert.equal(
      simulatedPsychicPrivatePassMaxTokens("xhigh", "revise_draft"),
      1_400,
    );
    assert.ok(
      simulatedPsychicScratchpadMaxChars("medium") <
        simulatedPsychicScratchpadMaxChars("xhigh"),
    );
    assert.ok(
      simulatedPsychicAnswerGuidanceMaxChars("low") <
        simulatedPsychicAnswerGuidanceMaxChars("high"),
    );
    assert.equal(simulatedPsychicPrivateArtifactMaxChars("medium"), 1_600);
    assert.equal(simulatedPsychicPrivateArtifactMaxChars("xhigh"), 4_000);
  });

  it("defaults to the lean standard ladder and keeps deep as experimental", () => {
    assert.deepEqual(simulatedEffortLadderPasses("none"), []);
    assert.deepEqual(simulatedEffortLadderPasses("minimal"), ["plan"]);
    assert.deepEqual(simulatedEffortLadderPasses("low"), ["plan"]);
    assert.deepEqual(simulatedEffortLadderPasses("medium"), ["plan", "audit"]);
    assert.deepEqual(simulatedEffortLadderPasses("high"), [
      "plan",
      "draft",
      "audit",
    ]);
    assert.deepEqual(simulatedEffortLadderPasses("xhigh"), [
      "plan",
      "draft",
      "audit",
      "synthesis",
    ]);
    assert.deepEqual(simulatedEffortLadderPasses("minimal", "deep"), [
      "plan",
      "alternatives",
      "draft",
    ]);
    assert.deepEqual(simulatedEffortLadderPasses("low", "deep"), [
      "plan",
      "alternatives",
      "draft",
      "audit",
      "red_team",
    ]);
    assert.equal(simulatedEffortLadderPasses("medium", "deep").length, 7);
    assert.equal(simulatedEffortLadderPasses("high", "deep").length, 8);
    assert.deepEqual(simulatedEffortLadderPasses("xhigh", "deep"), [
      "plan",
      "alternatives",
      "draft",
      "audit",
      "red_team",
      "constraint_lock",
      "revise_draft",
      "compliance_sweep",
      "synthesis",
    ]);
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
    assert.equal(reasoningGenerationBudgetMs("minimal"), 120_000);
    assert.equal(reasoningGenerationBudgetMs("low"), 180_000);
    assert.equal(reasoningGenerationBudgetMs("medium"), 240_000);
    assert.equal(reasoningGenerationBudgetMs("high"), 360_000);
    assert.equal(reasoningGenerationBudgetMs("xhigh"), 480_000);
    assert.equal(reasoningGenerationBudgetMs("max"), 600_000);
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
      120_000,
    );
    assert.equal(
      reasoningGenerationBudgetMs(undefined, {
        provider: "openai",
        modelId: "gpt-4o",
      }),
      120_000,
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
    for (const modelId of [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]) {
      assert.deepEqual(openAiReasoningEffortLevels(modelId), [
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
      assert.equal(
        openAiReasoningEffortForRequest(modelId, "minimal"),
        "minimal",
      );
      assert.equal(openAiReasoningEffortForRequest(modelId, "low"), "low");
      assert.equal(openAiModelSupportsMaxReasoningEffort(modelId), true);
      assert.equal(openAiReasoningEffortForRequest(modelId, "max"), "max");
      assert.equal(
        effectiveModelReasoningEffort({
          provider: "openai",
          modelId,
          preference: "minimal",
        }),
        "minimal",
      );
    }
    assert.deepEqual(openAiReasoningEffortLevels("gpt-5.5-pro"), []);
    assert.equal(openAiModelSupportsMaxReasoningEffort("gpt-5.5"), false);
    assert.equal(openAiReasoningEffortForRequest("gpt-5.5", "max"), null);
    assert.equal(openAiReasoningEffortForRequest("gpt-5", "none"), null);
    assert.equal(openAiReasoningEffortForRequest("gpt-5.6-sol", "none"), "none");
  });

  it("simulates effort for non-native models while preserving native online effort", () => {
    const localSimulated = resolveModelReasoningEffortCapability({
      provider: "local",
      modelId: "qwen3:14b",
    });
    assert.equal(localSimulated.mode, "simulated");
    assert.equal(localSimulated.supportsNone, true);
    assert.equal(localSimulated.supportsMax, false);
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
        provider: "local",
        modelId: "qwen3:14b",
        simulatedEffortEnabled: false,
      }).mode,
      "unavailable",
    );
    const openAiSimulated = resolveModelReasoningEffortCapability({
      provider: "openai",
      modelId: "gpt-4o",
    });
    assert.equal(openAiSimulated.mode, "simulated");
    assert.equal(openAiSimulated.supportsNone, true);
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
        simulatedEffortEnabled: true,
      }),
      "minimal",
    );
    assert.equal(
      effectiveModelReasoningEffort({
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        preference: "none",
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
    assert.equal(
      resolveModelReasoningEffortCapability({
        provider: "openai",
        modelId: "gpt-5.6-sol",
      }).supportsMax,
      true,
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
