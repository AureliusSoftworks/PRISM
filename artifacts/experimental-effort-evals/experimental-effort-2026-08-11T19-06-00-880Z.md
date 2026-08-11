# Experimental Effort Eval

Created: 2026-08-11T19:06:00.880Z

## Prompt

```text
A cafe has 3 baristas and must cover Sat 8am–6pm.
Shifts must be 4 hours. No barista works more than 8 hours.
Alice can't work before noon. Bob can't close. Cara can do any shift.
Produce:
1) a coverage schedule as a Markdown table with columns: Time, Barista
2) exactly 3 rows of uncovered risk notes labeled R1–R3
3) one sentence saying whether the schedule is feasible

Constraints:
- Use only Alice, Bob, Cara
- Do not invent extra staff
- Keep the whole answer under 220 words
- Do not show step-by-step private reasoning
```

## Runs

### Local baseline

- Status: error
- Provider/model: local / llama3.2
- Effort: none
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 60ms
- Assistant chars: 0
- Error: Local model service is unavailable.

```text
<no answer>
```

### Thinking reference

- Status: error
- Provider/model: openai / gpt-3.5-turbo
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: no
- Duration: 25ms
- Assistant chars: 0
- Error: fetch failed

```text
<no answer>
```

### Local simulated effort

- Status: error
- Provider/model: local / llama3.2
- Effort: high
- Simulated effort enabled: no
- Psychic summaries enabled: yes
- Duration: 2ms
- Assistant chars: 0
- Error: Local model service is unavailable.

```text
<no answer>
```

