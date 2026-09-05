# Soft-transfer Phase A suite

Created: 2026-08-07T03:08:14.121Z

Local model: llama3.2
Thinking model: openai / gpt-5.6-sol
Effort: high

Win condition for a case: local High sim judge total ≥ local None, and preferably closer to the thinking reference on constraints.

| Case | None | High sim | Sol/ref | High ≥ None? |
| --- | ---: | ---: | ---: | --- |
| Exact S1–S3 labels + forbidden word (`labels-s1-s3`) | 4 | 8 | 9 | yes |
| Required key phrases (local + private planning pass) (`key-phrases-local`) | 8 | 8 | 10 | yes |
| Tiny table with item whitelist (`tiny-table-whitelist`) | 4 | 7 | 10 | yes |

Cases where High sim ≥ None: **3/3** (strict wins: 2)

## Case reports

- [Exact S1–S3 labels + forbidden word](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-08-14-121Z-labels-s1-s3.md)
- [Required key phrases (local + private planning pass)](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-08-14-121Z-key-phrases-local.md)
- [Tiny table with item whitelist](/Users/jared/Developer/Web Apps/PRISM/artifacts/experimental-effort-evals/experimental-effort-2026-08-07T03-08-14-121Z-tiny-table-whitelist.md)

