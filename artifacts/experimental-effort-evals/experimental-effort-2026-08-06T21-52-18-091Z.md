# Experimental Effort Eval

Created: 2026-08-06T21:52:18.091Z

## Prompt

```text
A cafe has 3 baristas and must cover Sat 8am–6pm.
Shifts must be 4 hours. No barista works more than 8 hours.
Alice can't work before noon. Bob can't close. Cara can do any shift.
Produce:
1) a coverage schedule as a Markdown table with columns: Time, Barista
2) exactly 3 rows of uncovered risk notes labeled R1–R3
3) one sentence saying whether the schedule is feasible

Constraints:
- Use only Alice, Bob, Cara
- Do not invent extra staff
- Keep the whole answer under 220 words
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 9815ms
- Assistant chars: 436

```text
| Time | Barista |
| --- | --- |
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

R1: The cafe is at risk of understaffing during the morning rush from 9am to 11am.
R2: There is a high likelihood of burnout among baristas due to the long hours and lack of breaks.
R3: The schedule does not take into account any potential staff conflicts or personal issues that may arise during the shift.

The coverage schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 8971ms
- Assistant chars: 423

```text
| Time | Barista |
|---|---|
| 8am–12pm | Bob |
| 10am–2pm | Cara |
| 2pm–6pm | Alice |

| Risk | Uncovered risk note |
|---|---|
| R1 | No backup coverage if Bob is absent from 8am–10am. |
| R2 | No backup coverage if Cara is absent from 12pm–2pm. |
| R3 | No backup coverage if Alice is absent from 2pm–6pm. |

The schedule is feasible: all operating hours are covered using 4-hour shifts, and no barista exceeds 8 hours.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 19812ms
- Assistant chars: 109
- Private pass count: 3
- Guidance chars: 1800
- Private pass: plan; chars=284
- Private pass: draft; chars=123
- Private pass: audit; chars=371; warning=audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=371
- Planning scratchpad chars: 827
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=371

```text
The coverage schedule is as follows: | Time | Barista | | --- | --- | | 08:00-12:00 | Cara | | 12:00-16:00...
```

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
        "correctness": 3,
        "reasoning": 4,
        "actionability": 4,
        "constraints": 5,
        "total": 4,
        "notes": "Covers the day only by using a 2-hour 4pm-6pm shift, violating the 4-hour shift requirement, and assigns Bob to close despite the constraint. The feasibility sentence is therefore incorrect. Uses only allowed staff, stays concise, and provides three labeled risk notes."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Fully covers 8am-6pm with valid 4-hour shifts, respects Alice's availability, avoids Bob closing, uses only named staff, includes a proper Markdown schedule table, exactly three labeled risk-note rows, and a feasibility sentence under the word limit."
      },
      "C": {
        "correctness": 1,
        "reasoning": 1,
        "actionability": 1,
        "constraints": 1,
        "total": 1,
        "notes": "Incomplete and truncated. Does not provide the required complete Markdown table, exactly three risk notes, or feasibility sentence, so it is not actionable and fails most constraints."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only response that satisfies the scheduling rules and output constraints. Response A violates key scheduling constraints. Response C is incomplete."
  }
}
```

