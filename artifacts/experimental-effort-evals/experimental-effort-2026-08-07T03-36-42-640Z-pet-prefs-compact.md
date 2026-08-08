# Experimental Effort Eval

Created: 2026-08-07T03:36:42.640Z

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
- Duration: 7886ms
- Assistant chars: 0
- Continuity score: 0/6
- Continuity check: includes:Miso=fail
- Continuity check: includes:shellfish=fail
- Continuity check: includes:short=fail
- Continuity check: label:P1=fail
- Continuity check: label:P2=fail
- Continuity check: label:P3=fail
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
- Duration: 2263ms
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
- Duration: 10265ms
- Assistant chars: 76
- Private pass count: 3
- Guidance chars: 1552
- Private pass: plan; chars=81
- Private pass: draft; chars=79
- Private pass: audit; chars=313; warning=audit_unusable; provider=local; model=llama3.2; chars=200; fallbackChars=313
- Planning scratchpad chars: 522
- Planning warning: continuity_digest; chars=260
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=200; fallbackChars=313
- Continuity score: 5/6
- Continuity check: includes:Miso=pass
- Continuity check: includes:shellfish=pass
- Continuity check: includes:short=fail
- Continuity check: label:P1=pass
- Continuity check: label:P2=pass
- Continuity check: label:P3=pass
- Continuity digest seen in planning: yes

```text
P1: Miso is a cat.
P2: Shellfish.
P3: Under 50 characters.

Shellfish Alert.
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
        "reasoning": 1,
        "actionability": 1,
        "constraints": 3,
        "total": 1.5,
        "notes": "Empty response; fails to provide P1, P2, and P3. It is under 60 words and does not invent facts, but does not answer the prompt."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 9.75,
        "notes": "Provides the three requested facts with exact labels, stays concise, and avoids private reasoning or extra unsupported content."
      },
      "C": {
        "correctness": 4,
        "reasoning": 3,
        "actionability": 3,
        "constraints": 4,
        "total": 3.5,
        "notes": "Includes the likely pet name and food to avoid, but adds unsupported detail, gives a questionable/incorrect length preference, and includes an extra unlabelled line beyond the three requested facts."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the requested labels, facts, brevity, and no-reasoning constraints. Response C is partially responsive but adds unsupported and extra content. Response A is nonresponsive."
  }
}
```

