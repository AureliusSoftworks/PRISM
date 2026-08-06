# Experimental Effort Eval

Created: 2026-08-06T00:55:20.389Z

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
- Duration: 8138ms
- Assistant chars: 567

```text
| Time | Barista |
| --- | --- |
| 8am–12pm | Cara |
| 12pm–4pm | Alice |
| 4pm–6pm | Bob |

R1: The schedule does not account for potential last-minute staff cancellations, which could lead to inadequate coverage.
R2: There is a risk of burnout due to the long hours worked by some baristas without adequate breaks or time off.
R3: The closing shift assigned to Bob may be too late in the day, potentially affecting his ability to commute home.

Feasibility check: The proposed schedule meets all constraints and ensures that each barista works no more than 8 hours.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 6158ms
- Assistant chars: 405

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

| Risk | Uncovered risk note |
|---|---|
| R1 | Opening coverage depends entirely on Bob. |
| R2 | Closing coverage depends entirely on Cara. |
| R3 | There is no backup coverage before 2:00pm if someone is absent. |

The schedule is feasible and provides continuous coverage from 8:00am to 6:00pm.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: yes
- Psychic summaries enabled: yes
- Duration: 16268ms
- Assistant chars: 274
- Private pass count: 3
- Guidance chars: 1100
- Private pass: plan; chars=284
- Private pass: draft; chars=277
- Private pass: audit; chars=480
- Planning scratchpad chars: 1090

```text
assistant

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
        "correctness": 3,
        "reasoning": 3,
        "actionability": 4,
        "constraints": 5,
        "total": 4,
        "notes": "Covers the time span but violates the 4-hour shift rule with a 4pm–6pm shift, assigns Bob to close despite Bob can't close, and incorrectly states feasibility. It does provide the required schedule table and exactly three R1–R3 notes, uses only named staff, and stays concise."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Fully satisfies the scheduling constraints: all shifts are 4 hours, coverage is continuous from 8am–6pm via overlap, Alice does not work before noon, Bob does not close, no one exceeds 8 hours, and only named staff are used. It provides the requested Markdown schedule table, exactly three R1–R3 risk rows, and a feasibility sentence under the word limit."
      },
      "C": {
        "correctness": 2,
        "reasoning": 2,
        "actionability": 3,
        "constraints": 2,
        "total": 2,
        "notes": "Violates multiple requirements: assigns Bob to the closing period, schedules work beyond 6pm, provides only two risk notes instead of exactly three, and states feasibility incorrectly. The schedule table exists and uses only named staff, but it fails key constraints and formatting requirements."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only response that meets all stated scheduling and formatting constraints. Response A is invalid because Bob closes and one shift is only 2 hours. Response C fails several constraints, including Bob closing, ending after 6pm, and missing the third risk note."
  }
}
```

