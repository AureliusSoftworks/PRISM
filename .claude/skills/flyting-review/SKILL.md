---
name: flyting-review
description: Review PRISM Flyting bouts, Hall Records, saved sessions, event streams, crowd sway, Jarl rulings, and replay, then diagnose provenance and make focused systemic fixes. Use whenever the user invokes /flyting-review, supplies a Flyting session, Hall Record, or Archive reference, asks where a bout went wrong, or reports Bout Forge, consent, claim-targeting, maneuver, Yield, floor, Power, voice, Hall leaning, Jarl verdict, or replay failures — even without the word "review".
---

# Flyting Review

Read the shared PRISM review core at
`.claude/skills/references/prism-review-core.md` (PRISM root) before
applet-specific work.

## Workflow

1. Read the complete supplied record before judging it. Resolve exact session and Archive references read-only when available. If only screenshots, excerpts, or a Hall Record are available, review them and state which frozen setup, event, provider, audio, crowd-sway, guard, verdict, or replay evidence is missing. Convert every developer and session note into a work item before anything else.
2. Record the frozen Bout Forge, title, stakes, rivalry, forbidden topics, two flyters and their Legend facets, fifteen generic Hall spectators, three Jarl guards, Jarl, player role and coached side, consent outcomes, provider/model and LOCAL/ONLINE lane, Power plan, phase, revision, expected action, floor side, completion state, recording or Archive availability, source/running/package identity, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed public text, heard audio, or visible Mead Hall state;
   - session, revision, event, exchange, line, claim, challenge, phase, step key, speaker, side, crowd snapshot, guard, and verdict IDs when available;
   - authored mode (`bot`, `custom`, or `wielded`), provider/model, AUTO recovery, validation, sanitizer, fallback/skip, Power projection, voice cue, and nearby events;
   - responsible layer: Bout Forge, consent, cast freeze, provider, validation, safety boundary, Power projection, rejoinder evaluation, turn orchestration, persistence, Hall sway, Jarl ruling, voice, live presentation, Archive, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace setup through `public persona -> bounded Bout Forge draft -> validation and player edits -> format-bound consent -> frozen bout and cast -> persisted session`. Never treat generated rivalry, epithets, stakes, or Legend facets as canonical bot biography.
5. Trace each exchange through `unused Legend facet -> Boast -> exact claim target plus Challenge lens -> exact challenge target plus Rejoinder maneuver or Yield -> evaluator/fallback -> resolution and acclamation -> event persistence -> Hall Record -> voice/live presentation -> Archive/replay`. Never call visible speech raw provider output without preserved draft evidence; player text, Wield output, sanitization, and Powers can all change its provenance.
6. Audit the bout on three separate axes:
   - **Contest quality:** concrete claims, exact answers, responsive escalation, persona fidelity, vivid and accessible wit, distinct maneuvers, and cutting language that remains sporting. Rhyme, meter, and Norse familiarity are optional.
   - **System integrity:** frozen IDs, unique flyter/Jarl seats, fifteen stable Hall spectators, three stable Jarl guards, four alternating exchanges, unused Legend facets, valid targets and maneuvers, stable floor ownership, consequential Yield, pause/resume, revision and idempotency behavior, exact public persistence, chronological crowd-sway history, weighted Jarl decision, deterministic completion, and saved replay fidelity.
   - **Safety and privacy:** approved forbidden topics, speech boundaries, consent, LOCAL zero-egress, public-persona-only Forge inputs, no live research, no private relationship memory, and no hidden intended speech leaking through presentation or replay.
7. Audit the verdict chronologically. The fifteen spectators move among `for`, `neutral`, and `against` after each exchange, and each snapshot must preserve that public sway. At the end:
   - a strict neutral plurality dismisses both flyters; the three guards remain centered and the outcome is `double_loss`;
   - otherwise the human or bot Jarl sends all three guards to one side, adding weight three to that side;
   - the weighted Hall total decides the winner, with the Jarl's side breaking an exact weighted tie. The Jarl's preference does not erase a larger opposing Hall majority.
   Confirm crowd counts, neutral plurality, guard side, final weighted counts, public ruling, moderator/player verdict fields, completion event, and Archive agree. Treat legacy four-juror `hallVotes` as compatibility evidence for old records only.
8. Treat persona, prompt, Powers, avatar, and voice as allowed Flyting inputs. The Power-shaped public line is canonical for the Hall Record and listeners; private intended content may explain provenance but must not leak into crowd sway, Jarl ruling, captions, audio, reviews, or replay. Flag any learned-continuity or relationship-memory read/write as a privacy failure.
9. Preserve LOCAL as zero egress. Do not recommend live research, online provider escalation, remote fallback, or runtime image generation for a LOCAL bout. A saved or completed bout must reopen and replay without rerunning Forge or changing its public record or winner.
10. With a complete record and a concrete complaint, create or claim a Bead, establish a focused baseline, and fix the responsible PRISM layer. Do not mutate, resume, reroll, or overwrite the reported session merely to diagnose it. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
11. Reproduce the reported player role, floor, exchange shape, target chain, authored mode, Power state, crowd/neutral split, guard side, and Jarl path. Add focused regressions for public output and provenance metadata; `git diff --check` is always cheap. Verify per the core's verification posture; live visual/audio QA of presentation changes and any authenticated Mead Hall check follow the core's QA rules.

## Flyting Rules

- Flyting is a contest of answering, not a Viking-themed Cypher. Judge the persistent claim-and-answer record rather than rhythm, rhyme, cadence, or musical performance.
- The canonical loop is `Boast -> Challenge -> Rejoinder -> Acclamation` across four exchanges, with the boasting side alternating A/B/A/B. There is no timer, meter, fixed score, required rhyme, or continuous music.
- Each Boast uses one unused frozen Legend facet. A Challenge targets one exact recorded opponent claim through `Doubt`, `Expose`, `Belittle`, or `Outdo`. A Rejoinder answers the exact challenge through `Stand`, `Own`, `Turn`, or `Return`; `Return` must also target one recorded challenger claim.
- `Yield` is the only non-answer. It permanently records that charge as `unanswered`; do not soften it into substitute dialogue or infer that silence, skip, or a malformed line is an earned Yield without the saved action and state.
- Rejoinder evaluation may record `answered`, `turned`, or `contested`. It judges engagement and maneuver fit, not objective truth, morality, fame, likability, private biography, or hidden provider reasoning.
- The Hall Record is authoritative. It preserves the frozen bout, exact public lines, targets, maneuvers, resolutions, Jarl-authored between-rune acclamations, crowd-sway history, guard placement, final weighted tally, and decisive ruling. Replay performs that frozen record; it does not regenerate Forge material, reevaluate an answer, reroll the Hall, or select a new winner.
- A persisted acclamation or verdict is not proof it was heard. Review exports must distinguish event persistence, presentation eligibility, voice start, interruption/cutoff, and completed delivery. Jarl-authored between-rune acclamations belong in the existing voice path.
- A valid consent decline cannot be overridden or reused from another format. The coached bot remains the public body and voice in Participant play, and role, side, seat, floor, and verdict authorship remain bound to stable bot IDs through Powers.
- The Mead Hall runs under the shared Forum live view. `DebateExperience` keeps its live-view effects (app-away recess, automatic advance, pause and resume ceremonies) active while a Flyting session is open, so a bout that holds, pauses, or errors without a player action needs those Forum effects checked before blaming the Flyting engine. A Hall waiting for the player has no clock and must not recess because the app lost focus.
- The Jarl's vote is the side the guards go to. A human Jarl who sends the guards with a blank ruling records the default ceremonial ruling as a player verdict with `authoredMode: custom`; that is the contract, not a provenance fault.
- Prefer typed validation, target and floor guards, orchestration, Power projection, serialization, crowd sway, Jarl verdict, and replay fixes over bot-specific prompt edits, manual database repair, or rewriting a saved Hall Record.

## Key Surfaces

- Shared Flyting contracts and normalization: `packages/shared/src/debate.ts`
- Forge, action engine, evaluation, crowd sway, verdict, persistence, and replay projection: `apps/api/src/debate.ts`
- Forge, Wield, and action routes: `apps/api/src/server.ts`
- Focused API regressions: `apps/api/src/__tests__/debate.test.ts` under `Flyting V1`
- Setup, Mead Hall, Hall Record, and verdict UI: `apps/web/src/app/DebateFlyting.tsx`
- Forum live-view effects that also govern the open Mead Hall (app-away recess, auto-advance, lifecycle ceremonies): `apps/web/src/app/DebateExperience.tsx`, with source-shape regressions in `apps/web/src/app/debate-experience.test.ts`
- Ritual audio: `apps/web/src/app/debateFlytingAudio.ts`
- Rules and tutorial contract: `docs/debate-formats-turnabout-v1.md` and `apps/web/src/app/modeTutorials.ts`

## Output

- `Findings`: evidence-led failures with layer and confidence.
- `Root cause`: the first broken provenance link and why adjacent Forge, provider, validation, Power, persistence, crowd-sway, Jarl, voice, or replay layers are ruled out.
- `Fixes`: systemic PRISM changes made, or focused recommendations in review-only mode.
- `Verification`: baseline, exact checks run or deliberately not run, lifecycle result, and whether the saved Hall Record was reopened without changing the winner.
- `Gaps`: evidence unavailable, source/build uncertainty, authentication unavailable, or live voice/visual/replay validation still required.
