# Experimental Effort Eval

Created: 2026-08-07T03:52:11.827Z

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
- Duration: 1211ms
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
- Duration: 1421ms
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
- Duration: 7291ms
- Assistant chars: 115
- Private pass count: 3
- Guidance chars: 1445
- Private pass: plan; chars=185
- Private pass: draft; chars=17
- Private pass: audit; chars=275; warning=audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=275
- Planning scratchpad chars: 526
- Planning warning: continuity_digest; card=thread_state; chars=186
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
| Ship date | 2026-09-12 |
| Provider mode | LOCAL only |
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
        "notes": "Provides the requested Markdown table with exactly the three specified fields, concise formatting, and no extra reasoning or invented-looking additions."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Equivalent to A; contains exactly the requested three data rows, stays concise, and does not expose reasoning."
      },
      "C": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Equivalent to A; satisfies the table structure and constraint requirements."
      }
    },
    "ranking": [
      "A",
      "B",
      "C"
    ],
    "winner": "A",
    "summary": "All three responses are substantively identical and fully satisfy the prompt constraints. A is selected as winner only as a deterministic tie-break."
  }
}
```

