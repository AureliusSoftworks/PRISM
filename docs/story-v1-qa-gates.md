# Story V1 QA Gates

Operational verification gates for Story V1 (`setup -> generating -> reading -> library`).

## 1) Time-to-First-Readable-Page (TTFRP) Target Tracker

Use this section as the single source of truth for Story V1 first-value speed.

| Field | Value |
| --- | --- |
| Target TTFRP (seconds) | `<TTFRP_TARGET_SECONDS>` |
| Current observed p50 (seconds) | `<MEASURED_P50_SECONDS>` |
| Current observed p95 (seconds) | `<MEASURED_P95_SECONDS>` |
| Sample size | `<N>` |
| Environment | `<local/staging/prod-like>` |
| Last measured at | `<ISO_TIMESTAMP>` |
| Owner | `<name>` |

Gate rule: do not pass pre-release if p95 TTFRP exceeds target without an approved exception.

## 2) Prioritized Verification Matrix

Legend: P0 = release blocker, P1 = must-fix before release candidate sign-off, P2 = polish/follow-up.

| Priority | Verification Item | Method | Pass Criteria |
| --- | --- | --- | --- |
| P0 | **Text-first unlock** from generating | Manual + API status check | Reader unlocks immediately once `textReady=true`; no wait for image completion. |
| P0 | **Story-memory isolation** | API/manual cross-mode check | Story critique/preferences affect Story only; Chat/Sandbox behavior/memory remains unchanged. |
| P0 | Setup autosave clarity and resilience | Manual | Autosave visibly cycles `Saving.../Saved/Retry`; failed save never drops typed input. |
| P0 | Generate CTA gating by readiness | Manual | `Generate story` stays disabled until blockers resolved; blockers are concrete/actionable. |
| P0 | Session continuity on refresh/reopen | Manual | In-flight generation restores stage and safe next action; no forced reset to setup. |
| P0 | `.story` strict validation safety | Manual/API | Invalid payloads hard-fail with human-readable reason; no partial import success state. |
| P1 | Image placeholder/backfill behavior | Manual | Placeholder label shown deterministically; backfilled images replace in place without reader interruption. |
| P1 | Library reopen mode fidelity | Manual | Opening item restores correct phase (`generating` vs `reading`) from item state. |
| P1 | Idempotency conflict handling | API | Reused idempotency key with different payload returns `409`; duplicate valid request reuses job. |
| P1 | Retry path safety | Manual/API | Recoverable failures expose retry without dead-end navigation. |
| P2 | Progress/copy contract fidelity | Manual | Stage labels are plain-language and calm; no backend/stacktrace wording exposed. |
| P2 | Keyboard/focus/live-region behavior | Manual | Dynamic status changes remain perceivable and controls keep expected focus behavior. |

## 3) Pre-Merge Checklist

- [ ] All P0 items executed for changed surfaces and passing.
- [ ] Any touched P1 item executed and passing, or deferred with explicit owner/date.
- [ ] Story-memory isolation spot-check completed against Chat/Sandbox (no cross-mode contamination observed).
- [ ] Text-first unlock check completed with evidence (`textReady=true` while images still pending).
- [ ] New/updated tests added for changed behavior (or explicit reason documented if test not practical).
- [ ] Regression risk note added for any uncovered edge path.

## 4) Pre-Release Checklist

- [ ] Full P0 + P1 matrix pass on release candidate build.
- [ ] TTFRP tracker updated with fresh run data and target comparison.
- [ ] Manual stakeholder validation flow completed and recorded.
- [ ] Rollout/fallback gate reviewed and approved by owner.
- [ ] No open release-blocking defects on Story setup/generating/reading/library.

## 5) Manual Stakeholder Validation Flow (<=4 Steps)

1. Start a new Story session, complete setup, and confirm autosave/readiness behavior.
2. Trigger generation and verify reader unlocks the moment text is available (before full image completion if needed).
3. Validate library reopen behavior and strict `.story` import failure UX with one intentionally invalid file.
4. Confirm Story-only memory boundaries by submitting Story critique, then checking Chat/Sandbox remain unaffected.

## 6) Rollout + Fallback Gating Guidance

### Rollout Gate (Go/No-Go)

- **Go** only if all P0 pass, P1 has no unresolved high-risk defects, and TTFRP meets target (or has explicit exception approval).
- **No-Go** if Story-memory isolation fails, text-first unlock fails, or session continuity fails.

### Fallback Plan (if post-release issue appears)

1. Disable Story entry point for new sessions (feature flag/UI gate).
2. Preserve existing sessions as read-only when possible; avoid destructive state transitions.
3. Route users to safe fallback (`Back to Hub`/library) with clear message.
4. Re-open rollout only after failed P0 gate is re-verified and documented.
