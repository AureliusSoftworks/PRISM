import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
});
