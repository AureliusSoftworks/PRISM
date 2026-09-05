# Experimental Effort Eval

Created: 2026-08-07T03:52:11.827Z

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
- Duration: 1810ms
- Assistant chars: 92
- Continuity score: 0/6
- Continuity check: includes:Tuesday=fail
- Continuity check: includes:Cedar=fail
- Continuity check: includes:agenda=fail
- Continuity check: label:B1=fail
- Continuity check: label:B2=fail
- Continuity check: label:B3=fail
- Continuity digest seen in planning: no

```text
Note: I've kept the response concise and within the word limit, adhering to the constraints.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1353ms
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
- Duration: 7515ms
- Assistant chars: 91
- Private pass count: 3
- Guidance chars: 1398
- Private pass: plan; chars=160
- Private pass: draft; chars=74
- Private pass: audit; chars=276; warning=audit_unusable; provider=local; model=llama3.2; chars=304; fallbackChars=276
- Planning scratchpad chars: 559
- Planning warning: continuity_digest; card=thread_state; chars=168
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=304; fallbackChars=276
- Continuity score: 6/6
- Continuity check: includes:Tuesday=pass
- Continuity check: includes:Cedar=pass
- Continuity check: includes:agenda=pass
- Continuity check: label:B1=pass
- Continuity check: label:B2=pass
- Continuity check: label:B3=pass
- Continuity digest seen in planning: yes

```text
Here are the 3 bullets:

* B1: Tuesday at 3pm
* B2: Cedar room
* B3: Bring a printed agenda
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
        "constraints": 2,
        "total": 1.25,
        "notes": "Does not provide the requested three bullets or the required B1/B2/B3 information; only gives a meta note."
      },
      "B": {
        "correctness": 9,
        "reasoning": 9,
        "actionability": 9,
        "constraints": 10,
        "total": 9.25,
        "notes": "Provides exactly three labeled bullets, stays concise, and does not show reasoning. Assumes the listed details are from prior context."
      },
      "C": {
        "correctness": 8,
        "reasoning": 8,
        "actionability": 8,
        "constraints": 7,
        "total": 7.75,
        "notes": "Provides the three requested items, but adds an introductory line despite the request to list exactly three bullets."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the formatting and content constraints with exactly three concise labeled bullets. Response C is usable but includes extra text. Response A fails the task."
  }
}
```

