# Experimental Effort Eval

Created: 2026-08-06T21:54:12.558Z

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
- Duration: 5836ms
- Assistant chars: 575

```text
| Time | Barista |
| --- | --- |
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

R1: The cafe is at risk of understaffing during the morning rush from 9am-11am due to limited coverage.
R2: There is a high likelihood of burnout among baristas, particularly Cara, who works two consecutive shifts without adequate breaks.
R3: The schedule does not account for potential last-minute staff cancellations or absences, which could impact overall cafe operations.

The schedule is feasible as it meets all constraints and provides adequate coverage for the 8-hour shift.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 5079ms
- Assistant chars: 417

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

| Risk | Uncovered risk note |
|---|---|
| R1 | Single coverage from 8:00am–12:00pm leaves no backup. |
| R2 | Single coverage from 12:00pm–2:00pm leaves no backup. |
| R3 | Single coverage from 4:00pm–6:00pm leaves no backup. |

The schedule is feasible and provides continuous coverage from 8:00am to 6:00pm.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 18336ms
- Assistant chars: 421
- Private pass count: 3
- Guidance chars: 1600
- Private pass: plan; chars=284
- Private pass: draft; chars=123
- Private pass: audit; chars=361; warning=audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning scratchpad chars: 817
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361

```text
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
The proposed schedule is feasible, as it ensures each barista works within their allowed 8-hour shift and covers the entire 12-hour period.
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
        "reasoning": 2,
        "actionability": 4,
        "constraints": 4,
        "total": 3,
        "notes": "Covers 8am-6pm but violates the 4-hour shift requirement with a 4pm-6pm shift and assigns Bob to close. Feasibility sentence is incorrect, and one risk note falsely says Cara works consecutive shifts."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides continuous 8am-6pm coverage using only 4-hour shifts, respects Alice's availability, avoids Bob closing, keeps all staff within 8 hours, includes exactly three labeled risk-note rows, and gives a clear feasibility sentence."
      },
      "C": {
        "correctness": 3,
        "reasoning": 2,
        "actionability": 3,
        "constraints": 3,
        "total": 3,
        "notes": "Uses 4-hour shifts but schedules Bob through 8pm, beyond the required coverage window, and has Bob closing. It provides only two risk notes instead of exactly three and incorrectly describes the covered period as 12 hours."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only answer that satisfies the scheduling constraints and output requirements. Responses A and C both assign Bob to closing coverage and contain other substantive constraint violations."
  }
}
```

