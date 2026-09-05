import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCaseForgeQualityFixture,
  type CaseForgeQualityFixtureResult,
} from "../case-forge-quality-gate.ts";

function passingFixture(): CaseForgeQualityFixtureResult[] {
  return (["compact", "standard", "grand"] as const).flatMap((preset) =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `${preset}-${index + 1}`,
      preset,
      mode: index % 2 === 0 ? "investigation" as const : "court_only" as const,
      deterministicValid: true,
      baselineCompleted: true,
      currentCompleted: true,
      baselineOnlineInputTokens: 10_000,
      currentOnlineInputTokens: 6_500,
      baselineOnlineOutputTokens: 4_000,
      currentOnlineOutputTokens: 3_400,
      baselineEstimatedCostMicroUsd: 100_000,
      currentEstimatedCostMicroUsd: 70_000,
      baselineLatencyMs: 10_000,
      currentLatencyMs: 10_500,
      goldenReviewed:
        preset === "compact" || (preset === "standard" && index < 2),
      criticalGoldenRegression: false,
    })),
  );
}

describe("Case Forge local-first quality gate", () => {
  it("accepts the complete 30-case synthetic fixture at the release thresholds", () => {
    const result = evaluateCaseForgeQualityFixture(passingFixture());
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.equal(result.metrics.goldenReviewCount, 12);
    assert.equal(result.metrics.completionRate, 1);
    assert.ok(result.metrics.medianOnlineInputTokenReduction >= 0.3);
    assert.ok(result.metrics.medianOnlineOutputTokenReduction >= 0.1);
    assert.ok(result.metrics.medianEstimatedCostReduction >= 0.25);
    assert.ok(result.metrics.medianLatencyChange <= 0.1);
  });

  it("blocks release on deterministic, efficiency, completion, latency, or golden regressions", () => {
    const fixtures = passingFixture();
    fixtures[0] = {
      ...fixtures[0]!,
      deterministicValid: false,
      currentCompleted: false,
      currentOnlineInputTokens: 9_500,
      currentOnlineOutputTokens: 3_900,
      currentEstimatedCostMicroUsd: 95_000,
      currentLatencyMs: 12_000,
      criticalGoldenRegression: true,
    };
    for (let index = 1; index < fixtures.length; index += 1) {
      fixtures[index] = {
        ...fixtures[index]!,
        currentOnlineInputTokens: 9_500,
        currentOnlineOutputTokens: 3_900,
        currentEstimatedCostMicroUsd: 95_000,
        currentLatencyMs: 12_000,
      };
    }
    const result = evaluateCaseForgeQualityFixture(fixtures);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /deterministic/iu);
    assert.match(result.errors.join("\n"), /completion rate/iu);
    assert.match(result.errors.join("\n"), /input-token/iu);
    assert.match(result.errors.join("\n"), /output-token/iu);
    assert.match(result.errors.join("\n"), /cost reduction/iu);
    assert.match(result.errors.join("\n"), /latency/iu);
    assert.match(result.errors.join("\n"), /golden review/iu);
  });
});
