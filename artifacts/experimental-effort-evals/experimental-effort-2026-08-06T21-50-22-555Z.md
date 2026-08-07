# Experimental Effort Eval

Created: 2026-08-06T21:50:22.555Z

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
- Duration: 4871ms
- Assistant chars: 540

```text
The cafe's coverage schedule is as follows:

| Time | Barista |
| --- | --- |
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

Uncovered risk notes:
R1: The cafe may not be able to cover the entire shift from 2pm-4pm due to potential staffing shortages.
R2: There is a risk that Bob will close earlier than expected, potentially leaving the cafe understaffed during peak hours.
R3: If Cara is unable to work her scheduled shift, it could significantly impact the cafe's ability to meet customer demand.

The schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 7579ms
- Assistant chars: 461

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Cara |
| 2:00pm–6:00pm | Alice |

| Risk | Uncovered risk note |
|---|---|
| R1 | No uncovered period; Cara and Alice overlap from 2:00pm–4:00pm. |
| R2 | Coverage relies on a single barista from 8:00am–2:00pm. |
| R3 | Coverage relies solely on Alice from 4:00pm–6:00pm. |

The schedule is feasible because every hour is covered and all availability and shift-length constraints are met.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 17588ms
- Assistant chars: 514
- Private pass count: 3
- Guidance chars: 1594
- Private pass: plan; chars=284
- Private pass: draft; chars=123
- Private pass: audit; chars=121
- Planning scratchpad chars: 577

```text
To produce the requested output, I will follow the constraints and provide the following answer:

### Coverage Schedule
| Time | Barista |
| --- | --- |
| 08:00-12:00 | Cara |
| 12:00-16:00 | Alice |
| 16:00-20:00 | Bob |

### Uncovered Risk Notes
R1: What if a barista is late or can't make it?
R2: How will we handle peak hours (e.g., 17:00-19:00)?

### Feasibility of Schedule
The schedule is feasible as it covers the entire shift period with each barista working a maximum of 4 hours and no more than 8 hours.
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
        "constraints": 4,
        "total": 3,
        "notes": "Covers the 8am–6pm span only by using a 2-hour final shift, violating the 4-hour shift requirement. Bob is scheduled to close despite the constraint. The feasibility statement is incorrect, and the risk notes conflict with the schedule. It does provide the requested schedule table and three labeled risk notes, uses only allowed staff, and is under the word limit."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Meets the coverage requirement with valid 4-hour shifts, no one over 8 hours, Alice only after noon, Bob not closing, and only the named staff. It includes the required Markdown coverage table, exactly three labeled risk-note rows, and a clear feasibility sentence under the word limit."
      },
      "C": {
        "correctness": 3,
        "reasoning": 3,
        "actionability": 4,
        "constraints": 3,
        "total": 3,
        "notes": "Schedules Bob from 16:00–20:00, extending beyond closing and effectively making Bob close, which violates the constraint. It provides only two risk notes instead of exactly three. The feasibility statement is therefore incorrect. It does use only named staff and has 4-hour shifts, but the schedule is not compliant."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only response that satisfies the staffing, shift-length, availability, formatting, and feasibility requirements. Responses A and C both incorrectly mark infeasible schedules as feasible; A uses a 2-hour closing shift for Bob, while C schedules Bob through closing and gives only two risk notes."
  }
}
```

