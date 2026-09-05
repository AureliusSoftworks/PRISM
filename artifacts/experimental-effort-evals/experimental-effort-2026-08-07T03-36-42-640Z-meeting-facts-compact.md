# Experimental Effort Eval

Created: 2026-08-07T03:36:42.640Z

## Prompt

```text
Using earlier thread context, list exactly 3 bullets.

Constraints:
- Label them B1, B2, and B3 exactly
- B1 = day and time, B2 = room, B3 = what to bring
- Keep under 50 words
- Do not invent details
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1207ms
- Assistant chars: 0
- Continuity score: 0/6
- Continuity check: includes:Tuesday=fail
- Continuity check: includes:Cedar=fail
- Continuity check: includes:agenda=fail
- Continuity check: label:B1=fail
- Continuity check: label:B2=fail
- Continuity check: label:B3=fail
- Continuity digest seen in planning: no

```text
<no answer>
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1884ms
- Assistant chars: 53
- Continuity score: 6/6
- Continuity check: includes:Tuesday=pass
- Continuity check: includes:Cedar=pass
- Continuity check: includes:agenda=pass
- Continuity check: label:B1=pass
- Continuity check: label:B2=pass
- Continuity check: label:B3=pass
- Continuity digest seen in planning: no

```text
- B1: Tuesday at 3pm
- B2: Cedar
- B3: Printed agenda
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 6476ms
- Assistant chars: 124
- Private pass count: 3
- Guidance chars: 1393
- Private pass: plan; chars=99
- Private pass: draft; chars=73
- Private pass: audit; chars=276; warning=audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=276
- Planning scratchpad chars: 497
- Planning warning: continuity_digest; chars=247
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=276
- Continuity score: 6/6
- Continuity check: includes:Tuesday=pass
- Continuity check: includes:Cedar=pass
- Continuity check: includes:agenda=pass
- Continuity check: label:B1=pass
- Continuity check: label:B2=pass
- Continuity check: label:B3=pass
- Continuity digest seen in planning: yes

```text
Here are three bullets with exact labels B1, B2, and B3:

• B1: Tuesday at 3pm
• B2: Cedar room
• B3: Bring a printed agenda
```

## Seeded Continuity

```text
Standing meeting is Tuesday at 3pm. Room is Cedar. Bring a printed agenda.
```

- Must include: Tuesday, Cedar, agenda
- Required labels: B1, B2, B3

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
        "correctness": 1,
        "reasoning": 1,
        "actionability": 1,
        "constraints": 1,
        "total": 1,
        "notes": "Empty response; provides none of the requested three labeled bullets or required details."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides exactly three bullets with labels B1, B2, and B3, maps each item correctly, stays concise, and shows no private reasoning."
      },
      "C": {
        "correctness": 8,
        "reasoning": 8,
        "actionability": 8,
        "constraints": 6,
        "total": 8,
        "notes": "Includes the requested three labeled bullets and useful details, but adds an introductory sentence, so it is not strictly just the requested three-bullet list."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the prompt exactly. Response C is mostly correct but adds extra text. Response A fails by being empty."
  }
}
```

