import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  prepareMessagesWithSimulatedEffort,
  ReasoningGenerationTimeoutError,
  runWithReasoningGenerationBudget,
  shouldPrepareMessagesWithSimulatedEffort,
} from "../model-effort-runner.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";

describe("simulated model effort runner", () => {
  it("uses one abort signal for a complete direct reasoning attempt", async () => {
    const controller = new AbortController();
    const result = await runWithReasoningGenerationBudget({
      effort: "xhigh",
      signal: controller.signal,
      run: async (signal) => {
        assert.equal(signal.aborted, false);
        return "complete";
      },
    });
    assert.equal(result, "complete");
  });

  it("preserves caller cancellation instead of reporting a timeout", async () => {
    const controller = new AbortController();
    const pending = runWithReasoningGenerationBudget({
      effort: "xhigh",
      signal: controller.signal,
      run: (signal) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    });
    const cancellation = new DOMException("cancelled", "AbortError");
    controller.abort(cancellation);
    await assert.rejects(pending, (error) => {
      assert.equal(error, cancellation);
      assert.equal(error instanceof ReasoningGenerationTimeoutError, false);
      return true;
    });
  });

  it("selects only local models for simulated effort", () => {
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "local",
        model: "qwen3:9b",
        effort: "low",
      }),
      true,
    );
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "openai",
        model: "gpt-4o",
        effort: "medium",
      }),
      false,
    );
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "anthropic",
        model: "claude-haiku-4-5",
        effort: "high",
      }),
      false,
    );
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "openai",
        model: "gpt-5.6-sol",
        effort: "high",
      }),
      false,
    );
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "anthropic",
        model: "claude-opus-4-8",
        effort: "xhigh",
      }),
      false,
    );
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "openai",
        model: "gpt-4o",
        effort: "none",
      }),
      false,
    );
  });

  it("defensively skips direct preparation on an ONLINE provider", async () => {
    let calls = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        calls += 1;
        return "unused";
      },
      async embedText() {
        return [];
      },
    };
    const messages: ProviderMessage[] = [{ role: "user", content: "Hello" }];
    assert.equal(
      await prepareMessagesWithSimulatedEffort({
        provider,
        messages,
        options: { model: "gpt-4o" },
        effort: "high",
        surface: "signal",
      }),
      messages,
    );
    assert.equal(calls, 0);
  });

  it("scales thrifty simulated preparation budgets by effort", async () => {
    const calls: Array<{
      messages: ProviderMessage[];
      options?: GenerateOptions;
    }> = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages, options) {
        calls.push({ messages, options });
        return `private note ${calls.length} `.repeat(80);
      },
      async embedText() {
        return [];
      },
    };
    await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Argue it." }],
      options: { model: "qwen3:9b" },
      effort: "low",
      surface: "coffee",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.options?.maxTokens, 96);
    assert.match(calls[0]?.messages.at(-1)?.content ?? "", /under ~60 words/u);

    calls.length = 0;
    const preparedHigh = await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Argue it." }],
      options: { model: "qwen3:9b" },
      effort: "high",
      surface: "coffee",
    });
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.options?.maxTokens === 220));
    const note = preparedHigh.at(-1)?.content ?? "";
    assert.ok(note.length <= 1_400 + 160);

    calls.length = 0;
    await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Argue it." }],
      options: { model: "qwen3:9b" },
      effort: "high",
      surface: "coffee",
      ladderProfile: "deep",
    });
    assert.equal(calls.length, 8);
  });

  it("uses the saved ladder without mutating canonical messages", async () => {
    const calls: Array<{
      messages: ProviderMessage[];
      options?: GenerateOptions;
    }> = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages, options) {
        calls.push({ messages, options });
        return `private note ${calls.length}`;
      },
      async embedText() {
        return [];
      },
    };
    const canonical: ProviderMessage[] = [{ role: "user", content: "Argue it." }];
    const prepared = await prepareMessagesWithSimulatedEffort({
      provider,
      messages: canonical,
      options: { model: "qwen3:9b" },
      effort: "xhigh",
      surface: "debate",
      outputContract: "Return one JSON object.",
    });
    assert.equal(calls.length, 4);
    assert.deepEqual(canonical, [{ role: "user", content: "Argue it." }]);
    assert.equal(prepared.length, 2);
    assert.match(prepared[1]?.content ?? "", /private note 4/u);
    assert.ok(calls.every((call) => call.options?.usagePurpose === "psychic_planning"));
  });

  it("does no private work for Default or None", async () => {
    let calls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        calls += 1;
        return "unused";
      },
      async embedText() {
        return [];
      },
    };
    const messages: ProviderMessage[] = [{ role: "user", content: "Hello" }];
    assert.equal(
      await prepareMessagesWithSimulatedEffort({
        provider,
        messages,
        options: {},
        effort: null,
        surface: "signal",
      }),
      messages,
    );
    assert.equal(
      await prepareMessagesWithSimulatedEffort({
        provider,
        messages,
        options: {},
        effort: "none",
        surface: "signal",
      }),
      messages,
    );
    assert.equal(calls, 0);
  });

  it("falls back to the latest safe notes when a later private pass fails", async () => {
    let calls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        calls += 1;
        if (calls === 3) throw new Error("private pass unavailable");
        return `safe note ${calls}`;
      },
      async embedText() {
        return [];
      },
    };
    const prepared = await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Continue." }],
      options: { model: "qwen3:9b" },
      effort: "xhigh",
      surface: "story",
    });
    assert.equal(calls, 3);
    assert.match(prepared.at(-1)?.content ?? "", /safe note 2/u);
  });
});
