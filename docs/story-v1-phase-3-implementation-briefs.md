# Story V1 Phase 3 Implementation Briefs

Phase 3 turns approved Story V1 contracts into gated execution for `developer_1` through `developer_4`.

Source artifacts:

- `docs/story-v1-ux-contract.md`
- `docs/story-v1-frontend-implementation-brief.md`
- `docs/story-v1-backend-contract.md`
- `docs/story-v1-qa-gates.md`

---

## developer_4 brief (UI/UX leadership + contract enforcement)

### Scope (do only this)

- Own UX contract fidelity across `setup -> generating -> reading -> library`.
- Define and lock player-facing copy/interaction behavior for ambiguous edge states.
- Review and approve frontend UX outputs before QA execution.
- Enforce CTA hierarchy, recovery-path clarity, and memory-boundary copy language.

### Non-goals

- Do not implement backend routes, ledger schema, or memory plumbing.
- Do not own final API contract decisions already locked in backend contract.
- Do not run full verification matrix execution as primary owner (handoff to `developer_3`).

### Deliverables

- UX acceptance checklist mapped to each phase and edge state.
- Final copy decisions for status/error/retry states (human-readable, no backend jargon).
- Design sign-off notes for:
  - text-first reader unlock behavior
  - placeholder/backfill UX behavior
  - strict import validation error UX
  - Story-only memory boundary messaging
- Contract compliance review comments on `developer_1` implementation PR.

### Acceptance criteria

- All UX contract non-negotiables are either implemented or explicitly tracked as blockers.
- CTA priorities are consistent with the UX contract in all four phases.
- Recovery actions are present for required edge states with no dead-end flows.
- Copy clearly communicates Story-only memory boundaries and safe next actions.
- UX sign-off is complete before `developer_3` starts final release-gate verification.

### Dependencies / handoff checkpoints

- **Depends on:** approved Story V1 UX contract (already available).
- **Handoff to `developer_1`:** validated UX decision notes for unresolved micro-interactions/copy.
- **Receives from `developer_1`:** implementation preview for contract conformance review.
- **Handoff to `developer_3`:** explicit UX sign-off and any known acceptable exceptions.

---

## developer_1 brief (web shell + state machine implementation)

### Scope (do only this)

- Implement Story shell/state transitions in web app using existing shell patterns.
- Build Story phase state machine and event handling in `page.tsx` (`setup`, `generating`, `reading`, `library`).
- Implement Story UI structure/styling updates in `page.module.css` using existing tokens/patterns.
- Integrate text-first unlock, autosave states, progress states, placeholder/backfill behavior, and safe retries.
- Wire frontend to backend Story APIs without redefining backend contract.

### Non-goals

- Do not redesign UX contract or CTA hierarchy.
- Do not create new backend persistence schemas or memory isolation logic.
- Do not implement non-Story surfaces (Chat/Sandbox) refactors.

### Deliverables

- Story view route support and Hub entry activation.
- Story phase container with explicit transition guards and recoverable state persistence.
- Phase-specific render boundaries for Setup, Generating, Reading, Library.
- UI states for autosave/readiness/progress/errors matching contract language.
- Reader behavior that unlocks on `textReady` and continues image backfill in-place.
- Library phase behavior that restores correct mode from item state.

### Acceptance criteria

- Frontend acceptance checklist from `docs/story-v1-frontend-implementation-brief.md` is complete.
- P0 frontend-focused QA gates pass:
  - text-first unlock
  - autosave clarity/resilience
  - generate CTA readiness gating
  - session continuity on refresh/reopen
  - strict `.story` validation UX handling
- Touched P1 gates pass or are explicitly deferred with owner/date.
- TTFRP field support is present for measurement handoff:
  - `TTFRP Target (s): <TTFRP_TARGET_SECONDS>`
  - implementation exposes first-readable timing event hooks needed by QA.

### Dependencies / handoff checkpoints

- **Depends on:** `developer_4` UX clarifications/sign-off on ambiguous UI behaviors.
- **Depends on:** `developer_2` API/DTO availability for Story status/pages/library/import flows.
- **Handoff to `developer_3`:** feature branch + test notes + evidence for P0/P1 frontend gates.
- **Handoff checkpoint:** before merge, confirm no UX contract regressions via `developer_4` review.

---

## developer_2 brief (API/ledger/memory implementation)

### Scope (do only this)

- Implement Story API endpoints and envelopes per backend contract.
- Implement Story session/job/event ledger schema and legal transition enforcement.
- Implement idempotency, dedupe behavior, and restart-safe status semantics.
- Enforce Story-only memory boundaries and non-leak rules vs Chat/Sandbox paths.
- Implement strict, bounded `.story` validation boundary and failure semantics.

### Non-goals

- Do not redesign frontend rendering behavior or UX copy hierarchy.
- Do not broaden validation beyond bounded V1 checks.
- Do not introduce cross-mode memory recall behavior in V1.

### Deliverables

- API route implementations under `/api/story` matching required payloads/status codes.
- DB schema updates for `story_sessions`, `story_jobs`, `story_job_events` (+ indexes as needed).
- Idempotency conflict handling (`409`) and in-flight lock behavior (`423`) where specified.
- Reliable `/status` behavior from persisted ledger source of truth.
- Memory access guardrails that keep Story scopes isolated from Chat/Sandbox logic.
- Import validation handlers that hard-fail invalid payloads with readable reasons.

### Acceptance criteria

- Backend contract checklist in `docs/story-v1-backend-contract.md` is complete.
- P0/P1 backend-relevant QA gates pass:
  - story-memory isolation
  - strict `.story` validation safety
  - idempotency conflict handling
  - retry-path safety
- Invalid transitions return `409`; idempotency key reuse with payload mismatch returns `409`.
- Duplicate valid orchestration requests reuse existing job snapshot (no duplicate enqueue).
- Status polling is restart-safe and reflects persisted ledger truth.
- TTFRP measurement fields are supportable via API timestamps/status needed by QA tracker:
  - `TTFRP Target (s): <TTFRP_TARGET_SECONDS>`

### Dependencies / handoff checkpoints

- **Depends on:** backend contract (already approved).
- **Handoff to `developer_1`:** stable DTO/status semantics + endpoint readiness confirmation.
- **Handoff to `developer_3`:** API test fixtures, sample session/job states, and failure-case examples.
- **Checkpoint:** memory isolation review completed before QA release-gate run.

---

## developer_3 brief (QA harness + verification execution)

### Scope (do only this)

- Own QA harness updates and gate execution for Story V1.
- Execute and record P0/P1 verification matrix against integrated frontend/backend work.
- Produce pass/fail evidence and release-gate recommendation (Go/No-Go).
- Maintain TTFRP tracker values and compliance status.

### Non-goals

- Do not redesign product behavior or rewrite core implementation.
- Do not bypass P0 failures with informal sign-off.
- Do not expand into new feature implementation outside test harness/supporting fixes.

### Deliverables

- QA harness updates for Story flows and contract assertions.
- Verification report covering all required P0 checks and touched P1 checks.
- Updated TTFRP tracker values in QA gates artifact:
  - target: `<TTFRP_TARGET_SECONDS>`
  - measured p50/p95/sample/environment/timestamp/owner
- Regression risk notes for uncovered or deferred paths.
- Pre-merge and pre-release checklist completion evidence.

### Acceptance criteria

- All P0 items in `docs/story-v1-qa-gates.md` are executed and passing.
- Any touched P1 item is passing or deferred with explicit owner/date and risk note.
- TTFRP p95 is at/below target or has explicit approved exception.
- Manual stakeholder validation flow (<=4 steps) is completed and documented.
- Final recommendation includes clear Go/No-Go based on gate outcomes.

### Dependencies / handoff checkpoints

- **Depends on:** `developer_1` integrated frontend implementation and evidence notes.
- **Depends on:** `developer_2` backend API + ledger behavior + fixtures.
- **Depends on:** `developer_4` UX sign-off or explicit exceptions list.
- **Handoff to orchestrator/release owner:** final QA gate report + TTFRP status + unresolved risks.

---

## Recommended execution order and merge strategy

### Recommended order

1. `developer_4` confirms final UX contract interpretations and edge-state copy.
2. `developer_2` implements backend contract foundations (API/ledger/memory/validation).
3. `developer_1` implements web shell/state machine against stable backend semantics.
4. `developer_4` performs final UX contract enforcement review on integrated UI.
5. `developer_3` executes full QA gates + TTFRP verification and issues Go/No-Go.

### Merge strategy

- Use phase-gated, dependency-aware PR flow:
  - **PR-A (`developer_2`)**: backend contract implementation + API fixtures.
  - **PR-B (`developer_1`)**: frontend Story shell/state machine, rebased onto PR-A (or merged main after PR-A).
  - **PR-C (`developer_3`)**: QA harness/reporting updates, opened after PR-A + PR-B integration.
- Require sign-off gates before final merge:
  - UX sign-off (`developer_4`)
  - QA gate pass (`developer_3`) including TTFRP status vs `<TTFRP_TARGET_SECONDS>`
- Do not merge release candidate branch with open P0 failures.
