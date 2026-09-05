export type CaseForgeFixturePreset = "compact" | "standard" | "grand";
export type CaseForgeFixtureMode = "investigation" | "court_only";

export interface CaseForgeQualityFixtureResult {
  id: string;
  preset: CaseForgeFixturePreset;
  mode: CaseForgeFixtureMode;
  deterministicValid: boolean;
  baselineCompleted: boolean;
  currentCompleted: boolean;
  baselineOnlineInputTokens: number;
  currentOnlineInputTokens: number;
  baselineOnlineOutputTokens: number;
  currentOnlineOutputTokens: number;
  baselineEstimatedCostMicroUsd: number;
  currentEstimatedCostMicroUsd: number;
  baselineLatencyMs: number;
  currentLatencyMs: number;
  goldenReviewed: boolean;
  criticalGoldenRegression: boolean;
}

export interface CaseForgeQualityGateResult {
  ok: boolean;
  errors: string[];
  metrics: {
    completionRate: number;
    baselineCompletionRate: number;
    medianOnlineInputTokenReduction: number;
    medianOnlineOutputTokenReduction: number;
    medianEstimatedCostReduction: number;
    medianLatencyChange: number;
    goldenReviewCount: number;
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function reduction(baseline: number, current: number): number {
  const safeBaseline = finiteNonNegative(baseline);
  if (safeBaseline === 0) return current <= 0 ? 0 : -1;
  return (safeBaseline - finiteNonNegative(current)) / safeBaseline;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
    : sorted[midpoint]!;
}

/** Pure gate: callers own synthetic generation and never need saved cases. */
export function evaluateCaseForgeQualityFixture(
  fixtures: readonly CaseForgeQualityFixtureResult[],
): CaseForgeQualityGateResult {
  const errors: string[] = [];
  if (fixtures.length !== 30) {
    errors.push("The quality fixture must contain exactly 30 synthetic cases.");
  }
  for (const preset of ["compact", "standard", "grand"] as const) {
    if (fixtures.filter((fixture) => fixture.preset === preset).length !== 10) {
      errors.push(`The quality fixture must contain ten ${preset} cases.`);
    }
  }
  for (const mode of ["investigation", "court_only"] as const) {
    if (!fixtures.some((fixture) => fixture.mode === mode)) {
      errors.push(`The quality fixture must cover ${mode}.`);
    }
  }
  if (fixtures.some((fixture) => !fixture.deterministicValid)) {
    errors.push("Every synthetic case must pass deterministic validation.");
  }
  const baselineCompletionRate = fixtures.length
    ? fixtures.filter((fixture) => fixture.baselineCompleted).length /
      fixtures.length
    : 0;
  const completionRate = fixtures.length
    ? fixtures.filter((fixture) => fixture.currentCompleted).length /
      fixtures.length
    : 0;
  if (completionRate < baselineCompletionRate) {
    errors.push("Completion rate regressed below baseline.");
  }
  const medianOnlineInputTokenReduction = median(
    fixtures.map((fixture) =>
      reduction(
        fixture.baselineOnlineInputTokens,
        fixture.currentOnlineInputTokens,
      )),
  );
  const medianOnlineOutputTokenReduction = median(
    fixtures.map((fixture) =>
      reduction(
        fixture.baselineOnlineOutputTokens,
        fixture.currentOnlineOutputTokens,
      )),
  );
  const medianEstimatedCostReduction = median(
    fixtures.map((fixture) =>
      reduction(
        fixture.baselineEstimatedCostMicroUsd,
        fixture.currentEstimatedCostMicroUsd,
      )),
  );
  const medianLatencyChange = median(
    fixtures.map((fixture) =>
      -reduction(fixture.baselineLatencyMs, fixture.currentLatencyMs)),
  );
  if (medianOnlineInputTokenReduction < 0.3) {
    errors.push("Median online input-token reduction is below 30%.");
  }
  if (medianOnlineOutputTokenReduction < 0.1) {
    errors.push("Median online output-token reduction is below 10%.");
  }
  if (medianEstimatedCostReduction < 0.25) {
    errors.push("Median estimated online cost reduction is below 25%.");
  }
  if (medianLatencyChange > 0.1) {
    errors.push("Median compilation latency is more than 10% worse.");
  }
  const golden = fixtures.filter((fixture) => fixture.goldenReviewed);
  if (golden.length < 12) {
    errors.push("At least twelve cases require golden review.");
  }
  if (golden.some((fixture) => fixture.criticalGoldenRegression)) {
    errors.push("Golden review found a critical quality regression.");
  }
  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      completionRate,
      baselineCompletionRate,
      medianOnlineInputTokenReduction,
      medianOnlineOutputTokenReduction,
      medianEstimatedCostReduction,
      medianLatencyChange,
      goldenReviewCount: golden.length,
    },
  };
}
