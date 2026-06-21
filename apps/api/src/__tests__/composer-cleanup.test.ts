import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import {
  cleanupComposerTextWithModel,
  cleanupResolvedPromptWithModel,
} from "../composer-cleanup.ts";

function mockProvider(
  reply: string,
  inspect?: (messages: ProviderMessage[], options?: GenerateOptions) => void
): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages: ProviderMessage[], options?: GenerateOptions) {
      inspect?.(messages, options);
      return reply;
    },
    async embedText() {
      return [];
    },
  };
}

describe("composer cleanup", () => {
  it("uses the composer proofreader prompt and unwraps fenced replies", async () => {
    const provider = mockProvider("```text\nHello, world!\n```", (messages, options) => {
      assert.match(messages[0]?.content ?? "", /composer proofreader/u);
      assert.equal(messages[1]?.content, "hello world");
      assert.equal(options?.model, "llama3.2");
      assert.equal(options?.temperature, 0.05);
    });

    const cleaned = await cleanupComposerTextWithModel({
      text: "hello world",
      provider,
      model: "llama3.2",
    });

    assert.equal(cleaned, "Hello, world!");
  });

  it("realigns wildcard replacement ranges after punctuation cleanup", async () => {
    const provider = mockProvider("Tell me about Sarah Inkwell's son.");

    const cleaned = await cleanupResolvedPromptWithModel({
      prompt: "Tell me about Sarah inkwellson.",
      replacements: [{ key: "NAME", value: "Sarah inkwell", start: 14, end: 27 }],
      provider,
      model: "llama3.2",
    });

    assert.equal(cleaned.prompt, "Tell me about Sarah Inkwell's son.");
    assert.deepEqual(cleaned.replacements, [
      { key: "NAME", value: "Sarah Inkwell", start: 14, end: 27 },
    ]);
    assert.equal(cleaned.changed, true);
  });
});
