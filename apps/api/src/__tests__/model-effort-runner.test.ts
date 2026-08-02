import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  prepareMessagesWithSimulatedEffort,
  shouldPrepareMessagesWithSimulatedEffort,
} from "../model-effort-runner.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";

describe("simulated model effort runner", () => {
  it("selects local and unsupported online models while preserving native effort", () => {
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
      true,
    );
    assert.equal(
      shouldPrepareMessagesWithSimulatedEffort({
        provider: "anthropic",
        model: "claude-haiku-4-5",
        effort: "high",
      }),
      true,
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

  it("uses the saved ladder without mutating canonical messages", async () => {
    const calls: Array<{
      messages: ProviderMessage[];
      options?: GenerateOptions;
    }> = [];
    const provider: LlmProvider = {
      async generateResponse(messages, options) {
        calls.push({ messages, options });
        return `private note ${calls.length}`;
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
      async generateResponse() {
        calls += 1;
        return "unused";
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
      async generateResponse() {
        calls += 1;
        if (calls === 3) throw new Error("private pass unavailable");
        return `safe note ${calls}`;
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
