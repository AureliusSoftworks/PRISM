# Experimental Effort Eval

Created: 2026-08-06T22:12:58.954Z

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
- Duration: 3491ms
- Assistant chars: 520

```text
| Time | Barista |
| --- | --- |
| 8am–12pm | Cara |
| 12pm–4pm | Alice |
| 4pm–6pm | Bob |

R1: The cafe is at risk of understaffing during the morning rush from 8am to 10am due to limited coverage.
R2: There is a high likelihood of burnout among baristas, particularly Cara and Alice, who work consecutive shifts without adequate breaks.
R3: The schedule does not account for potential last-minute staff cancellations or absences, which could impact the cafe's ability to stay fully staffed.

The schedule is feasible.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 8381ms
- Assistant chars: 463

```text
| Time | Barista |
|---|---|
| 8:00am–12:00pm | Bob |
| 10:00am–2:00pm | Cara |
| 2:00pm–6:00pm | Alice |

| Risk | Uncovered risk note |
|---|---|
| R1 | No scheduled gap; coverage overlaps from 10:00am–12:00pm. |
| R2 | A Bob call-out could leave 8:00am–10:00am uncovered. |
| R3 | An Alice call-out could leave 2:00pm–6:00pm uncovered. |

The schedule is feasible because every shift is four hours, the full day is covered, and all availability limits are met.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 16376ms
- Assistant chars: 110
- Private pass count: 2
- Guidance chars: 1600
- Private pass: plan; chars=284
- Private pass: draft; chars=0; warning=draft_skipped_hard_constraints
- Private pass: audit; chars=361; warning=audit_unusable; provider=local; model=llama3.2; chars=289; fallbackChars=361
- Planning scratchpad chars: 678
- Planning warning: draft_skipped_hard_constraints
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=289; fallbackChars=361
- Planning warning: final_constraint_repair; breaks=2; Bob appears on a closing or late shift but Bob can't close. | Schedule extends past the stated closing time.
- Planning warning: final_constraint_repair_rejected; attempt=1; reason=blocking_breaks_remain; before=2; after=1
- Planning warning: final_constraint_repair_rejected; attempt=2; reason=blocking_breaks_remain; before=2; after=1

```text
| Time | Barista | | --- | --- | | 08:00-12:00 | Cara | | 12:00-16:00 | Alice | | 16:00-20:00 | Bob | R1: W...
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
        "reasoning": 4,
        "actionability": 5,
        "constraints": 5,
        "total": 4,
        "notes": "Covers 8am–6pm continuously, but the 4pm–6pm shift is only 2 hours and Bob is assigned to close despite the constraint. The feasibility statement is therefore incorrect. It uses only allowed staff, stays concise, and includes three R1–R3 notes."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "All shifts are 4 hours, coverage spans 8am–6pm, Alice starts after noon, Bob does not close, no one exceeds 8 hours, and only allowed staff are used. It provides the required Markdown schedule table, exactly three R1–R3 risk rows, and a feasibility sentence under the word limit."
      },
      "C": {
        "correctness": 1,
        "reasoning": 1,
        "actionability": 1,
        "constraints": 1,
        "total": 1,
        "notes": "The response is truncated and malformed, does not provide the required complete Markdown table, assigns Bob to a closing/after-close shift, extends beyond 6pm, and fails to provide exactly three complete R1–R3 risk notes or a feasibility sentence."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the scheduling requirements and formatting constraints. Response A has major scheduling violations. Response C is incomplete and largely noncompliant."
  }
}
```

