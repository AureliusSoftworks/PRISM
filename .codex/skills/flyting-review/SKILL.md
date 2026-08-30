---
name: flyting-review
description: Review PRISM Flyting bouts, Hall Records, saved sessions, event streams, votes, verdicts, and replay, then diagnose provenance and make focused systemic fixes. Use when the user invokes /flyting-review or $flyting-review, supplies a Flyting session or Archive reference, asks where a bout went wrong, or reports Bout Forge, consent, claim-targeting, maneuver, Yield, floor, Power, voice, Hall vote, Host verdict, or replay failures.
---

# Flyting Review

## Workflow

1. Read the complete supplied record before judging it. Resolve exact session and Archive references read-only when available. If only screenshots, excerpts, or a Hall Record are available, review them and state which frozen setup, event, provider, audio, vote, verdict, or replay evidence is missing.
2. Record the frozen Bout Forge, title, stakes, rivalry, forbidden topics, two flyters and their Legend facets, four Hall members, Host, player role and coached side, consent outcomes, provider/model and LOCAL/ONLINE lane, Power plan, phase, revision, expected action, floor side, completion state, recording or Archive availability, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - observed public text, heard audio, or visible Mead Hall state;
   - session, revision, event, exchange, line, claim, challenge, phase, step key, speaker, side, and vote IDs when available;
   - authored mode (`bot`, `custom`, or `wielded`), provider/model, AUTO recovery, validation, sanitizer, fallback/skip, Power projection, voice cue, and nearby events;
   - responsible layer: Bout Forge, consent, cast freeze, provider, validation, safety boundary, Power projection, rejoinder evaluation, turn orchestration, persistence, Hall voting, Host verdict, voice, live presentation, Archive, or replay;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace setup through `public persona -> bounded Bout Forge draft -> validation and player edits -> format-bound consent -> frozen bout and cast -> persisted session`. Never treat generated rivalry, epithets, stakes, or Legend facets as canonical bot biography.
5. Trace each exchange through `unused Legend facet -> Boast -> exact claim target plus Challenge lens -> exact challenge target plus Rejoinder maneuver or Yield -> evaluator/fallback -> resolution and acclamation -> event persistence -> Hall Record -> voice/live presentation -> Archive/replay`. Never call visible speech raw provider output without preserved draft evidence; player text, Wield output, sanitization, and Powers can all change its provenance.
6. Audit the bout on three separate axes:
   - **Contest quality:** concrete claims, exact answers, responsive escalation, persona fidelity, vivid and accessible wit, distinct maneuvers, and cutting language that remains sporting. Rhyme, meter, and Norse familiarity are optional.
   - **System integrity:** frozen IDs, unique cast seats, four alternating exchanges, unused Legend facets, valid targets and maneuvers, stable floor ownership, consequential Yield, pause/resume, revision and idempotency behavior, exact public persistence, deterministic completion, Hall votes, Host ruling, and saved replay fidelity.
   - **Safety and privacy:** approved forbidden topics, speech boundaries, consent, LOCAL zero-egress, public-persona-only Forge inputs, no live research, no private relationship memory, and no hidden intended speech leaking through presentation or replay.
7. Audit the verdict chronologically. Four Hall members vote from the complete public record. Their votes advise a human Host, whose authored fifth word crowns the winner; otherwise the bot Host supplies the deciding fifth vote. Confirm the winning side, public ruling, final ballots, moderator or player verdict fields, completion event, and Archive agree without inventing a score.
8. Treat persona, prompt, Powers, avatar, and voice as allowed Flyting inputs. The Power-shaped public line is canonical for the Hall Record and listeners; private intended content may explain provenance but must not leak into votes, captions, audio, reviews, or replay. Flag any learned-continuity or relationship-memory read/write as a privacy failure.
9. Preserve LOCAL as zero egress. Do not recommend live research, online provider escalation, remote fallback, or runtime image generation for a LOCAL bout. A saved or completed bout must reopen and replay without rerunning Forge or changing its public record or winner.
10. With a complete record and a concrete complaint, create or claim a Bead, establish a focused baseline, and fix the responsible PRISM layer. Do not mutate, resume, reroll, or overwrite the reported session merely to diagnose it. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
11. Reproduce the reported player role, floor, exchange shape, target chain, authored mode, Power state, vote split, and Host path. Add focused regressions for public output and provenance metadata, then run narrow shared/API/web checks, relevant typecheck and lint, `git diff --check`, and live visual/audio QA when presentation changed. Reuse the existing authenticated LOCAL QA account; never create another without explicit approval.

## Flyting Rules

- Flyting is a contest of answering, not a Viking-themed Cypher. Judge the persistent claim-and-answer record rather than rhythm, rhyme, cadence, or musical performance.
- The canonical loop is `Boast -> Challenge -> Rejoinder -> Acclamation` across four exchanges, with the boasting side alternating A/B/A/B. There is no timer, meter, fixed score, required rhyme, or continuous music.
- Each Boast uses one unused frozen Legend facet. A Challenge targets one exact recorded opponent claim through `Doubt`, `Expose`, `Belittle`, or `Outdo`. A Rejoinder answers the exact challenge through `Stand`, `Own`, `Turn`, or `Return`; `Return` must also target one recorded challenger claim.
- `Yield` is the only non-answer. It permanently records that charge as `unanswered`; do not soften it into substitute dialogue or infer that silence, skip, or a malformed line is an earned Yield without the saved action and state.
- Rejoinder evaluation may record `answered`, `turned`, or `contested`. It judges engagement and maneuver fit, not objective truth, morality, fame, likability, private biography, or hidden provider reasoning.
- The Hall Record is authoritative. It preserves exact public lines, targets, maneuvers, resolutions, acclamations, Hall votes, and the decisive ruling. Replay performs that frozen record; it does not regenerate Forge material, reevaluate an answer, reroll votes, or select a new winner.
- A valid consent decline cannot be overridden or reused from another format. The coached bot remains the public body and voice in Participant play, and role, side, seat, floor, and vote ownership remain bound to stable bot IDs through Powers.
- Prefer typed validation, target and floor guards, orchestration, Power projection, serialization, voting, verdict, and replay fixes over bot-specific prompt edits, manual database repair, or rewriting a saved Hall Record.

## Key Surfaces

- Shared Flyting contracts and normalization: `packages/shared/src/debate.ts`
- Forge, action engine, evaluation, votes, verdict, persistence, and replay projection: `apps/api/src/debate.ts`
- Forge, Wield, and action routes: `apps/api/src/server.ts`
- Focused API regressions: `apps/api/src/__tests__/debate.test.ts` under `Flyting V1`
- Setup, Mead Hall, Hall Record, and verdict UI: `apps/web/src/app/DebateFlyting.tsx`
- Ritual audio: `apps/web/src/app/debateFlytingAudio.ts`
- Rules and tutorial contract: `docs/debate-formats-turnabout-v1.md` and `apps/web/src/app/modeTutorials.ts`

## Output

- `Findings`: evidence-led failures with layer and confidence.
- `Root cause`: the first broken provenance link and why adjacent Forge, provider, validation, Power, persistence, vote, verdict, voice, or replay layers are ruled out.
- `Fixes`: systemic PRISM changes made, or focused recommendations in review-only mode.
- `Verification`: baseline, exact checks, lifecycle result, and whether the saved Hall Record was reopened without changing the winner.
- `Gaps`: evidence unavailable, source/build uncertainty, authentication unavailable, or live voice/visual/replay validation still required.
