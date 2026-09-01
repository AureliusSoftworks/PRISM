---
name: turnabout-review
description: Review PRISM Turnabout proceedings, testimony, exact contradiction targets, objections, rulings, courtroom records, verdicts, and replay, then diagnose provenance and make focused systemic fixes. Use when the user invokes /turnabout-review or $turnabout-review, supplies a Turnabout session or Archive reference, or reports statement, Press, evidence, objection, ruling, floor, voice, completion, or replay failures. Use whodunnit-review for a Whodunnit mystery court.
---

# Turnabout Review

Read [the shared PRISM review core](../references/prism-review-core.md) before
applet-specific work. If the session has a Whodunnit `mysteryTrial` bridge or
depends on sealed case truth, route the whole review through
`$whodunnit-review` instead.

## Workflow

1. Read the complete supplied record and resolve exact session and Archive
   references read-only. State what frozen setup, event, audio, ruling, or
   replay evidence is missing when only excerpts are available.
2. Record the frozen motion, side briefs, cast IDs and formal roles, player role
   and side, format consent and Devil's Advocate framing, provider/model and
   LOCAL/ONLINE lane, Powers, frozen evidence and object exhibits, phase,
   revision, expected action, floor, completion state, and source/build age.
3. Build an evidence ledger for each finding: public text, heard audio, or
   visible Court state; session/revision/sequence/event/statement/source/ruling
   IDs; provider, retry/fallback, validation, Power projection, and presentation
   metadata; responsible layer; and `observed`, `inferred`, or `unknown`.
4. Trace setup through `motion and side briefs -> cast and format consent ->
   frozen participant/evidence snapshots -> persisted Turnabout state`.
5. Trace each courtroom chain through `speaker statement -> exact contradiction
   or frozen source target -> Press or objection -> neutral ruling ->
   sustained/overruled consequence -> next floor -> public Court record ->
   completion/Archive/replay`. Never infer a contradiction, ruling, or heard
   delivery from adjacent prose alone.
6. Audit three separate axes:
   - **Proceeding quality:** clear claims, responsive examination, exact source
     use, grounded reversals, neutral rulings, fair advocacy, and a decisive but
     earned resolution.
   - **System integrity:** frozen IDs, statement order, valid Press/object/pass
     targets, stable floor and role ownership, evidence validation, Power-shaped
     public truth, mutation idempotency, pause/resume, completion, Archive, and
     replay continuity.
   - **Experience integrity:** captions, voice, stage focus, objection/ruling
     timing, Court record readability, and agreement between persisted events
     and what the player could actually see or hear.
7. With a concrete complaint and enough evidence, create or claim a Bead,
   establish a focused baseline, and fix the first responsible PRISM layer. For
   review-only requests, stop after findings.
8. Reproduce the reported role, side, phase, statement/source target, action,
   ruling, and Power state. Add focused regressions, run narrow shared/API/web
   checks plus relevant typecheck/lint and `git diff --check`, and perform live
   visual/audio QA when presentation changed.

## Turnabout Rules

- Turnabout is its own Court of Record, not Forum with courtroom copy. The
  canonical interaction is pressable testimony, exact frozen-evidence
  objection, immediate neutral ruling, and a public consequence.
- Accepted format consent and frozen cast/evidence are authoritative. A decline
  cannot be overridden, and later bot/profile edits cannot rewrite the record.
- Only exact recorded statements and frozen evidence may support an objection.
  A sustained ruling must identify the contradiction it resolves; an
  overruled action must not silently alter the record or floor.
- Public post-Power text is what the Court, captions, voice, record, ballots,
  and replay may perceive. Private intended speech can explain provenance but
  cannot become evidence or leak into those surfaces.
- Preserve stable role, side, seat, source, statement, and floor ownership
  through identity effects, pause/resume, and replay. Do not infer a score the
  format does not persist.
- LOCAL remains zero egress. Relationship memory and learned continuity must
  not read from or write into a Turnabout proceeding.
- The archived Court record is frozen. Replay performs that record; it does not
  regenerate statements, rerule objections, change evidence, or choose a new
  verdict.
- Prefer typed target validation, state transitions, orchestration, Power
  projection, serialization, and presentation fixes over bot-specific prompt
  edits or rewriting a saved proceeding.

## Key Surfaces

- Shared Turnabout contracts and normalization: `packages/shared/src/debate.ts`
- Engine, rulings, persistence, and replay projection: `apps/api/src/debate.ts`
- Action and evidence routes: `apps/api/src/server.ts`
- Court setup, stage, action deck, and record UI:
  `apps/web/src/app/DebateExperience.tsx`
- Canonical rules: `docs/debate-formats-turnabout-v1.md`

## Output

- `Findings`: evidence-led failures with layer and confidence.
- `Root cause`: the first broken setup, target, ruling, persistence,
  presentation, or replay link and why adjacent layers are ruled out.
- `Fixes`: systemic changes made, or focused recommendations in review-only
  mode.
- `Verification`: baseline, exact checks, lifecycle result, and Archive/replay
  evidence.
- `Gaps`: missing frozen state, delivery evidence, source/build certainty,
  authentication, or live voice/visual validation.
