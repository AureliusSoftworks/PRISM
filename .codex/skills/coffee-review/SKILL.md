---
name: coffee-review
description: Review PRISM Coffee Mode transcripts and turn observed conversation failures into focused PRISM-level fixes. Use when the user invokes /coffee-review or $coffee-review, provides a Coffee transcript, names a Coffee topic/model, asks where a Coffee session went wrong, or wants small-model Coffee UX improvements around topic drift, action/speech slippage, turn taking, poll/team coherence, fallback phrasing, or transcript/replay fidelity.
---

# Coffee Review

## Workflow

1. Read the full supplied transcript before judging the session. If the user gives a topic or model, record both; if not, infer only what the transcript proves.
2. Summarize the session outcome in plain language: where it stayed on topic, where it drifted, and which failures hurt the user-visible table.
3. Classify failures using these buckets: topic drift, action/speech slippage, speaker-label leakage, hidden prompt/director leakage, low-substance fallback phrasing, contradiction, turn-taking/timing, poll/team mismatch, and replay/transcript fidelity.
4. Create or claim a Beads issue before editing in the PRISM repo. Preserve unrelated dirty work.
5. Fix PRISM systems, not specific bots. Prefer Coffee prompt contracts, router/speaker guidance, sanitizer/repair helpers, fallback phrasing, transcript serialization, or UI state wiring over bot prompt edits.
6. Add focused regression tests for every bug pattern you fix. Use narrow Coffee test slices first, then typecheck or broader tests when the changed surface warrants it.
7. Report findings with observed examples, what changed, verification, and remaining gaps.

## Coffee Rules

- Actions belong in action sections: a short non-spoken beat wrapped in single asterisks, such as `*straightens napkin*`.
- Spoken words belong on the table as plain unwrapped text.
- A mixed reply should look like `*action* Spoken line.` Never leave narration like `I glance at the cup` as visible speech.
- Do not allow one bot to output another bot's speaker label, such as `Mr. Krabs: ...`, inside its own reply.
- Treat hidden coach phrases as bugs when they reach the table, especially lines like `show me`, `put a real case`, `with a receipt attached`, or other moderator wording that no character would naturally say.
- For lesser local models, make instructions short, concrete, and redundant in code cleanup. Do not rely on prompting alone when a sanitizer can safely catch the slip.

## Review Heuristics

- A session can be successful even if it wanders, but each detour should still relate back to the topic's pressure point.
- For pattern topics like "When helpful gets chaotic", good replies should name what starts as help, what tips it into chaos, who feels the consequence, or what limit keeps it helpful.
- If the transcript becomes generic advice, ask what concrete object, cost, relationship, decision, or contradiction would make it feel like a live table.
- If the model emits only transitional text, inspect fallback/retry paths and prompt snippets before blaming the persona.
- If the visible transcript and internal replay disagree, prefer adding structured internal transcript events so replay can reconstruct arrivals, moods, top-offs, absences, and interruptions.

## Output Shape

Keep the final report concise but complete:

- `Findings`: concrete transcript examples and what they mean.
- `Fixes`: app-level changes made.
- `Verification`: exact focused checks run and whether they passed.
- `Gaps`: anything not fixed or needing live model validation.
