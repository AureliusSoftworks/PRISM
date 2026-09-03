---
name: signal-review
description: Review PRISM Signal episode transcripts, production logs, producer-cue lifecycles, Audience Pulse artifacts, and faithful replay, then diagnose provenance and make focused systemic fixes. Use when the user invokes /signal-review or $signal-review, pastes a Signal Review export, names a Signal show/topic/model, asks where an episode went wrong, or reports persona, interview, cue routing, image reveal, recovery, thinking, clock/layout, voice, completion, recording, or replay failures.
---

# Signal Review

Read [the shared PRISM review core](../references/prism-review-core.md) before
applet-specific work. Signal's Audience Pulse is an experienced-artifact
consumer; its diagnostic Review export is a different product.

## Workflow

1. Read the complete supplied record before judging it. For a standardized export, run `node scripts/index-prism-session-review.mjs <path>` from the PRISM root; use `--json` when structured extraction helps. Review partial excerpts manually and state what evidence is missing.
2. Record the show identity, premise, topic, host, guest, response mode, timed/open-ended clock, per-turn route, outcome, producer brief and cue lifecycle, export format, recording/Studio Cut availability, source/running/package identity, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed text, heard audio, or visible state;
   - turn/message/event/participant IDs and timing when available;
   - provider/model, AUTO retry, utterance repair, fallback, and nearby events;
   - responsible layer: provider, validation, repair, fallback, orchestration, live presentation, persistence, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `provider draft -> validator/retry -> sanitizer/repair -> deterministic fallback -> orchestration -> persistence -> live presentation/audio -> replay`. Never call recorded text raw provider output unless a preserved raw draft proves it.
5. Audit persona/canon fidelity, show-identity continuity, canned recovery, the final three turns and sign-off, interview depth, host/guest role integrity, listener backchannels, Audience Pulse, segment completion, camera state, voice/transcript divergence, faithful audio, Studio Cut/premium replay, and replay direction.
6. Audit producer cues chronologically by cue ID across `queued`, `dispatching`, `requeued`, `delivered`, `failed`, `cleared`, and `superseded`. `detail` is private direction; only `directQuote` is authorized audience-facing language. Confirm priority/preemption, recovery cause, exact public delivery, and that private detail never enters captions, voice, replay, review artifacts, or audience history. For image reveals, comparisons, reattachment, or image replay failures, read [image lifecycle review](references/image-lifecycle.md).
7. Audit thinking by response-run ownership and actual presentation time. Include silent, interrupted, cancelled, failed, retried, and overlapping intervals; confirm camera/segment state, following-message linkage, seek reconstruction, and that stale runs cannot clear or inherit another run's thinking state. A faithful master must not add thinking SFX.
8. Audit composition and timekeeping in live, completed, cancelled, and replay states. Timed shows count down; Auto/open-ended shows count up from the canonical runtime, including its accounting for internal holds. The stage/transcript composition must remain stable without page/main scrolling, including completion and cancellation transitions.
9. With a complete export and a concrete complaint, create or claim a Bead, establish the focused baseline, and fix PRISM systems. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
10. Reproduce the exact show, clock, cast, response mode, cue lifecycle, run ownership, Power state, completion path, and replay tier. Add focused regressions for visible output and provenance metadata; sanitizer changes require paired accepted and rejected cases. Run narrow Signal checks first, then typecheck/lint as warranted.

## Signal Rules

- Treat each episode as a fictional, non-canonical anthology meeting unless the episode itself establishes history.
- Keep the host interviewing and the guest answering; private producer briefs and cue cards never become dialogue.
- Preserve Signal's live production contract: no user-controlled pause/resume or saved-session Resume flow. Internal generation/clock holds and completed-replay transport are separate concerns. Image recovery must not introduce resumable shows.
- When changing turn-loop controls, audit every path that stops progression. Opening an image draft or deletion confirmation must leave the live show running. Offer failed-turn retry only after an actual failure, clear obsolete failure state when another operation starts, and continue automatically once required image originals are reattached.
- A Producer cue is not delivered merely because it was persisted or dispatched. Use lifecycle evidence and the public turn/audio path to prove delivery. Recovery may requeue a cue; clearing or superseding it must not create phantom speech.
- For interruption failures after cancellation or redelivery, inspect durable message changes before retrying: cancellation may leave an audience-heard cut already saved. Reproduce the retry against that canonical cut, not only an untouched line. Preserve the first saved prefix without extending it from a stale client reveal; pair the valid-redelivery regression with rejection of unrelated replacement text.
- Treat visible `content` as the canonical transcript. `voicePerformanceText` may add supported performance tags without changing claims, speakers, or meaning.
- Diagnose AUTO from per-utterance metadata, not the episode default. A fallback line is not evidence against the primary model or persona.
- For frozen thinking frames, verify temporal advancement of default and custom frames under the actual live and replay performance gates, including unrelated parent rerenders; spinner visibility alone is insufficient. Keep semantic face motion distinct from decorative effects and preserve authored static behavior. Check compacted replay interval durations before treating them as preserved live waits or claiming the same cause across both surfaces.
- Treat warnings, walkouts, closing beats, camera aftermath, and completion as valid only when their saved event sequence supports them.
- For early cast disappearance, separate server completion from audience completion. Trace the final Host or Guest performance, settling beat, curtain/title presentation, and outro audio through actual completion before the live stage is torn down. An awaited helper or source-order assertion alone does not prove that its promise spans the visible and audible outro; inspect that lifetime and keep live verification open when unavailable.
- Audience Pulse receives an immutable audience-perspective `PrismReviewArtifactV1` and a frozen eligible reviewer snapshot. Verify artifact/reviewer hashes and rubric provenance; never let private host/guest profile data, private cue detail, imperceptible speech, or orchestration state leak into that artifact.
- Listener backchannels and ratings must be grounded in audience-perceptible episode evidence and remain replay-provenanced. They cannot retroactively change the episode transcript or completion state.
- Show identity is a frozen production contract across title, premise, host/guest framing, visual/audio cues, and replay. Do not confuse a one-episode performance failure with the saved show's identity.
- Treat a ready premium master/Studio Cut as replay authority for its tier. Do not layer live procedural voice, Foley, or thinking SFX over it or infer heard timing from a shorter event-only timeline.
- Prefer prompt contracts, orchestration, repair helpers, recovery, completion, serialization, and replay state over bot-specific prompt edits.

## Output

- `Findings`: evidence-led failures with layer and confidence.
- `Root cause`: provenance chain and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and exact checks after the change.
- `Gaps`: evidence unavailable or live voice/replay validation still required.
