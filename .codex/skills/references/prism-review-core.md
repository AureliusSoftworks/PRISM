# PRISM Review Core

Use this shared contract for PRISM applet review skills. Applet-specific skills
own their rules and evidence chain; this file owns the boundaries that should
not drift between them. Treat `docs/review-artifacts.md` as the canonical
experienced-artifact contract.

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
- For authenticated PRISM UI QA, reuse the single `codex_qa_admin` account via
  the repository's purpose-built account helper. Never create another account,
  use Jared's real account as a fixture, print credentials, or switch the test
  ONLINE without explicit approval.
- Keep one browser tab and preserve the reported session whenever practical.
  If authentication or the relevant installed build is unavailable, report the
  verification boundary instead of manufacturing evidence.

## Fix and verification boundary

- Review-only requests stop after findings and recommendations. When the user
  asks for a fix, create or claim the relevant Bead first, patch the first
  broken shared layer, and preserve saved artifacts unless migration is itself
  authorized.
- Reproduce the reported shape, add focused regressions for both visible output
  and provenance, then run the narrow shared/API/web checks warranted by the
  change. Use live visual/audio/package QA only when those presentation layers
  changed.
- Report findings, root cause, fixes or recommendations, verification, and
  remaining evidence gaps. Never overstate source-only or fixture-only proof as
  a player-surface pass.

## Closing retrospective

Before the final handoff, once findings, verification results, and remaining
gaps are established, read and follow
[Skill Retrospective](/Users/jared/.codex/skills/skill-retrospective/SKILL.md).
Run one bounded closing pass per user review, including review-only requests;
the final owning reviewer runs it after any format routing.

- Retain only demonstrated, reusable lessons. No skill change is a valid
  outcome; do not turn uncertain diagnoses or one-off case details into rules.
- For review-only, thoughts, or recommendation requests, keep the retrospective
  read-only and propose any skill improvements without applying them unless
  the user separately authorizes skill edits.
- Otherwise, make only directly relevant skill improvements: applet-specific
  lessons belong in the owning reviewer; genuinely shared lessons belong in
  this core. Follow Skill Retrospective's scope and privacy boundaries.
- Use `skill-creator` for any skill edits and validation. Do not start another
  applet review or retrospective merely because this pass changed a skill.
- Briefly report the skill changes and validation, or that no reusable update
  was warranted, alongside the review's final handoff.
