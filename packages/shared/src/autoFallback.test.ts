import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autoFallbackResolvedChain,
  fallbackChainForLane,
  normalizeAutoFallbackChain,
  normalizeFallbackChainsV2,
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

  it("migrates and round-trips an existing chain through lane-specific storage", () => {
    const normalized = normalizeAutoFallbackChain(chain);
    assert.deepEqual(normalized, chain);
    assert.deepEqual(parseStoredAutoFallbackChain(serializeAutoFallbackChain(chain)), chain);
    assert.deepEqual(normalizeFallbackChainsV2(chain), {
      v: 2,
      local: [],
      online: [...chain.fallbacks],
    });
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

  it("keeps fallback attempts in the selected lane and skips duplicates", () => {
    assert.equal(
      autoFallbackResolvedChain({ provider: "local", model: "qwen3:14b" }, chain),
      null,
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

  it("drops Ollama Cloud from global ONLINE fallback recovery", () => {
    assert.equal(
      autoFallbackResolvedChain(
        { provider: "openai", model: "gpt-primary" },
        {
          v: 1,
          fallbacks: [
            { provider: "ollama_cloud", model: "minimax-m2.5:cloud" },
          ],
        },
      ),
      null,
    );
  });

  it("migrates saved Cloud fallback entries out of the global ONLINE chain", () => {
    assert.deepEqual(
      normalizeFallbackChainsV2({
        v: 1,
        fallbacks: [
          { provider: "ollama_cloud", model: "minimax-m2.5:cloud" },
          { provider: "anthropic", model: "claude-sonnet" },
        ],
      }),
      {
        v: 2,
        local: [],
        online: [{ provider: "anthropic", model: "claude-sonnet" }],
      },
    );
  });

  it("treats saved entries as priorities before remaining eligible models and final local recovery", () => {
    const runtimeChain = {
      v: 1 as const,
      fallbacks: [
        { provider: "anthropic" as const, model: "claude-priority" },
        { provider: "openai" as const, model: "gpt-primary" },
      ],
      eligibleCandidates: [
        { provider: "openai" as const, model: "gpt-primary" },
        { provider: "openai" as const, model: "gpt-remainder" },
        { provider: "anthropic" as const, model: "claude-priority" },
      ],
      finalLocalRecovery: {
        provider: "local" as const,
        model: "llama3.2",
      },
    };

    assert.deepEqual(
      autoFallbackResolvedChain(
        { provider: "openai", model: "gpt-primary" },
        runtimeChain,
      ),
      [
        { provider: "openai", model: "gpt-primary" },
        { provider: "anthropic", model: "claude-priority" },
        { provider: "openai", model: "gpt-remainder" },
        { provider: "local", model: "llama3.2" },
      ],
    );
    assert.equal(
      serializeAutoFallbackChain({
        ...runtimeChain,
        fallbacks: [{ provider: "anthropic", model: "claude-priority" }],
      }),
      JSON.stringify({
        v: 2,
        local: [],
        online: [{ provider: "anthropic", model: "claude-priority" }],
      }),
    );
  });

  it("reserves the bounded route plan's final slot for bundled local recovery", () => {
    const resolved = autoFallbackResolvedChain(
      { provider: "openai", model: "gpt-primary" },
      {
        v: 1,
        fallbacks: [],
        eligibleCandidates: Array.from({ length: 80 }, (_, index) => ({
          provider: "openai" as const,
          model: `gpt-${index}`,
        })),
        finalLocalRecovery: { provider: "local", model: "llama3.2" },
      },
    );
    assert.equal(resolved?.length, 64);
    assert.deepEqual(resolved?.at(-1), {
      provider: "local",
      model: "llama3.2",
    });
  });

  it("partitions a mixed legacy chain into independent LOCAL and ONLINE chains", () => {
    const mixed = {
      v: 1 as const,
      fallbacks: [
        { provider: "openai" as const, model: "gpt-5-mini" },
        { provider: "local" as const, model: "qwen3:9b" },
        { provider: "anthropic" as const, model: "claude-sonnet" },
        { provider: "local" as const, model: "gemma3:4b" },
      ],
    };
    assert.deepEqual(fallbackChainForLane(mixed, "local")?.fallbacks, [
      { provider: "local", model: "qwen3:9b" },
      { provider: "local", model: "gemma3:4b" },
    ]);
    assert.deepEqual(fallbackChainForLane(mixed, "online")?.fallbacks, [
      { provider: "openai", model: "gpt-5-mini" },
      { provider: "anthropic", model: "claude-sonnet" },
    ]);
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
