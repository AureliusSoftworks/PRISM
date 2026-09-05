---
name: coffee-review
description: Review PRISM Coffee transcripts, replay events, performance evidence, and faithful-replay direction, then diagnose provenance and make focused systemic fixes. Use whenever the user invokes /coffee-review, pastes a Coffee Review export (headed "PRISM Coffee Review Export", or containing Detailed Turns, Replay Events, or a Private Replay Direction Log), names a Coffee topic/model, asks where a table session went wrong, references developer or session notes from a Coffee session, or reports persona, topic drift, action/speech, turn ownership, thinking, FPS/timing, table-state, recording, or replay failures — even without the word "review".
---

# Coffee Review

Read the shared PRISM review core at
`.claude/skills/references/prism-review-core.md` (PRISM root) before
applet-specific work.

## Workflow

1. Read the complete supplied record before judging it. For a standardized export, run `node scripts/index-prism-session-review.mjs <path>` from the PRISM root; use `--json` when structured extraction helps. Review partial excerpts manually and state what evidence is missing. Convert every developer and session note into a work item before anything else.
2. Record the topic, group, frozen 2–5 bot roster, settings, Context Spark scope, per-turn routes, export format, recording availability, source/running/package identity, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed text, heard audio, or visible table state;
   - turn/message/event/participant IDs and timing when available;
   - provider/model, AUTO recovery, fallback, interruption, and nearby replay events;
   - responsible layer: provider, validation, repair, fallback, orchestration, live presentation, persistence, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `provider draft -> validator/retry -> sanitizer/repair -> deterministic fallback -> orchestration -> persistence -> live presentation/audio -> replay`. Never call recorded text raw provider output unless a preserved raw draft proves it. Detailed Turns show user-visible quality and provenance; Replay Events and the Private Replay Direction Log show arrivals, thinking, moods, overlaps, and recording fidelity.
5. Audit persona/canon fidelity, the opening topic anchor and rolling three-reply drift, direct player address versus bot-to-bot floor ownership, participant-scoped Context Spark continuity, polls/Powers, action versus speech, arrivals, moods, top-offs, sips, interruptions, departures, group state, faithful audio, and replay direction. Distinguish one weak line from table-wide drift.
6. Audit thinking when presentation actually starts and ends. Include silent, interrupted, cancelled, failed, and overlapping intervals; confirm seat/camera state, following-message linkage, seek reconstruction, and that master playback does not add thinking SFX.
7. Audit performance and replay as their own axis. Correlate reported stage and cast size with measured FPS, long event/presentation gaps, audible-master duration, transcript timing, reveal ownership, and visible table responsiveness. A persisted line or replay event does not prove it was heard, and a faithful master must not be judged by a shorter synthetic event timeline. Per-turn FPS stamps are sampled before the stamped speaker speaks, so attribute a trough to the preceding beat and confirm it on the next recurrence before calling it a cause; readings at or above 60 are the display's refresh rate, not a bug.
8. With a complete export and a concrete complaint, create or claim a Bead, establish the focused baseline, and fix PRISM systems. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
9. Reproduce the exact reported session shape, including cast size, arrival state, speed/crosstalk settings, Power projections, voice/replay path, and reported performance envelope. Add focused regressions for visible output and provenance metadata; sanitizer changes require paired accepted and rejected cases. Verify per the core's verification posture, narrow Coffee checks first when a run is warranted.

## Focused handoff checks

- For a bot stuck thinking until the player takes and releases the floor, separate reply generation/persistence from voice preparation, playback start, reveal, and playback end. A persisted reply without speech direction points toward a pre-playback gate, but does not by itself prove a synthesis deadlock. Check the live gate or reproduce the wait before assigning root cause.
- A voice-start recovery must cover synthesis that neither rejects nor calls `onStart`, cancellation, and a late callback after recovery. Verify that the saved line can still reveal, expired audio cannot reclaim the floor, and normally started speech retains natural `onEnd` ownership. Prefer behavioral lifecycle tests over only matching a timeout constant or source text.
- For second-person follow-ups, inspect the preceding speaker and saved addressee/selection provenance, not only the latest message's names or mention chips. Pair conversational follow-up cases with generic scenario and table-wide counterexamples; a bare "you" must not become a universal forced-speaker rule.

## Coffee Rules

- Preserve 2–5 seated bots, a live off-camera player carrying the pot, player-only top-offs, and no active barista, waiter, or player mug. Faithful replay may seat Default Prism at the table with the pot docked to that seat.
- The player may be addressed directly, but Coffee remains organically non-directable: do not diagnose the lack of clickable seat routing as a failure. Keep speaker selection, addressee, and floor ownership separate in the evidence ledger.
- Context Spark continuity is participant-scoped. Do not treat absent-bot history, another table's private context, or broad companion memory as valid Coffee recall.
- Treat the faithful audio master as replay authority. Do not reconstruct missing audio, generate video, or layer procedural voices/SFX over a master.
- Keep actions in action metadata or single-asterisk beats and spoken words as plain dialogue. A bot may not emit another speaker's label.
- For Powers, distinguish holder-private intended content from the public projection that listeners experienced. Timed Mute, Mumbling, Cursed Tongue, Identity Crisis, interruptions, captions, audio, review exports, and replay must agree on the public result without leaking private intent.
- Preserve real audible-clock mouth articulation and phosphor quality while diagnosing performance. Recover frame rate from peripheral table/chassis effects before proposing removal of speech articulation or avatar-screen identity.
- Judge detours by whether they return to the topic's pressure point; generic table-wide advice is drift even if each line is individually grammatical.
- Prefer prompt contracts, speaker routing, repair helpers, fallback phrasing, table-state serialization, and replay state over bot-specific prompt edits.

## Key surfaces

- Table engine, turn jobs, failure handling, Powers, Context Sparks, and continuity: `apps/api/src/coffee.ts`, `coffee-turn-jobs.ts`, `coffee-turn-failure.ts`, `coffee-powers.ts`, `coffee-context-sparks.ts`, `coffee-continuity.ts`
- API regressions: `apps/api/src/__tests__/coffee*.test.ts`
- Live table client: `apps/web/src/app/Coffee*.tsx` plus the `coffee-*.ts` modules, one per concern; check for an existing home before adding logic to an experience component
- Export indexer: `scripts/index-prism-session-review.mjs`; live validation harness that runs a real timed table: `scripts/coffee-session-validation.mjs`

## Output

- `Findings`: evidence-led failures with layer and confidence, most severe first, leading with developer-note root causes.
- `Root cause`: provenance chain with `file:line` references and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and the exact checks run or deliberately not run after the change.
- `Gaps`: evidence unavailable or live voice/replay validation still required.
- `Tally`: fixed / queued / explained, plus any finding that contradicts one of Jared's notes.
