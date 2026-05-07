# Story V1 UX Contract

This document is the player-facing UX contract for Story V1. It defines required
state behavior, CTA priority, and recovery paths that implementation must follow.

## Scope

- In scope: `setup -> generating -> reading -> library`.
- In scope: Story-only flows, copy, progress signaling, and failure recovery.
- Out of scope: backend implementation details and non-Story surfaces.

## Locked Product Decisions (V1)

These decisions are fixed for Story V1 and should not be re-opened during build:

1. Incremental autosave is required during setup.
2. Reader unlocks as soon as text is readable, with image backfill after unlock.
3. Story library is Story-owned in V1 (not merged into a global library).
4. `.story` import/export validation is strict and bounded, with clear UX errors.

## Flow Contract

### 1) Setup

### Required behavior

- The setup form autosaves incrementally after each meaningful answer change.
- Autosave status must be visible and never ambiguous (`Saving...`, `Saved`, `Retry`).
- Generate action is disabled until minimum readiness requirements are met.
- Validation errors are inline, specific, and tied to fields.

### CTA hierarchy

1. Primary: `Generate story` (enabled only when ready).
2. Secondary: `Continue editing` / field-level correction actions.
3. Tertiary: `Back to Hub`.

### 2) Generating

### Required behavior

- Progress uses plain-language stages (example: `Planning`, `Writing`, `Rendering images`).
- A safe next action is always visible.
- If text is ready before images, `Open reader now` becomes the primary CTA.
- Generation is resumable after refresh/reopen using persisted session status.

### CTA hierarchy

1. Primary while text not ready: `Keep generating` (status-first, no dead end).
2. Primary when text ready: `Open reader now`.
3. Secondary: `Stay here` (watch progress), `Retry failed step` (if recoverable).
4. Tertiary: `Back to setup` (must warn about abandoning current generation).

### 3) Reading

### Required behavior

- Reader opens on earliest text-ready payload without waiting for all images.
- Missing images use deterministic placeholders and label `Image still rendering`.
- Backfilled images replace placeholders in place without interrupting reading.
- Reader metadata indicates generation status (for example, `3 of 8 images ready`).

### CTA hierarchy

1. Primary: `Continue reading`.
2. Secondary: `Retry image render` (if image stage failed), `Open in library`.
3. Tertiary: `Back to generating` (only when generation still active).

### 4) Library (Story-owned in V1)

### Required behavior

- Library only shows Story artifacts in V1.
- Story cards expose stable metadata: title, updated time, completion state.
- Opening a library item restores the correct mode (`reading` vs `generating`).
- Import/export actions must route through strict `.story` validation rules.

### CTA hierarchy

1. Primary: `Open story`.
2. Secondary: `Import .story`, `Export .story`.
3. Tertiary: `Back to Hub`.

## `.story` Validation UX Contract (Strict + Bounded)

Validation must be strict enough to prevent corrupt or incompatible files, but
bounded enough to keep V1 implementation predictable.

### Required validation checks (V1 bounded set)

- File extension must be `.story`.
- Payload must parse as valid JSON.
- Required top-level fields must exist with valid types.
- Version field must be supported by V1 compatibility table.
- Story content arrays/objects must meet minimum structure requirements.

### UX behavior on validation outcomes

- Success: show confirmation and proceed to import preview/open flow.
- Recoverable issue: show exact field-level problem and suggest re-export.
- Fatal issue: block import and provide single clear reason plus `Try another file`.

### Non-negotiable UX rules

- Never silently coerce malformed structure.
- Never partially import while showing success.
- Never show raw stack traces or backend-only error wording to players.

## Required Edge States and Recovery Actions

1. Autosave failed in setup
   - Show persistent inline banner and `Retry save` action.
   - Keep local form state intact; do not discard typed input.
2. Generation request failed before text
   - Show `Retry generation` primary CTA and keep setup answers available.
3. Text ready, image rendering stalled
   - Unlock reader immediately and expose `Retry image render`.
4. Session reload during generating
   - Restore last known stage and CTA without forcing user back to setup.
5. Import validation failed
   - Keep user in library import flow with actionable error copy.
6. Story open fails from library
   - Show retry plus fallback route (`Back to library`) without dead end.

## Copy Guidance (Readiness + Memory Boundaries)

### Readiness copy principles

- Use concrete readiness language: `Ready to generate` vs vague states like `Almost done`.
- Explain blocked state in one line: `Add a protagonist name to continue`.
- Keep progress language calm and deterministic; avoid hype or urgency framing.

### Memory boundary copy principles

- Story memory is Story-only in V1 and should be named directly in UI copy.
- Use plain boundaries, for example:
  - `Feedback here improves future Story generations.`
  - `This does not change Chat or Sandbox behavior in V1.`
- Avoid language that implies cross-mode personalization until explicitly supported.

## Acceptance Criteria

1. Player can complete setup and start generation without ambiguity about readiness.
2. Progress screen always shows a safe next action across normal and error states.
3. Reader becomes available at earliest text-ready moment, even with pending images.
4. Library reliably re-opens Story sessions in the correct state.
5. `.story` import/export surfaces strict, human-readable validation outcomes.
6. Copy consistently communicates Story-only memory boundaries.
7. Time to first readable page meets V1 target placeholder: `<TTFRP_TARGET_SECONDS>`.
   - Rationale: this metric directly captures first meaningful value in the Story
     flow and protects player trust during long-running generation.

## Phase 3 Kickoff Clarifications (Locked)

These clarifications are now part of the Story V1 UX contract for implementation.

### Setup autosave behavior

- A "meaningful answer change" means a value change that survives trim normalization
  (for example, whitespace-only edits do not trigger autosave).
- Autosave status copy is locked to: `Saving...`, `Saved`, `Retry`.
- `Retry` re-attempts the most recent failed save for the same answers payload and
  does not clear or roll back local form values.

### Generating progress/copy mapping

- Frontend stage labels are locked to:
  - `outline`/`outline_pending` -> `Planning`
  - `page_text` -> `Writing`
  - `image_prompts`/`image_render`/`assemble` -> `Rendering images`
- While text is not ready, the primary CTA stays status-first (`Keep generating`).
- As soon as text is ready, primary CTA switches to `Open reader now` even when
  image stages are still active.

### Reader placeholder/backfill behavior

- Missing images must reserve stable layout space to prevent reading jumps.
- Placeholder label copy is locked to `Image still rendering`.
- Backfilled images replace placeholders in place without changing page index,
  scroll position, or reader focus.

### Recovery and abandon behavior

- `Back to setup` from generating is allowed only behind an explicit abandon
  confirmation when generation is active.
- Confirmation copy must communicate impact in plain language (generation stops,
  setup answers remain editable).
- `Retry image render` is shown only for recoverable image-stage failures and must
  never hide `Continue reading` or `Open reader now`.

### Import validation copy format

- Import failure UX uses one clear reason plus one next action.
- Preferred CTA pairing for fatal validation failure:
  - Primary: `Try another file`
  - Secondary: `Back to library`
- Error copy must reference player-actionable context and avoid backend jargon.

### Story-memory boundary placement

- Story-only memory boundary reminder appears in:
  1. setup (near generation readiness/help text), and
  2. critique/feedback entry point.
- Locked boundary line:
  - `Feedback here improves future Story generations. This does not change Chat or Sandbox behavior in V1.`

### Accepted implementation exception for kickoff

- `<TTFRP_TARGET_SECONDS>` remains a placeholder in this phase.
- Implementation may proceed with instrumentation hooks and timestamp capture while
  final numeric TTFRP target is set in QA gates.

## Implementation Notes for Developers

- Treat this document as the source of truth for Story V1 UX behavior.
- If technical constraints force a contract change, escalate and update this doc
  before implementation diverges.
