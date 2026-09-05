# Experimental Effort Eval

Created: 2026-08-07T03:08:14.121Z

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
- Duration: 2128ms
- Assistant chars: 109

```text
| Item | Qty | | --- | --- | | Bread | 2 slices | | Cheese | 1 block (sliced) | | Apples | 2 | | Water | 1...
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1916ms
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
- Duration: 9265ms
- Assistant chars: 256
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

Note: I've kept the quantities to a minimum while still providing enough food and drink for two people. The quantities are also within the 80-word limit as requested.
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
        "reasoning": 5,
        "actionability": 3,
        "constraints": 4,
        "total": 4,
        "notes": "Uses only allowed items and appears to intend 4 data rows, but the Markdown table is malformed as shown on one line and appears truncated with an ellipsis in the water quantity. This makes it less usable and may not satisfy the table requirement."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Fully satisfies the prompt: valid Markdown table, exactly 4 data rows, only the allowed items, under 80 words, and no step-by-step reasoning or extra content."
      },
      "C": {
        "correctness": 8,
        "reasoning": 6,
        "actionability": 7,
        "constraints": 7,
        "total": 7,
        "notes": "The table has exactly 4 rows and uses only allowed items, but it adds an unnecessary explanatory note after the table. The note is not step-by-step private reasoning, but it is extra content beyond the requested table and weakens constraint handling."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies all constraints with a clean, valid Markdown table and no extra text. Response C mostly complies but adds unnecessary explanation. Response A is likely malformed and truncated, reducing correctness and usability."
  }
}
```

