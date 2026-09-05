# Experimental Effort Eval

Created: 2026-08-06T21:43:56.811Z

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
- Duration: 7126ms
- Assistant chars: 485

```text
| Time | Barista |
| --- | --- |
| 8am–12pm | Cara |
| 12pm–4pm | Alice |
| 4pm–6pm | Bob |

R1: The cafe is at risk of understaffing during the morning rush from 9am to 11am due to limited coverage.

R2: There is a high chance that Bob will be closing alone, which may lead to burnout and decreased morale.

R3: If Cara's shift is extended beyond 6pm without proper compensation or recognition, it could negatively impact her job satisfaction and retention.

The schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 6791ms
- Assistant chars: 396

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

| Risk | Uncovered risk note |
|---|---|
| R1 | Bob’s absence would leave 8:00am–12:00pm uncovered. |
| R2 | Alice’s absence would leave 12:00pm–2:00pm uncovered. |
| R3 | Cara’s absence would leave 4:00pm–6:00pm uncovered. |

The schedule is feasible and satisfies all stated constraints.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 16667ms
- Assistant chars: 476
- Private pass count: 3
- Guidance chars: 934
- Private pass: plan; chars=284
- Private pass: draft; chars=110
- Private pass: audit; chars=2
- Planning scratchpad chars: 445

```text
Let's analyze the constraints and create a schedule.

Since Alice can't work before noon, she will start at 12:00 PM. Bob cannot close, so he must finish by 8:00 AM. Cara can do any shift.

Here is the coverage schedule:
| Time | Barista |
| --- | --- |
| 08:00-12:00 | Cara |
| 12:00-16:00 | Alice |
| 16:00-20:00 | Bob |

Uncovered risk notes:

R1: What if a barista is late or can't make it?
R2: How will we handle peak hours (e.g., 17:00-19:00)?

The schedule is feasible.
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
        "reasoning": 3,
        "actionability": 4,
        "constraints": 5,
        "total": 4,
        "notes": "Covers the full 8am–6pm span, but uses a 2-hour shift for Bob, violates the 4-hour shift rule, and has Bob closing despite the constraint. Risk notes are exactly R1–R3 but include irrelevant or inconsistent risks. Feasibility sentence is incorrect."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides full coverage with valid 4-hour shifts, respects Alice's availability, avoids Bob closing, uses only the named staff, includes exactly three labeled risk notes, stays concise, and correctly states feasibility."
      },
      "C": {
        "correctness": 2,
        "reasoning": 2,
        "actionability": 2,
        "constraints": 2,
        "total": 2,
        "notes": "Violates Bob's no-closing constraint, schedules beyond closing time, gives only two risk notes instead of exactly three, and includes visible analysis. The feasibility statement is incorrect."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only answer that satisfies the scheduling constraints and requested format. Response A has a better format than C but violates key scheduling rules. Response C has multiple constraint and format failures."
  }
}
```

