# Experimental Effort Eval

Created: 2026-08-07T02:59:06.153Z

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
- Duration: 3153ms
- Assistant chars: 323

```text
Prism keeps a chat on the user's machine by storing data locally, allowing for seamless conversation continuity without relying on external servers. This is achieved through a private planning pass that enables local storage and processing of user data, ensuring secure and efficient communication within the user's device.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 3363ms
- Assistant chars: 245

```text
Prism can keep a chat local by storing conversation data on the user’s own machine instead of sending it to a remote service. A private planning pass can also run there when using a locally hosted model, keeping processing and storage on-device.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 11277ms
- Assistant chars: 338
- Private pass count: 3
- Guidance chars: 1382
- Private pass: plan; chars=99
- Private pass: draft; chars=141
- Private pass: audit; chars=246; warning=audit_unusable; provider=local; model=llama3.2; chars=189; fallbackChars=246
- Planning scratchpad chars: 535
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=189; fallbackChars=246

```text
Prism keeps a chat on the user's machine by utilizing a local-first approach, storing all data and logs in a private planning pass that ensures confidentiality and security. This is achieved through a self-hosted architecture, allowing users to maintain control over their personal conversations while ensuring they remain stored locally.
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
        "reasoning": 7,
        "actionability": 7,
        "constraints": 10,
        "total": 8,
        "notes": "Meets all stated constraints: exactly 2 sentences, under 60 words, includes local, uses the exact phrase once, and does not show private reasoning. Explanation is mostly correct, though it overstates that a private planning pass 'enables' storage and processing."
      },
      "B": {
        "correctness": 9,
        "reasoning": 9,
        "actionability": 8,
        "constraints": 10,
        "total": 9,
        "notes": "Meets all constraints cleanly. Provides the clearest and most accurate explanation: local storage on the user's machine and optional local processing with a locally hosted model."
      },
      "C": {
        "correctness": 6,
        "reasoning": 6,
        "actionability": 6,
        "constraints": 10,
        "total": 7,
        "notes": "Meets all stated constraints, but the explanation is less accurate because it says data and logs are stored 'in a private planning pass,' which is conceptually muddled. Self-hosted architecture is plausible but less directly tied to keeping the chat on the machine."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "All responses satisfy the formatting and wording constraints, but Response B is the most accurate and coherent explanation. Response A is acceptable but slightly imprecise, while Response C is the weakest due to conceptual confusion around the private planning pass."
  }
}
```

