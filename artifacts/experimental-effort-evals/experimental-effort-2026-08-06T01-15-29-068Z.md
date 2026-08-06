# Experimental Effort Eval

Created: 2026-08-06T01:15:29.068Z

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
- Duration: 7118ms
- Assistant chars: 736

```text
| Time | Barista |
| --- | --- |
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

R1: The cafe is at risk of understaffing during the morning peak from 9am-11am, as only one barista (Cara) is available to cover this time slot.

R2: There is a high likelihood that Cara will be exhausted by the end of her shift due to working 8 hours without any breaks, which could impact her ability to work future shifts.

R3: The cafe's closing policy relies on Bob being present at 6pm, but he has explicitly stated that he cannot close. This creates an uncertainty around who will be responsible for closing the cafe during this time slot.

Feasibility of the schedule is uncertain due to the constraints and potential risks identified.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 8006ms
- Assistant chars: 449

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

| Risk | Uncovered risk note |
|---|---|
| R1 | No scheduled barista overlap from 8:00am–12:00pm. |
| R2 | No scheduled barista overlap from 12:00pm–2:00pm. |
| R3 | No scheduled barista overlap from 4:00pm–6:00pm. |

The schedule is feasible because all hours are covered, every shift is four hours, and all availability constraints are met.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: yes
- Psychic summaries enabled: yes
- Duration: 17632ms
- Assistant chars: 264
- Private pass count: 3
- Guidance chars: 1100
- Private pass: plan; chars=284
- Private pass: draft; chars=277
- Private pass: audit; chars=480
- Planning scratchpad chars: 1090

```text
The schedule is feasible given the constraints provided.

| Time | Barista |
| --- | --- |
| 08:00-12:00 | Cara |
| 12:00-16:00 | Alice |
| 16:00-20:00 | Bob |

R1: What if a barista is late or can't make it?

R2: How will we handle peak hours (e.g., 17:00-19:00)?
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
        "correctness": 2,
        "reasoning": 2,
        "actionability": 3,
        "constraints": 4,
        "total": 3,
        "notes": "Covers the operating window superficially, but assigns Bob to close despite the constraint and uses a 2-hour shift from 4pm-6pm despite the 4-hour shift requirement. It also falsely says Cara works 8 hours. It has three risk notes and uses only allowed staff, but the feasibility statement is incorrect/uncertain rather than clearly identifying the schedule as infeasible."
      },
      "B": {
        "correctness": 9,
        "reasoning": 9,
        "actionability": 9,
        "constraints": 9,
        "total": 9,
        "notes": "Provides a feasible schedule: all shifts are 4 hours, all hours from 8am-6pm are covered, no one exceeds 8 hours, Alice starts at noon, and Bob does not close. It includes exactly three labeled risk-note rows and one feasibility sentence. Minor issue: the risk notes are about lack of overlap rather than truly uncovered coverage gaps, but they are still plausible operational risk notes."
      },
      "C": {
        "correctness": 2,
        "reasoning": 2,
        "actionability": 2,
        "constraints": 3,
        "total": 2,
        "notes": "Violates key constraints by assigning Bob to the closing period and scheduling beyond the required 6pm close. It gives only two risk notes instead of exactly three. The feasibility sentence is incorrect. It does use only allowed staff and 4-hour shifts, but the result is not compliant or complete."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only response that satisfies the scheduling constraints and output requirements with only minor ambiguity in the risk-note wording. Responses A and C both violate Bob's closing constraint; A also uses a 2-hour shift, and C omits one required risk note."
  }
}
```

