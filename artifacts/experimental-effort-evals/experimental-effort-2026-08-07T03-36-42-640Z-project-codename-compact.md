# Experimental Effort Eval

Created: 2026-08-07T03:36:42.640Z

## Prompt

```text
Fill a Markdown table with columns: Field, Value for exactly these three fields from earlier thread context: Codename, Ship date, Provider mode.

Constraints:
- Exactly 3 data rows
- Keep under 70 words
- Do not invent values
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1127ms
- Assistant chars: 115
- Continuity score: 3/3
- Continuity check: includes:Lumen Gate=pass
- Continuity check: includes:2026-09-12=pass
- Continuity check: includes:LOCAL=pass
- Continuity digest seen in planning: no

```text
| Field | Value |
| --- | --- |
| Codename | Lumen Gate |
| Ship date | 2026-09-12 |
| Provider mode | LOCAL only |
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1510ms
- Assistant chars: 111
- Continuity score: 3/3
- Continuity check: includes:Lumen Gate=pass
- Continuity check: includes:2026-09-12=pass
- Continuity check: includes:LOCAL=pass
- Continuity digest seen in planning: no

```text
| Field | Value |
|---|---|
| Codename | Lumen Gate |
| Ship date | 2026-09-12 |
| Provider mode | LOCAL only |
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 6952ms
- Assistant chars: 115
- Private pass count: 3
- Guidance chars: 1445
- Private pass: plan; chars=155
- Private pass: draft; chars=115
- Private pass: audit; chars=275; warning=audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=275
- Planning scratchpad chars: 594
- Planning warning: continuity_digest; chars=265
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=275
- Continuity score: 3/3
- Continuity check: includes:Lumen Gate=pass
- Continuity check: includes:2026-09-12=pass
- Continuity check: includes:LOCAL=pass
- Continuity digest seen in planning: yes

```text
| Field | Value |
| --- | --- |
| Codename | Lumen Gate |
| Ship Date | 2026-09-12 |
| Provider Mode | LOCAL only |
```

## Seeded Continuity

```text
Project codename is Lumen Gate. Ship date is 2026-09-12. Provider mode must stay LOCAL only.
```

- Must include: Lumen Gate, 2026-09-12, LOCAL

## Blind Judge

```json
{
  "model": "gpt-5.5",
  "responseMap": {
    "A": "local-baseline",
    "B": "thinking-reference",
    "C": "local-simulated-effort"
  },
  "result": {
    "scores": {
      "A": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides exactly the requested Markdown table with the three specified data rows, preserves field names, stays concise, and does not include reasoning."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Equivalent to A; fully satisfies the requested table format, fields, concision, and no-reasoning constraint."
      },
      "C": {
        "correctness": 8,
        "reasoning": 10,
        "actionability": 9,
        "constraints": 7,
        "total": 8.5,
        "notes": "Values and row count are correct, but it changes the specified field labels from 'Ship date' and 'Provider mode' to title case, violating the request for exactly these fields."
      }
    },
    "ranking": [
      "A",
      "B",
      "C"
    ],
    "winner": "A",
    "summary": "A and B are equally compliant and correct; A is selected as winner only as a tie-break. C is usable but loses points for not preserving the exact requested field names."
  }
}
```

