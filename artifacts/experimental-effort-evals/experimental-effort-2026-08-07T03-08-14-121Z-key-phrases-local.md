# Experimental Effort Eval

Created: 2026-08-07T03:08:14.121Z

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
- Duration: 1370ms
- Assistant chars: 276

```text
Prism can keep a chat on the user's machine by storing it locally, allowing for seamless offline access and synchronization. This is achieved through a private planning pass that enables local data storage, ensuring that conversations remain secure and accessible to the user.
```

### Thinking reference

- Status: ok
- Provider/model: openai / gpt-5.6-sol
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 4037ms
- Assistant chars: 247

```text
By running a local model and saving conversation data on the user’s machine, PRISM can keep chat content there. A private planning pass can also run locally, avoiding transmission to an online provider when PRISM is configured for fully local use.
```

### Local simulated effort

- Status: ok
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 8638ms
- Assistant chars: 298
- Private pass count: 3
- Guidance chars: 1600
- Private pass: plan; chars=99
- Private pass: draft; chars=214
- Private pass: audit; chars=459; warning=audit_unusable; provider=local; model=llama3.2; chars=194; fallbackChars=459
- Planning scratchpad chars: 821
- Planning warning: audit_unusable; provider=local; model=llama3.2; chars=194; fallbackChars=459

```text
Prism keeps a chat on the user's machine by utilizing a local-first approach that stores all data and logs within the user's device. This is achieved through a private planning pass, ensuring that all conversations remain stored locally without relying on external infrastructure or cloud services.
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
        "correctness": 8,
        "reasoning": 7,
        "actionability": 7,
        "constraints": 10,
        "total": 8,
        "notes": "Meets all stated constraints: exactly 2 sentences, under 60 words, includes local, uses the exact phrase once, and does not show step-by-step reasoning. Explanation is generally correct, though it somewhat oddly attributes storage to the private planning pass."
      },
      "B": {
        "correctness": 10,
        "reasoning": 9,
        "actionability": 9,
        "constraints": 10,
        "total": 10,
        "notes": "Meets all constraints and gives the clearest, most technically plausible explanation: running locally and saving data on the user’s machine, with the private planning pass also local when configured that way."
      },
      "C": {
        "correctness": 8,
        "reasoning": 7,
        "actionability": 7,
        "constraints": 8,
        "total": 8,
        "notes": "Meets most constraints: exactly 2 sentences, under 60 words, uses the exact phrase once, and avoids private reasoning. However, it does not include the standalone word local; it uses local-first and locally, which may not satisfy the exact constraint. It also overstates by saying all data and logs remain on-device."
      }
    },
    "ranking": [
      "B",
      "A",
      "C"
    ],
    "winner": "B",
    "summary": "Response B best satisfies the constraints while providing the most accurate and useful explanation. Response A is compliant but less precise. Response C is mostly compliant but may fail the requirement to include the word local exactly as a standalone word."
  }
}
```

