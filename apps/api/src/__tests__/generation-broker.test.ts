import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runPrismDeterministicWork,
  runPrismStructuredGeneration,
  type PrismGenerationLane,
} from "../generation-broker.ts";
import { AutoFallbackExhaustedError } from "../auto-fallback.ts";
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

  it("accepts valid Auto JSON containing refusal-like character dialogue", async () => {
    const result = await runPrismStructuredGeneration({
      work: work(),
      lanes: [lane("openai", "terra"), lane("anthropic", "haiku")],
      modelSelectionKind: "auto",
      perAttemptTimeoutMs: () => 100,
      totalTimeoutMs: 500,
      run: async () =>
        '{"dialogue":"I cannot agree, and I won\'t pretend otherwise."}',
      validate: (raw) => JSON.parse(raw) as { dialogue: string },
    });

    assert.equal(
      result.value.dialogue,
      "I cannot agree, and I won't pretend otherwise.",
    );
    assert.equal(result.receipt.model, "terra");
    assert.equal(result.attempts.length, 1);
  });

  it("accepts valid fixed-model JSON containing refusal-like character dialogue", async () => {
    const result = await runPrismStructuredGeneration({
      work: work(),
      lanes: [lane("anthropic", "opus")],
      modelSelectionKind: "fixed",
      maxAttempts: 1,
      perAttemptTimeoutMs: () => 100,
      run: async () => '{"dialogue":"I won\'t call that proof."}',
      validate: (raw) => JSON.parse(raw) as { dialogue: string },
    });

    assert.equal(result.value.dialogue, "I won't call that proof.");
    assert.equal(result.receipt.model, "opus");
    assert.equal(result.attempts.length, 1);
  });

  it("still advances or fails bounded work for a genuine plain-text refusal", async () => {
    const autoCalls: string[] = [];
    const recovered = await runPrismStructuredGeneration({
      work: work(),
      lanes: [lane("openai", "terra"), lane("anthropic", "haiku")],
      modelSelectionKind: "auto",
      perAttemptTimeoutMs: () => 100,
      totalTimeoutMs: 500,
      run: async ({ lane: selected }) => {
        autoCalls.push(selected.model);
        return selected.model === "terra"
          ? "I cannot comply with that request."
          : '{"ok":true}';
      },
      validate: (raw) => JSON.parse(raw) as { ok: true },
    });
    assert.deepEqual(autoCalls, ["terra", "haiku"]);
    assert.equal(recovered.receipt.fallbackReason, "refusal");

    const fixedPriorErrors: Array<string | null> = [];
    await assert.rejects(
      runPrismStructuredGeneration({
        work: work(),
        lanes: [lane("openai", "terra")],
        modelSelectionKind: "fixed",
        maxAttempts: 2,
        perAttemptTimeoutMs: () => 100,
        run: async ({ priorError }) => {
          fixedPriorErrors.push(priorError);
          return "I cannot comply with that request.";
        },
        validate: (raw) => JSON.parse(raw) as { ok: true },
      }),
      /refusal/u,
    );
    assert.deepEqual(fixedPriorErrors, [null, "refusal"]);
  });

  it("preserves semantic validation diagnostics for JSON-shaped refusal-like dialogue", async () => {
    await assert.rejects(
      runPrismStructuredGeneration({
        work: work(),
        lanes: [lane("openai", "terra"), lane("anthropic", "haiku")],
        modelSelectionKind: "auto",
        perAttemptTimeoutMs: () => 100,
        totalTimeoutMs: 500,
        run: async ({ lane: selected }) => JSON.stringify({
          kind: selected.model,
          dialogue: "I cannot place that exact minute in my account.",
        }),
        validate: (raw) => {
          const parsed = JSON.parse(raw) as { kind: string };
          throw new Error(
            parsed.kind === "terra"
              ? "Witness chapter omitted required dialogue."
              : "Temporal recall must remain approximate.",
          );
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof AutoFallbackExhaustedError);
        assert.deepEqual(
          error.attempts.map((attempt) => attempt.reason),
          ["invalid_output", "invalid_output"],
        );
        assert.match(
          error.message,
          /\[openai\/terra\] Witness chapter omitted required dialogue\./u,
        );
        assert.match(
          error.message,
          /\[anthropic\/haiku\] Temporal recall must remain approximate\./u,
        );
        return true;
      },
    );

    const fixedPriorErrors: Array<string | null> = [];
    const fixed = await runPrismStructuredGeneration({
      work: work(),
      lanes: [lane("openai", "terra")],
      modelSelectionKind: "fixed",
      maxAttempts: 2,
      perAttemptTimeoutMs: () => 100,
      run: async ({ attempt, priorError }) => {
        fixedPriorErrors.push(priorError);
        return attempt === 1
          ? '{"ok":false,"dialogue":"I cannot swear to that minute."}'
          : '{"ok":true}';
      },
      validate: (raw) => {
        const parsed = JSON.parse(raw) as { ok: boolean };
        if (!parsed.ok) {
          throw new Error("Witness chapter omitted required dialogue.");
        }
        return parsed;
      },
    });
    assert.equal(fixed.value.ok, true);
    assert.deepEqual(fixedPriorErrors, [
      null,
      "Witness chapter omitted required dialogue.",
    ]);
  });

  it("caps Auto lane traversal at an explicit all-route attempt budget", async () => {
    const calls: string[] = [];
    await assert.rejects(
      runPrismStructuredGeneration({
        work: work(),
        lanes: [
          lane("openai", "terra"),
          lane("openai", "sol"),
          lane("openai", "luna"),
          lane("local", "llama3.2"),
        ],
        modelSelectionKind: "auto",
        maxAttempts: 3,
        perAttemptTimeoutMs: () => 100,
        totalTimeoutMs: 500,
        run: async ({ lane: selected }) => {
          calls.push(selected.model);
          return "{}";
        },
        validate: (raw) => {
          const parsed = JSON.parse(raw) as { ok?: boolean };
          assert.equal(parsed.ok, true);
          return { ok: true as const };
        },
      }),
    );
    assert.deepEqual(calls, ["terra", "sol", "luna"]);
  });

  it("keeps every schema clause but raw rejected drafts out of Auto exhaustion diagnostics", async () => {
    const rawDraft = "SECRET RAW DRAFT THAT MUST NOT ENTER THE ERROR";
    await assert.rejects(
      runPrismStructuredGeneration({
        work: work(),
        lanes: [
          lane("openai", "terra"),
          lane("anthropic", "haiku"),
          lane("anthropic", "opus"),
        ],
        modelSelectionKind: "auto",
        perAttemptTimeoutMs: () => 100,
        totalTimeoutMs: 500,
        run: async ({ lane: selected }) =>
          selected.model === "terra"
            ? '{"kind":"missing-dialogue"}'
            : selected.model === "haiku"
              ? '{"kind":"temporal-recall"}'
              : rawDraft,
        validate: (raw) => {
          const parsed = JSON.parse(raw) as { kind?: string };
          if (parsed.kind === "missing-dialogue") {
            throw new Error("Witness chapter omitted required dialogue.");
          }
          if (parsed.kind === "temporal-recall") {
            throw new Error("Temporal recall must remain approximate.");
          }
          return parsed;
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof AutoFallbackExhaustedError);
        assert.match(
          error.message,
          /\[openai\/terra\] Witness chapter omitted required dialogue\./u,
        );
        assert.match(
          error.message,
          /\[anthropic\/haiku\] Temporal recall must remain approximate\./u,
        );
        assert.match(
          error.message,
          /\[anthropic\/opus\] The result was not valid JSON\./u,
        );
        assert.doesNotMatch(error.message, /SECRET RAW DRAFT/u);
        return true;
      },
    );
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
