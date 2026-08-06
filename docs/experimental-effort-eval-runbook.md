# Experimental Effort Eval Runbook

Use this runbook when changing or validating:

- the Experimental Features setting that exposes effort for more models
- simulated effort for non-reasoning models
- tiered private-pass effort simulation for non-reasoning models
- Psychic planning summaries and live-only debug diagnostics
- local-vs-online privacy guarantees for extra model calls

The eval scripts exercise the real chat pipeline, not isolated provider stubs.
Observed results belong in `docs/experimental-effort-research-log.md`; keep this file as the repeatable method.

For iterative diagnosis of a run (collapse, leakage, native-vs-simulated mismatch, LOCAL egress risk), use `/effort-review` (skill: `.codex/skills/effort-review/`).

## Product Boundary

Simulated effort is an opt-in quality booster for models without adjustable native effort. It is not a claim that those models become true reasoning models.

- Prism simulated planning/draft/audit/revision passes run on the selected provider/model, whether local or online.
- OpenAI and Anthropic models without adjustable native effort receive the same private multi-call ladder when the experiment is enabled.
- Models with native effort keep provider-native effort; fixed-effort models remain fixed.
- Online simulation makes multiple paid/provider calls and may increase usage, cost, and latency. Settings must say so plainly.
- Psychic mode may show concise summaries/diagnostics, but private plans, drafts, audits, and revisions remain ephemeral.
- LOCAL mode always uses the selected local provider for every private and visible pass; it must never call an online provider.

## Prerequisites

- Run from the repo root (for example `~/Developer/Web Apps/PRISM` or `C:\PRISM`).
- Keep Ollama running with the local test model available, usually `llama3.2`.
- For the strong-reference comparison, set one online key in `.env` or the shell:
  - `ANTHROPIC_API_KEY` for Opus
  - `OPENAI_API_KEY` for Sol / OpenAI judge
- Do not use online keys for LOCAL-mode assertions. LOCAL simulated effort must stay on Ollama.
- Use provider stubs for routine online multi-call tests. Run live paid-provider checks only when explicitly evaluating quality or cost.

Prefer the direct Node commands below when passing flags. The npm scripts are convenient for defaults, but direct commands avoid shell-specific argument forwarding surprises.

## Head-to-head prompt (default)

The default `experimental-effort.ts` prompt is a **constraint-heavy scheduling task**, not a meta “design simulated Effort” brief. Open-ended feature-design prompts make weak and strong models look alike and confuse the blind judge.

Default task shape:

- cafe staffing schedule with hard staff/shift constraints
- required Markdown table + exactly three risk rows (`R1`–`R3`) + one feasibility sentence
- staff whitelist, word cap, and no private step-by-step reasoning

Override with `--prompt` only when deliberately testing a different skill. Prefer checkable constraints over open-ended product design.

## Strong reference vs local baseline vs simulated local

Run with Anthropic as the strong reference:

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/experimental-effort.ts --thinking-provider anthropic --thinking-model claude-opus-4-8
```

Or with OpenAI Sol (useful when calibrating against the ONLINE Auto 5.6 ladder):

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/experimental-effort.ts --local-model llama3.2 --thinking-provider openai --thinking-model gpt-5.6-sol --effort high
```

Swap `--local-model` for other installed Ollama chat models (`qwen3.6`, `gemma4`, `gpt-oss`, and so on).

This produces:

- local baseline: chosen local model, no simulated effort
- thinking reference: strong native-effort model
- local simulated effort: same local model, tiered private passes plus final pass

Artifacts are written to:

```text
artifacts/experimental-effort-evals/
```

Inspect the latest Markdown report first, then the JSON if exact fields matter. Append dated interpretation to `docs/experimental-effort-research-log.md`.

### What Good Looks Like

- All three runs complete.
- The simulated local run has `psychicDebug.simulated: true`.
- The simulated local run has nonzero `psychicDebug.passCount`.
- The simulated local run records `psychicDebug.passes` and `psychicDebug.guidanceChars`.
- The simulated local run has non-empty `scratchpadChars`.
- The simulated local run has no `planningWarnings`.
- The blind judge result is plausible. The strong reference should usually beat the local baseline; simulated local should usually beat the same model's baseline if the ladder is helping.
- Answers respect the prompt shape (table, `R1`–`R3`, feasibility sentence, staff whitelist, word cap).
- The local simulated run must not require or use OpenAI/Anthropic for private passes.

### Red Flags

- `planningWarnings` contains `invalid_json`: the planning pass fell back to normal generation.
- `scratchpadChars` is empty or zero for simulated effort: the self-call workaround did not produce usable guidance.
- `passCount` stays flat across high-effort settings: the tiered private work is not being exercised.
- Strong-reference OpenAI models return `OpenAI returned an empty response`: rerun with Opus before diagnosing local effort.
- The simulated local answer improves latency only, not quality: the model may be ignoring the private guidance.
- Blind judge ranks all answers as similarly weak on an open-ended prompt: switch back to the default constraint task before drawing product conclusions.
- Final simulated answer is empty, tiny, or only a chat role token such as `assistant`: private passes may have completed while the visible generation collapsed; treat as a failed simulated run and rerun before concluding the ladder hurts quality. Known cause (fixed in `PRISM-n7ijv`): trailing Psychic guidance `system` after the last `user` turn; guidance must sit before the last user message.

## Effort Slider Ladder

Run:

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2
```

By default, this runs a harder 3-prompt suite 3 times per effort across:

```text
none -> minimal -> low -> medium -> high -> xhigh
```

For a fast smoke test that preserves the original single-prompt table, run:

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick
```

To A/B the thrifty (product default) budgets against the pre-thrifty ladder:

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick --repeats 2 --budget-profile thrifty
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts --model llama3.2 --quick --repeats 2 --budget-profile legacy
```

`--budget-profile` is eval-only. Product runtime always uses thrifty unless an eval selects legacy.

Artifacts are written to:

```text
artifacts/effort-ladder-evals/
```

The ladder records:

- average score by effort
- median latency by effort
- private pass count
- private pass diagnostics
- guidance character count
- scratchpad character count
- planning warnings
- final answer word count
- objective constraint score

## Interpreting Ladder Results

Use this decision table:

| Observation | Meaning | Next Move |
| --- | --- | --- |
| `none` has no scratchpad and simulated efforts do | The workaround is active | Compare score and latency |
| higher efforts have larger scratchpads and better scores | Slider has useful signal | Keep current ladder |
| higher efforts have larger scratchpads but no score gain | More planning is happening but not helping | Improve final-answer guidance |
| high/xhigh have more passes but no score gain | More private work is happening but not helping | Tighten draft, audit, or final guidance prompts |
| all nonzero efforts have identical pass counts | The tiered pipeline is not active | Check simulated pass selection and diagnostics |
| any nonzero effort has `invalid_json` warnings | Planning failed and fell back | Tighten planning prompt/schema or fallback parsing |
| `xhigh` is slower and worse | The slider is overfitting/noisy for that model | Cap or redesign high efforts |

For `llama3.2`, the important test is not whether `xhigh` has a larger budget. It must show more useful behavior: more private passes, larger live diagnostics, better constraint score, or some defensible combination. If it only gets more budget, the product should not claim that it thinks harder.

## Historic Baseline Snapshot

Before tiered private passes, the first clean `llama3.2` ladder after tightening the single planning pass showed:

| Effort | Planning budget | Scratchpad chars | Score |
| --- | ---: | ---: | ---: |
| none | 0 | 0 | 9/10 |
| minimal | 300 | 69 | 9/10 |
| low | 420 | 69 | 8/10 |
| medium | 560 | 69 | 9/10 |
| high | 720 | 69 | 9/10 |
| xhigh | 900 | 69 | 8/10 |

Conclusion: `llama3.2` accepted the simulated planning pass, but it did not use extra budget as effort increased. The current implementation should now make higher simulated effort structurally different:

- `minimal`: plan plus final
- `low`: fuller plan plus final
- `medium`: plan, constraint audit, final
- `high`: plan, private draft, private critique, final
- `xhigh`: plan, private draft, constraint audit, revision guidance, final

## Acceptance Targets

For the hard `llama3.2` suite:

- no planning warnings on the ladder
- nonzero efforts show live private-pass diagnostics
- high/xhigh show more private work than low
- averaged high or xhigh score beats none/minimal on the harder prompt suite
- stored transcript rows contain only the concise Psychic summary, never drafts, audits, revisions, or scratchpads

## Research Log

See `docs/experimental-effort-research-log.md` for dated results and interpretation. Do not paste full private scratchpads, drafts, audits, or revision notes into docs.

## Privacy Checks

When validating LOCAL behavior:

- Use `preferredProvider: "local"` and a local model such as `llama3.2`.
- Confirm simulated effort uses `LocalOllamaProvider`.
- Do not pass online keys as evidence that LOCAL is safe; local safety should hold even when keys exist.
- Keep `apps/api/src/__tests__/providers.test.ts` LOCAL invariant passing.

When validating online behavior:

- Use an unsupported/non-native model such as `gpt-4o` with the experiment enabled.
- Confirm the selected provider and model handle every private pass and the final response.
- Confirm native-effort models still make one visible generation call and receive provider-native effort.
- Confirm disabling the experiment removes simulated levels and prevents private-pass calls.

## Follow-Up Validation

After changing this area, run:

```powershell
node --test --experimental-strip-types packages/shared/src/reasoningEffort.test.ts apps/api/src/__tests__/chat.test.ts apps/api/src/__tests__/model-effort-preferences.test.ts apps/api/src/__tests__/model-effort-runner.test.ts apps/api/src/__tests__/providers.test.ts
npm run typecheck
```

For UI Psychic summary work, also run:

```powershell
node --test --experimental-strip-types apps/web/src/app/model-routing-picker-integration.test.ts apps/web/src/app/psychicThoughtDisplay.test.ts apps/web/src/app/psychicCommand.test.ts
```
