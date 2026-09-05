# Experimental Effort Eval

Created: 2026-08-07T02:59:06.153Z

## Prompt

```text
Make a Markdown table with columns: Item, Qty for a picnic for 2 people.

Constraints:
- Exactly 4 data rows
- Use only these items: bread, cheese, apples, water
- Do not invent extra items
- Keep under 80 words
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 3743ms
- Assistant chars: 205

```text
| Item | Qty |
| --- | --- |
| Bread | 1 |
| Cheese | 1/2 |
| Apples | 1 |
| Water | 1 |

Note: The quantity of cheese is assumed to be half a loaf or half a block, as the exact quantity was not specified.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1724ms
- Assistant chars: 137

```text
| Item   | Qty       |
|--------|-----------|
| bread  | 1 loaf    |
| cheese | 200 g     |
| apples | 2         |
| water  | 2 bottles |
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 8365ms
- Assistant chars: 197
- Private pass count: 3
- Guidance chars: 1540
- Private pass: plan; chars=183
- Private pass: draft; chars=88
- Private pass: audit; chars=339; warning=audit_unusable; provider=local; model=llama3.2; chars=164; fallbackChars=339
- Planning scratchpad chars: 659
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=164; fallbackChars=339

```text
| Item | Qty |
| --- | --- |
| Bread | 1 |
| Cheese | 1/2 |
| Apples | 1 |
| Water | 1 |

Note: The quantity of cheese is assumed to be half a loaf or half a block, as it's not specified otherwise.
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
        "correctness": 7,
        "reasoning": 5,
        "actionability": 6,
        "constraints": 6,
        "total": 6,
        "notes": "Has exactly 4 table rows and uses the requested item set, but adds an unnecessary note, uses vague quantities, and the note introduces unsupported assumptions."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Satisfies the requested Markdown table, exactly 4 data rows, only allowed items, practical quantities for 2 people, under 80 words, and no extra reasoning."
      },
      "C": {
        "correctness": 7,
        "reasoning": 5,
        "actionability": 6,
        "constraints": 6,
        "total": 6,
        "notes": "Same issues as A: correct row count and item set, but includes an unnecessary explanatory note and vague assumed quantities."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B best follows all constraints and provides a concise, usable picnic table. Responses A and C are acceptable tables but weakened by unnecessary notes and ambiguous quantities."
  }
}
```

