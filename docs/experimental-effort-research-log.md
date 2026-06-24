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
- Online OpenAI/Anthropic models should not receive Prism simulated-effort private-pass chains.
- Online native reasoning should remain provider-native.
- Online non-reasoning effort customization should no-op clearly instead of silently multiplying paid API calls.
- Psychic mode can still report concise summaries/diagnostics, but private artifacts remain live-only and must not be persisted into docs or transcript rows.
