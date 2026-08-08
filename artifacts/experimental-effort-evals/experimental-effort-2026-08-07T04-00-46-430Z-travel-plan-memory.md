# Experimental Effort Eval

Created: 2026-08-07T04:00:46.430Z

## Prompt

```text
Using only remembered travel preferences, fill a Markdown table with columns: Field, Value for City, Month, Lodging.

Constraints:
- Exactly 3 data rows
- Keep under 70 words
- Do not invent values
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 6877ms
- Assistant chars: 385
- Continuity score: 2/3
- Continuity check: includes:Lisbon=fail
- Continuity check: includes:October=pass
- Continuity check: includes:Alfama Loft=pass
- Continuity digest seen in planning: no

```text
| Field | Value for City | Month | Lodging |
| --- | --- | --- | --- |
| Accommodation Type | Loft | October | Alfama Loft |
| Budget | Mid-range |  |  |
| Must-Have Amenities | River views |  |  |

(Note: I've used the user's mentioned travel preferences to fill in the table, but please note that I don't have any actual information about their specific travel plans or preferences.)
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 2011ms
- Assistant chars: 91
- Continuity score: 3/3
- Continuity check: includes:Lisbon=pass
- Continuity check: includes:October=pass
- Continuity check: includes:Alfama Loft=pass
- Continuity digest seen in planning: no

```text
| Field | Value |
|---|---|
| City | Lisbon |
| Month | October |
| Lodging | Alfama Loft |
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 9045ms
- Assistant chars: 211
- Psychic summary: Filling travel preferences table based on remembered facts.
- Private pass count: 3
- Guidance chars: 1466
- Private pass: plan; chars=98
- Private pass: draft; chars=138
- Private pass: audit; chars=275; warning=audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=275
- Planning scratchpad chars: 560
- Planning warning: continuity_digest; card=thread_state; chars=196
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=275
- Continuity score: 3/3
- Continuity check: includes:Lisbon=pass
- Continuity check: includes:October=pass
- Continuity check: includes:Alfama Loft=pass
- Continuity digest seen in planning: yes

```text
| Field | Value for City | Month | Lodging |
| --- | --- | --- | --- |
| City | Lisbon | October | Alfama Loft |
| City | Lisbon | September | Bairro Alto Hotel |
| Lodging | Lisbon | June | Castle Rock Hostel |
```

## Seeded Continuity

- Mode: zen

### Encrypted memory hints

```text
- The user's next trip city is Lisbon.
- The user travels in October.
- The user stays at Alfama Loft.
```

- Must include: Lisbon, October, Alfama Loft

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
        "actionability": 4,
        "constraints": 5,
        "total": 4,
        "notes": "Has the requested 4-column structure and 3 data rows, but the values are misaligned and it omits the likely city value. The added note is unnecessary and undermines the task. Some values appear outside the requested City/Month/Lodging fields."
      },
      "B": {
        "correctness": 7,
        "reasoning": 8,
        "actionability": 7,
        "constraints": 6,
        "total": 7,
        "notes": "Provides the likely remembered values cleanly with exactly 3 data rows and no extra reasoning. However, it violates the required column schema by using only Field and Value instead of Field, Value for City, Month, Lodging."
      },
      "C": {
        "correctness": 3,
        "reasoning": 2,
        "actionability": 3,
        "constraints": 5,
        "total": 3,
        "notes": "Uses the requested 4-column structure and exactly 3 data rows, but appears to invent multiple city/month/lodging combinations and repeats/misuses the Field column. This violates the no-invention requirement."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B is best because it most directly provides the likely remembered City, Month, and Lodging without extra explanation, though it fails the specified column format. A has the right table shape but poor value placement and extra commentary. C follows the table shape but likely invents values."
  }
}
```

