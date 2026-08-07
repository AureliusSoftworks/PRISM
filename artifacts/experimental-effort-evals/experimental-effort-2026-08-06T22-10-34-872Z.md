# Experimental Effort Eval

Created: 2026-08-06T22:10:34.872Z

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
- Duration: 3058ms
- Assistant chars: 342

```text
| Time | Barista |
| --- | --- |
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

R1: The cafe is short-staffed during the lunch rush from 12pm-2pm.
R2: Bob's closing shift may conflict with his personal plans.
R3: The schedule does not account for potential last-minute staff calls or absences.

The coverage schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 5559ms
- Assistant chars: 461

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

| Risk | Uncovered risk note |
|---|---|
| R1 | No uncovered time from 8:00am to 6:00pm. |
| R2 | Noon handoff must occur promptly to maintain coverage. |
| R3 | No backup coverage is available if a barista is absent. |

The schedule is feasible because all shifts are four hours, all availability constraints are met, and no barista exceeds eight hours.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 17441ms
- Assistant chars: 355
- Private pass count: 3
- Guidance chars: 1600
- Private pass: plan; chars=284
- Private pass: draft; chars=123
- Private pass: audit; chars=361; warning=audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning scratchpad chars: 817
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning warning: final_constraint_repair; breaks=2; Bob appears on a closing or late shift but Bob can't close. | Schedule extends past the stated closing time.
- Planning warning: final_constraint_repair_rejected; attempt=1; reason=blocking_breaks_remain; before=2; after=1
- Planning warning: final_constraint_repair_rejected; attempt=2; reason=blocking_breaks_remain; before=2; after=1

```text
The coverage schedule is as follows:

| Time | Barista |
| --- | --- |
| 08:00-12:00 | Cara |
| 12:00-16:00 | Alice |
| 16:00-20:00 | Bob |

Uncovered risk notes:
R1: What if a barista is late or can't make it?
R2: How will we handle peak hours (e.g., 17:00-19:00)?
R3: Are there any other constraints or risks we've overlooked?

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
        "constraints": 4,
        "total": 3,
        "notes": "Covers the stated 8am-6pm span, but violates the 4-hour shift requirement with a 4pm-6pm shift and assigns Bob to closing despite 'Bob can't close.' The feasibility sentence is therefore incorrect. Uses only allowed staff and has three labeled risk notes, but the schedule is not valid."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides a valid continuous coverage schedule using 4-hour shifts, with Bob not closing, Alice not before noon, and no one over 8 hours. Uses only the named baristas, includes exactly three labeled risk-note rows, stays concise, and gives a correct feasibility sentence."
      },
      "C": {
        "correctness": 3,
        "reasoning": 3,
        "actionability": 3,
        "constraints": 4,
        "total": 3,
        "notes": "Uses 4-hour shifts but schedules Bob from 16:00-20:00, which both extends past the required 6pm closing time and has Bob closing, violating a key constraint. The feasibility sentence is incorrect. It uses only allowed staff and has three labeled notes, but the schedule is not valid."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only valid answer: it covers 8am-6pm with compliant 4-hour shifts, respects all availability constraints, and follows the formatting and brevity requirements. Responses A and C both incorrectly assign Bob to closing, and A also uses a 2-hour shift while C extends beyond closing."
  }
}
```

