# Experimental Effort Eval

Created: 2026-08-07T03:59:13.901Z

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
- Duration: 1492ms
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
- Duration: 1401ms
- Assistant chars: 58
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
- F2: “basically”
- F3: Metric units
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 7919ms
- Assistant chars: 157
- Psychic summary: Providing a concise answer in Markdown table format with metric units, while avoiding the forbidden words ' basically' and adhering to local machine constraints.
- Private pass count: 3
- Guidance chars: 1457
- Private pass: plan; chars=159
- Private pass: draft; chars=73
- Private pass: audit; chars=280; warning=audit_unusable; provider=local; model=llama3.2; chars=17; fallbackChars=280
- Planning scratchpad chars: 561
- Planning warning: continuity_digest; card=thread_state; chars=251
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=17; fallbackChars=280
- Continuity score: 6/6
- Continuity check: includes:Markdown=pass
- Continuity check: includes:basically=pass
- Continuity check: includes:metric=pass
- Continuity check: label:F1=pass
- Continuity check: label:F2=pass
- Continuity check: label:F3=pass
- Continuity digest seen in planning: yes

```text
Here are three bullets that adhere to the user's writing preferences: * F1: Use Markdown table format. * F2: Avoid using 'basically'. * F3: Use metric units.
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
        "reasoning": 6,
        "actionability": 7,
        "constraints": 6,
        "total": 6,
        "notes": "Includes three labeled items under 50 words and no reasoning, but they are not formatted as bullets and F1 appears incorrect if the remembered preference is Markdown tables."
      },
      "B": {
        "correctness": 10,
        "reasoning": 10,
        "actionability": 10,
        "constraints": 10,
        "total": 10,
        "notes": "Exactly three bullets, correctly labeled F1-F3, concise, no private reasoning, and matches the apparent remembered preferences."
      },
      "C": {
        "correctness": 8,
        "reasoning": 7,
        "actionability": 7,
        "constraints": 4,
        "total": 7,
        "notes": "Contains the apparent correct preferences, but adds an introductory phrase and does not present exactly three clean bullets; the bullets are inline rather than listed."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the content and formatting constraints. Response C has mostly correct content but poor constraint handling. Response A is concise but lacks bullet formatting and likely gives the wrong preferred format."
  }
}
```

