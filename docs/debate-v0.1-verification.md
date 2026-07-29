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
- Debate setup is one non-gated Debate Studio: a persistent instrument rail
  switches the active Motion, Cast, Evidence, or Archive workbench while the
  Forum schematic and launch circuit stay visible. It uses one continuous
  production surface rather than a wizard or stack of website cards.
- Stage geometry is a quiet advanced control before, between, and after
  proceedings. During a live Duel it sits behind the camera bar's overflow
  control instead of competing with everyday camera direction.
  Outside a session it preserves the current draft assignments and fills empty
  roles with unique Library stand-ins; the same account/device calibration
  applies to every future, active, and completed proceeding.
- The alignment workspace has a Wide/Moderator preview toggle. Wide exposes all
  three roles and their tuners; each role can independently place its bot,
  nameplate, and glyph plate by direct drag or exact X/Y controls. Moderator
  uses the authored close-up receiver, restores the full moderator body and
  glyph screen, and exposes only the moderator's three items. Its viewport uses
  the same responsive width and height rules as the live Forum so saved
  placement is pixel-faithful rather than a 16:9 approximation. The two views
  persist independent moderator bot, nameplate, and glyph placements, and Copy
  alignment data exports both as formatted JSON, including unsaved adjustments.
- Debate, Signal, Coffee, Chat, and Zen use the shared bot-picker grid and tile
  presentation while keeping their own single-seat or multi-seat rules.
- The live Forum is stage-first: the authored chamber dominates the viewport,
  Proceedings occupies one restrained transcript rail, and the living case
  board and gallery form a compact support strip. Player turns and
  interjections rise in a full-width command deck; pause, player-turn, verdict,
  and interruption states appear directly on the stage.
- The source viewer behaves as a keyboard-contained modal drawer, and the
  contextual walkthrough ends with optional stage geometry so it cannot strand
  the player inside calibration.
- Light and Dark were visually checked at 1440×1000 for the production Studio,
  live Forum, source drawer, case board, and all three player roles.
- Judge shows a bench mark, Participant shows the player's Prism beside its
  partner, and Spectator has no player embodiment.
- Each podium carries its cast bot's glyph on a dark inset screen. Advocate
  screens are perspective matched to their angled podiums and pulled slightly
  inward, while only the current turn owner's mark glows; speech, prose reveal,
  and ambient vocal Foley do not grant the floor.
- Wide, Left, and Right keep the moderator's expressive face inside a smaller
  procedural dark screen with a silver-white rim and no fine frame texture.
  Moderator view restores the full textured bot and full-size glyph screen,
  with the moderator facing the advocate who owns the turn.
- Reduced Motion has a static lighting path. A masked CSS receiver remains
  available when the adaptive GPU scene cannot initialize.
- Windows WebView2 lighting and mask alignment were not available in this macOS
  verification environment and remain the recorded release gap.

## Privacy and durability

- LOCAL synthesis and Duel generation use only the local provider; Brave
  research is rejected before network access.
- One Debate-wide provider/model handles synthesis, consent, all three cast
  members, and ballots; Start freezes that lane into the saved session.
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
Web coverage also pins shared picker filtering and keyboard navigation,
slot-first cast assignment, duplicate and muted-moderator prevention, dashboard
readiness, and removal of the former setup wizard.

The production gate is the repository's standard lint, typecheck, build,
desktop policy tests, runtime staging, and `git diff --check`.

## 2026-07-28 verification record

- Debate Studio UI/UX overhaul: setup now uses one rail-driven instrument
  console with focused Motion, Cast, Evidence, and Archive workbenches, a
  persistent Forum schematic, and one launch circuit. The live Forum gives the
  authored chamber visual priority, moves player actions into a fixed command
  deck, adds explicit stage states, and keeps calibration behind advanced
  controls. Browser QA at 1440×900 covered every Studio workbench, Light and
  Dark, Wide/Left/Moderator/Right cameras, dashboard and live alignment,
  normalized stage-position fidelity, and the unclipped launch rail. The
  contextual tutorial was updated in the same pass; first-run onboarding was
  reviewed and remains unchanged because Debate is not a first-run
  destination. Twenty-five focused Debate contracts, the focused Debate
  tutorial contract, 16 companion-integration contracts, web typecheck, the
  mocked desktop visual flow, focused lint, formatting, and diff check passed.
- Independent stage-item follow-up: For and Against nameplates now use matching
  restrained ±10° perspective, while the moderator remains square to camera.
  Wide gives every role separate Bot, Nameplate, and Glyph plate drag handles
  plus one compact item selector with exact X/Y controls; Moderator provides
  the same three controls against its own saved close-up placements. Existing
  V1/V2 alignment migrates into V3 without moving the bot/nameplate pairing
  users previously calibrated. Twenty-seven focused Debate contracts, the
  targeted Debate tutorial contract, web typecheck, focused lint, formatting,
  and diff check passed. Browser QA at 1280×720 verified Dark Wide, Dark
  Moderator, and Light Moderator; keyboard placement moved only the selected
  item, close-up nameplate movement left Wide and both other close-up items at
  zero, the opposing nameplates resolved to opposite 10° matrices, and the
  temporary QA account was deleted afterward. The full mode-tutorial suite
  still has its two pre-existing Signal copy-contract failures (close-up pan
  wording and separate floor-glow wording); the Debate tutorial contract passes.
- Stage-fidelity correction: the aligner no longer forces a 16:9 approximation;
  it uses the live Forum's responsive stage width and capped height. The mocked
  1440×900 browser fixture applies non-zero saved offsets, then verifies the
  alignment and live stage boxes match within one pixel and every bot,
  nameplate, and podium glyph resolves to the same normalized position.
- Independent moderator-calibration follow-up: Wide and Moderator now persist
  separate moderator positions with automatic V1 migration, and the alignment
  workspace copies both views as formatted JSON. Thirty-three focused Debate
  contracts, the targeted Debate tutorial contract, web typecheck, focused
  lint, and diff check passed. The mocked 1440×900 browser fixture verified
  close-up adjustment leaves Wide unchanged, each scoped reset preserves the
  other view, and clipboard output includes unsaved values from both views.
- Moderator alignment-view follow-up: the new Wide/Moderator preview toggle
  passed 32 focused Debate contracts, the targeted Debate tutorial contract,
  web typecheck, and the mocked 1440×900 browser visual. The browser fixture
  also verified the authored close-up, full moderator avatar, moderator-only
  tuner, arrow-key nudge, scoped reset, and return to the three-role Wide view.
  Focused lint passed with 0 errors and 176 existing warnings; diff check
  passed.
- Persistent alignment access follow-up: the dashboard entry and
  session-independent stand-in preview passed 32 focused Debate contracts, the
  targeted Debate tutorial contract, web typecheck, diff check, and the mocked
  1440×900 desktop visual. The same fixture confirmed the live camera-bar
  entry remains available.
- Dashboard and unified-picker follow-up: web typecheck and production build
  passed; 24 shared-picker and Debate contracts, 2 focused Signal picker/
  Producer contracts, and 2 Debate tutorial contracts passed.
- Moderator/podium presentation follow-up: focused presentation contracts,
  web typecheck, and the 1440×900 mocked live visual passed. The visual fixture
  pins the expressive compact moderator screen in Wide, the full textured body
  in Moderator view, dark perspective-matched podium screens, their inward
  registration, current-turn glow, 50%/100% moderator screen scaling, and the
  moderator's turn-directed facing.
- Browser QA covered the Debate dashboard in Light and Dark at 1440×900,
  slot activation and auto-advance, duplicate disabling, search, arrow-key
  navigation, persistent Start placement, and New Debate’s in-place reset.
  Signal’s compact Host grid and Coffee’s multi-select grid were also checked.
- The 1180px and 900px dashboard media rules resolve to a one-column desk and
  rail respectively. PRISM’s existing desktop viewport gate still prevents an
  end-to-end phone-sized app session.
- Focused lint passed with 0 errors and 2 existing Signal hook-dependency
  warnings. `git diff --check` passed.
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
