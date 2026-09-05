---
name: slate-review
description: Review PRISM Slate manuscripts, Continuity developer transcripts, writing operations, Mirror provenance, Story Bible updates, and Creative Studios Review Circle artifacts, then diagnose provenance and make focused systemic improvements. Use whenever the user invokes /slate-review, supplies a Slate Review export (format prism-slate-review-v1) or Room Note, asks where a section, Continuity decision, or reader review went wrong, or reports character, canon, timeline, clarification, style, momentum, generation, reviewer, artifact, or export failures in Slate — even without the word "review".
---

# Slate Review

Read the shared PRISM review core at
`.claude/skills/references/prism-review-core.md` (PRISM root) before
applet-specific work. Slate Review developer exports and Review Circle reader
artifacts are distinct evidence products.

## Workflow

1. Read the complete supplied record before judging it. For a standardized
   export, run `node .claude/skills/slate-review/scripts/index-slate-review.mjs <path>`
   from the PRISM root; use `--json` when structured extraction helps. Read
   `.claude/skills/slate-review/references/export-schema.md` only when
   validating or repairing the export contract. Convert every developer and
   session note into a work item before anything else.
2. Record the project, section and revision, accepted manuscript prose,
   direction and inferred scope, provider/model route, Mirror version,
   Continuity version/generation, Creative Studios/Review Circle session and
   reviewer snapshots when relevant, export/artifact format, source/running/
   package identity, and whether the record predates relevant current code.
3. Build an evidence ledger for every finding:
   - exact prose, visible question, selected option, or exported event;
   - section, source, operation, concern, clarification, generation, review
     session, reviewer snapshot, artifact/result hash, and event IDs when
     available;
   - provider/model, timing, retry, cancellation, acceptance, and nearby events;
   - responsible layer: document projection, intent compiler, retrieval,
     preflight, clarification, composer, proposal lifecycle, Mirror, extraction,
     reconciliation, generation promotion, Story Bible projection, momentum,
     reader artifact projection, reviewer snapshot, Room Note synthesis,
     persistence, export, or presentation;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace suspicious behavior through `accepted sources -> direction intent ->
   Continuity retrieval/brief -> hard-conflict preflight -> writer
   clarification -> composer proposal -> accept/reject -> extraction ->
   reconciliation -> generation promotion -> Story Bible/momentum projection`.
   Never call a synthesized event summary hidden model reasoning. Slate Review
   exports operational provenance and explicit bounded rationales, not private
   chain-of-thought.
5. Audit the section on three separate axes:
   - **Manuscript quality:** scene objective, causality, character desire and
     pressure, persona/voice, arc movement, pacing, specificity, prose
     coherence, Mirror consistency, requested scope, and whether the ending
     sustains momentum.
   - **Continuity quality:** source grounding, canon/plan/interpretation
     separation, character and knowledge state, chronology and branch identity,
     relationships, causal edges, setup/payoff threads, hard-conflict precision,
     false positives/negatives, question quality, idempotent resume, generation
     isolation, and accepted-proposal authority.
   - **Review Circle integrity:** exact accepted-prose revision, reader
     perspective, frozen Persona/guest snapshots, independent subjective
     verdicts, artifact/reviewer hashes, bounded Room Note synthesis, meaningful
     dissent, and no mutation of manuscript, canon, or companion memory.
6. Audit each in-canvas question. Confirm it interrupted only a material
   high-confidence conflict or a writer-invoked `Unstick me`, offered exactly
   three distinct grounded choices plus `Describe the vibe...`, preserved the
   writer's choice as authority, and resumed the intended operation once.
7. For Review Circle or Creative Studios findings, trace `accepted manuscript
   revision -> reader-perspective PrismReviewArtifactV1 -> frozen reviewer
   snapshot -> independent typed review -> provenance hashes -> verdict-first
   Room Note -> optional writer-authorized direction`. Confirm the manuscript
   and Continuity versions did not change while readers were working. Do not
   treat the developer Continuity transcript as reader-perceptible evidence.
8. Compare multiple exports by section revision, Continuity producer versions,
   and code revision. Identify systemic improvement only when evidence survives
   that comparison; do not optimize Continuity around one story's wording.
9. With a complete export and a concrete complaint, create or claim a Bead,
   establish a focused failing fixture, and fix the responsible PRISM layer. If
   the user asks for review-only, thoughts, or a recommendation, stop after
   findings.
10. Add a regression reproducing the exact source/direction/decision or
   artifact/reviewer/Room Note shape. Prefer deterministic contracts,
   retrieval, validation, state transitions, and provenance over
   story-specific prompt patches. Verify per the core's verification posture;
   Slate synthesis runs behind the login gate, so ask Jared to re-run the
   section and share the next export for comparison.

## Slate Rules

- The manuscript is primary. Do not turn a review finding into more default
  cockpit chrome.
- Direct human writing, locks, accept/reject choices, and explicit Story Bible
  edits are authoritative.
- Accepted manuscript evidence, writer-approved canon, future plans, and AI
  interpretations are distinct layers.
- Character records describe fictional people; they are not PRISM bots or
  autonomous co-authors.
- A project may remember up to three invited Persona readers and one optional
  guest. Reviewers are subjective readers; Continuity remains the objective
  keeper of narrative state. Do not merge their authority or turn disagreement
  into a synthetic consensus.
- Every Review Circle session freezes the exact manuscript scope/revisions,
  Continuity versions, and reviewer prompts. Later manuscript, bot, guest, or
  Continuity changes require a new room and cannot rewrite review history.
- Review Circle receives only the reader-experienced manuscript artifact. Raw
  Continuity state, private developer events, directions, recovery buffers,
  companion memory, and hidden prompts never enter reader evidence or Room
  Notes.
- Review opinions do not become canon or edit prose. `Use this direction` is a
  separate writer-authorized revision-preview action.
- Mirror learns only from eligible human-authored or substantially revised
  prose, never directions, research, quotations, imports, or untouched AI text.
- Soft concerns never interrupt. A hard conflict may pause an AI operation, but
  Continuity failure may not block direct editing, opening, autosave, recovery,
  or export.
- Preserve LOCAL as zero egress across prose, Mirror, Continuity, review,
  images, and export.
- Treat developer events as user-facing diagnostic records. Never request,
  reconstruct, or persist hidden chain-of-thought, credentials, or secrets.

## Key surfaces

- Slate mutations, Continuity, concerns, author safety, character studio, and
  archive import/export: `apps/api/src/prism-slate-mutations.ts`,
  `slate-continuity-auxiliary.ts`, `slate-continuity-concerns.ts`,
  `slate-author-safety.ts`, `slate-character-studio.ts`, `slate-archive-*.ts`
- Workspace, manuscript canvas, direction questions, Story Bible, Mirror, and
  Creative Studios desks: `apps/web/src/app/Slate*.tsx`, with focused tests in
  `apps/web/src/app/slate-*.test.ts`
- Plan of record: `docs/slate-master-plan.md`
- Export indexer and schema: `.claude/skills/slate-review/scripts/index-slate-review.mjs`,
  `.claude/skills/slate-review/references/export-schema.md`

## Output

- `Findings`: evidence-led manuscript and Continuity failures with layer and
  confidence.
- `Root cause`: the provenance chain and why adjacent layers are ruled out.
- `Fixes`: systemic changes made, or focused recommendations in review-only
  mode.
- `Verification`: failing baseline, focused regressions, next-export or
  next-room comparison, and stable artifact/reviewer provenance.
- `Iteration candidates`: ranked changes likely to generalize beyond this
  section.
- `Gaps`: missing source, event, provider, model, version, or live-product
  evidence.
