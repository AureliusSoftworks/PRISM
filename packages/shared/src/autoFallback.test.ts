import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autoFallbackResolvedChain,
  normalizeAutoFallbackChain,
  normalizeAutoRecoveryTrace,
  normalizeResponseMode,
  parseStoredAutoFallbackChain,
  serializeAutoFallbackChain,
} from "./autoFallback.ts";

describe("Auto fallback contracts", () => {
  const chain = {
    v: 1 as const,
    fallbacks: [
      { provider: "openai" as const, model: "gpt-5-mini" },
      { provider: "anthropic" as const, model: "claude-sonnet" },
    ] as const,
  };

  it("normalizes the three response modes", () => {
    assert.equal(normalizeResponseMode("local"), "local");
    assert.equal(normalizeResponseMode("auto"), "auto");
    assert.equal(normalizeResponseMode("online"), "online");
    assert.equal(normalizeResponseMode("bogus", "online"), "online");
  });

  it("round-trips an existing distinct two-model fallback chain", () => {
    const normalized = normalizeAutoFallbackChain(chain);
    assert.deepEqual(normalized, chain);
    assert.deepEqual(parseStoredAutoFallbackChain(serializeAutoFallbackChain(chain)), chain);
  });

  it("accepts one to five fallbacks and rejects empty, oversized, or duplicate chains", () => {
    assert.deepEqual(
      normalizeAutoFallbackChain({ v: 1, fallbacks: [chain.fallbacks[0]] }),
      { v: 1, fallbacks: [chain.fallbacks[0]] },
    );
    assert.equal(normalizeAutoFallbackChain({ v: 1, fallbacks: [] }), null);
    assert.equal(
      normalizeAutoFallbackChain({
        v: 1,
        fallbacks: Array.from({ length: 6 }, (_, index) => ({
          provider: "openai",
          model: `gpt-${index}`,
        })),
      }),
      null,
    );
    assert.equal(
      normalizeAutoFallbackChain({
        v: 1,
        fallbacks: [chain.fallbacks[0], { ...chain.fallbacks[0], model: " GPT-5-MINI " }],
      }),
      null
    );
  });

  it("skips a redundant fallback matching the contextual primary", () => {
    assert.deepEqual(
      autoFallbackResolvedChain({ provider: "local", model: "qwen3:14b" }, chain),
      [
        { provider: "local", model: "qwen3:14b" },
        ...chain.fallbacks,
      ]
    );
    assert.deepEqual(
      autoFallbackResolvedChain({ provider: "openai", model: "gpt-5-mini" }, chain),
      [
        { provider: "openai", model: "gpt-5-mini" },
        { provider: "anthropic", model: "claude-sonnet" },
      ],
    );
    assert.equal(
      autoFallbackResolvedChain(
        { provider: "openai", model: "gpt-5-mini" },
        { v: 1, fallbacks: [{ provider: "openai", model: "gpt-5-mini" }] },
      ),
      null,
    );
  });

  it("normalizes privacy-safe recovery traces and rejects raw invalid shapes", () => {
    assert.deepEqual(
      normalizeAutoRecoveryTrace({
        v: 1,
        attempts: [
          { provider: "local", model: "qwen3:14b", durationMs: 30_001, outcome: "failed", reason: "timeout" },
          { provider: "openai", model: "gpt-5-mini", durationMs: 820, outcome: "succeeded" },
        ],
        finalProvider: "openai",
        finalModel: "gpt-5-mini",
        crossedOnline: true,
        rawError: "must never survive normalization",
      }),
      {
        v: 1,
        attempts: [
          { provider: "local", model: "qwen3:14b", durationMs: 30_001, outcome: "failed", reason: "timeout" },
          { provider: "openai", model: "gpt-5-mini", durationMs: 820, outcome: "succeeded" },
        ],
        finalProvider: "openai",
        finalModel: "gpt-5-mini",
        crossedOnline: true,
      }
    );
    assert.equal(normalizeAutoRecoveryTrace({ v: 1, attempts: [] }), undefined);
  });
});
