# Soft-continuity-memory Phase B suite

Created: 2026-08-07T03:59:13.901Z

Local model: llama3.2
Thinking model: openai / gpt-5.6-sol
Effort: high

Win condition for a case: local High sim continuity fact score ≥ local None (seeded encrypted memories only; prompt does not restate keys).

| Case | None facts | High facts | Sol/ref facts | High ≥ None? | Digest? | Judge None | Judge High |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Drink + milk + nickname from encrypted memories (`drink-prefs-memory`) | 5/6 | 5/6 | 6/6 | yes | yes | 6 | 6 |
| City + month + lodging from encrypted memories (`travel-plan-memory`) | 3/3 | 1/3 | 2/3 | no | yes | 2 | 4 |
| Format + forbidden word + units from encrypted memories (`format-prefs-memory`) | 5/6 | 6/6 | 6/6 | yes | yes | 6 | 7 |

Cases where High sim ≥ None: **2/3** (strict wins: 1)

## Case reports

- [Drink + milk + nickname from encrypted memories](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-59-13-901Z-drink-prefs-memory.md)
- [City + month + lodging from encrypted memories](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-59-13-901Z-travel-plan-memory.md)
- [Format + forbidden word + units from encrypted memories](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-59-13-901Z-format-prefs-memory.md)

