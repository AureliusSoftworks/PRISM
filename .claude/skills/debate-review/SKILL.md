---
name: debate-review
description: Review PRISM Forum Debate transcripts, saved sessions, event streams, ballots, and live presentation, then diagnose provenance and make focused systemic fixes; route Turnabout, Flyting, and Whodunnit records to their dedicated reviewers. Use whenever the user invokes /debate-review, pastes a Debate verbose transcript (headed "PRISM Debate Review — Verbose Transcript", or containing an Event stream, Jury Record, or Ballots and verdict section), supplies a Debate record without naming its format, names a Forum Duel, references developer or session notes from a debate, shares screenshots from a live session, or reports motion balance, advocacy consent, evidence, role/floor ownership, Powers, case-board, Jury, voice, transcript, verdict, pause/resume, frame-rate, or Assembly Chamber failures — even without the word "review".
---

# Debate Review

Read the shared PRISM review core at
`.claude/skills/references/prism-review-core.md` (PRISM root) before
applet-specific work. Jared runs live Debate sessions as test flights and hands
over the recording; the transcript is a bug report, a profiler trace, and a
directive list in one document.

## Format routing

Resolve the saved session's `format` before applying Forum rules:

- `forum` or legacy sessions without a format: continue with this skill.
- `turnabout`: use `/turnabout-review`.
- `flyting`: use `/flyting-review`.
- `whodunnit`, a mystery-trial bridge, Case Forge, mansion, or sealed-case
  evidence: use `/whodunnit-review`.

Do not blend verdict rules, cast shapes, evidence semantics, or replay contracts
across formats. Keep this skill as the compatibility entrypoint and Forum owner.

## What arrives

A verbose transcript exported from the Debate applet ("Copy verbose
transcript"). Its sections, in rough order: session metadata, developer notes,
Motion, Cast and frozen runtime, Advocacy consent, Frozen evidence, Resolved
Powers, the Event stream (numbered beats with speaker, step, timestamps, frame
rate, generation route, voice cue, and the full spoken text), the Turnabout
public exchange when present, the Living Case Board, the Jury Record
(timestamped juror comments), and Ballots and verdict. Screenshots sometimes
accompany it; treat them as additional evidence, not decoration.

## Workflow

1. Read the complete supplied record before judging it. If only screenshots or excerpts are available, review them and state which session, event, provider, or audio evidence is missing. Convert every developer and session note into a work item before anything else.
2. Record the motion and side briefs, player role and side, cast, consent outcomes, frozen evidence, provider/model snapshots, Power plan, Forum contract, conduct states, completion reason, Human Factor public reveal, export/app version, source/running/package identity, and whether the record predates the relevant current code.
3. Build an evidence ledger for every finding:
   - observed text, heard audio, or visible forum state;
   - session, revision, sequence, event, phase, speaker, side, and step key when available;
   - provider/model, retry/fallback, source markers, Power effects, Formality, Intellectual Pressure, public conduct incidents, compact strategy provenance, sequence gaps/lifecycle gaps, and nearby events;
   - responsible layer: synthesis, consent, evidence, provider, validation, Power resolution, difficulty policy, conduct reducer, Human Factor condition, orchestration, persistence, voice, case-board distillation, ballot, or presentation;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `frozen contract -> private performance condition -> provider draft -> validation/retry -> Power application -> conduct reducer -> public speech -> persistence -> voice/presentation -> case board -> ballot/verdict`. Never call visible text raw provider output without preserved draft evidence. Treat the private Human Factor seed and condition plan as diagnostic evidence only; never use them to justify a verdict.
5. Audit the debate on two separate axes:
   - **Proceeding quality:** balanced motion, side-brief fidelity, directness, responsiveness, evidence use, concessions, clarity, distinct arguments, fair moderation, pressure-appropriate strategic rigor, and persona-shaped imperfections that remain coherent.
   - **System integrity:** consent and Devil's Advocate disclosure, stable floor ownership, every player-role path, phase order, Pass, pause/resume, idempotency, source validation, post-Power public truth, deterministic conduct transitions, valid warnings/cutoffs/restored floors, earned withdrawal, ballot order, verdict rules, Human Factor redaction/reveal, event-sequence continuity, transcript/result continuity, and voice timing.
6. Audit the Human Factor separately:
   - confirm it changed at most one meaningful bot-controlled performance beat per side;
   - confirm Participant text, moderator neutrality, evidence, output budgets, providers/models, Powers, and ballots were untouched;
   - judge whether the public difference stayed subtle rather than becoming deliberate incompetence;
   - decide whether the public transcript supports the eventual verdict without hidden-state knowledge;
   - flag any live favored-side, seed, condition, numeric modifier, buff/debuff, or implied win-odds exposure as a privacy and fairness failure.
7. Audit conduct chronologically. A withdrawal is valid only after earned escalation and at least one earlier moderator warning; it ends advocacy as a procedural forfeit and skips ordinary ballots. Distinguish rhetorical heat from a server-recorded violation.
8. Audit the Jury as both a persisted decision and an experienced performance. Verify ballot order, voter identity, majority/moderator fields, public reasons, voice start/completion or interruption, and visible reveal order. A persisted ballot or result card is not proof the audience heard its reason.
9. Audit verbose exports for monotonic or explicitly accounted event sequences, lifecycle gaps, provider/model and retry/fallback provenance, Power adaptation, Human Factor redaction/reveal, and app/export version. Reserved or omitted sequences must be marked, not silently collapsed.
10. Treat persona, prompt, Powers, avatar, and voice as allowed Debate inputs. Flag any relationship-memory or learned-continuity read/write as a privacy failure.
11. Preserve LOCAL as zero egress. Do not recommend online research, provider escalation, or remote fallback for a LOCAL session.
12. With a complete record and a concrete complaint, create or claim a Bead, establish a focused baseline, and fix the responsible PRISM layer. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
13. Reproduce the reported Forum role, side, phase, floor, Power state, conduct state, Jury path, and presentation/replay conditions. Add focused regressions for public output and provenance metadata; `git diff --check` is always cheap. Verify per the core's verification posture and hand Jared the visual/audio checks for presentation changes.

## Reading the record

Checks that have paid off in past reviews, and why they work:

- **Powers vs. behavior.** The Resolved Powers section declares what each bot
  should be doing; the spoken text shows what it did. Check every speaker's
  lines against their Powers, and check each delivery path separately: a Power
  can work in deliberation but fail on final ballots because jury ballots,
  moderator rulings, objections, and floor speech are generated by different
  code paths that each need the Power applied. An asymmetry between two paths
  is a precise pointer to the broken one.
- **Frame-rate stamps.** Every event carries the FPS at presentation time, and
  the stamp is sampled before the stamped speaker speaks, so attribute a trough
  to the preceding beat. The shape of the sequence tells you which cost you are
  looking at:
  - Drops clustered on beat kinds (voiced speech, interrupts, but not quiet
    beats): per-tick rendering cost during playback. Look for a tick source
    hitting the root render boundary unthrottled.
  - Monotonic decay with event count (29 → 24 → 19 → 7 across a session) that
    recovers when the scene changes (jury chamber swap, session end): something
    in the departing scene's subtree accumulates per event. The recovery point
    names the leaking subtree; per-beat throttles will not help. Confirm by
    checking whether the same beat kind gets slower each time it recurs.
  - Readings at or above 60 are the display's refresh rate, not a bug.
- **Leaks.** Production instructions, JSON contracts, evidence-assignment
  blocks, or director copy appearing in public speech. The shared helpers in
  `packages/shared/src/debate.ts` (`debateSpeechLooksLikePromptLeak`) define
  what counts.
- **Timing.** Spoken durations vs. the announced limits. Overtime should be cut
  at limit plus grace (`DEBATE_FORUM_OVERTIME_CORRECTION_MIN_MS`), not merely
  scolded after a full overrun.
- **Empty or inconsistent records.** A completed session with an empty case
  board, missing ballots, a jury split that does not match the verdict line, or
  events out of phase order each point at the pipeline that should have
  written the missing piece.
- **Improvements.** Anything that would make the session smoother even though
  nothing failed: phase-handoff jank, copy quality, pacing, presentation
  polish. The standing bar is Jared's own: smooth from start to finish. Propose
  small ones inline; queue large ones as Beads.

## Debate Rules

- Judge rulings are final unless advocacy has already ended through a valid procedural forfeit; Participant and Spectator Duels use the three-bot majority. Do not infer a score that Debate does not store.
- A valid decline cannot be overridden. Devil's Advocate is willing advocacy with visible framing, not a refusal or identity mutation.
- Only frozen evidence may be cited after Start. Invalid source markers disappear, and valid chips do not enter spoken audio.
- Hard mute is canonical silence. Hidden, muted, or obfuscated content cannot influence the public case board or listener-facing ballot reasons.
- The public post-Power line is the Forum's evidence. Private intended content may explain provenance but must not enter the case board, Jury rationale, captions, voice, review export, or replay.
- Keep formal role, side, seat, and floor bound to stable bot IDs through identity effects and bounded reactions.
- Formality controls presentation and conduct; Intellectual Pressure controls rigor. Never excuse weak strategy as "casual presentation" or treat Crucible as permission to cheat.
- The Human Factor is session fiction and performance-only. It never weights ballots, selects a winner, fabricates evidence, creates misconduct by itself, or changes a real persona's canonical biography.
- Prefer prompt contracts, validation, orchestration, Power application, serialization, and presentation fixes over bot-specific prompt edits or rewriting a saved transcript.

## Where to look

- `apps/api/src/debate.ts` — session engine: generation, speech pipeline,
  Powers application, moderator logic, jury, lifecycle mutations.
- `apps/web/src/app/DebateExperience.tsx` — the entire live client:
  presentation loop, cameras, audio mixing, consent UI, jury chamber.
- `apps/web/src/app/debate*.ts` — one module per concern (gallery arrival,
  jury camera, revision recovery, participation). Check here before adding
  logic to DebateExperience; the concern usually already has a home.
- `packages/shared/src/debate.ts`, `packages/shared/src/botPower.ts` — shared
  types, invariants, Power transforms.
- `apps/web/src/app/DebateExperience.module.css` — all live-scene styling.
- `docs/debate-formats-turnabout-v1.md` — canonical format rules.

Architecture facts that repeatedly explain bugs:

- **Server truth vs. viewer truth.** Spectator sessions bake ahead: the
  server's `stepKey`/events can be far past what the viewer has watched. Any
  client logic that reads session state directly during presentation gaps
  (camera choice, resume position, progress gauges) will leak the future. The
  viewer's position lives in the presentation playhead and bookmarks.
- **The render-boundary split.** High-frequency presentation data flows
  through `presentationStore` to memoized consumers (captions, turn clock,
  active avatar); root React state should change only at beat boundaries,
  throttled by `DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS`. A frame-rate regression
  usually means some new tick source calls `updateLiveReveal` with an
  unthrottled render boundary.
- **Phase seams are where bugs live.** Bake → gallery arrival → start card →
  floor → verdict → archive return. When a symptom involves a flash, a wrong
  camera, a volume pop, or a wrong resume point, look at the handoff between
  two phases before suspecting either phase itself.

## Working rules

- You cannot see the app. Debate sits behind the login gate; reason from code,
  the transcript, and screenshots, and give Jared a precise list of what to
  look for after `npm run desktop` re-stages the runtime. For blind CSS work,
  name the single tunable knob so he can calibrate by eye.
- Shared-tree discipline, verification posture, Bead handling, and response
  scaling follow the core.

## Output

- `Findings`: evidence-led failures with layer and confidence, most severe first, leading with developer-note root causes.
- `Root cause`: provenance chain with `file:line` references and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and the exact checks run or deliberately not run after the change.
- `Gaps`: missing sequence/provenance evidence, source/build uncertainty, or live Jury voice/visual validation still required.
- `Tally`: fixed / queued / explained, plus any finding that contradicts one of Jared's notes.
