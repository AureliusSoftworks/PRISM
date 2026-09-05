# Experimental Effort Eval

Created: 2026-08-06T00:41:32.802Z

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
- Duration: 8571ms
- Assistant chars: 489

```text
| Time | Barista |
| --- | --- |
| 8am–12pm | Cara |
| 12pm–4pm | Alice |
| 4pm–6pm | Bob |

R1: The cafe is at risk of understaffing during the morning rush from 8am-12pm due to limited coverage.
R2: There is a high likelihood of burnout among baristas, particularly Cara and Bob, who work extended hours without adequate breaks.
R3: The schedule does not account for potential absences or last-minute changes, leaving the cafe vulnerable to staffing shortages.

The schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 7889ms
- Assistant chars: 515

```text
### Coverage Schedule

| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

### Uncovered Risk Notes

| Risk | Note |
|---|---|
| R1 | No uncovered time; Cara overlaps with Alice from 2:00pm–4:00pm. |
| R2 | Coverage depends on Bob being available for the full opening shift. |
| R3 | Coverage depends on Cara completing the closing shift. |

The schedule is feasible because every hour is covered, all shifts are four hours, and no barista exceeds eight hours.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: yes
- Psychic summaries enabled: yes
- Duration: 60235ms
- Assistant chars: 9
- Private pass count: 3
- Guidance chars: 1100
- Private pass: plan; chars=284
- Private pass: draft; chars=277
- Private pass: audit; chars=480
- Planning scratchpad chars: 1090

```text
assistant
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
        "correctness": 4,
        "reasoning": 3,
        "actionability": 5,
        "constraints": 5,
        "total": 4,
        "notes": "Covers the full 8am–6pm span in appearance, but violates the 4-hour shift requirement with Bob scheduled only 2 hours, violates Bob can't close, and incorrectly states the schedule is feasible. Risk notes are labeled R1–R3 and word limit/staff constraints are mostly followed, but some notes are inaccurate."
      },
      "B": {
        "correctness": 9,
        "reasoning": 9,
        "actionability": 9,
        "constraints": 9,
        "total": 9,
        "notes": "Provides a valid feasible schedule: Bob 8–12, Alice 12–4, Cara 2–6 covers all hours; all shifts are 4 hours; no one exceeds 8 hours; Alice does not work before noon; Bob does not close. Includes exactly three labeled risk-note rows and a feasibility sentence. Minor issue: extra section headings and risk-note table format differ slightly from the requested simple output but do not materially violate constraints."
      },
      "C": {
        "correctness": 1,
        "reasoning": 1,
        "actionability": 1,
        "constraints": 1,
        "total": 1,
        "notes": "Does not provide a schedule, risk notes, feasibility sentence, or satisfy the requested format."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only response that satisfies the scheduling constraints and requested deliverables. Response A has invalid shift length and assigns Bob to closing while calling the schedule feasible. Response C is nonresponsive."
  }
}
```

