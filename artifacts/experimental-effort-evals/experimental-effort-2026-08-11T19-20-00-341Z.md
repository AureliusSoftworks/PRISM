# Experimental Effort Eval

Created: 2026-08-11T19:20:00.341Z

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

Temperature: 0.25
Max completion tokens per arm: 3200
Eval profile: paid same-model online simulation (gpt-3.5-turbo)
Paid multi-call acknowledged: yes
Private scratchpad content included: no

## Runs

### A — OpenAI ordinary single-call baseline

- Status: ok
- Provider/model: openai / gpt-3.5-turbo
- Effort: none
- Deep simulated ladder requested: no
- Psychic summaries enabled: no
- Call behavior: ordinary-single-visible-call
- Simulation provenance: simulated=false; passCount=0; verified=true
- Duration: 3217ms
- Assistant chars: 412

```text
| Time  | Barista |
|-------|---------|
| 8am-12pm | Cara    |
| 12pm-4pm | Alice   |
| 4pm-8pm  | Bob     |

**Uncovered Risk Notes:**
- R1: Shortage of a barista for the 8am-12pm shift.
- R2: Bob may need to cover the 4pm-8pm shift.
- R3: Potential gap in coverage between 12pm-4pm.

The schedule is feasible as it meets all constraints: Alice works after noon, Bob doesn't close, and Cara can cover any shift.
```

### B — OpenAI PRISM simulated High

- Status: ok
- Provider/model: openai / gpt-3.5-turbo
- Effort: high
- Deep simulated ladder requested: no
- Psychic summaries enabled: no
- Call behavior: private-pass-ladder-plus-visible-call
- Simulation provenance: simulated=true; passCount=2; verified=true
- Duration: 19977ms
- Assistant chars: 326
- Private pass count: 2
- Guidance chars: 1600
- Private pass: plan; chars=251
- Private pass: draft; chars=0; warning=draft_skipped_hard_constraints
- Private pass: audit; chars=361; warning=audit_unusable; provider=openai; model=gpt-3.5-turbo; chars=377; fallbackChars=361
- Planning scratchpad chars: 645
- Planning warning: draft_skipped_hard_constraints
- Planning warning: audit_unusable; provider=openai; model=gpt-3.5-turbo; chars=377; fallbackChars=361
- Planning warning: final_constraint_repair; breaks=2; Bob appears on a closing or late shift but Bob can't close. | A shift appears shorter than the required 4 hours.
- Planning warning: final_constraint_repair_rejected; attempt=1; reason=blocking_breaks_remain; before=2; after=2
- Planning warning: final_constraint_repair_rejected; attempt=2; reason=blocking_breaks_remain; before=2; after=1

```text
| Time | Barista |
|------|---------|
| 8am-12pm | Cara |
| 12pm-4pm | Alice |
| 4pm-6pm | Bob |

Risk Notes:
- R1: Bob may need to leave before closing time.
- R2: Alice's shift starts close to her earliest availability.
- R3: Bob's shift is near the end of the day.

The schedule is feasible within the constraints provided.
```

## Blind Judge

```json
{
  "model": "gpt-5.5",
  "responseMap": {
    "A": "online-single-call-baseline",
    "B": "online-simulated-high"
  },
  "result": {
    "scores": {
      "A": {
        "correctness": 2,
        "reasoning": 2,
        "actionability": 3,
        "constraints": 4,
        "total": 3,
        "notes": "Uses only allowed staff, has 4-hour shifts, and is under the word limit, but it schedules 4pm-8pm instead of covering only until 6pm, has Bob closing despite the constraint, and incorrectly claims feasibility. Risk notes conflict with the schedule."
      },
      "B": {
        "correctness": 3,
        "reasoning": 2,
        "actionability": 4,
        "constraints": 4,
        "total": 3,
        "notes": "Covers 8am-6pm using only allowed staff and stays concise, but the 4pm-6pm shift violates the 4-hour shift requirement and Bob is assigned the closing period despite not being allowed to close. The feasibility sentence is incorrect."
      }
    },
    "ranking": [
      "B",
      "A"
    ],
    "winner": "B",
    "summary": "Both responses violate key constraints and incorrectly state the schedule is feasible. B is slightly better because it covers exactly 8am-6pm, while A extends the schedule to 8pm and assigns Bob to close."
  }
}
```

