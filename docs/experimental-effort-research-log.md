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

## 2026-08-05 - Standard lean ladder vs Deep experimental (`llama3.2`)

### Scope

- Model: `llama3.2` (local Ollama)
- Suite: effort ladder `--quick --repeats 2` (rollout-table constraint trap)
- Budgets: thrifty (product default)
- Arms: `--ladder-profile standard` (product default) vs `--ladder-profile deep` (Settings experimental)
- Commands:

```bash
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick --repeats 2 --ladder-profile standard --budget-profile thrifty
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick --repeats 2 --ladder-profile deep --budget-profile thrifty
```

- Artifacts:
  - standard: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T06-24-00-070Z.md`
  - deep: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T06-25-49-590Z.md`
- Harness note: `--ladder-profile` maps to `experimentalAllModelEffortEnabled` (`deep` = on).

### Integrity QA

- Standard passes: `none=0`, `minimal/low=1`, `medium=2`, `high=3`, `xhigh=4` (`plan`→`draft`→`audit`→`synthesis`)
- Deep passes: `none=0`, `minimal=3`, `low=5`, `medium=7`, `high=8`, `xhigh=9` (full workshop incl. Compliance Sweep on xhigh)
- Zero planning warnings; no role-token collapses; no CoT/scratchpad leak heuristics
- LOCAL-only for every private + visible pass

### Aggregate results

| Effort | Standard score | Deep score | Standard median ms | Deep median ms | Std passes | Deep passes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 8.0 | 8.5 | 5485 | 3407 | 0 | 0 |
| minimal | 9.5 | 8.5 | 7606 | 9722 | 1 | 3 |
| low | 9.5 | 9.0 | 6259 | 14006 | 1 | 5 |
| medium | 9.5 | 9.5 | 11430 | 19312 | 2 | 7 |
| high | 10.0 | 10.0 | 11001 | 20477 | 3 | 8 |
| xhigh | 9.0 | 10.0 | 10749 | 20111 | 4 | 9 |

### Interpretation

- **Standard default earns its keep**: beats `none` at every nonzero tier; `high` is the quality peak (10/10 both repeats) at ~11s median.
- **Deep is a latency tax with mixed low-tier payoff**: ~+2–9s median vs standard; `minimal`/`low` scored *worse* than standard on this n=2 smoke despite 3–5 private passes.
- **Deep helps Extra High on this prompt**: xhigh 10/10 vs standard 9/10, with Compliance Sweep present — still ~2× the wait of standard high.
- **Do not promote Deep to default** from this run. Keep lean standard as product default; keep Deep behind Settings experimental for players who want maximum private workshop at High/XHigh.

### Product Notes

- Eval harness now defaults `--ladder-profile standard` so ladder smokes match product, not the experimental deep spine.
- Cafe-constraint head-to-head still open for Deep vs Standard quality claims beyond the rollout-table trap.

## 2026-08-06 - Thrifty vs legacy hard suite (`gemma3:4b`)

### Scope

- Model: `gemma3:4b` (local Ollama, 4.3B)
- Suite: hard effort ladder (3 prompts × 2 repeats × 6 efforts = 36 runs/profile)
- Profiles: `thrifty` vs `legacy`; ladder profile `standard`
- Commands:

```bash
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model gemma3:4b --repeats 2 --budget-profile thrifty
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model gemma3:4b --repeats 2 --budget-profile legacy
```

- Artifacts:
  - thrifty: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T11-12-05-175Z.md`
  - legacy: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T11-28-28-654Z.md`
- Note: first thrifty attempt stalled on cold/swapped Ollama (medium/high hit wall-clock budgets). After `ollama stop` + warm gemma generate, both suites completed with zero timeouts.

### Integrity QA

- Pass ladder for healthy runs: `none=0`, `low=1`, `medium=2`, `high=3`, `xhigh=4`
- Thrifty **minimal** is broken on this model: `avgPasses=0`, **6/6** `invalid_json` planning warnings, scratchpad 0
- Legacy minimal healthier but still flaky (`avgPasses=0.67`, 2 warnings)
- No `assistant` role-token collapses; all runs `status=ok` after warm load
- LOCAL-only throughout

### Aggregate results

| Effort | Thrifty score | Legacy score | Thrifty median ms | Legacy median ms | Thrifty passes | Legacy passes | Thrifty warn | Legacy warn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 5.67 | 6.17 | 14305 | 14676 | 0 | 0 | 0 | 0 |
| minimal | 5.00 | 7.67 | 19147 | 21844 | 0 | 0.67 | 6 | 2 |
| low | **9.33** | 8.50 | 22501 | 23843 | 1 | 1 | 0 | 0 |
| medium | 7.83 | **8.83** | 27204 | 31373 | 2 | 2 | 0 | 0 |
| high | 8.50 | 8.50 | 33984 | 34320 | 3 | 3 | 0 | 0 |
| xhigh | 8.67 | 8.67 | 42194 | 39684 | 4 | 4 | 0 | 0 |

### Interpretation

- **Thrifty Low is the gemma sweet spot**: best score in the whole A/B (9.33), beats legacy Low, and slightly faster — lean plan+guidance helps this 4B model.
- **Thrifty Minimal is too lean**: 200-token planning budget + ultra-short prompt → `invalid_json` every time on gemma. Treat as a product bug for thrifty Minimal, not “gemma can’t simulate Effort.”
- **Thrifty Medium underperformed legacy Medium** (7.83 vs 8.83) despite healthy 2-pass ladder — lean medium budgets/prompts may strip useful audit room on gemma.
- **High/XHigh identical** across profiles (same top-tier budgets); Extra High still not clearly better than High on score.
- Warm Ollama matters: cold model-swap made medium/high look like hard timeouts earlier.

### Next

1. Raise thrifty Minimal planning budget (and/or relax Minimal thrifty prompt) so gemma can emit valid plan JSON — target: nonzero `passCount` and 0 `invalid_json` on a quick gemma recheck.
2. Consider a small Medium thrifty bump for weak local models if Medium keeps losing to legacy on more models.
3. Optional: same hard A/B on `mistral` / `smollm:1.7b` once Minimal is fixed.

## 2026-08-06 - Fix: thrifty Minimal planning room (`gemma3:4b` recheck)

### Change

- Thrifty `simulatedPsychicPlanningMaxTokens("minimal")`: `200` → `300`; `low` → `340` to keep ordering
- Softened Minimal thrifty plan prompt to demand complete valid JSON fields
- Rebuilt `@localai/shared` dist (runtime imports dist; source-only edits do not apply)

### Recheck (standard ladder, thrifty, `gemma3:4b`, Minimal × 2)

- `simulated: true`, `passCount: 1` (`plan` only), `warnings: []` both repeats
- Scratchpad ~323 chars (was 0 / `invalid_json` before)

### Note

Eval/scripts that import `@localai/shared` must rebuild `packages/shared` after budget helper edits.

## 2026-08-06 - Hard thrifty ladder (`mistral`)

### Scope

- Model: `mistral` (local Ollama)
- Suite: hard effort ladder, thrifty + standard, `--repeats 2`
- Command:

```bash
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model mistral --repeats 2 --budget-profile thrifty --ladder-profile standard
```

- Artifact: `artifacts/effort-ladder-evals/effort-ladder-2026-08-06T17-54-19-932Z.md`

### Aggregate results

| Effort | Avg score | Median ms | Avg passes | Warnings | Avg scratchpad |
| --- | ---: | ---: | ---: | ---: | ---: |
| none | 5.67 | 7832 | 0 | 0 | 0 |
| minimal | 3.83 | 32175 | 0.33 | 4 | 137 |
| low | 5.50 | 28637 | 1 | 0 | 175 |
| medium | 3.83 | 40896 | 1.33 | 2 | 1003 |
| high | 5.00 | 52577 | 2 | 2 | 1896 |
| xhigh | 6.00 | 70077 | 2.67 | 2 | 520 |

### Interpretation

- Suite completed with **0 hard errors** (no wall-clock timeouts).
- **Low is the only reliably healthy sim tier** on mistral here: `avgPasses=1`, 0 warnings.
- **Minimal still flaky** after the 300-token bump: 4/6 `invalid_json` (works on rollout-table, fails on incident-handoff + qa-gate). Gemma-fixed Minimal is not universal.
- Medium/High/XHigh also drop plan JSON on some prompts (incident-handoff especially weak overall, scores ~1–3).
- Simulated Effort does **not** clearly beat `none` on average for this model/suite; XHigh edges `none` (6.0 vs 5.67) but latency ~9×.
- Next diagnosis: capture mistral Minimal raw plan payloads on failing prompts; consider JSON repair / slightly higher Minimal budget / model-specific plan prompt — do not raise Medium yet until Minimal is stable across small locals.

### Product Notes

- Keep thrifty Low as the practical “lean sim works” tier for weaker Ollama chat models.
- Treat mistral Minimal JSON failures as a follow-up bug, not a reason to revert the gemma Minimal fix.

## 2026-08-06 - North star locked: guidance → final (Phase A)

### Decision

Win condition: a player may prefer `llama3.2` XHigh over luna XHigh for expansive usefulness, not only to save API tokens.

Locked path (Jared, 2026-08-06):

1. **Phase A (now)** — Strengthen **guidance → final-answer transfer** so private plan/audit/checklist actually reshape the visible reply. Primary measure: cafe staffing head-to-head — local High ≥ local None, closer to Sol on constraint fidelity. Beads: `PRISM-jwe8r` (north star), `PRISM-f5r9j` (Phase A task).
2. **Phase B** — Memory / retrieval for expansive LOCAL continuity (after A).
3. **Phase C** — Deep / multi-agent local workshop only after A earns its keep.
4. **Not next** — ONLINE Fast toggle (orthogonal).

### Why A first

Cafe evals showed healthy private passes with finals that still break hard constraints (e.g. Bob closes, illegal shift lengths). More passes alone will not beat luna; plating must obey the recipe card.

### Next engineering

Inspect `composePsychicFinalGuidance` / `appendPsychicAnswerGuidance` / final generation: stronger must-keep constraint extraction from user + private checklist, final-pass obedience framing for weak locals, then `experimental-effort` cafe recheck vs Sol.
