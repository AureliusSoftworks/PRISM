# Experimental Effort Eval Runbook

Use this runbook when changing or validating:

- the Experimental Features setting that exposes effort for more models
- simulated effort for non-reasoning models
- tiered private-pass effort simulation for non-reasoning models
- Psychic planning summaries and live-only debug diagnostics
- local-vs-online privacy guarantees for extra model calls

The eval scripts exercise the real chat pipeline, not isolated provider stubs.
Observed results belong in `docs/experimental-effort-research-log.md`; keep this file as the repeatable method.

## Product Boundary

Simulated effort is a local-model quality booster. It is not a claim that weak models become true reasoning models.

- Prism simulated planning/draft/audit/revision passes run only for the selected local provider/model.
- OpenAI and Anthropic models never receive Prism simulated-effort private-pass chains.
- OpenAI models with native reasoning support keep provider-native `reasoning_effort`.
- Online non-reasoning models no-op simulated effort and emit a developer diagnostic instead of multiplying API calls.
- Psychic mode can show concise summaries/diagnostics, but online Psychic mode must not trigger simulated online effort.

## Prerequisites

- Run from the repo root: `C:\PRISM`.
- Keep Ollama running with the local test model available, usually `llama3.2`.
- For the strong-reference comparison, set one online key in `.env` or the shell:
  - `ANTHROPIC_API_KEY` for Opus
  - `OPENAI_API_KEY` for the OpenAI judge
- Do not use online keys for LOCAL-mode assertions. LOCAL simulated effort must stay on Ollama.

Prefer the direct Node commands below when passing flags. The npm scripts are convenient for defaults, but direct commands avoid shell-specific argument forwarding surprises.

## Opus vs Llama vs Simulated Llama

Run:

```powershell
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/experimental-effort.ts --thinking-provider anthropic --thinking-model claude-opus-4-8
```

This produces:

- local baseline: `llama3.2`, no simulated effort
- thinking reference: `claude-opus-4-8`
- local simulated effort: `llama3.2`, tiered private passes plus final pass

Artifacts are written to:

```text
artifacts/experimental-effort-evals/
```

Inspect the latest Markdown report first, then the JSON if exact fields matter.

### What Good Looks Like

- All three runs complete.
- The simulated local run has `psychicDebug.simulated: true`.
- The simulated local run has nonzero `psychicDebug.passCount`.
- The simulated local run records `psychicDebug.passes` and `psychicDebug.guidanceChars`.
- The simulated local run has non-empty `scratchpadChars`.
- The simulated local run has no `planningWarnings`.
- The blind judge result is plausible. Opus should usually beat `llama3.2`.
- The local simulated run must not require or use OpenAI.

### Red Flags

- `planningWarnings` contains `invalid_json`: the planning pass fell back to normal generation.
- `scratchpadChars` is empty or zero for simulated effort: the self-call workaround did not produce usable guidance.
- `passCount` stays flat across high-effort settings: the tiered private work is not being exercised.
- Strong-reference OpenAI models return `OpenAI returned an empty response`: rerun with Opus before diagnosing local effort.
- The simulated local answer improves latency only, not quality: the model may be ignoring the private guidance.

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

## Follow-Up Validation

After changing this area, run:

```powershell
node --test --experimental-strip-types apps/api/src/__tests__/chat.test.ts apps/api/src/__tests__/providers.test.ts
npm run typecheck
```

For UI Psychic summary work, also run:

```powershell
node --test --experimental-strip-types apps/web/src/app/psychicThoughtDisplay.test.ts apps/web/src/app/psychicCommand.test.ts
```
