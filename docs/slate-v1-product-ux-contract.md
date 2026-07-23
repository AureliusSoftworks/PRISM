# Slate V1 Product and UX Contract

Slate is PRISM's prose-fiction production workspace. It is built around one
clear division of labor:

> The AI writes. The writer directs.

The AI performs most drafting and rewriting labor. The writer retains creative
authority by shaping, arranging, directing, approving, rejecting, locking, and
directly editing the work.

## Product boundary

Slate is not Chat with a document attached. It is a quiet creative-production
desk whose primary objects are a project, its structure, its manuscript, and
explicit directions.

Slate and Story remain separate experiences:

- **Story:** "Let's discover what happens." An immersive procedural experience.
- **Slate:** "Let's turn this into something good." An editorial production
  workspace.

Story remains a preview applet while Slate is built. Story earns graduation only
when choices materially alter later events; current-run character memory and
world facts remain coherent; consequences persist; players can discover moments
they would not have outlined; and playing a scene feels meaningfully different
from asking Slate to write one. Do not remove Story or fold its player experience
into Slate during Slate V1.

## V1 scope

Slate V1 is for prose fiction:

- short stories
- chapters and novellas
- novel projects
- imported prose or planning material

Screenplays, poetry-specific tooling, publishing-grade EPUB/PDF layout,
collaboration, persona editor panels, and branching-fiction authoring are later
roadmap items. Clean manuscript export to DOCX, Markdown, and text is part of
the author-safety foundation.

Slate starts from the account's effective provider and model defaults. Each
project may then choose **OFFLINE**, **AUTO**, or **ONLINE** prose routing and a
concrete model. Sampling and reasoning controls remain under the hood.

## Continuity versioning

Continuity is a larger narrative framework with a capability version independent
from the Slate applet version. Its shared version contract begins at planned
`v0.0` and remains visible in Slate settings. Promote it only when the
corresponding end-to-end capability is genuinely usable; internal schema,
extractor, resolver, and prompt-projection revisions may advance separately
without presenting implementation noise to the writer.

For the first promotion, “genuinely usable” includes the visible concern and
reconciliation loop, safe shadow-generation promotion/rollback, and
representative multi-book cohesion—not merely persisted tables or background
jobs.

The normative series-scale ledger, provenance, privacy, upgrade, context, and
reconciliation contract lives in `docs/slate-continuity-contract.md`. The
cross-workstream dependency index lives in `docs/slate-master-plan.md`.

## Workspace contract

The primary workspace has three conceptual regions:

1. **Structure rail** — acts, chapters, scenes, characters, and unresolved
   threads. Structural cards can be added, removed, pinned, redirected, and
   rearranged.
2. **Manuscript canvas** — beautifully typeset, directly editable prose.
   Human edits autosave and are authoritative.
3. **Direction panel** — concise project-, chapter-, scene-, or selection-level
   notes and actions. It is not a chat transcript.

The direction panel can open a bounded **Lux / Umbra inner dialogue** when a
creative decision benefits from visible counterpoint. Lux develops the humane,
coherent possibility; Umbra pressure-tests its assumptions, cost, and ability
to survive contact with the story. They alternate for one to three
writer-selected rounds, then Slate resolves the exchange into one proposed
direction. The exchange is ephemeral, stoppable, uses the project's prose
privacy route, and cannot mutate manuscript, structure, title, or Continuity.
The writer must explicitly place the synthesis into a draft or revision
direction before it can affect generated prose.

Slate Settings exposes project-scoped profiles for the two hemispheres. Lux and
Umbra may each inherit the project prose route or select a model allowed by the
project's OFFLINE, AUTO, or ONLINE boundary, plus carry a writer-authored
creative lens. These settings can emphasize each side but never replace its
core role, weaken the privacy route, or grant document authority. The center
synthesis continues to use the project's ordinary prose route.

A movable rainbow Prism bubble opens an ephemeral project-context exchange in
place. The composer and Markdown messages float independently above the desk,
then each message fades like action text. Only the latest three messages are
kept as a crash-recovery buffer; they are not continuity, and Prism does not
bring up an earlier exchange unless the writer explicitly asks about one still
in that buffer. The companion is advisory chrome, not a fourth document region:
it cannot mutate prose, Continuity, structure, or titles.

Cross-surface discussion is selection-led. Zen can send an exact, previewed
passage into a new project's spark or attach it to an existing project as a
read-only source card. Slate can preview an exact manuscript selection and
stage it in Zen for discussion. No transfer includes surrounding transcripts,
manuscript, Continuity, or memory, and the Zen draft is not a conversation turn
until the writer deliberately sends it.

The workspace moves through three phases without forcing a rigid wizard:

### Shape

- Start from exactly one source: a creative spark or existing material. Bringing
  material replaces the spark controls so the sources are never blended accidentally.
- Preserve a supplied title; otherwise use the active privacy-matched prose model
  to generate a story-aware working title from the source, then confirm it before
  creation. The writer may request another title or edit it directly.
- Offer privacy-matched book-cover generation as an explicit creation choice and
  as a repeatable project action. Title and cover generation remain independent;
  neither silently replaces the writer's accepted choice.
- Wildcard-assisted starts are optional: a writer may place supported uppercase
  `{WILDCARDS}` in the spark, preview or reroll the concrete result, and create
  from that roll. Slate preserves both the resolved spark and its source template.
- Establish premise, intent, cast, voice, structure, and non-negotiables.
- Ask Slate for a proposed story spine and scene plan.
- Rearrange, remove, pin, lock, or redirect structural elements before drafting.

### Draft

- Draft an approved scene or section without repetitive conversational prompting.
- Show exactly which planned section Slate is writing.
- Allow start, stop, continue, and redirect actions.
- Preserve the approved structure and any locked material.

### Refine

- Direct a project, chapter, scene, or selection revision.
- First actions include **Deepen**, **Condense**, **Rewrite**, **Reframe**, and
  **Cut**, plus concise freeform direction.
- Preview revisions as proposals before they affect the manuscript.
- Accept or reject a proposal; preserve a version checkpoint before substantial
  accepted rewrites.

## Authority and safety rules

1. Direct human edits are authoritative and autosave without requiring AI
   approval.
2. Pinned or locked material is never overwritten by generation or revision.
3. AI revisions remain proposals until explicitly accepted.
4. Rejecting a proposal leaves the manuscript unchanged and records the
   decision for project continuity.
5. Substantial accepted AI rewrites create a recoverable version checkpoint.
6. Generation acts on an explicit structure item or scope; it does not silently
   continue elsewhere.
7. Project prose routing starts from account defaults and may be overridden by
   OFFLINE/AUTO/ONLINE plus a model choice. OFFLINE must use only the local
   provider path and must never escalate externally.
8. Every AI draft and revision stores a backend receipt containing the exact
   provider, model, target artifact, and content hash even when the prose is
   later edited or the proposal is rejected.
9. Living summaries, project chat, and title suggestions remain advisory.
   Once a spark-led manuscript has enough prose, Slate surfaces a visible title
   checkpoint. It recommends a replacement only when materially stronger, and
   accepting it remains an explicit writer action.

## Persistent project contract

Each tenant-scoped project stores at minimum:

- title, creative spark, premise, voice, and non-negotiables
- current phase
- ordered structural items and their kind, summary, direction, status, and lock
- characters and unresolved threads
- editable manuscript text
- project-, scene-, and selection-level direction
- current AI revision proposal and its accepted/rejected state
- version checkpoints created before substantial accepted rewrites
- timestamps and the provider/model provenance of AI operations
- project prose-routing and model preferences
- backend generation receipts for drafted and proposed prose
- a fingerprinted living `Story so far` summary
- project-scoped Prism side-chat history
- pending and resolved title suggestions

All project list, detail, update, generation, and revision queries include the
authenticated `user_id`. Knowing another tenant's project or revision ID must not
permit reading or mutation.

## First functional vertical slice

Slate becomes preview `v0.1` only when a player can:

1. Enter Slate from PRISM's applet surface.
2. Create a persistent prose project from either a creative spark or existing
   material, deriving a working title when the writer did not provide one and
   optionally resolving spark `{WILDCARDS}` before creation.
3. Shape a generated premise and scene plan.
4. Open the three-region manuscript workspace.
5. Draft at least one planned scene.
6. Direct a revision without a chat transcript.
7. Preview and accept or reject the proposed revision.
8. Directly edit and autosave the manuscript.
9. Leave and reopen the project with structure, manuscript, locks, and revision
   state intact.

Until those behaviors work together and targeted verification passes, Slate stays
planned `v0.0` and must not be advertised as usable.

## Story and Slate integration roadmap

Cross-applet integration is explicit, staged, and snapshot-based. No stage may
silently synchronize or rewrite content across applets.

### Stage 1 — Slate standalone foundation

Ship the V1 vertical slice above. Story remains unchanged and separately usable.

### Stage 2 — Story to Slate: `Develop in Slate`

Story asks what to create:

- a polished short story
- a chapter or novella
- a larger outline
- a substantial reimagining

It also asks how faithfully Slate should treat the run: **Preserve it**,
**Expand it**, or **Reimagine it**.

The handoff is a structured narrative source packet, never a transcript dump. It
can contain the chosen path and ending, important discarded branches, characters
and demonstrated voices, locations, objects, relationships, world facts, major
dramatic and emotional beats, player-bookmarked moments, visual references, and
field-level provenance distinguishing procedural from player-directed material.
The original Story stays unchanged and is linked as a read-only source snapshot.

### Stage 3 — Slate to Story: `Rehearse in Story`

A writer snapshots a Slate scene or outline into Story as an improvisational
simulation. The resulting Story run is linked to that immutable Slate source
snapshot. Playing and bookmarking discoveries never mutates the Slate project.

### Stage 4 — selective round-trip incorporation and provenance

Slate lists candidate discoveries from a rehearsal. The writer chooses what to
incorporate and where. Every accepted discovery retains provenance to the Story
run and Slate source snapshot, creates version safety before a substantial
rewrite, and respects human edits and locks.

The long-term loop is:

`Slate draft -> Rehearse in Story -> Play the scene -> Bring discoveries back -> Revise in Slate`

## Tutorial and onboarding contract

- Player-accessible Slate ships with an action-led tutorial whose selectors are
  stable and tested.
- The walkthrough teaches project creation, prose routing/model choice,
  structure selection/rearrangement, manuscript editing, the living summary,
  advisory project chat, direction, and revision approval.
- The tutorial remains skippable and resettable.
- `firstRunOnboarding.ts` needs no additional Slate-specific provider step:
  account setup remains the default, while the project control is taught inside
  Slate and can be changed later.

## Deliberate V1 exclusions

- `Develop in Slate`, `Rehearse in Story`, and round-trip incorporation runtime
  UI (the contracts are documented now; implementation is staged later)
- live cross-applet synchronization
- advanced sampling/reasoning controls
- chat that can silently mutate manuscript, structure, Continuity, or title
- custom persona-guided editor panels and multi-editor panels
- screenplay-specific structure and formatting
- collaborative editing, comments by other people, publishing-grade EPUB/PDF
  layout, and branching-fiction authoring
