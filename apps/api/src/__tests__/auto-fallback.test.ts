import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AutoFallbackExhaustedError,
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

  it("rejects chains outside the one-to-five fallback range", async () => {
    await assert.rejects(
      runAutoFallbackChain({
        attempts: [attempt("local", "primary", async () => "unused")],
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 100,
      }),
      /one primary model and one to five fallback models/,
    );
    await assert.rejects(
      runAutoFallbackChain({
        attempts: Array.from({ length: 7 }, (_, index) =>
          attempt("local", `model-${index}`, async () => "unused"),
        ),
        perAttemptTimeoutMs: 100,
        totalTimeoutMs: 100,
      }),
      /one primary model and one to five fallback models/,
    );
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
