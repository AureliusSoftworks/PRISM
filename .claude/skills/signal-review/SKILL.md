---
name: signal-review
description: Review PRISM Signal episode transcripts, production logs, producer-cue lifecycles, Audience Pulse artifacts, and faithful replay, then diagnose provenance and make focused systemic fixes. Use whenever the user invokes /signal-review, pastes a Signal review record (headed "PRISM Signal Review Transcript", or containing a Segment Record, Production Event Log, Faithful Recording Evidence, or Private Replay Direction Log), names a Signal show/topic/model, asks where an episode went wrong, references developer or session notes from an episode, shares screenshots from a live episode, or reports persona, interview, cue routing, image reveal, recovery, thinking, clock/layout, voice, completion, recording, replay, or Botcast failures — even without the word "review".
---

# Signal Review

Read the shared PRISM review core at
`.claude/skills/references/prism-review-core.md` (PRISM root) before
applet-specific work. Signal's Audience Pulse is an experienced-artifact
consumer; its diagnostic Review export is a different product.

Signal is the talk-show lane: a host bot interviews a guest bot across
`opening` → `interview` → `closing` segments while the user acts as producer and
can send cues mid-episode. The engine is `apps/api/src/botcast.ts` ("botcast"
is the internal name for the Signal lane; there is no `signal.ts` engine).

## What arrives

An export from the Signal applet. Sections, in order: Episode metadata (ids,
show premise, hosting style, private producer brief, response mode, runtime,
warmup holds, counts), Segment Record, Transcript (numbered turns with
timestamp, frame rate, segment, routing, repair state, provenance, stage
action, visible transcript, and voice performance text), Response cues,
Faithful Recording Evidence, the Production Event Log, the Private Replay
Direction Log, and Session notes. Screenshots sometimes accompany it; treat
them as additional evidence, not decoration.

Two sections carry most of the diagnostic weight and are easy to skim past:

- **Production Event Log** — what the engine *decided*: routing, utterances,
  power effects, listener reactions, camera suggestions, producer cues, session
  clock holds, provider generation traces.
- **Private Replay Direction Log** — what the recording *compiled*: actual
  speech start/end ms, channels, camera cuts, thinking ranges.

Reading one against the other is the highest-yield check in this document. A
thing planned in the first and missing from the second is a fidelity bug with
its own proof attached.

## Workflow

1. Read the complete supplied record before judging it. For a standardized export, run `node scripts/index-prism-session-review.mjs <path>` from the PRISM root; use `--json` when structured extraction helps. Review partial excerpts manually and state what evidence is missing. Convert every developer and session note into a work item before anything else; a note as terse as "Awkward silence." resolves to an exact gap once lined up against the event log.
2. Record the show identity, premise, topic, host, guest, response mode, timed/open-ended clock, per-turn route, outcome, producer brief and cue lifecycle, export format, recording/Studio Cut availability, source/running/package identity, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed text, heard audio, or visible state;
   - turn/message/event/participant IDs and timing when available;
   - provider/model, AUTO retry, utterance repair, fallback, and nearby events;
   - responsible layer: provider, validation, repair, fallback, orchestration, live presentation, persistence, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious output through `provider draft -> validator/retry -> sanitizer/repair -> deterministic fallback -> orchestration -> persistence -> live presentation/audio -> replay`. Never call recorded text raw provider output unless a preserved raw draft proves it.
5. Audit persona/canon fidelity, show-identity continuity, canned recovery, the final three turns and sign-off, interview depth, host/guest role integrity, listener backchannels, Audience Pulse, segment completion, camera state, voice/transcript divergence, faithful audio, Studio Cut/premium replay, and replay direction.
6. Audit producer cues chronologically by cue ID across `queued`, `dispatching`, `requeued`, `delivered`, `failed`, `cleared`, and `superseded`. `detail` is private direction; only `directQuote` is authorized audience-facing language. Confirm priority/preemption, recovery cause, exact public delivery, and that private detail never enters captions, voice, replay, review artifacts, or audience history. For image reveals, comparisons, reattachment, or image replay failures, read `.claude/skills/signal-review/references/image-lifecycle.md`.
7. Audit thinking by response-run ownership and actual presentation time. Include silent, interrupted, cancelled, failed, retried, and overlapping intervals; confirm camera/segment state, following-message linkage, seek reconstruction, and that stale runs cannot clear or inherit another run's thinking state. A faithful master must not add thinking SFX.
8. Audit composition and timekeeping in live, completed, cancelled, and replay states. Timed shows count down; Auto/open-ended shows count up from the canonical runtime, including its accounting for internal holds. The stage/transcript composition must remain stable without page/main scrolling, including completion and cancellation transitions.
9. With a complete export and a concrete complaint, create or claim a Bead, establish the focused baseline, and fix PRISM systems. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
10. Reproduce the exact show, clock, cast, response mode, cue lifecycle, run ownership, Power state, completion path, and replay tier. Add focused regressions for visible output and provenance metadata; sanitizer changes require paired accepted and rejected cases. Verify per the core's verification posture, narrow Signal checks first when a run is warranted.

## Reading the record

Checks that have paid off in past reviews, and why they work:

- **Provider generation traces.** A `provider_generation` event carries every
  attempt with `reason` and `clause`. The reason is the whole diagnosis:
  `invalid_output` / `empty` / `refusal` mean the model answered and a content
  contract rejected it; `provider_error` / `timeout` mean it never answered.
  Several different models failing with the same `clause` is never model
  flakiness. It is a validator bug, and the clause slug names the predicate.
  Read that predicate and run candidate drafts through it in a scratchpad probe
  before theorizing.
- **Validator vs. persona conflicts.** The most expensive bugs in this lane
  come from a contract written in standard English applied to a bot whose
  vernacular or accent pin makes it speak otherwise. When a predicate matches
  literal wording (thanks, greetings, farewells, name address, refusals), check
  it against the speaker's actual register elsewhere in the same transcript,
  not against neutral prose. A rule that only accepts the accent's absence will
  reject every faithful performance.
- **Powers vs. behavior.** The `powerSnapshot` in the first `segment` event
  declares each bot's compiled effects; the transcript shows what happened.
  Check each effect separately and each delivery path separately: opening,
  interview turns, producer-redirect turns, closing, and deterministic
  fallbacks are different code paths that each need the Power applied. An
  asymmetry between two paths points straight at the broken one. Also check
  the inverse: a Power that is `enabled` and `compileStatus: ready` but emits
  no `power_effect` events all episode did nothing, and nothing warned anyone.
- **Producer cue paths.** Cues differ by `kind` and `delivery`
  (`redirect_host`, `interrupt_guest`, `directQuote`, `detail`). Compare them
  against each other in the same episode; one carrying an
  `interruptionBridgeLine` and `interruptedSpeakerCue` while the other carries
  neither is a real gap. A `directQuote` is aired verbatim by design
  (`BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN`); do not file that as a leak.
- **Leaks.** Stage directions surviving into `Visible transcript` (especially
  asterisk-wrapped ones), production instructions, JSON, or director copy in
  public speech. Cue extraction leaves artifacts too: an orphaned space before
  punctuation means a cue was lifted out mid-sentence and the gap never closed.
- **Frame-rate stamps.** Every turn carries the FPS at presentation time, and
  the stamp is sampled before the stamped speaker speaks, so attribute a trough
  to the preceding beat. Readings at or above 60 are the display's refresh
  rate, not a bug. Look for shape: drops clustered on one beat kind mean
  per-tick cost in that path; a split by speaker (host turns at half the
  guest's rate) points at that speaker's rendering, such as a hidden or scaled
  avatar still being laid out. A trough around one event is not a cause until
  it reproduces on the next instance of that event in the same episode; if it
  does not, report it as a pattern to watch and nothing more.
- **Session clock holds vs. runtime.** Sum the `session_clock_hold` events and
  compare against recorded runtime. `foreground_generation` holds are real
  seconds the viewer sat through. A large ratio is a pacing finding even though
  nothing failed.
- **Empty or inconsistent records.** A completed episode with a segment
  containing no turns, a closing with no guest sign-off, a
  `presentationDurationMs` wildly out of line with its neighbours, or replay
  durations exceeding the recording length each point at the pipeline that
  should have written the missing piece.
- **Improvements.** Anything that would make the episode better even though
  nothing failed: camera framing, pacing, copy quality, cue wording, whether
  the private producer brief actually shaped the episode. The bar is smooth and
  entertaining from open to close. An episode where the guest abandons the
  premise a third of the way in has failed the Experience Principle even with a
  clean event log.

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
- Safety guardrails in compiled Powers stay exactly as written. Cues that forbid applying a trait to the player or to real people, or that bar slurs and real-world protected categories, are load-bearing; fixing a bit's staying power never means loosening them.
- Prefer prompt contracts, orchestration, repair helpers, recovery, completion, serialization, and replay state over bot-specific prompt edits.

## Where to look

- `apps/api/src/botcast.ts` — the Signal engine: prompt assembly, generation,
  sanitization and contract clauses, Powers, producer cues, segments, listener
  reactions, lifecycle. Nearly every fix lands here.
- `packages/shared/src/botcast.ts` — shared Signal types, cadence/timeline
  math, producer-quote composition, perception-overlap helpers.
- `packages/shared/src/replay.ts` — `compileReplayTimelineV1` and the direction
  log, where planned production becomes compiled replay.
- `packages/shared/src/voiceSpokenText.ts` — spoken-text and voice-performance
  extraction, where cue tags are lifted out of speech.
- `packages/shared/src/botPower.ts` — Power transforms, silence detection, name
  and address helpers.
- `apps/api/src/auto-fallback.ts` — `runAutoFallbackChain`, the retry ladder.
- `apps/web/src/app/BotcastExperience.tsx` — the live client.
- `apps/web/src/app/signal*.ts` — one module per concern (camera transition,
  live captions, voice fallback, thinking presentation, replay video frame,
  studio placement). Check here before adding logic to the experience
  component; the concern usually already has a home.
- `apps/web/src/app/signalReviewTranscript.ts` — defines the export you are
  reading. Useful when a field looks wrong or missing.
- `apps/web/src/app/botcast.module.css` — live scene styling.

Architecture facts that repeatedly explain bugs:

- **Validation rejection is not provider failure.** `runAutoFallbackChain`
  advances to the next provider on both, so one unsatisfiable contract clause
  costs the entire chain in wall-clock time before a deterministic fallback
  lands. When a turn took tens of seconds and ended in a canned line, look here
  first.
- **Deterministic fallbacks are vernacular-blind.** Canned host closings,
  recovery questions, and cue lines are fixed strings in neutral English. When
  one fires for a strongly accented persona, the seam is audible, so a fallback
  firing is a double failure: the beat it replaced and the voice it broke.
- **Two authorities can disagree.** Production emits `camera_suggestion` with a
  `reason`; the replay compiler makes its own cut. Same for planned overlaps vs
  compiled channels, and for the live timeline vs the faithful recording. When
  a symptom is a wrong shot, a stomped line, or a mistimed reaction, compare the
  two logs before suspecting either one.
- **Event kinds differ across lanes.** Coffee and Signal file some of the same
  concepts under different event shapes (Signal writes a `power_effect` whose
  `payload.effect` names the effect, where Coffee uses a top-level kind). Shared
  consumers that match on `kind` alone can be silently dead for one lane.
- **Segment seams are where bugs live.** opening → interview → closing, plus
  producer-cue interruptions and departures. When a symptom involves a
  truncated line, a missing sign-off, a wrong camera, or a dropped reaction,
  look at the handoff before suspecting either side of it.

## Working rules

- You cannot see the app. Signal sits behind the login gate; reason from code,
  the export, and screenshots, and give Jared a precise list of what to look
  for after `npm run desktop` re-stages the runtime.
- Shared-tree discipline, verification posture, Bead handling, and response
  scaling follow the core.

## Output

- `Findings`: evidence-led failures with layer and confidence, most severe first, leading with developer-note root causes.
- `Root cause`: provenance chain with `file:line` references and why adjacent layers are ruled out.
- `Fixes`: systemic app changes made, or focused recommendations in review-only mode.
- `Verification`: baseline and the exact checks run or deliberately not run after the change.
- `Gaps`: evidence unavailable or live voice/replay validation still required.
- `Tally`: fixed / queued / explained, plus any finding that contradicts one of Jared's notes.
