# Soft-continuity Phase B suite

Created: 2026-08-07T03:52:11.827Z

Local model: llama3.2
Thinking model: openai / gpt-5.6-sol
Effort: high

Win condition for a case: local High sim continuity fact score ≥ local None (seeded thread compact only; prompt does not restate keys).

| Case | None facts | High facts | Sol/ref facts | High ≥ None? | Digest? | Judge None | Judge High |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Pet + allergy + brevity from thread compact (`pet-prefs-compact`) | 0/6 | 6/6 | 6/6 | yes | yes | 1.5 | 6.25 |
| Codename + ship date + LOCAL from thread compact (`project-codename-compact`) | 3/3 | 3/3 | 3/3 | yes | yes | 10 | 10 |
| Meeting day/room/bring from thread compact (`meeting-facts-compact`) | 0/6 | 6/6 | 6/6 | yes | yes | 1.25 | 7.75 |

Cases where High sim ≥ None: **3/3** (strict wins: 2)

## Case reports

- [Pet + allergy + brevity from thread compact](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-52-11-827Z-pet-prefs-compact.md)
- [Codename + ship date + LOCAL from thread compact](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-52-11-827Z-project-codename-compact.md)
- [Meeting day/room/bring from thread compact](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-52-11-827Z-meeting-facts-compact.md)

