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

/**
 * Private guidance is inserted before the final user turn (appending a system
 * turn after it returns an empty completion on llama3.2), so tests locate it
 * by role rather than by position.
 */
const guidanceOf = (messages: readonly ProviderMessage[]): string =>
  [...messages].reverse().find((message) => message.role === "system")
    ?.content ?? "";

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
    assert.match(guidanceOf(calls[0]?.messages ?? []), /under ~60 words/u);

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
    const note = guidanceOf(preparedHigh);
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
    assert.match(guidanceOf(prepared), /private note 4/u);
    // Guidance sits before the final user turn, never after it.
    assert.deepEqual(prepared.map((message) => message.role), ["system", "user"]);
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

  it("carries every completed pass into the visible turn", async () => {
    // The chain used to overwrite: each pass saw only the one before it and the
    // visible turn saw only the last, so High effort shipped a bare correction
    // list with the plan and draft it referenced already thrown away.
    const seen: string[] = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages) {
        seen.push(guidanceOf(messages));
        if (seen.length === 1) return "- intent: settle the bet";
        if (seen.length === 2) return "- draft: name the wager, then the odds";
        return "- fix: drop the second hedge";
      },
      async embedText() {
        return [];
      },
    };
    const prepared = await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Settle it." }],
      options: { model: "qwen3:9b" },
      effort: "high",
      surface: "coffee",
    });
    const brief = guidanceOf(prepared);
    assert.match(brief, /Plan: - intent: settle the bet/u);
    assert.match(brief, /Draft: - draft: name the wager/u);
    assert.match(brief, /Corrections: - fix: drop the second hedge/u);
    // Later passes see the whole record, not just their predecessor.
    assert.match(seen[2] ?? "", /Plan: - intent: settle the bet/u);
    assert.match(seen[2] ?? "", /Draft: - draft: name the wager/u);
    // The brief stays inside the effort's note budget.
    assert.ok(brief.length <= 1_400 + 400, `brief was ${brief.length}`);
  });

  it("keeps authored bullet structure instead of flattening it", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return "- Must: keep the label\n- Must: stay under 40 words";
      },
      async embedText() {
        return [];
      },
    };
    const prepared = await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Go." }],
      options: { model: "qwen3:9b" },
      effort: "low",
      surface: "signal",
    });
    const brief = guidanceOf(prepared);
    // Every pass prompt asks for bullets; collapsing them to one line threw
    // away the structure the pass was told to produce.
    assert.match(brief, /- Must: keep the label\n- Must: stay under 40 words/u);
  });

  it("samples the alternatives pass with real diversity", async () => {
    const temperatures: Array<number | undefined> = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(_messages, options) {
        temperatures.push(options?.temperature);
        return "note";
      },
      async embedText() {
        return [];
      },
    };
    await prepareMessagesWithSimulatedEffort({
      provider,
      messages: [{ role: "user", content: "Go." }],
      options: { model: "qwen3:9b" },
      effort: "minimal",
      surface: "coffee",
      ladderProfile: "deep",
    });
    // deep/minimal is plan -> alternatives -> draft.
    assert.deepEqual(temperatures, [0, 0.6, 0.35]);
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
    assert.match(guidanceOf(prepared), /safe note 2/u);
    // llama3.2 returns an empty completion when a system turn is last.
    assert.equal(prepared.at(-1)?.role, "user");
  });
});
