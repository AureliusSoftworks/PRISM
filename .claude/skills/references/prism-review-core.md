# PRISM Review Core

Use this shared contract for PRISM applet review skills in Claude Code.
Applet-specific skills own their rules and evidence chain; this file owns the
boundaries that should not drift between them. Treat `docs/review-artifacts.md`
as the canonical experienced-artifact contract.

## The export is the work order

Jared improves PRISM through a recursive loop: he plays a live session as a
test flight, annotates it in real time, exports the record, and pastes it in.
The next live session validates the fixes, so a fix that does not land at root
cause comes back as the same note.

- Developer notes (`> **Developer note · <timestamp> · <N FPS>**` blockquotes
  inline) and the closing `## Session notes` are direct orders typed while the
  failure was on screen. Locate the surrounding events before interpreting the
  words. Convert every note into a work item before anything else: fix it,
  queue it with a diagnosis attached, or say explicitly why it is wrong. None
  may be silently dropped.
- Read the rest of the record the way you would read a failing test's output.
  The session is the test.
- Diagnose in source, not from the transcript alone. Notes describe symptoms;
  the cause is usually systemic and shared across bots or lanes.
- Carry unresolved watch items (for example an FPS trough that did not
  reproduce) forward as Beads; they recur across rounds until closed.

## Keep three evidence products distinct

1. **Experienced artifact** — an immutable, perspective-specific
   `PrismReviewArtifactV1` containing only what the declared audience, reader,
   player, participant, or creator could perceive. Applets project this before
   invoking a reviewer. Never pass raw runtime state to the generic runner.
2. **Diagnostic review export** — a developer-facing record that may contain
   public events, IDs, timing, routing, validation, fallback, persistence, and
   presentation provenance. It can explain how an experience was produced, but
   it is not proof that persisted text was visible or heard.
3. **Private internal diagnostics** — sealed truth, private prompts or intent,
   protected continuity, hidden orchestration state, credentials, and similar
   implementation evidence. Read the minimum needed to locate a fault, never
   reproduce it in player-facing artifacts, findings, fixtures, Beads, or logs.
   Never request or reconstruct hidden chain-of-thought.

`PrismReviewResultV1` must retain the artifact hash, frozen reviewer-snapshot
hash and snapshot, rubric id/version, provider/model, and creation time. Those
fields prove what was reviewed and by whom; they do not prove live delivery.

## Review boundary

- Establish the exact applet, format, perspective, session/revision boundary,
  export version, and source/runtime/package identity before diagnosing.
- Read supplied records completely and inspect saved sessions read-only. Never
  resume, reroll, retry, delete, repair, or overwrite the reported artifact just
  to investigate it. Existing dirty work belongs to the user.
- For each finding, cite the perceptible evidence or diagnostic record, stable
  IDs and timing when available, the responsible layer, and confidence as
  `observed`, `inferred`, or `unknown`.
- Trace the applet's full provenance chain. Persisted content, queued playback,
  completed playback, replay reconstruction, and an immutable experienced
  artifact are separate states unless evidence explicitly joins them.
- Distinguish current source, the running API/web process, a staged desktop
  bundle, and the installed application. A source fix cannot change an already
  running request or old package.

## Privacy and QA

- LOCAL is zero egress. Do not use online research, provider escalation, remote
  fallback, or runtime generation while reproducing a LOCAL session.
- Small local models (llama3.2) are the design and testing baseline. A prompt or
  contract fix must succeed there; an online model is uplift, never a
  requirement.
- Authenticated PRISM UI QA uses the single shared LOCAL `codex_qa_admin`
  account described in `AGENTS.md`. Verify it exists with
  `CODEX_SECRETS_ENV=/Users/jared/secrets.env node scripts/prism-local-qa-account.mjs ensure`.
  Never create another account, use Jared's real account as a fixture, print
  credentials, or switch the test ONLINE without explicit approval.
- Claude never types credentials into the PRISM login form or any other field,
  so logged-in surfaces are Jared's to check. Verify UI changes with the repo's
  source-shape tests plus an HTML facsimile built from the real CSS module under
  the gitignored `.cache/` directory (leave `.cache/prism-models` alone),
  screenshot it in the Browser pane, then remove the facsimile. The pane caps
  open tabs at about nine; close old tabs before blaming a "couldn't open file"
  error on the file.
- A parallel Codex session may own the dev ports. Do not start a second API or
  web server on them.
- If authentication, the running build, or the relevant installed bundle is
  unavailable, report the verification boundary instead of manufacturing
  evidence, and hand Jared a precise list of what to observe after
  `npm run desktop` re-stages the runtime.

## Shared working tree

Jared runs Codex, Cursor, and Claude against the same checkout and commits
mid-session from other tools, including Claude's own edits.

- Work directly on `dev`. Never create a branch, worktree, or PR for review
  fixes. Commit only when Jared asks ("merge into dev and push"); stage
  explicit paths, never `git add -A`, and never stash or revert changes you did
  not make.
- Before editing any file, especially an untracked one, re-read it or compare
  its mtime against your read. Anchor edits on exact content, never on line
  numbers: in this tree they move by dozens of lines within minutes. Use
  exact-match edits that assert one hit; never rewrite an existing file
  wholesale. If a clobber happens, rebuild from the other session's sibling
  test file.
- Re-check `git status` before reasoning about tree state; it goes stale within
  a session. Prove a test failure predates you before treating it as yours, and
  confirm your diff contains only your hunks before reporting.

## Fix and verification boundary

- Review-only requests stop after findings and recommendations. When the user
  asks for a fix, create or claim the relevant Bead first, patch the first
  broken shared layer, and preserve saved artifacts unless migration is itself
  authorized.
- Beads (`bd`) is the tracker shared with the Codex sessions. Find existing work
  with `bd search "<text>"` or `bd list --status open`; create with
  `bd create "<title>" --type bug --description "<diagnosis>"`; claim with
  `bd update <id> --claim`; close with `bd close <id>` once the fix lands. Keep
  sealed or private content out of Bead text.
- Reproduce the reported shape and add focused regressions for both visible
  output and provenance. Sanitizer or validator changes require paired accepted
  and rejected cases.
- Verification posture: Jared's standing instruction is not to run test suites
  or typechecks proactively; PRISM's suites are large and he verifies in-app.
  Write the regression, deliver the fix, and state plainly what changed and
  that it is unverified. Run tests only when he reports a fix did not work or
  asks. When several edits stack up, offer a scoped typecheck rather than
  running it. A scratchpad probe that reproduces a predicate's behavior is
  diagnosis, not testing; use it freely and prefer it to speculation. Live
  visual, audio, or package QA belongs to Jared unless the surface is reachable
  without login.
- Scale the response to the finding. Small and certain: fix now. Large or
  architectural: queue a Bead with the diagnosis attached so the analysis is
  not lost. Uncertain: say what you found and ask.
- Report findings, root cause, fixes or recommendations, verification, and
  remaining evidence gaps. Never overstate source-only or fixture-only proof as
  a player-surface pass, and flag any finding that contradicts one of Jared's
  notes rather than silently overriding it.

## Closing retrospective

Before the final handoff, once findings, verification results, and remaining
gaps are established, read and follow the Skill Retrospective at
`~/.claude/skills/skill-retrospective/SKILL.md`. Run one bounded closing pass
per user review, including review-only requests; the final owning reviewer runs
it after any format routing.

- Retain only demonstrated, reusable lessons. No skill change is a valid
  outcome; do not turn uncertain diagnoses or one-off case details into rules.
- For review-only, thoughts, or recommendation requests, keep the retrospective
  read-only and propose any skill improvements without applying them unless
  the user separately authorizes skill edits.
- Otherwise, make only directly relevant skill improvements: applet-specific
  lessons belong in the owning reviewer; genuinely shared lessons belong in
  this core. Follow Skill Retrospective's scope and privacy boundaries.
- Load the `anthropic-skills:skill-creator` skill for any skill edits and
  validation. Do not start another applet review or retrospective merely
  because this pass changed a skill.
- Briefly report the skill changes and validation, or that no reusable update
  was warranted, alongside the review's final handoff.

## Codex twins

Every skill here was ported from the Codex catalog Jared runs in parallel:
`.codex/skills/<name>/SKILL.md` for coffee, effort, flyting, signal,
turnabout, and whodunnit; `~/.codex/skills/<name>/SKILL.md` for debate, slate,
and skill-retrospective; `.codex/skills/references/prism-review-core.md` for
this file. Do not edit the Codex copies from a Claude session unless Jared asks.
When a retrospective changes a shared contract here, name the twin that now
differs in the handoff so the two catalogs can be re-synced.
