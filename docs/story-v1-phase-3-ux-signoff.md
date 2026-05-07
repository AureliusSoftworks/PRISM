# Story V1 Phase 3 UX Signoff (Kickoff)

Date: 2026-05-06  
Owner: developer_4 (UX signoff)

This note is the final UX signoff artifact for Phase 3 implementation kickoff.
It confirms locked UX behavior, approved edge-state handling, and the concrete
V1 TTFRP target used by downstream implementation and QA.

## 1) Locked UX Decisions (Confirmed)

The following V1 decisions are locked and approved for implementation:

1. Setup uses incremental autosave with explicit status states (`Saving...`,
   `Saved`, `Retry`) and no ambiguous save state.
2. Reader unlock is text-first: unlock as soon as text is readable; do not wait
   for full image completion.
3. Story library remains Story-owned in V1 (no merge into global library).
4. `.story` import/export validation is strict + bounded with human-readable
   error outcomes.
5. CTA hierarchy remains contract-driven in all phases (`setup -> generating ->
   reading -> library`) with a safe next action always visible.

## 2) Approved Edge-State Behavior (No Dead Ends)

These edge behaviors are approved and required:

- Autosave failure keeps typed input intact, shows persistent inline error, and
  offers `Retry save`.
- Generation failure before text-ready shows `Retry generation` and preserves
  setup answers.
- Text ready while image rendering is stalled still unlocks reader immediately;
  `Retry image render` remains available.
- Session reload during generating restores last known stage + CTA, not a forced
  reset to setup.
- Import validation failure remains in import flow with actionable copy.
- Story open failure from library offers retry plus safe fallback (`Back to library`).

## 3) TTFRP V1 Recommendation (Concrete)

Approved V1 target for implementation + QA gates:

- **TTFRP target (p95): <= 20 seconds**

Rationale:

- Keeps the first meaningful value (first readable page) inside a "patient but
  trustworthy" wait window for narrative generation.
- Aligns with text-first unlock: users see usable output quickly even while
  images continue in backfill.
- Gives engineering room for V1 stability without normalizing long silent waits.
- Maintains clear release gate behavior: p95 above 20s requires explicit
  exception signoff before release.

## 4) Known Acceptable UX Exceptions (V1)

The following are acceptable in V1 and **not** release blockers if all P0 gates
remain passing:

1. Image backfill may complete after reader entry, as long as placeholders are
   deterministic, labeled, and replaced in place without interrupting reading.
2. Minor copy polish differences are acceptable if meaning is equivalent,
   player-facing language is clear, and no backend jargon is exposed.
3. Temporary p95 TTFRP exceedance is acceptable only with explicit approved
   exception and documented mitigation plan.

## 5) Downstream Usage

- `developer_1` and `developer_2`: use `20` as the concrete TTFRP target in
  implementation notes, instrumentation handoff, and PR evidence.
- `developer_3`: use `20` as the QA gate comparator for TTFRP pass/fail logic.

