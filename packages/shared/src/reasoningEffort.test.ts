import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anthropicModelSupportsReasoningEffort,
  anthropicReasoningEffortForRequest,
  modelSupportsNativeReasoningEffort,
  normalizeReasoningEffort,
  openAiModelSupportsReasoningEffort,
  reasoningEffortForRequest,
} from "./reasoningEffort.ts";

describe("reasoning effort helpers", () => {
  it("normalizes supported effort values", () => {
    assert.equal(normalizeReasoningEffort(undefined), "auto");
    assert.equal(normalizeReasoningEffort("HIGH"), "high");
    assert.equal(normalizeReasoningEffort(" xhigh "), "xhigh");
    assert.equal(normalizeReasoningEffort("fast"), "auto");
    assert.equal(reasoningEffortForRequest("auto"), null);
    assert.equal(reasoningEffortForRequest("none"), null);
    assert.equal(reasoningEffortForRequest("minimal"), "minimal");
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
});
