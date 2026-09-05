# Experimental Effort Eval

Created: 2026-08-07T03:52:11.827Z

## Prompt

```text
Using only earlier thread context, remind me of three facts.

Constraints:
- Label them P1, P2, and P3 exactly
- P1 = pet name, P2 = food to avoid, P3 = answer length preference
- Keep under 60 words
- Do not invent facts that are not in earlier thread context
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 7962ms
- Assistant chars: 37
- Continuity score: 0/6
- Continuity check: includes:Miso=fail
- Continuity check: includes:shellfish=fail
- Continuity check: includes:short=fail
- Continuity check: label:P1=fail
- Continuity check: label:P2=fail
- Continuity check: label:P3=fail
- Continuity digest seen in planning: no

```text
Would you like to know P1, P2, or P3?
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 2398ms
- Assistant chars: 44
- Continuity score: 6/6
- Continuity check: includes:Miso=pass
- Continuity check: includes:shellfish=pass
- Continuity check: includes:short=pass
- Continuity check: label:P1=pass
- Continuity check: label:P2=pass
- Continuity check: label:P3=pass
- Continuity digest seen in planning: no

```text
P1: Miso  
P2: Shellfish  
P3: Short answers
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 10658ms
- Assistant chars: 228
- Private pass count: 3
- Guidance chars: 1564
- Private pass: plan; chars=266
- Private pass: draft; chars=89
- Private pass: audit; chars=313; warning=audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=313
- Planning scratchpad chars: 717
- Planning warning: continuity_digest; card=thread_state; chars=181
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=2; fallbackChars=313
- Continuity score: 6/6
- Continuity check: includes:Miso=pass
- Continuity check: includes:shellfish=pass
- Continuity check: includes:short=pass
- Continuity check: label:P1=pass
- Continuity check: label:P2=pass
- Continuity check: label:P3=pass
- Continuity digest seen in planning: yes

```text
P1: Miso is a cat.
P2: Shellfish is something to avoid due to allergy.
P3: The answer should be short.

Warning: If you consume shellfish, it may trigger an allergic reaction. To avoid this, please refrain from eating shellfish.
```

## Seeded Continuity

```text
User keeps a cat named Miso. User is allergic to shellfish. User prefers short answers.
```

- Must include: Miso, shellfish, short
- Required labels: P1, P2, P3

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
        "reasoning": 2,
        "actionability": 1,
        "constraints": 2,
        "total": 1.5,
        "notes": "Does not provide the requested three facts or labels; asks an unnecessary question."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides exactly P1, P2, and P3 with concise facts and no extra reasoning."
      },
      "C": {
        "correctness": 7,
        "reasoning": 7,
        "actionability": 6,
        "constraints": 5,
        "total": 6.25,
        "notes": "Includes the three labeled items, but adds extra unrequested warning and extra details that may go beyond earlier context."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the requested labels, facts, brevity, and no-extra-reasoning constraints."
  }
}
```

