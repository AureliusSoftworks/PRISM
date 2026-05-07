# Story V1 UX Signoff Notes (Phase 3 Step 1)

Date: 2026-05-06  
Owner: developer_4 (UX contract enforcement prep)

## Kickoff Readiness Verdict

Story V1 UX contract is complete enough to start implementation kickoff, with the
clarifications below now locked for execution alignment.

## Final Clarifications for Implementation

1. **Autosave trigger semantics**
   - Trigger autosave only on meaningful answer changes (trim-normalized value differs).
   - Whitespace-only edits do not create save churn.
   - Failed autosave keeps all local values intact; retry reuses the same payload.

2. **Stage-to-copy mapping**
   - `outline`/`outline_pending` => `Planning`
   - `page_text` => `Writing`
   - `image_prompts`/`image_render`/`assemble` => `Rendering images`
   - This mapping is locked to avoid inconsistent stage language between views.

3. **CTA priority lock during partial readiness**
   - Text not ready: primary CTA is `Keep generating`.
   - Text ready: primary CTA is `Open reader now` (even while image work continues).
   - `Retry image render` is additive only; it cannot demote reading continuation.

4. **Reader placeholder stability**
   - Placeholder reserves final media layout space to avoid content jump.
   - Pending label is locked to `Image still rendering`.
   - In-place backfill must preserve current page position and focus continuity.

5. **Abandon/recovery microcopy expectation**
   - Leaving active generation toward setup requires explicit confirmation.
   - Confirmation language must state the effect clearly: generation stops, answers remain editable.
   - Error states must always show one clear next action (retry or safe back route).

6. **Import validation UX shape**
   - Fatal validation errors: one reason + one next action.
   - Preferred CTA pair: `Try another file` (primary), `Back to library` (secondary).
   - No backend/internal wording in user-visible errors.

7. **Story-only memory boundary placement**
   - Boundary copy must appear in setup help context and critique entry context.
   - Locked line:
     - `Feedback here improves future Story generations. This does not change Chat or Sandbox behavior in V1.`

## Accepted Exceptions

1. **TTFRP target value placeholder remains unresolved in this step**
   - `<TTFRP_TARGET_SECONDS>` is still a placeholder.
   - Accepted for kickoff as long as implementation includes instrumentation hooks and timestamp capture for QA ownership.

## Handoff Notes

### developer_2 (backend)

- Keep status payload fields stable enough for frontend copy mapping lock above.
- Do not expose backend-only terminology in error envelopes intended for player display.
- Ensure partial readiness states (`textReady` true while image stages continue) remain first-class and poll-safe.

### developer_1 (frontend)

- Implement CTA switches exactly at `textReady` boundary; do not wait for full image completion.
- Apply locked copy strings from UX contract clarifications to autosave, placeholder, and boundary messaging.
- Preserve reading continuity during image backfill (no page jump/focus reset).
- Treat abandon-flow confirm copy as required guardrail for active generation.
