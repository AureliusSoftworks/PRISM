# Debate v0.1 Preview verification

Last reviewed: 2026-07-28

## Release boundary

Debate replaces the planned Arena identifier with one 8–12 minute Duel:
Judge, Participant, and Spectator roles; one moderator; fixed For and Against
advocates; frozen evidence; explicit advocacy consent; a scoreless living case
board; durable transcripts, ballots, verdicts, and resumable state.

V0.1 deliberately excludes Panel debates, alternate durations, live research
after Start, generated forums, faithful audio replay, and portable transcript
export.

## Product review

- The first-run onboarding remains unchanged because Debate is not a first-run
  destination. Debate has its own resettable contextual walkthrough.
- Light and Dark were visually checked at 1440×1000 for the lobby, four-step
  setup, live forum, source drawer, case board, and all three player roles.
- Judge shows a bench mark, Participant shows the player's Prism beside its
  partner, and Spectator has no player embodiment.
- Reduced Motion has a static lighting path. A masked CSS receiver remains
  available when the adaptive GPU scene cannot initialize.
- Windows WebView2 lighting and mask alignment were not available in this macOS
  verification environment and remain the recorded release gap.

## Privacy and durability

- LOCAL synthesis and Duel generation use only the local provider; Brave
  research is rejected before network access.
- Debate does not read or write conversations, relationship memories, learned
  continuity, or memory summaries.
- Session state, event history, case-board history, cast and Power snapshots,
  evidence, ballots, and verdicts are tenant-scoped and included in account
  backup, restore, and reset.
- Delete uses the shared action journal and a 30-day encrypted quarantine
  inverse, so a deleted Duel can be restored with Undo.

## Automated coverage

Focused shared, API, integration, and web tests cover all three complete role
paths, player Pass behavior, Judge verdict independence, bot ballot ordering,
Devil's Advocate disclosure, declined assignments, pause/resume, stale
revisions, duplicate mutations, provider failure, Power adaptations, source
validation, LOCAL zero-egress behavior, tenant isolation, backup/restore,
reset, delete/Undo, tutorial targets, and Light/Dark forum assets.

The production gate is the repository's standard lint, typecheck, build,
desktop policy tests, runtime staging, and `git diff --check`.

## 2026-07-28 verification record

- Debate-focused shared/API/integration/web suite: 21 passed.
- Production build and full typecheck: passed.
- Lint: passed with 0 errors and 193 existing warnings.
- Desktop policy suite: 4 passed.
- macOS arm64 `.app` bundle: built; its packaged Node 22.23.1, Qdrant
  1.17.1, Debate API module, web server, and both forum receivers were checked
  in place.
- Full repository test run: 2,156 passed, 12 skipped, and one pre-existing
  Story assertion failed. The same Forgetful Freddie assertion reproduces in
  the source `dev` checkout.
- The focused tutorial suite retains two pre-existing Signal copy assertions
  about floor glows and camera pans; both reproduce outside Debate work.
