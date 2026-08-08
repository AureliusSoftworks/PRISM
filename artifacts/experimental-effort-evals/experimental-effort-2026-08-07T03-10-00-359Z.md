# Experimental Effort Eval

Created: 2026-08-07T03:10:00.359Z

## Prompt

```text
In exactly 2 sentences, explain how Prism can keep a chat on the user's machine.

Constraints:
- Include the word local
- Use the exact phrase private planning pass once
- Keep under 60 words
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: ok
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 1590ms
- Assistant chars: 332

```text
PRISM keeps a chat on the user's machine by storing data locally, allowing for seamless offline access and private planning passes that ensure sensitive information remains secure. This local-first approach enables users to maintain control over their conversations and data, while still benefiting from PRISM's AI-powered features.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 3516ms
- Assistant chars: 257

```text
Prism can keep a chat on the user’s machine by storing conversation data locally and using a local model when configured that way. A private planning pass can also run on-device, so prompts and intermediate processing need not be sent to an online provider.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 9969ms
- Assistant chars: 373
- Private pass count: 3
- Guidance chars: 1600
- Private pass: plan; chars=99
- Private pass: draft; chars=214
- Private pass: audit; chars=459; warning=audit_unusable; provider=local; model=llama3.2; chars=194; fallbackChars=459
- Planning scratchpad chars: 821
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=194; fallbackChars=459
- Planning warning: final_constraint_repair; breaks=2; Missing the required word local. | Required phrase private planning pass is misused as a storage container.
- Planning warning: final_constraint_repair_applied; attempt=1; before=2; after=0; chars=373

```text
Prism keeps a chat on the user's local machine by utilizing a local approach and incorporating a private planning pass as part of its on-device planning process, ensuring all information remains stored locally without relying on external infrastructure or cloud services. This secure approach allows for private conversation management within the user's own device storage.
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
        "correctness": 6,
        "reasoning": 6,
        "actionability": 5,
        "constraints": 5,
        "total": 6,
        "notes": "Two sentences and under 60 words, but it does not use the exact phrase \"private planning pass\" once; it uses the plural \"private planning passes.\" It also includes \"local\" only as part of \"local-first\" and otherwise uses \"locally,\" so it is weaker on the local-word constraint."
      },
      "B": {
        "correctness": 9,
        "reasoning": 9,
        "actionability": 8,
        "constraints": 10,
        "total": 9,
        "notes": "Satisfies all stated constraints: exactly 2 sentences, under 60 words, includes \"local,\" uses the exact phrase \"private planning pass\" once, and does not reveal step-by-step private reasoning. The explanation is accurate and clear."
      },
      "C": {
        "correctness": 8,
        "reasoning": 8,
        "actionability": 7,
        "constraints": 10,
        "total": 8,
        "notes": "Satisfies all stated constraints: exactly 2 sentences, under 60 words, includes \"local,\" uses the exact phrase \"private planning pass\" once, and avoids private reasoning. Slightly more absolute than necessary in claiming no external infrastructure or cloud services."
      }
    },
    "ranking": [
      "B",
      "C",
      "A"
    ],
    "winner": "B",
    "summary": "Response B is the best because it fully satisfies the formatting and phrase constraints while giving a clear, accurate explanation. Response C also satisfies the constraints but is somewhat overbroad. Response A fails the exact phrase requirement and is weaker on the required word constraint."
  }
}
```

