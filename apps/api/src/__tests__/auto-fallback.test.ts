import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTO_FALLBACK_EXHAUSTED_MESSAGE_MAX_CHARS,
  AUTO_FALLBACK_TOTAL_TIMEOUT_MAX_MS,
  AUTO_FALLBACK_VALIDATION_CLAUSE_MAX_CHARS,
  AutoFallbackExhaustedError,
  autoFallbackReasoningEffort,
  runAutoFallbackChain,
  validateAutoFallbackText,
} from "../auto-fallback.ts";

function attempt(
  provider: "local" | "openai" | "anthropic",
  model: string,
  run: (signal: AbortSignal) => Promise<string>,
  available = true
) {
  return { provider, model, run, available };
}

describe("Auto fallback runner", () => {
  it("keeps the whole-route budget bounded", () => {
    assert.equal(AUTO_FALLBACK_TOTAL_TIMEOUT_MAX_MS, 600_000);
  });

  it("preserves primary effort and disables thinking on every fallback", () => {
    assert.equal(autoFallbackReasoningEffort(0, "high"), "high");
    assert.equal(autoFallbackReasoningEffort(1, "high"), "none");
    assert.equal(autoFallbackReasoningEffort(5, "xhigh"), "none");
  });

  it("retains every distinct validation clause after later invalid JSON and timeout failures", () => {
    const error = new AutoFallbackExhaustedError([
      {
        provider: "openai",
        model: "gpt-4.1",
        durationMs: 12,
        outcome: "failed",
        reason: "invalid_output",
        clause: "Witness chapter omitted required dialogue.",
      },
      {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        durationMs: 18,
        outcome: "failed",
        reason: "invalid_output",
        clause: "Temporal recall must remain approximate.",
      },
      {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        durationMs: 19,
        outcome: "failed",
        reason: "invalid_output",
        clause: "  Witness chapter omitted   required dialogue. ",
      },
      {
        provider: "anthropic",
        model: "claude-opus-5",
        durationMs: 20,
        outcome: "failed",
        reason: "invalid_output",
        clause: "The result was not valid JSON.",
      },
      {
        provider: "anthropic",
        model: "last-recovery",
        durationMs: 60_000,
        outcome: "failed",
        reason: "timeout",
      },
    ]);

    assert.match(
      error.message,
      /\[openai\/gpt-4\.1\] Witness chapter omitted required dialogue\./u,
    );
    assert.match(
      error.message,
      /\[anthropic\/claude-haiku-4-5\] Temporal recall must remain approximate\./u,
    );
    assert.match(
      error.message,
      /\[anthropic\/claude-opus-5\] The result was not valid JSON\./u,
    );
    assert.equal(
      error.message.match(/Witness chapter omitted required dialogue\./gu)?.length,
      1,
    );
  });

  it("bounds every validation clause and the complete exhaustion message", () => {
    const error = new AutoFallbackExhaustedError(
      Array.from({ length: 64 }, (_, index) => ({
        provider: "openai" as const,
        model: `model-${index}`,
        durationMs: index,
        outcome: "failed" as const,
        reason: "invalid_output" as const,
        clause: `schema-clause-${index}-${"x".repeat(400)}`,
      })),
    );

    assert.ok(
      error.message.length <= AUTO_FALLBACK_EXHAUSTED_MESSAGE_MAX_CHARS,
    );
    assert.doesNotMatch(
      error.message,
      new RegExp(`x{${AUTO_FALLBACK_VALIDATION_CLAUSE_MAX_CHARS + 1}}`, "u"),
    );
    assert.match(error.message, /\+\d+ more/u);
  });

  it("returns the primary without recovery metadata when it succeeds", async () => {
    const result = await runAutoFallbackChain({
      attempts: [
        attempt("local", "primary", async () => "hello"),
        attempt("openai", "fallback-1", async () => "unused"),
        attempt("anthropic", "fallback-2", async () => "unused"),
      ],
      perAttemptTimeoutMs: 100,
      totalTimeoutMs: 200,
    });
    assert.equal(result.value, "hello");
    assert.equal(result.recovery, undefined);
    assert.equal(result.attempts.length, 1);
  });

  it("advances across provider errors, refusals, and validators", async () => {
    const calls: string[] = [];
    const result = await runAutoFallbackChain({
      attempts: [
        attempt("local", "primary", async () => {
          calls.push("primary");
          throw new Error("offline");
        }),
        attempt("openai", "fallback-1", async () => {
          calls.push("fallback-1");
          return "I cannot comply with that request.";
        }),
        attempt("anthropic", "fallback-2", async () => {
          calls.push("fallback-2");
          return '{"ok":true}';
        }),
      ],
      perAttemptTimeoutMs: 100,
      totalTimeoutMs: 300,
      validate: (raw) => {
        const textFailure = validateAutoFallbackText(raw);
        if (!textFailure.ok) return textFailure;
        try {
          JSON.parse(raw);
          return { ok: true as const, value: raw };
        } catch {
          return { ok: false as const, reason: "invalid_output" as const };
        }
      },
    });
    assert.deepEqual(calls, ["primary", "fallback-1", "fallback-2"]);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.recovery?.crossedOnline, true);
    assert.deepEqual(
      result.attempts.map((entry) => entry.reason ?? "ok"),
      ["provider_error", "refusal", "ok"]
    );
  });

  it("runs an ordered five-slot chain across mixed local and online providers", async () => {
    const calls: string[] = [];
    const providers = [
      "local",
      "openai",
      "local",
      "anthropic",
      "openai",
      "local",
    ] as const;
    const result = await runAutoFallbackChain({
      attempts: providers.map((provider, index) =>
        attempt(provider, `model-${index}`, async () => {
          calls.push(`${provider}:${index}`);
          if (index < providers.length - 1) throw new Error("next");
          return "recovered";
        }),
      ),
      perAttemptTimeoutMs: 100,
      totalTimeoutMs: 700,
    });

    assert.deepEqual(calls, [
      "local:0",
      "openai:1",
      "local:2",
      "anthropic:3",
      "openai:4",
      "local:5",
    ]);
    assert.equal(result.value, "recovered");
    assert.equal(result.attempts.length, 6);
  });

  it("rejects route plans outside the runtime attempt bound", async () => {
    await assert.rejects(
      runAutoFallbackChain({
        attempts: [attempt("local", "primary", async () => "unused")],
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 100,
      }),
      /one primary model and between one and 63 recovery routes/,
    );
    await assert.rejects(
      runAutoFallbackChain({
        attempts: Array.from({ length: 65 }, (_, index) =>
          attempt("local", `model-${index}`, async () => "unused"),
        ),
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 100,
      }),
      /one primary model and between one and 63 recovery routes/,
    );
  });

  it("reserves time for an explicit final local recovery attempt", async () => {
    const calls: string[] = [];
    const result = await runAutoFallbackChain({
      attempts: [
        attempt("openai", "primary", async () => {
          calls.push("primary");
          throw new Error("next");
        }),
        attempt("anthropic", "priority", async () => {
          calls.push("priority");
          throw new Error("next");
        }),
        attempt("openai", "remainder", async () => {
          calls.push("remainder");
          throw new Error("next");
        }),
        attempt("local", "llama3.2", async () => {
          calls.push("local");
          return "recovered locally";
        }),
      ],
      perAttemptTimeoutMs: 100,
      totalTimeoutMs: 300,
    });

    assert.equal(result.value, "recovered locally");
    assert.equal(result.provider, "local");
    assert.deepEqual(calls, ["primary", "priority", "remainder", "local"]);
  });

  it("skips unavailable attempts and fails after all three", async () => {
    await assert.rejects(
      runAutoFallbackChain({
        attempts: [
          attempt("local", "primary", async () => "", false),
          attempt("openai", "fallback-1", async () => ""),
          attempt("anthropic", "fallback-2", async () => "I won't comply."),
        ],
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 300,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AutoFallbackExhaustedError);
        assert.deepEqual(
          error.attempts.map((entry) => entry.reason),
          ["unavailable", "empty", "refusal"]
        );
        return true;
      }
    );
  });

  it("times out a stalled attempt and respects outer cancellation", async () => {
    const result = await runAutoFallbackChain({
      attempts: [
        attempt("local", "primary", (signal) => new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        })),
        attempt("openai", "fallback-1", async () => "recovered"),
        attempt("anthropic", "fallback-2", async () => "unused"),
      ],
      perAttemptTimeoutMs: 5,
      totalTimeoutMs: 100,
    });
    assert.equal(result.value, "recovered");
    assert.equal(result.attempts[0]?.reason, "timeout");

    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await assert.rejects(
      runAutoFallbackChain({
        attempts: [
          attempt("local", "primary", async () => "unused"),
          attempt("openai", "fallback-1", async () => "unused"),
          attempt("anthropic", "fallback-2", async () => "unused"),
        ],
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 200,
        signal: controller.signal,
      }),
      { name: "AbortError" }
    );
  });

  it("enforces the timeout when a provider ignores AbortSignal", async () => {
    const result = await runAutoFallbackChain({
      attempts: [
        attempt("local", "uncooperative", async () =>
          new Promise<string>(() => undefined)),
        attempt("local", "fallback", async () => "recovered"),
      ],
      perAttemptTimeoutMs: 5,
      totalTimeoutMs: 50,
    });

    assert.equal(result.value, "recovered");
    assert.equal(result.attempts[0]?.reason, "timeout");
  });

  it("uses the concrete model's attempt budget within one total ceiling", async () => {
    const budgets: Array<{ model: string; index: number }> = [];
    const result = await runAutoFallbackChain({
      attempts: [
        attempt("local", "primary", (signal) => new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        })),
        attempt("openai", "fallback-1", async () => "recovered"),
        attempt("anthropic", "fallback-2", async () => "unused"),
      ],
      perAttemptTimeoutMs: (model, index) => {
        budgets.push({ model: model.model, index });
        return index === 0 ? 5 : 100;
      },
      totalTimeoutMs: 200,
    });
    assert.equal(result.value, "recovered");
    assert.deepEqual(budgets, [
      { model: "primary", index: 0 },
      { model: "fallback-1", index: 1 },
    ]);
    assert.equal(result.attempts[0]?.reason, "timeout");
  });

  it("does not start another attempt after the total budget is exhausted", async () => {
    const calls: string[] = [];
    const timeline = [1_000, 1_000, 1_009];
    const now = () => timeline.shift() ?? 1_009;
    await assert.rejects(
      runAutoFallbackChain({
        attempts: [
          attempt("local", "primary", (signal) => new Promise((_, reject) => {
            calls.push("primary");
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          })),
          attempt("openai", "fallback-1", async () => {
            calls.push("fallback-1");
            return "too late";
          }),
          attempt("anthropic", "fallback-2", async () => "unused"),
        ],
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 10,
        now,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AutoFallbackExhaustedError);
        assert.equal(error.attempts[0]?.reason, "timeout");
        return true;
      }
    );
    assert.deepEqual(calls, ["primary"]);
  });

  it("stops immediately for an operation-specific terminal error", async () => {
    const terminal = new Error("stale turn");
    terminal.name = "StaleTurnError";
    const calls: string[] = [];
    await assert.rejects(
      runAutoFallbackChain({
        attempts: [
          attempt("local", "primary", async () => {
            calls.push("primary");
            throw terminal;
          }),
          attempt("openai", "fallback-1", async () => {
            calls.push("fallback-1");
            return "unused";
          }),
          attempt("anthropic", "fallback-2", async () => "unused"),
        ],
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 300,
        isTerminalError: (error) => error === terminal,
      }),
      terminal
    );
    assert.deepEqual(calls, ["primary"]);
  });
});
