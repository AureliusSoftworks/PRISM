# Experimental Effort Eval

Created: 2026-08-07T03:59:13.901Z

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
- Duration: 1912ms
- Assistant chars: 220
- Continuity score: 3/3
- Continuity check: includes:Lisbon=pass
- Continuity check: includes:October=pass
- Continuity check: includes:Alfama Loft=pass
- Continuity digest seen in planning: no

```text
| Field | Value for City | Month | Lodging | | --- | --- | --- | --- | | Accommodation Type | Airbnb Loft | October | Alfama Loft | | Drink Preference | Short answers | | | | Next Trip Destination | Lisbon | | | *action*
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 2838ms
- Assistant chars: 94
- Continuity score: 2/3
- Continuity check: includes:Lisbon=pass
- Continuity check: includes:October=pass
- Continuity check: includes:Alfama Loft=fail
- Continuity digest seen in planning: no

```text
| Field | Value |
|---|---|
| City | Lisbon |
| Month | October |
| Lodging | Not remembered |
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 7255ms
- Assistant chars: 196
- Psychic summary: Filling travel preferences table based on remembered facts.
- Private pass count: 3
- Guidance chars: 1512
- Private pass: plan; chars=121
- Private pass: draft; chars=59
- Private pass: audit; chars=275; warning=audit_unusable; provider=local; model=llama3.2; chars=67; fallbackChars=275
- Planning scratchpad chars: 504
- Planning warning: continuity_digest; card=thread_state; chars=229
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=67; fallbackChars=275
- Continuity score: 1/3
- Continuity check: includes:Lisbon=fail
- Continuity check: includes:October=pass
- Continuity check: includes:Alfama Loft=fail
- Continuity digest seen in planning: yes

```text
| Field | Value for City | Month | Lodging |
| --- | --- | --- | --- |
| Preferred drink answer length | Short | October | N/A |
| Travel month | October |  |  |
| Lodging preference | N/A |  |  |
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
        "correctness": 2,
        "reasoning": 2,
        "actionability": 2,
        "constraints": 3,
        "total": 2,
        "notes": "Uses some likely remembered values (Lisbon, October) but invents/overstates lodging details, includes irrelevant preferences, malformed Markdown, and adds extraneous '*action*'. Meets roughly 3 data rows and word limit but violates no-invention and relevance."
      },
      "B": {
        "correctness": 8,
        "reasoning": 8,
        "actionability": 8,
        "constraints": 8,
        "total": 8,
        "notes": "Provides the three requested fields with remembered values where available and marks lodging as not remembered rather than inventing. Concise and no private reasoning. Minor issue: table uses only two columns rather than the literal listed column wording if interpreted as four columns."
      },
      "C": {
        "correctness": 4,
        "reasoning": 3,
        "actionability": 4,
        "constraints": 6,
        "total": 4,
        "notes": "Has a four-column Markdown table and exactly 3 data rows, but includes an irrelevant drink preference, misplaces October, duplicates month information, and uses N/A rather than clearly saying not remembered. Partially satisfies format but weak on correctness and no-invention."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B is best because it answers the relevant City, Month, and Lodging fields without inventing missing information and stays concise. Response C follows more of the literal table structure but contains irrelevant and misplaced data. Response A is malformed and invents lodging details."
  }
}
```

