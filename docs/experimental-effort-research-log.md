# Experimental Effort Research Log

Append-only lab notebook for simulated-effort eval observations. Keep repeatable method and commands in `docs/experimental-effort-eval-runbook.md`; use this file for dated results, interpretation, and calibration notes.

Privacy rule: do not commit full private scratchpads, drafts, audits, or revision notes. Logged material should be limited to aggregate scores, pass diagnostics, warning counts, latency, concise summaries when needed, and final-answer observations.

## 2026-06-22 - llama3.2 Tiered Local Simulated Effort

### Scope

- Model: `llama3.2`
- Provider: local Ollama
- Suite: hard effort ladder, 3 prompts x 3 repeats per effort
- Temperature: `0.25`
- Final max tokens: `900`
- Private simulated passes: deterministic, `temperature: 0`
- Command:

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --out-dir <temp-dir>
```

### Scoring Rubric

Each answer is scored out of 10 objective checks:

- exactly six labeled rows or steps
- S1 names the user-facing effort setting
- S2 explains the local-only guarantee without the forbidden word
- S3 describes the private planning pass
- S4 handles planning JSON failure
- S5 says scratchpads are not persisted
- S6 names a Psychic UI indicator
- avoids the forbidden word
- stays under 180 words
- avoids raw chain-of-thought/scratchpad exposure

### Results

| Effort | Avg score | Median latency | Avg passes | Warnings | Avg scratchpad chars | Avg guidance chars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 8.78/10 | 1389ms | 0 | 0 | 0 | 0 |
| minimal | 9.33/10 | 2753ms | 1 | 0 | 79 | 1075 |
| low | 9.44/10 | 3178ms | 1 | 0 | 317 | 1057 |
| medium | 9.78/10 | 4236ms | 2 | 0 | 676 | 1100 |
| high | 9.89/10 | 5368ms | 3 | 0 | 1473 | 1100 |
| xhigh | 9.56/10 | 6339ms | 4 | 0 | 2043 | 1100 |

### Interpretation

- The latest hard suite meets the quality target: `high` beat both `none` and `minimal`.
- `xhigh` also beat `none` and `minimal`, but it did not beat `high`.
- Higher settings clearly did more private work: pass count rose from `0` to `4`, and scratchpad diagnostics grew with effort.
- No planning warnings appeared in the suite.
- Cost matters: median latency rose from `1389ms` at `none` to `5368ms` at `high` and `6339ms` at `xhigh`.
- Practical calibration for `llama3.2`: `low` is the cheapest meaningful improvement, `medium` is a strong quality/latency balance, `high` was the quality winner in this run, and `xhigh` should be framed as more structured private work plus more latency, not automatically best.

### Product Notes

- Simulated effort should be described as a local-model quality booster, not as converting weak models into true reasoning models.
- Keep Extra High available manually; Auto should stay capped at High unless a later policy explicitly opts in.

## 2026-08-05 - Cafe constraint head-to-head (`llama3.2` vs `gpt-5.6-sol`)

### Scope

- Prompt: default cafe staffing constraint task (schedule table + `R1`–`R3` + feasibility sentence)
- Local model: `llama3.2`
- Strong reference: `gpt-5.6-sol` / High native effort
- Effort for simulated local: `high`
- Artifacts:
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T00-41-32-802Z.md`
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T00-41-32-802Z.json`
- Prior meta-prompt run (superseded as method, kept for contrast):
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T00-35-15-806Z.md`

### Why the prompt changed

The previous default brief asked models to design simulated Effort itself. Blind judging became noisy (all answers weak/meta). The cafe task is checkable and domain-neutral.

### Results

| Run | Duration | Blind judge total | Notes |
| --- | ---: | ---: | --- |
| local baseline (`llama3.2`, no simulation) | 8.6s | 4 | Produced the format, but invalid schedule (2-hour close; Bob closes) |
| thinking reference (`gpt-5.6-sol`, High) | 7.9s | 9 | Valid feasible schedule; clear winner |
| local simulated (`llama3.2`, High simulation) | 60.2s | 1 | Private passes ran (plan/draft/audit), but final visible answer collapsed to the literal token `assistant` |

Judge ranking: Sol ≫ baseline ≫ simulated collapse.

### Interpretation

- Constraint prompt restored a sane ranking: strong native reference beat local baseline.
- Simulated Effort **machinery** was healthy (`simulated: true`, 3 passes, scratchpad/guidance present, no `invalid_json`).
- Simulated Effort **final answer** failed this run: 9 chars (`assistant`). Do not treat this as “simulation hurts quality”; treat as a collapse/flake to rerun before the next local model.
- Baseline still failed hard constraints, so there is room for simulation to help if the final pass stays intact.

### Next

1. Optional: one `llama3.2` simulated rerun to see if the collapse reproduces.
2. Then move to `qwen3.6` with the same cafe prompt.

## 2026-08-05 - Cafe constraint retry (`llama3.2` collapse check)

### Scope

- Same cafe prompt / High simulated Effort / `gpt-5.6-sol` reference as the prior head-to-head
- Command:

```bash
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/experimental-effort.ts --local-model llama3.2 --thinking-provider openai --thinking-model gpt-5.6-sol --effort high --include-scratchpad
```

- Artifacts:
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T00-55-20-389Z.md`
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T00-55-20-389Z.json`

### Results

| Run | Duration | Blind judge total | Notes |
| --- | ---: | ---: | --- |
| local baseline (`llama3.2`, no simulation) | 8.1s | 4 | Same failure class as prior: 2-hour close; Bob closes; falsely claims feasible |
| thinking reference (`gpt-5.6-sol`, High) | 6.2s | 10 | Valid overlapping 4-hour coverage; clear winner |
| local simulated (`llama3.2`, High simulation) | 16.3s | 2 | Private passes healthy (3 passes, scratchpad/guidance present); final answer **starts with literal `assistant`**, then an invalid schedule (Bob closes; extends past 6pm; only two risk notes) |

Judge ranking: Sol ≫ baseline ≫ simulated.

### Interpretation

- The total “final = only `assistant`” collapse did **not** fully repeat; a softer form did: role-token prefix leak + still-invalid schedule.
- Simulation machinery remains healthy; final-generation / assembly is the suspect layer for the `assistant` prefix.
- Simulated answer still lost to baseline on the blind judge (2 vs 4), so this is not yet evidence the ladder helps `llama3.2` on this prompt.
- Treat the `assistant` prefix as a reproducible red flag for `/effort-review`, not as a one-off flake.

### Root cause (confirmed live)

Trailing Psychic guidance was appended as `system` **after** the last `user` turn. A direct Ollama probe on `llama3.2`:

- `[system, user]` → `"Hello"`
- `[system, user, system(guidance)]` → `"assistant\n\nhello"`
- merged leading system → `"hello"`

Fix tracked as `PRISM-n7ijv`: insert guidance before the last user message; strip leading role markers from local replies.

### Next

1. Verify with cafe head-to-head after the message-order fix.
2. Then continue the local-model series (`qwen3.6` → `gemma4` → `gpt-oss`).

## 2026-08-05 - Cafe constraint verify after role-token fix (`llama3.2`)

### Scope

- Same cafe prompt / High simulated Effort / `gpt-5.6-sol` reference
- Code: Psychic guidance inserted before last user; local `stripLeadingChatRoleMarker`
- Bead: `PRISM-n7ijv`
- Artifacts:
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T01-15-29-068Z.md`
  - `artifacts/experimental-effort-evals/experimental-effort-2026-08-06T01-15-29-068Z.json`

### Results

| Run | Duration | Blind judge total | Notes |
| --- | ---: | ---: | --- |
| local baseline | 7.1s | 3 | Still invalid (Bob closes; 2-hour shift) |
| thinking reference (`gpt-5.6-sol`) | 8.0s | 9 | Valid winner |
| local simulated High | 17.6s | 2 | **No `assistant` prefix.** Schedule still invalid (Bob closes; past 6pm; only two risk notes) |

Judge ranking: Sol ≫ baseline ≫ simulated.

### Interpretation

- Role-token leak is fixed on this prompt/model.
- Simulated Effort still does not beat baseline for `llama3.2` on the cafe task — next `/effort-review` iteration is quality of guidance → final answer, not presentation collapse.

### Next

1. Continue model series (`qwen3.6` …) and/or tighten final-answer constraint transfer for weak local models.

## 2026-08-05 - Thrifty vs legacy simulated budgets (`llama3.2` ladder QA)

### Scope

- Model: `llama3.2` (local Ollama)
- Suite: effort ladder `--quick --repeats 2` (rollout-table constraint trap)
- Profiles: `thrifty` (product default) vs `legacy` (pre-thrifty A/B via `--budget-profile`)
- Commands:

```bash
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick --repeats 2 --budget-profile thrifty
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick --repeats 2 --budget-profile legacy
```

- Artifacts:
  - thrifty: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T01-58-04-794Z.md`
  - legacy: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T02-00-05-762Z.md`

### Integrity QA

- Pass ladder identical for both: `none=0`, `minimal/low=1`, `medium=2`, `high=3`, `xhigh=4`
- Planning token budgets differ at low/med as designed (`200/280/400` thrifty vs `300/420/560` legacy); `high`/`xhigh` stay `720`/`900`
- Zero planning warnings; no `assistant` role-token collapses
- LOCAL-only (Ollama) for every private + visible pass

### Aggregate results

| Effort | Thrifty score | Legacy score | Thrifty median ms | Legacy median ms | Passes |
| --- | ---: | ---: | ---: | ---: | ---: |
| none | 7.0 | 7.5 | 7648 | 3222 | 0 |
| minimal | 9.0 | 9.5 | 8869 | 7048 | 1 |
| low | 8.5 | 10.0 | 7545 | 6967 | 1 |
| medium | 9.0 | 7.5 | 11665 | 9113 | 2 |
| high | 10.0 | 9.0 | 12050 | 7710 | 3 |
| xhigh | 8.0 | 8.5 | 10103 | 8178 | 4 |

### Interpretation

- **Logic works**: profile switch + thrifty clamps are live (recorded budgets match helpers; guidance at thrifty `minimal`/`low` capped ~905 vs legacy ~952–1041).
- **Quality**: thrifty `high` was the best arm (10/10 both repeats) and beat thrifty `none`; thrifty `medium` held 9 while legacy `medium` dipped to 7.5. Thrifty `low` was slightly weaker than legacy `low` on this n=2 smoke.
- **Latency**: thrifty was not faster in this sequential smoke (machine variance + thrifty `high` filled a richer scratchpad ~1055 chars vs legacy ~267). Do not claim a wall-clock win from this run; re-run interleaved or warm-cached if latency is the claim.
- **xhigh**: still not automatically better than `high` (matches prior calibration).

### Product Notes

- Keep thrifty as the product default for simulated Effort; reserve `--budget-profile legacy` for eval A/B only.
- ONLINE Fast (`service_tier`) remains a separate future control.
