---
name: effort-review
description: Review PRISM experimental/simulated Effort evals, Psychic planning traces, and native-vs-simulated effort behavior, then diagnose provenance and make focused systemic fixes. Use when the user invokes /effort-review or $effort-review, pastes an experimental-effort or effort-ladder artifact, asks why simulated thinking helped or failed, reports planning collapse, role-token leakage, private-pass waste, LOCAL egress risk, or wants iterative adjustments to simulated-thinking logic.
---

# Effort Review

## Workflow

1. Read the complete supplied record before judging it. Prefer the Markdown report under `artifacts/experimental-effort-evals/` or `artifacts/effort-ladder-evals/`, then the sibling JSON for exact fields. Review partial excerpts manually and state which runs, private-pass diagnostics, judge result, or code revision are missing.
2. Record the prompt family, local model, thinking reference (provider/model/effort), simulated effort setting, Psychic summaries on/off, temperature/token caps when present, artifact paths, and whether the record predates the current cafe-constraint default prompt or current private-pass ladder.
3. Build an evidence ledger for every finding:
   - observed final text, private-pass summaries, scratchpad/guidance sizes, warnings, latency, and blind-judge scores when present;
   - run id, artifact stamp, effort tier, pass names (`plan` / `draft` / `audit` / `revision`), and nearby events;
   - provider/model for each arm (baseline, reference, simulated), retry/fallback, `psychicDebug.simulated`, `passCount`, `planningWarnings`, and source markers;
   - responsible layer: effort policy, simulation gate, private-pass orchestration, planning JSON validation, scratchpad/guidance assembly, final visible generation, Psychic presentation, persistence redaction, LOCAL/ONLINE gate, eval harness, or blind judge;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `effort selection -> simulation gate -> private passes (plan/draft/audit/revision) -> guidance assembly -> final visible generation -> Psychic debug payload -> persistence/redaction -> eval report/judge`. Never call the visible answer raw private-pass output without preserved draft evidence. Treat scratchpads and private drafts as diagnostic evidence only; never paste full private artifacts into docs, commits, or player-facing surfaces.
5. Audit on two separate axes:
   - **Answer quality:** constraint fidelity, directness, structure (table / `R1`–`R3` / feasibility when using the cafe prompt), distinct improvement over the same-model baseline, and whether higher Effort tiers earn their latency. Preserve the blind judge's raw quality score, then apply the latency-adjusted comparison below for the product verdict.
   - **System integrity:** native models keep provider-native Effort; simulation only runs when the experiment allows it; LOCAL private passes stay on the local provider; Psychic summaries stay concise; private plans/drafts/audits/revisions stay ephemeral; Auto Effort never selects Extra High unless policy explicitly changes.
6. Audit collapses and leakage separately:
   - empty, tiny, or role-token finals such as a leading/lone `assistant` line while private passes look healthy;
   - private guidance that never reaches the final answer;
   - private content leaking into the visible reply;
   - `invalid_json` or flat `passCount` across Effort tiers;
   - paid online multi-call simulation when the user expected native Effort or a no-op.
7. Prefer the default cafe staffing constraint prompt for head-to-head quality claims. Treat open-ended meta prompts as method noise unless the complaint is specifically about meta prompts.
8. Preserve LOCAL as zero egress. Do not recommend online research, provider escalation, or remote fallback for a LOCAL simulated session.
9. With a complete record and a concrete complaint, create or claim a Bead, establish a focused baseline (same prompt, model, Effort, and harness flags), and fix the responsible PRISM layer. If the user asks for review-only, thoughts, or a recommendation, stop after findings and append a dated note to `docs/experimental-effort-research-log.md` when the observation is durable.
10. Reproduce the reported session shape with the runbook commands. Add focused regressions for public output and provenance metadata (`psychicDebug`, simulation gate, LOCAL gate). Run narrow API/shared Effort checks first, then typecheck/lint as warranted. Keep research-log privacy: aggregates and concise observations only — no full scratchpads.

## Effort Rules

- Native Effort and simulated Effort are different systems. Do not judge one with the other's success criteria.
- Simulated Effort is an opt-in quality booster for models without adjustable native Effort, not a claim that weak models become true reasoning models.
- Online OpenAI/Anthropic models with native Effort keep provider-native Effort; do not wrap them in Prism private-pass chains.
- Online non-native simulation may multiply paid calls; Settings and notices must say so plainly. Prefer stubs for routine tests.
- Auto Effort stays capped at High unless an explicit later policy opts into Extra High.
- A healthy private ladder plus a collapsed final answer is a final-generation / assembly failure, not proof that simulation hurts quality — rerun before drawing that product conclusion.
- Prefer prompt contracts, validation, orchestration, guidance assembly, serialization, Psychic presentation, and eval-harness fixes over model-specific prompt hacks or rewriting a saved artifact by hand.
- Method lives in `docs/experimental-effort-eval-runbook.md`; dated interpretation lives in `docs/experimental-effort-research-log.md`.

## Latency-adjusted comparison

Use this only for a same-model None/baseline arm versus a simulated-Effort arm. Keep native-Effort comparisons separate.

- Preserve and report the raw blind-judge quality scores unchanged.
- Compute `latencyRatio = max(1, simulatedDurationMs / baselineDurationMs)`.
- Compute `latencyPenalty = min(0.5, 0.1 * log2(latencyRatio))` on the 0–5 score scale.
- Compute `adjustedSimulatedScore = rawSimulatedScore - latencyPenalty`; the baseline's adjusted score equals its raw score.
- Calculate with unrounded values, then display the ratio, penalty, and adjusted scores to two decimals.
- Award raw ties, adjusted ties, and adjusted losses to the baseline. Call simulated Effort the winner only when its adjusted score remains strictly higher.
- For repeated suites, apply the adjustment to each paired case before aggregating. Do not use one unusually fast or slow run to adjust the whole suite.
- If either duration is missing or the arms differ in model, prompt, temperature, or token cap, report raw quality and latency separately and mark the adjusted verdict unavailable.

This is a deliberately slight baseline bias: a 2x slowdown costs 0.10 points, 4x costs 0.20, 8x costs 0.30, and the penalty caps at 0.50. Do not rewrite historical raw judge scores.

## Key surfaces

- Runtime / simulation: `apps/api/src/chat.ts`, `apps/api/src/model-effort-runtime.ts`
- Shared effort / Auto policy: `packages/shared/src/modelRouting.ts` and related Effort helpers
- Evals: `apps/api/src/evals/experimental-effort.ts`, `apps/api/src/evals/effort-ladder.ts`
- Docs: `docs/experimental-effort-eval-runbook.md`, `docs/experimental-effort-research-log.md`
- Artifacts: `artifacts/experimental-effort-evals/`, `artifacts/effort-ladder-evals/`

## Closing retrospective

Follow the shared [closing retrospective](../references/prism-review-core.md#closing-retrospective)
before the final handoff, including its evidence gate, review-only boundary,
and one-pass limit. This imports only the closeout step; Effort's eval workflow
and rules above remain authoritative for the review.

## Output

- `Findings`: evidence-led failures with layer and confidence, including raw quality, latency ratio, latency penalty, adjusted score, and baseline-biased verdict when eligible.
- `Root cause`: provenance chain and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and exact checks after the change.
- `Gaps`: evidence unavailable or live Psychic/UI validation still required.
