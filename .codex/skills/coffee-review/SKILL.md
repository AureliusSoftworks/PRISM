---
name: coffee-review
description: Review PRISM Coffee transcripts, replay events, and faithful-replay direction, then diagnose provenance and make focused systemic fixes. Use when the user invokes /coffee-review or $coffee-review, pastes a Coffee Review export, names a Coffee topic/model, asks where a session went wrong, or reports persona, topic drift, action/speech, turn ownership, thinking, table-state, recording, or replay failures.
---

# Coffee Review

## Workflow

1. Read the complete supplied record before judging it. For a standardized export, run `node scripts/index-prism-session-review.mjs <path>` from the PRISM root; use `--json` when structured extraction helps. Review partial excerpts manually and state what evidence is missing.
2. Record the topic, group, roster, settings, per-turn routes, export format, recording availability, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed text, heard audio, or visible table state;
   - turn/message/event/participant IDs and timing when available;
   - provider/model, AUTO recovery, fallback, interruption, and nearby replay events;
   - responsible layer: provider, validation, repair, fallback, orchestration, live presentation, persistence, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `provider draft -> validator/retry -> sanitizer/repair -> deterministic fallback -> orchestration -> persistence -> live presentation/audio -> replay`. Never call recorded text raw provider output unless a preserved raw draft proves it.
5. Audit persona/canon fidelity, the opening topic anchor and rolling three-reply drift, addressee and floor ownership, polls/Powers, action versus speech, arrivals, moods, top-offs, sips, interruptions, departures, group state, faithful audio, and replay direction. Distinguish one weak line from table-wide drift.
6. Audit thinking when presentation actually starts and ends. Include silent, interrupted, cancelled, failed, and overlapping intervals; confirm seat/camera state, following-message linkage, seek reconstruction, and that master playback does not add thinking SFX.
7. With a complete export and a concrete complaint, create or claim a Bead, establish the focused baseline, and fix PRISM systems. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
8. Reproduce the exact reported session shape. Add focused regressions for visible output and provenance metadata; sanitizer changes require paired accepted and rejected cases. Run narrow Coffee checks first, then typecheck/lint as warranted.

## Coffee Rules

- Preserve 2–5 seated bots, a live off-camera player carrying the pot, player-only top-offs, and no active barista, waiter, or player mug. Faithful replay may seat Default Prism at the table with the pot docked to that seat.
- Treat the faithful audio master as replay authority. Do not reconstruct missing audio, generate video, or layer procedural voices/SFX over a master.
- Keep actions in action metadata or single-asterisk beats and spoken words as plain dialogue. A bot may not emit another speaker's label.
- Judge detours by whether they return to the topic's pressure point; generic table-wide advice is drift even if each line is individually grammatical.
- Prefer prompt contracts, speaker routing, repair helpers, fallback phrasing, table-state serialization, and replay state over bot-specific prompt edits.

## Output

- `Findings`: evidence-led failures with layer and confidence.
- `Root cause`: provenance chain and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and exact checks after the change.
- `Gaps`: evidence unavailable or live voice/replay validation still required.
