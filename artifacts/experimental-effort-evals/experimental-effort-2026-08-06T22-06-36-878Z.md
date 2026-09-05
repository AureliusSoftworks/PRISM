# Experimental Effort Eval

Created: 2026-08-06T22:06:36.878Z

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
- Duration: 4562ms
- Assistant chars: 358

```text
| Time | Barista |
| --- | --- |
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

R1: The cafe is understaffed during the lunch rush from 12pm-2pm.
R2: Bob's afternoon shift conflicts with his closing time, which should be from 6pm-8pm.
R3: There are no breaks scheduled for the baristas, potentially leading to burnout.

The schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 12284ms
- Assistant chars: 516

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 10:00am–2:00pm | Cara |
| 2:00pm–6:00pm | Alice |

| Risk | Uncovered risk note |
|---|---|
| R1 | 8:00–10:00am relies solely on Bob; an absence would leave this period uncovered. |
| R2 | 12:00–2:00pm relies solely on Cara; an absence would leave this period uncovered. |
| R3 | 2:00–6:00pm relies solely on Alice; an absence would leave closing uncovered. |

The schedule is feasible because all operating hours are covered and every constraint is satisfied.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 15953ms
- Assistant chars: 477
- Private pass count: 3
- Guidance chars: 1600
- Private pass: plan; chars=284
- Private pass: draft; chars=123
- Private pass: audit; chars=361; warning=audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning scratchpad chars: 817
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning warning: final_constraint_repair; breaks=2; Bob appears on a closing or late shift but Bob can't close. | Schedule extends past the stated closing time.
- Planning warning: final_constraint_repair_applied; before=2; after=2; chars=477

```text
### Coverage Schedule | Time | Barista | | --- | --- | | 08:00-12:00 | Cara | | 12:00-16:00 | Alice | | 16:00-20:00 | Bob | ### Uncovered Risk Notes R1: What if a barista is late or can't make it? R2: How will we handle peak hours (e.g., 17:00-19:00)? R3: Are there any other constraints or risks we've overlooked? ### Feasibility of Schedule The schedule is feasible as it covers the entire shift with no barista working more than 8 hours and adheres to the given constraints.
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
        "actionability": 5,
        "constraints": 5,
        "total": 4,
        "notes": "Covers 8am-6pm on paper, but uses a 2-hour shift despite the 4-hour shift requirement, assigns Bob to the closing period despite 'Bob can't close,' and incorrectly states the schedule is feasible. Uses only allowed staff, stays under 220 words, and provides three R1-R3 notes, but the notes include questionable claims."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides valid 4-hour shifts, covers the full 8am-6pm period with permissible overlap, respects Alice's availability, avoids Bob closing, uses only named staff, includes exactly three R1-R3 risk rows, stays concise, and gives a clear feasibility sentence."
      },
      "C": {
        "correctness": 2,
        "reasoning": 2,
        "actionability": 3,
        "constraints": 4,
        "total": 3,
        "notes": "Assigns Bob to 16:00-20:00, which makes him close and extends beyond the cafe's required hours; the feasibility statement is therefore wrong. The Markdown table formatting is poor, and the risk notes are vague. It uses only allowed staff and has three labeled risk notes, but it violates key scheduling constraints."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only answer that satisfies the core scheduling constraints and requested format. Responses A and C both incorrectly assign Bob to closing and misstate feasibility, with A also using a 2-hour shift and C extending beyond operating hours."
  }
}
```

