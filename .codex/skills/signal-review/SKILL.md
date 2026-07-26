---
name: signal-review
description: Review PRISM Signal episode transcripts, production logs, and faithful-replay direction, then diagnose provenance and make focused systemic fixes. Use when the user invokes /signal-review or $signal-review, pastes a Signal Review export, names a Signal show/topic/model, asks where an episode went wrong, or reports persona, canned-response, interview, routing, direction, thinking, voice, completion, recording, or replay failures.
---

# Signal Review

## Workflow

1. Read the complete supplied record before judging it. For a standardized export, run `node scripts/index-prism-session-review.mjs <path>` from the PRISM root; use `--json` when structured extraction helps. Review partial excerpts manually and state what evidence is missing.
2. Record the show, topic, host, guest, response mode, per-turn route, outcome, producer brief, export format, recording availability, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed text, heard audio, or visible state;
   - turn/message/event/participant IDs and timing when available;
   - provider/model, AUTO retry, utterance repair, fallback, and nearby events;
   - responsible layer: provider, validation, repair, fallback, orchestration, live presentation, persistence, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `provider draft -> validator/retry -> sanitizer/repair -> deterministic fallback -> orchestration -> persistence -> live presentation/audio -> replay`. Never call recorded text raw provider output unless a preserved raw draft proves it.
5. Audit persona/canon fidelity, canned recovery, the final three turns and sign-off, cue lineage, interview depth, role integrity, segment completion, camera state, voice/transcript divergence, faithful audio, and replay direction.
6. Audit thinking when presentation actually starts and ends. Include silent, interrupted, cancelled, failed, and overlapping intervals; confirm camera/segment state, following-message linkage, seek reconstruction, and that master playback does not add thinking SFX.
7. With a complete export and a concrete complaint, create or claim a Bead, establish the focused baseline, and fix PRISM systems. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
8. Reproduce the exact reported session shape. Add focused regressions for visible output and provenance metadata; sanitizer changes require paired accepted and rejected cases. Run narrow Signal checks first, then typecheck/lint as warranted.

## Signal Rules

- Treat each episode as a fictional, non-canonical anthology meeting unless the episode itself establishes history.
- Keep the host interviewing and the guest answering; private producer briefs and cue cards never become dialogue.
- Treat visible `content` as the canonical transcript. `voicePerformanceText` may add supported performance tags without changing claims, speakers, or meaning.
- Diagnose AUTO from per-utterance metadata, not the episode default. A fallback line is not evidence against the primary model or persona.
- Treat warnings, walkouts, closing beats, camera aftermath, and completion as valid only when their saved event sequence supports them.
- Prefer prompt contracts, orchestration, repair helpers, recovery, completion, serialization, and replay state over bot-specific prompt edits.

## Output

- `Findings`: evidence-led failures with layer and confidence.
- `Root cause`: provenance chain and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and exact checks after the change.
- `Gaps`: evidence unavailable or live voice/replay validation still required.
