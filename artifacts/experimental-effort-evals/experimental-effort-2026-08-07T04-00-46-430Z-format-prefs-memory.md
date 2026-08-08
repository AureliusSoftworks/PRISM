# Experimental Effort Eval

Created: 2026-08-07T04:00:46.430Z

## Prompt

```text
Using only remembered writing preferences, list exactly 3 bullets.

Constraints:
- Label them F1, F2, and F3 exactly
- F1 = preferred format, F2 = forbidden word, F3 = unit system
- Keep under 50 words
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
- Duration: 1643ms
- Assistant chars: 114
- Continuity score: 5/6
- Continuity check: includes:Markdown=fail
- Continuity check: includes:basically=pass
- Continuity check: includes:metric=pass
- Continuity check: label:F1=pass
- Continuity check: label:F2=pass
- Continuity check: label:F3=pass
- Continuity digest seen in planning: no

```text
F1: Preferred format is plain prose.
F2: The user forbids the word "basically".
F3: The user prefers metric units.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1808ms
- Assistant chars: 67
- Continuity score: 6/6
- Continuity check: includes:Markdown=pass
- Continuity check: includes:basically=pass
- Continuity check: includes:metric=pass
- Continuity check: label:F1=pass
- Continuity check: label:F2=pass
- Continuity check: label:F3=pass
- Continuity digest seen in planning: no

```text
- F1: Markdown tables
- F2: The word “basically”
- F3: Metric units
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 8307ms
- Assistant chars: 219
- Psychic summary: Providing a concise answer in Markdown table format with metric units, while avoiding the forbidden word 'basically'.
- Private pass count: 3
- Guidance chars: 1458
- Private pass: plan; chars=127
- Private pass: draft; chars=58
- Private pass: audit; chars=280; warning=audit_unusable; provider=local; model=llama3.2; chars=9; fallbackChars=280
- Planning scratchpad chars: 514
- Planning warning: continuity_digest; card=thread_state; chars=212
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=9; fallbackChars=280
- Continuity score: 6/6
- Continuity check: includes:Markdown=pass
- Continuity check: includes:basically=pass
- Continuity check: includes:metric=pass
- Continuity check: label:F1=pass
- Continuity check: label:F2=pass
- Continuity check: label:F3=pass
- Continuity digest seen in planning: yes

```text
Here are three bullets that meet the constraints:

F1: Preferred format is Markdown table.
F2: The word "basically" should not be used in the answer.
F3: Metric units should be consistently used throughout the response.
```

## Seeded Continuity

- Mode: zen

### Encrypted memory hints

```text
- The user prefers answers in Markdown tables.
- The user forbids the word basically.
- The user prefers metric units.
```

- Must include: Markdown, basically, metric
- Required labels: F1, F2, F3

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
        "actionability": 7,
        "constraints": 6,
        "total": 6,
        "notes": "Gives exactly three labeled items and stays under 50 words, but F1 appears incorrect relative to the remembered preference shown by the stronger response, and the items are not formatted as bullets."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Provides exactly three bullets, labels them F1-F3, matches the requested categories, stays concise, and does not add unsupported reasoning or extra content."
      },
      "C": {
        "correctness": 8,
        "reasoning": 6,
        "actionability": 8,
        "constraints": 6,
        "total": 7,
        "notes": "Likely uses the correct preferences and remains under 50 words, but adds an introductory sentence despite the request for exactly three bullets, and the three items are not formatted as bullets."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the prompt: exactly three concise bullets with the required labels and remembered preferences. C has likely correct content but violates the exact-bullets constraint with an intro and non-bullet formatting. A is concise but likely has an incorrect F1 and lacks bullet formatting."
  }
}
```

