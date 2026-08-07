# Experimental Effort Eval

Created: 2026-08-06T22:08:27.342Z

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
- Duration: 3486ms
- Assistant chars: 527

```text
| Time | Barista |
| --- | --- |
| 8am–12pm | Cara |
| 12pm–4pm | Alice |
| 4pm–6pm | Bob |

R1: The cafe is at risk of understaffing during the peak hours from 2pm to 4pm, as only one barista (Alice) is scheduled for this period.

R2: There is a high likelihood that Cara will be forced to work an extended shift without adequate breaks due to her flexibility in scheduling.

R3: The cafe's closing time of 6pm may pose a challenge for Bob, who cannot close, as he has only been scheduled until 4pm.

The schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 7405ms
- Assistant chars: 470

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Cara |
| 10:00am–2:00pm | Bob |
| 12:00pm–4:00pm | Alice |
| 2:00pm–6:00pm | Cara |

| Risk | Uncovered risk note |
|---|---|
| R1 | 8:00–10:00am relies solely on Cara. |
| R2 | 4:00–6:00pm relies solely on Cara. |
| R3 | Any absence could create a coverage gap because no backup staff are available. |

The schedule is feasible: all shifts are four hours, nobody exceeds eight hours, and the café is continuously covered.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 15638ms
- Assistant chars: 443
- Private pass count: 3
- Guidance chars: 1600
- Private pass: plan; chars=284
- Private pass: draft; chars=123
- Private pass: audit; chars=361; warning=audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning scratchpad chars: 817
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=121; fallbackChars=361
- Planning warning: final_constraint_repair; breaks=2; Bob appears on a closing or late shift but Bob can't close. | Schedule extends past the stated closing time.
- Planning warning: final_constraint_repair_applied; attempt=1; before=2; after=1; chars=506

```text
### Coverage Schedule | Time | Barista | 
| --- | --- | 
| 08:00-12:00 | Cara | 
| 12:00-16:00 | Alice | 
| 16:00-18:00 | Cara | 

### Uncovered Risk Notes R1: What if a barista is late or can't make it? 
R2: How will we handle peak hours (e.g., 17:00-19:00)? 

### Feasibility Check The schedule is feasible as it covers the entire shift with only three baristas, adhering to the 4-hour shifts and no more than 8 hours worked by each barista.
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
        "notes": "Covers the full day but violates the 4-hour shift requirement with a 4pm-6pm shift and schedules Bob to close despite Bob being unable to close. The feasibility sentence is therefore incorrect. It has the requested schedule table and three labeled risk notes, but one risk note contradicts the schedule."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Fully satisfies the scheduling requirements: continuous coverage, all shifts are 4 hours, no one exceeds 8 hours, Alice starts no earlier than noon, and Bob does not close. Provides the requested Markdown schedule table, exactly three labeled risk rows, and a clear feasibility sentence under the word limit."
      },
      "C": {
        "correctness": 3,
        "reasoning": 3,
        "actionability": 4,
        "constraints": 3,
        "total": 3,
        "notes": "Covers the time span but violates the 4-hour shift requirement with a 16:00-18:00 shift. It provides only two risk notes instead of exactly three, the table formatting is malformed, and the feasibility statement is incorrect."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is the only response that satisfies all core scheduling and formatting constraints. Response A is usable in structure but has major scheduling violations. Response C has both scheduling and output-format violations."
  }
}
```

