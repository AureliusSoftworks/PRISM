# /effort-review — Simulated Effort / Psychic planning review

Review an experimental Effort eval, effort ladder run, Psychic planning trace, or the current diff with an Effort-simulation focus. Simulated Effort is the private plan/draft/audit/revision ladder Prism runs for models without adjustable native Effort when the experiment is enabled.

## Files that shape Effort behavior

- **Runtime**: `apps/api/src/chat.ts` (private passes, guidance assembly, final generation, Psychic debug), `apps/api/src/model-effort-runtime.ts` (simulation gate / user allow).
- **Shared policy**: `packages/shared/src/modelRouting.ts` and related Effort / Auto helpers (including Auto never selecting Extra High unless policy changes).
- **Evals**: `apps/api/src/evals/experimental-effort.ts`, `apps/api/src/evals/effort-ladder.ts`.
- **Method + notebook**: `docs/experimental-effort-eval-runbook.md`, `docs/experimental-effort-research-log.md`.
- **Artifacts**: `artifacts/experimental-effort-evals/`, `artifacts/effort-ladder-evals/`.

## What to check

- **Native vs simulated**: models with native Effort keep provider-native Effort; simulation only where the experiment allows it.
- **LOCAL zero egress**: every private and visible pass on a LOCAL turn stays on the local provider.
- **Private ladder health**: `psychicDebug.simulated`, nonzero `passCount`, pass names, guidance/scratchpad sizes, no `invalid_json` warning spam.
- **Final-answer integrity**: no empty/tiny finals, no leading/lone chat role token such as `assistant` while private passes look fine.
- **Quality vs latency**: higher Effort should usually earn better constraint fidelity than the same-model baseline; Extra High is not automatically better than High.
- **Privacy**: full private scratchpads/drafts/audits must not land in docs, commits, or player-facing persistence.
- **Prompt method**: prefer the cafe staffing constraint task for head-to-head claims; open-ended meta prompts are noisy.

## Report shape

- **Findings**: evidence-led failures with layer and confidence.
- **Root cause**: provenance chain (`effort -> gate -> private passes -> guidance -> final -> Psychic/persistence/eval`).
- **Fixes**: systemic changes, or review-only recommendations.
- **Verification**: exact rerun command and checks.
- **Gaps**: missing artifacts or live UI validation still needed.

When the observation is durable, append a dated note to `docs/experimental-effort-research-log.md` (aggregates only — no full private artifacts).
