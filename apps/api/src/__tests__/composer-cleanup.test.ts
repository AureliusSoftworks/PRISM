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

  it("uses structured send cleanup values when grammar changes a wildcard replacement", async () => {
    const provider = mockProvider(
      JSON.stringify({
        prompt: "Bring two apples.",
        replacements: [{ index: 0, value: "apples" }],
      }),
      (messages, options) => {
        assert.match(messages[0]?.content ?? "", /send-time proofreader/u);
        assert.match(messages[1]?.content ?? "", /<resolved_prompt>/u);
        assert.match(messages[1]?.content ?? "", /"key":"NOUN"/u);
        assert.equal(options?.jsonMode, true);
      }
    );

    const cleaned = await cleanupResolvedPromptWithModel({
      prompt: "Bring two apple.",
      replacements: [{ key: "NOUN", value: "apple", start: 10, end: 15 }],
      provider,
      model: "llama3.2",
    });

    assert.equal(cleaned.prompt, "Bring two apples.");
    assert.deepEqual(cleaned.replacements, [
      { key: "NOUN", value: "apples", start: 10, end: 16 },
    ]);
    assert.equal(cleaned.changed, true);
  });

  it("skips send cleanup when there are no wildcard replacements", async () => {
    const provider = mockProvider("", () => {
      throw new Error("Plain sends should not call the cleanup provider.");
    });

    const cleaned = await cleanupResolvedPromptWithModel({
      prompt: "Carry a umbrella.",
      provider,
      model: "llama3.2",
    });

    assert.equal(cleaned.prompt, "Carry a umbrella.");
    assert.deepEqual(cleaned.replacements, []);
    assert.equal(cleaned.changed, false);
  });

  it("fixes a/an article agreement in send cleanup", async () => {
    const provider = mockProvider(
      JSON.stringify({
        prompt: "Carry an umbrella.",
        replacements: [{ index: 0, value: "umbrella" }],
      }),
      (messages) => {
        assert.match(messages[0]?.content ?? "", /a\/an article choice/u);
        assert.match(messages[0]?.content ?? "", /obvious a\/an agreement/u);
      }
    );

    const cleaned = await cleanupResolvedPromptWithModel({
      prompt: "Carry a umbrella.",
      replacements: [{ key: "OBJECT", value: "umbrella", start: 8, end: 16 }],
      provider,
      model: "llama3.2",
    });

    assert.equal(cleaned.prompt, "Carry an umbrella.");
    assert.deepEqual(cleaned.replacements, [
      { key: "OBJECT", value: "umbrella", start: 9, end: 17 },
    ]);
    assert.equal(cleaned.changed, true);
  });

  it("rejects send cleanup when wildcard replacements cannot be realigned", async () => {
    const provider = mockProvider(
      JSON.stringify({
        prompt: "Bring two fruit.",
        replacements: [{ index: 0, value: "apples" }],
      })
    );

    await assert.rejects(
      cleanupResolvedPromptWithModel({
        prompt: "Bring two apple.",
        replacements: [{ key: "NOUN", value: "apple", start: 10, end: 15 }],
        provider,
      }),
      /could not realign/u
    );
  });

  it("rejects raw JSON-looking cleanup text before it can become the visible prompt", async () => {
    const provider = mockProvider(
      '{"prompt":"Bring two apples.\\nWildcard replacements:\\n0: NOUN = \\"apple\\"'
    );

    await assert.rejects(
      cleanupResolvedPromptWithModel({
        prompt: "Bring two apple.",
        replacements: [{ key: "NOUN", value: "apple", start: 10, end: 15 }],
        provider,
      }),
      /leaked prompt metadata/u
    );
  });

  it("rejects parsed cleanup prompts that include wildcard replacement metadata", async () => {
    const provider = mockProvider(
      JSON.stringify({
        prompt: 'Bring two apples.\nWildcard replacements:\n0: NOUN = "apple"',
        replacements: [{ index: 0, value: "apples" }],
      })
    );

    await assert.rejects(
      cleanupResolvedPromptWithModel({
        prompt: "Bring two apple.",
        replacements: [{ key: "NOUN", value: "apple", start: 10, end: 15 }],
        provider,
      }),
      /leaked prompt metadata/u
    );
  });
});
