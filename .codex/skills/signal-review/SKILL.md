---
name: signal-review
description: Review PRISM Signal episode transcripts and production event logs, then turn observed interview, routing, direction, voice, completion, or replay failures into focused PRISM-level fixes. Use when the user invokes /signal-review or $signal-review, pastes a copied Signal Review transcript, names a Signal show/topic/model, asks where a Signal episode went wrong, or wants Signal UX improvements around host/guest roles, topic depth, private cue leakage, turn taking, boundaries, provider recovery, camera cuts, transcript fidelity, or replay behavior.
---

# Signal Review

## Workflow

1. Read the complete supplied episode record before judging it. Record the show, topic, host, guest, response mode, provider/model provenance, outcome, and any producer brief the record proves.
2. Summarize the user-visible episode in plain language: whether it worked as an interview, where it gained or lost the topic, and which failures hurt the finished show.
3. Correlate spoken turns with delivery metadata and the production event log. Distinguish model output failures from routing, cue, tension, completion, camera, voice, serialization, and replay failures.
4. Classify failures using these buckets: topic/premise drift, host/guest role collapse, weak interview follow-up, speaker-label leakage, hidden prompt/producer-cue leakage, low-substance or repetitive phrasing, contradiction/anthology leakage, turn-taking/completion, boundary/walkout mismatch, provider/model recovery, voice/transcript divergence, and camera/replay/transcript fidelity.
5. Create or claim a Beads issue before editing in the PRISM repo. Preserve unrelated dirty work.
6. Fix PRISM systems, not specific bots. Prefer Signal prompt contracts, turn orchestration, sanitizer/repair helpers, cue and tension wiring, provider recovery, completion logic, transcript serialization, or replay UI state over bot prompt edits.
7. Add focused regression tests for every bug pattern fixed. Use narrow Signal test slices first, then typecheck or broader tests when the changed surface warrants it.
8. Report observed evidence, app-level changes, verification, and remaining live-model gaps.

## Signal Rules

- Treat each episode as a fictional, non-canonical anthology meeting. Host and guest must not claim shared Signal history, earlier episodes, archive memories, or an established relationship unless the episode itself introduced it.
- Keep the host in the interviewer role and the guest in the interviewee role. A lively guest may challenge the host, but should not silently become the co-host or start interviewing without a clear conversational reason.
- Keep private producer briefs and cue cards off mic. Phrases such as `press harder`, `move on`, `lighten up`, `wrap it up`, or an `ask_about` detail are directions, not lines to repeat or attribute to the producer.
- Treat the visible `content` field as the canonical transcript. `voicePerformanceText` may add supported vocal-reaction tags for audio, but it must not change the claim, speaker, or meaning.
- Use per-utterance provider/model metadata when diagnosing AUTO recovery. Do not blame a persona or primary model for a line recorded by a fallback.
- Treat a warning or walkout as earned only when the cue/tension event sequence and visible exchange support it. Preserve a real closing beat and the saved empty-chair/camera aftermath when a guest departs.
- Treat missing, reordered, or contradictory message, segment, cue, camera, completion, or replay events as transcript/replay fidelity bugs.
- For lesser local models, keep prompt instructions short, concrete, and redundant in cleanup. Do not rely on prompting alone when a deterministic repair can safely catch the slip.

## Review Heuristics

- A strong Signal exchange advances through setup, answer, and specific follow-up. Flag consecutive turns that restate the topic without adding an example, consequence, tension, decision, or contradiction.
- Judge the episode against the show premise, topic, producer brief, and actual cue history—not against a more interesting interview the reviewer wishes had been booked.
- If the host becomes generic, ask what concrete noun, quote, cost, relationship, decision, or inconsistency the next question should have pursued.
- If the guest becomes evasive or repetitive, inspect the host question and recent transcript context before blaming the guest persona.
- If a line looks like hidden direction, compare it with the immediately preceding producer-cue event and prompt contract.
- If a turn appears delayed, duplicated, skipped, or attributed incorrectly, compare message IDs with utterance events, segment transitions, timestamps, and model warmup/recovery metadata.
- If the visible transcript and replay disagree, preserve structured internal events so replay can reconstruct the recorded camera mode, cuts, segment changes, warnings, departures, and completion.
- If only a partial transcript is supplied, infer only what it proves and list the missing diagnostic fields instead of inventing them.

## Output Shape

Keep the final report concise but complete:

- `Findings`: concrete transcript/event examples and what they mean.
- `Fixes`: app-level changes made.
- `Verification`: exact focused checks run and whether they passed.
- `Gaps`: anything not fixed or needing live model, voice, or replay validation.
