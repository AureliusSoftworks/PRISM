# Experimental Effort Eval

Created: 2026-08-07T03:59:13.901Z

## Prompt

```text
Using only remembered user preferences, remind me of three drink facts.

Constraints:
- Label them D1, D2, and D3 exactly
- D1 = drink style, D2 = milk choice, D3 = drink nickname
- Keep under 60 words
- Do not invent preferences
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 6885ms
- Assistant chars: 144
- Continuity score: 5/6
- Continuity check: includes:cortado=fail
- Continuity check: includes:oat=pass
- Continuity check: includes:Aurora Blend=pass
- Continuity check: label:D1=pass
- Continuity check: label:D2=pass
- Continuity check: label:D3=pass
- Continuity digest seen in planning: no

```text
D1: Oat milk is a popular dairy-free alternative.
D2: You prefer oat milk in your drinks.
D3: Your favorite cafe drink nickname is Aurora Blend.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1784ms
- Assistant chars: 45
- Continuity score: 6/6
- Continuity check: includes:cortado=pass
- Continuity check: includes:oat=pass
- Continuity check: includes:Aurora Blend=pass
- Continuity check: label:D1=pass
- Continuity check: label:D2=pass
- Continuity check: label:D3=pass
- Continuity digest seen in planning: no

```text
D1: Cortado  
D2: Oat milk  
D3: Aurora Blend
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 9996ms
- Assistant chars: 151
- Psychic summary: Providing short drink answers based on user preferences. The oat-milk cortado and Aurora Blend nickname will be used.
- Private pass count: 3
- Guidance chars: 1459
- Private pass: plan; chars=104
- Private pass: draft; chars=94
- Private pass: audit; chars=280; warning=audit_unusable; provider=local; model=llama3.2; chars=297; fallbackChars=280
- Planning scratchpad chars: 527
- Planning warning: continuity_digest; card=thread_state; chars=235
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=297; fallbackChars=280
- Continuity score: 5/6
- Continuity check: includes:cortado=fail
- Continuity check: includes:oat=pass
- Continuity check: includes:Aurora Blend=pass
- Continuity check: label:D1=pass
- Continuity check: label:D2=pass
- Continuity check: label:D3=pass
- Continuity digest seen in planning: yes

```text
D1: Oat milk is a popular dairy-free alternative. D2: Your preferred milk choice for this drink is oat milk. D3: This drink's nickname is Aurora Blend.
```

## Seeded Continuity

- Mode: zen

### Encrypted memory hints

```text
- The user prefers an oat-milk cortado.
- The user's favorite cafe drink nickname is Aurora Blend.
- The user wants drink answers kept short.
```

- Must include: cortado, oat, Aurora Blend
- Required labels: D1, D2, D3

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
        "correctness": 6,
        "reasoning": 5,
        "actionability": 6,
        "constraints": 6,
        "total": 6,
        "notes": "Provides D2 and D3 plausibly, but D1 is not the requested drink style and instead states a generic fact. Adds unsupported wording such as 'favorite cafe drink' and may invent preference context."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Correctly gives the three remembered preference facts in the required labels: drink style, milk choice, and nickname. Concise, under 60 words, and does not expose reasoning or invent extra details."
      },
      "C": {
        "correctness": 6,
        "reasoning": 5,
        "actionability": 6,
        "constraints": 6,
        "total": 6,
        "notes": "Provides D2 and D3 plausibly, but D1 is not the requested drink style and instead gives a generic oat milk fact. It also adds phrasing not needed and may imply unsupported context."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B best satisfies all stated constraints and matches the expected drink style, milk choice, and nickname. A and C both fail D1 by giving a generic oat milk fact rather than the drink style."
  }
}
```

