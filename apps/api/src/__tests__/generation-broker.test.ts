import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runPrismDeterministicWork,
  runPrismStructuredGeneration,
  type PrismGenerationLane,
} from "../generation-broker.ts";
import type { LlmProvider } from "../providers.ts";

function lane(
  providerName: "local" | "openai" | "anthropic",
  model: string,
): PrismGenerationLane {
  const provider: LlmProvider = {
    name: providerName,
    diagnosticModel: model,
    generateResponse: async () => "unused",
    embedText: async () => [],
  };
  return { provider, providerName, model, reasoningEffort: "none" };
}

function work(overrides: Record<string, unknown> = {}) {
  return {
    workflow: "case-forge",
    operation: "compile",
    stage: "foundation",
    executionLane: "selected" as const,
    role: "author" as const,
    outputClass: "critical" as const,
    priority: "compilation" as const,
    privacyMode: "online" as const,
    timeoutMs: 2_000,
    ...overrides,
  };
}

describe("PRISM generation broker", () => {
  it("advances Auto from an empty primary to the next frozen lane", async () => {
    const calls: string[] = [];
    const result = await runPrismStructuredGeneration({
      work: work(),
      lanes: [lane("openai", "terra"), lane("openai", "sol"), lane("local", "llama3.2")],
      modelSelectionKind: "auto",
      perAttemptTimeoutMs: () => 100,
      totalTimeoutMs: 500,
      run: async ({ lane: selected }) => {
        calls.push(selected.model);
        return selected.model === "terra" ? "" : '{"ok":true}';
      },
      validate: (raw) => JSON.parse(raw) as { ok: true },
    });

    assert.deepEqual(calls, ["terra", "sol"]);
    assert.equal(result.receipt.provider, "openai");
    assert.equal(result.receipt.model, "sol");
    assert.equal(result.receipt.fallbackReason, "empty");
  });

  it("preserves fixed selection while supplying distinct repair context", async () => {
    const priorErrors: Array<string | null> = [];
    const result = await runPrismStructuredGeneration({
      work: work(),
      lanes: [lane("openai", "terra"), lane("openai", "sol")],
      modelSelectionKind: "fixed",
      perAttemptTimeoutMs: () => 100,
      run: async ({ attempt, priorError }) => {
        priorErrors.push(priorError);
        return attempt === 1 ? "not json" : '{"ok":true}';
      },
      validate: (raw) => JSON.parse(raw) as { ok: true },
    });

    assert.equal(result.receipt.model, "terra");
    assert.equal(result.attempts.length, 2);
    assert.equal(priorErrors[0], null);
    assert.match(priorErrors[1] ?? "", /Unexpected token|JSON/u);
  });

  it("enforces LOCAL non-egress and the auxiliary critical-output boundary", async () => {
    await assert.rejects(
      runPrismStructuredGeneration({
        work: work({ privacyMode: "local" }),
        lanes: [lane("openai", "terra")],
        modelSelectionKind: "fixed",
        run: async () => '{"ok":true}',
        validate: (raw) => JSON.parse(raw),
      }),
      /No local model/u,
    );
    await assert.rejects(
      runPrismStructuredGeneration({
        work: work({
          executionLane: "auxiliary",
          privacyMode: "local",
        }),
        lanes: [lane("local", "llama3.2")],
        modelSelectionKind: "fixed",
        run: async () => '{"ok":true}',
        validate: (raw) => JSON.parse(raw),
      }),
      /cannot finalize critical output/u,
    );
  });

  it("returns deterministic work through the same receipt contract", async () => {
    const result = await runPrismDeterministicWork({
      work: work(),
      run: () => ({ ok: true }),
    });
    assert.deepEqual(result.value, { ok: true });
    assert.equal(result.receipt.provider, "deterministic");
    assert.equal(result.receipt.model, "prism");
  });
});
