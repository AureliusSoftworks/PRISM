---
name: signal-review
description: Review a PRISM Signal episode transcript and implement the fixes it calls for. Use whenever the user pastes a Signal review record (headed "PRISM Signal Review Transcript", or containing a Segment Record, Production Event Log, Faithful Recording Evidence, or Private Replay Direction Log), asks to review a Signal episode or a show, references developer notes or session notes from an episode, or shares a Signal export and asks what went wrong or what to fix — even without the word "review". Also use when the user reports Signal or Botcast bugs alongside a transcript or screenshots from a live episode.
---

# Signal Review

The user records live Signal episodes as test flights, then hands over the
recording. Your job is to mine it for everything actionable and ship the fixes
— the export is a bug report, a profiler trace, and a directive list in one
document.

Signal is the talk-show lane: a host bot interviews a guest bot across
`opening` → `interview` → `closing` segments, while the user acts as the
producer and can send cues mid-episode. The engine is `apps/api/src/botcast.ts`
("botcast" is the internal name for the Signal lane — do not go looking for a
`signal.ts` engine).

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

**Reading one against the other is the highest-yield check in this document.**
A thing planned in the first and missing from the second is a fidelity bug with
its own proof attached.

## Triage, in priority order

**1. Session and developer notes are direct orders.** They appear as
`> **Developer note · <timestamp> · <N FPS>**` blockquotes inline in the
transcript and again under `## Session notes`. Each is a bug report the user
typed *mid-episode while watching the failure happen* — the timestamp tells you
which beat was on screen, so always locate the surrounding events before
interpreting the words. A note as terse as "Awkward silence." resolves to an
exact 36-second gap once you line it up against the event log. Convert every
note into a work item: fix it, queue it with a diagnosis attached, or say
explicitly why it's wrong. None may be silently dropped.

**2. Bugs the record reveals on its own.** Read the event log the way you'd
read a failing test's output — the episode *is* the test.

- **Provider generation traces.** A `provider_generation` event carries every
  attempt with `reason` and `clause`. The reason is the whole diagnosis:
  `invalid_output` / `empty` / `refusal` mean the model answered and a *content
  contract* rejected it; `provider_error` / `timeout` mean it never answered.
  **Several different models failing with the same `clause` is never model
  flakiness — it is a validator bug, and the clause slug names the predicate.**
  Read that predicate and run candidate drafts through it in a scratchpad probe
  before theorizing; the failing input is usually obvious once you see which
  branch rejects it.
- **Validator vs. persona conflicts.** The most expensive bugs in this lane
  come from a contract written in standard English being applied to a bot whose
  vernacular or accent pin makes it speak otherwise. When a predicate matches
  literal wording (thanks, greetings, farewells, name address, refusals), check
  it against the *speaker's actual register* as seen elsewhere in the same
  transcript, not against neutral prose. A rule that only accepts the accent's
  absence will reject every faithful performance.
- **Powers vs. behavior.** The `powerSnapshot` in the first `segment` event
  declares each bot's compiled effects; the transcript shows what happened.
  Check each effect separately and check each *delivery path* separately —
  opening, interview turns, producer-redirect turns, closing, and deterministic
  fallbacks are different code paths that each need the Power applied. An
  asymmetry between two paths points straight at the broken one. Also check the
  inverse: a Power that is `enabled` and `compileStatus: ready` but emits *no*
  `power_effect` events all episode did nothing, and nothing warned anyone.
- **Producer cue paths.** Cues differ by `kind` and `delivery`
  (`redirect_host`, `interrupt_guest`, `directQuote`, `detail`). Compare them
  against each other in the same episode — one carrying an
  `interruptionBridgeLine` and `interruptedSpeakerCue` while the other carries
  neither is a real gap. Note that a `directQuote` is aired verbatim by design
  (`BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN`); do not file that as a leak.
- **Leaks.** Stage directions surviving into `Visible transcript` (especially
  asterisk-wrapped ones), production instructions, JSON, or director copy in
  public speech. Cue-extraction leaves artifacts too — an orphaned space before
  punctuation means a cue was lifted out mid-sentence and the gap never closed.
- **Frame-rate stamps.** Every turn carries the FPS at presentation time.
  Readings at or above 60 are the display's refresh rate, not a bug. Look for
  *shape*: drops clustered on one beat kind mean per-tick cost in that path; a
  split by speaker (e.g. host turns half the guest's rate) points at something
  about that speaker's rendering, such as a hidden or scaled avatar still being
  laid out. **Discipline: a trough around one event is not a cause until it
  reproduces on the next instance of that event in the same episode.** Check,
  and if it does not reproduce, report it as a pattern to watch and nothing
  more.
- **Session clock holds vs. runtime.** Sum the `session_clock_hold` events and
  compare against recorded runtime. `foreground_generation` holds are real
  seconds the viewer sat through. A large ratio is a pacing finding even though
  nothing "failed".
- **Empty or inconsistent records.** A completed episode with a segment
  containing no turns, a closing with no guest sign-off, a `presentationDurationMs`
  wildly out of line with its neighbours, or replay durations exceeding the
  recording length — each points at the pipeline that should have written the
  missing piece.

**3. Improvements.** Anything that would make the episode better even though
nothing failed: camera framing, pacing, copy quality, cue wording, whether the
private producer brief actually shaped the episode. The standing bar is the
user's own: smooth and *entertaining* from open to close. An episode where the
guest abandons the premise a third of the way in has failed the Experience
Principle even with a clean event log.

## Where to look

- `apps/api/src/botcast.ts` (~17k lines) — the Signal engine: prompt assembly,
  generation, sanitization and contract clauses, Powers, producer cues,
  segments, listener reactions, lifecycle. Nearly every fix lands here.
- `packages/shared/src/botcast.ts` — shared Signal types, cadence/timeline
  math, producer-quote composition, perception-overlap helpers.
- `packages/shared/src/replay.ts` — `compileReplayTimelineV1` and the direction
  log. Where planned production becomes compiled replay.
- `packages/shared/src/voiceSpokenText.ts` — spoken-text and voice-performance
  extraction; where cue tags are lifted out of speech.
- `packages/shared/src/botPower.ts` — Power transforms, silence detection, name
  and address helpers.
- `apps/api/src/auto-fallback.ts` — `runAutoFallbackChain`, the retry ladder.
- `apps/web/src/app/BotcastExperience.tsx` (~16k lines) — the live client.
- `apps/web/src/app/signal*.ts` — one module per concern (camera transition,
  live captions, voice fallback, thinking presentation, replay video frame,
  studio placement, …). Check here before adding logic to the experience
  component; the concern usually already has a home.
- `apps/web/src/app/signalReviewTranscript.ts` — defines the export you are
  reading. Useful when a field looks wrong or missing.
- `apps/web/src/app/botcast.module.css` — live scene styling.

Architecture facts that repeatedly explain bugs:

- **Validation rejection ≠ provider failure.** `runAutoFallbackChain` advances
  to the next provider on both, so one unsatisfiable contract clause costs the
  entire chain in wall-clock time before a deterministic fallback lands. When a
  turn took tens of seconds and ended in a canned line, look here first.
- **Deterministic fallbacks are vernacular-blind.** Canned host closings,
  recovery questions, and cue lines are fixed strings written in neutral
  English. When one fires for a strongly-accented persona, the seam is audible.
  That makes a fallback firing a *double* failure: the beat it replaced, and
  the voice it broke.
- **Two authorities can disagree.** Production emits `camera_suggestion` with a
  `reason`; the replay compiler makes its own cut. Same for planned overlaps vs
  compiled channels, and for the live timeline vs the faithful recording. When
  a symptom is a wrong shot, a stomped line, or a mistimed reaction, compare the
  two logs before suspecting either one.
- **Event kinds differ across lanes.** Coffee and Signal file some of the same
  concepts under different event shapes (e.g. Signal writes a `power_effect`
  whose `payload.effect` names the effect, where Coffee uses a top-level kind).
  Shared consumers that match on `kind` alone can be silently dead for one lane.
- **Segment seams are where bugs live.** opening → interview → closing, plus
  producer-cue interruptions and departures. When a symptom involves a truncated
  line, a missing sign-off, a wrong camera, or a dropped reaction, look at the
  handoff before suspecting either side of it.

## Working rules

- **No proactive test or typecheck runs.** Deliver the fix, state plainly what
  changed and that it is unverified. When several edits stack up, *offer* a
  scoped typecheck — one typo costs the user a full desktop re-stage to find.
  A scratchpad probe that reproduces a predicate's behavior is diagnosis, not
  testing; use it freely, and prefer it to speculation.
- **A parallel agent session shares this working tree.** Before editing any
  file, check its mtime; if it changed recently, flag it and either wait or
  work around it. Never revert or stash changes you didn't make. Confirm your
  diff contains only your hunks before reporting.
- **You cannot see the app.** Signal sits behind the login gate. Reason from
  code, the export, and screenshots; give the user a precise list of what to
  look for after they rebuild (`npm run desktop` re-stages the runtime).
- **Scale the response to the finding.** Small and certain → fix now. Large or
  architectural (lookahead generation, render cost, persona-arc constraints) →
  queue a task with the diagnosis attached so the analysis isn't lost.
  Uncertain → say what you found and ask.
- **Safety guardrails in Powers stay exactly as written.** Compiled Power cues
  that forbid applying a trait to the player or to real people, or that bar
  slurs and real-world protected categories, are load-bearing. Fixing a bit's
  staying power never means loosening them.

## Deliverable

Report findings most-severe first, leading with the developer note's root cause
— that's the direct order. For each: the root cause with `file:line`
references, the evidence from the record that proves it, the fix applied (or
the task queued), and what the user should observe after rebuilding. Close with
a tally of fixed / queued / explained so the batch is trackable at a glance,
and flag any finding that contradicts one of their notes rather than silently
overriding them.
