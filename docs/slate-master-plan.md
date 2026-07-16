# Slate Master Plan

Slate is PRISM's quiet prose-production workspace:

> The AI writes. The writer directs.

This is the durable execution index for Continuity, long-form manuscripts,
Review Circle, Atmosphere, author safety, exports, and Story handoffs. Beads are
the source of truth for implementation status.

## Product contract

- Continuity privately maintains saga-scale canon, chronology, knowledge,
  relationships, locations, objects, promises, and unresolved threads.
- Continuity warns but never blocks. Human edits, locks, and approvals remain
  authoritative.
- The writer sees one contextual decision at a time, never a wiki or ribbon.
- Personas join only as invited subjective reviewers in a Review Circle.
- Return sessions lead with a grounded synopsis and one next action.
- Atmosphere begins as local story-reactive ambience; illustrations are later,
  optional, provider-routed, and explicitly accepted.
- Autosave, version history, rotating recovery, and portable exports are core
  requirements for novel-length work.
- Story remains separate and connects only through explicit immutable snapshots.

## Normative architecture

### Long-form manuscript

- SQLite stores stable ordered act, chapter, scene, and imported-manuscript
  sections. Each section owns prose, private direction, locks, status, content
  hash, and optimistic revision number.
- The focused section is the editing unit. Full-book reading is a separate,
  paginated or virtualized projection; it must not rebuild one giant editable
  document in the browser.
- A flat generated plan is projected into hierarchy deterministically: an act
  opens the current act and closes the prior chapter; a chapter belongs to the
  current act; and a scene belongs to the current chapter, then current act.
  Chapters without an act and scenes without either container remain at the
  root. Imported material is a root boundary. Stable ordering remains the final
  authority, and reopen backfills these relationships for older flat records.
- Existing monolithic projects receive an exact version checkpoint before
  migration. Split only at unambiguous headings; otherwise preserve every byte
  in one `Imported manuscript` section.
- Stale autosaves, model results, and background jobs fail under compare-and-
  swap instead of overwriting newer human work. Multi-section changes are
  versioned and atomic.

### Continuity narrative mind

- The authoritative tenant-scoped ledger covers series, ordered books,
  immutable sources, entities and aliases, claims, events, knowledge,
  relationships, objects, locations, promises, threads, concerns, jobs,
  provenance, and ledger generations.
- Canon distinguishes narrated fact, writer constraint, character belief,
  rumor, mystery, deliberate ambiguity, and superseded material. Corrected or
  deleted evidence is not current canon and must not return in later prompts.
- Every derived record points to exact source evidence and records the
  Continuity capability version plus its schema, extraction, reconciliation,
  context, recap, and Atmosphere producer versions.
- A rebuildable semantic index may accelerate recall later, but SQLite IDs,
  hashes, ordering, provenance, and constraints remain sufficient for correct
  operation.

Processing order is fixed:

1. Deterministically diff changed prose, resolve exact aliases, update indexes,
   and detect exact conflicts.
2. Use the local auxiliary model for bounded extraction, recap, reconciliation,
   and semantic uncertainty.
3. Only in ONLINE mode, allow an explicitly routed high-impact uncertainty
   check through the account's effective provider and model.
4. Validate every generated fact against current source evidence.
5. Compile a bounded scene brief containing the focused section, adjacent
   structure, relevant cross-book canon, character knowledge, locks, voice,
   due threads, and current direction.

The baseline context budget is 8,192 tokens. Routine work stays usable with
`llama3.2`; stronger models improve nuance and prose rather than unlock memory,
privacy, or basic cohesion. LOCAL never invokes an online LLM, embedding,
image, backup, or export service. Paired Ollama and ComfyUI hosts must be
loopback, private-LAN addresses, or `.local` names; public endpoints fail
closed before discovery or generation.

### Continuity upgrades

Each project records active and target Continuity versions, active and previous
ledger generations, upgrade state, and the last successful run. An upgrade:

1. preserves immutable sources and the active ledger;
2. builds a separate shadow generation;
3. validates and compares canon, concerns, provenance, and retrieval;
4. promotes compatible conclusions atomically;
5. presents one recommendation when conclusions materially change;
6. keeps the old generation active when deferred or failed; and
7. retains the immediately previous generation for rollback.

Archives migrate compatible older producer versions forward. Older runtimes
reject newer unsupported archives before mutation with a clear explanation.

## Experience contract

### Gentle direction and return sessions

- Project creation begins with one spark or import surface. Title confirmation
  and `{WILDCARD}` assistance appear only when useful or explicitly requested.
- Refinement offers one contextual action plus freeform direction, not a ribbon
  of commands or a conversational transcript.
- Only one next card appears at a time. Priority is canon risk, narratively due
  thread, Continuity upgrade, requested review, drafting guidance, then a visual
  suggestion.
- Opening a book, launching Slate, or returning after roughly twelve hours
  begins a project session with `Story so far`, `Where it is going`, progress,
  and one recommended action. Recaps are fingerprinted against manuscript,
  structure, lore, and Continuity versions.
- Tutorials are action-led, one step at a time, skippable, resettable, and tied
  to stable selectors.

### Persona Review Circle

- A project may remember up to three invited Personas and one optional guest.
  Reviewers are subjective readers; Continuity remains the objective keeper of
  narrative state.
- Every review snapshots the Persona profile and prompt, exact manuscript
  scope, section revisions, and Continuity versions. Later bot edits or deletion
  cannot rewrite review history.
- Reviews never read or modify ordinary companion memories. An offline-only
  Persona forces LOCAL routing.
- Reviewers respond independently, receive one bounded deliberation round, and
  produce one verdict-first `Room Note` containing agreement, meaningful
  dissent, evidence, and one action. `Use this direction` creates a normal
  revision preview.
- Review opinions never become canon or edit prose directly. Slate may gently
  offer a review after a milestone but never starts a panel automatically.

### Atmosphere and illustrations

- The first Atmosphere slice derives local ambient cues from focused-scene
  location, time, weather, mood, texture, and palette. Cues are cached by
  section revision, lore generation, and Atmosphere producer version.
- Ambient transitions occur only at scene or session boundaries. The manuscript
  remains on a readable paper surface in light/dark, high contrast, and reduced
  motion, with a persistent shared-navbar toggle.
- Later scene plates are opt-in recommendations at meaningful moments. They use
  the effective image provider, preview before acceptance, and become part of
  reading/export layout only after approval. Visual details never become canon
  unless the writer explicitly promotes them.

## Author safety and portability

Slate protects work through three independent layers:

1. **Transactional autosave** — continuously save settled focused-section
   edits; keep failed saves in the live editor; show quiet Saving, Saved, or
   actionable conflict status. A bounded browser draft journal must preserve
   the final unsaved edit window across crashes or forced closes before the
   automatic-recovery umbrella is considered complete.
2. **Internal history** — checkpoint before substantial drafts or rewrites,
   imports, Continuity promotion, restores, and structural migration; support
   section-level recovery.
3. **External recovery generations** — snapshot changed authoritative content
   about every five active minutes and at meaningful milestones; write temp,
   flush, checksum, verify, and atomically rename under owner-only local paths.

Recovery retention keeps 12 recent five-minute generations, 24 hourly, 30
daily, and 12 monthly. Corrupt newest generations are skipped. An optional
writer-selected mirror is secondary; mirror failure never prevents the local
snapshot, and repeated failure is the only reason to interrupt the writer.
Normal success appears as quiet `Protected · <time>` status.

The versioned `prism-slate-project-v1` ZIP contains series/project metadata,
structure and prose sections, locks and non-negotiables, version history,
pending revisions, authoritative Continuity sources/canon/generation metadata,
available Story/Review/visual provenance, a Markdown fallback, and per-file
hashes. It excludes credentials, API keys, rejected generated assets, temporary
jobs, caches, vector indexes, and every sibling book's prose or Continuity
evidence. Cross-book entities referenced by the backed-up project may survive
only as metadata-only identity stubs. Import rejects cross-project rows,
previews first, and restores as a copy; replacement is a separately confirmed
future operation protected by a snapshot.

Clean manuscript export supports selection, scene, chapter, act, or book in
DOCX, Markdown, and text. Output is deterministic prose with title, structural
headings, conventional scene breaks, and a checksum manifest. It excludes
Continuity internals, AI/provider metadata, reviews, comments, and private
direction. EPUB/PDF, series-wide editorial packages, custom covers, and animated
library pages remain later publishing work.

## Verification contract

Release evidence covers tenant isolation, LOCAL egress, migration without prose
loss, stale-write rejection, human edits surviving background work, current-
canon correction/deletion, producer versions and rollback, recovery cadence and
corruption fallback, archive traversal/future-version/no-secret checks,
restore-as-copy, deterministic valid exports, one-card return sessions, shared
navbar/theme behavior, tutorials, and wildcard/draft/revision/reopen flows.

Compact multi-book fixtures run in normal CI. A separate target-scale evaluation
must exercise roughly seven books and two million words, large casts, recurring
objects and locations, non-linear chronology, secrets, belief state, retcons,
promises, false-positive budgets, storage growth, incremental latency, and
llama3.2 usability.

Deliberate exclusions are a public/editable Continuity wiki, arbitrary version
selection, per-project model controls, automatic Review Circle sessions,
reviewer voting or prose mutation, silent AI/image/cross-applet writes, direct
cloud backup integration, V1 screenplays, Story removal, and inline editable-
prose illustrations.

## Dependency order

1. **Contracts** — series-scale canon, provenance, versions, privacy, and UX
   boundaries (`PRISM-1ln0p.1`).
2. **Persistence** — tenant-scoped series, projects/books, sections, sources,
   ledger records, concerns, generations, and jobs (`PRISM-1ln0p.2`).
3. **Long-form manuscript** — stable sections, revision-safe saves, legacy
   migration, focused editing, deterministic hierarchy, and paginated reading
   (`PRISM-huqnu.10`, `PRISM-huqnu.19`).
4. **Full-book reader** — bounded virtualized continuous reading over the
   paginated section API, followed by gentle multi-book series/library
   management (`PRISM-huqnu.20`, `PRISM-huqnu.22`).
5. **Deterministic Continuity** — changed-range indexing, bounded context, and
   dependency invalidation (`PRISM-1ln0p.3`).
6. **Auxiliary Continuity** — local-first extraction and reconciliation
   followed by rare explicit ONLINE high-impact escalation
   (`PRISM-1ln0p.4`, `PRISM-1ln0p.11`).
7. **Concerns and direction** — ambiguity-safe detection and one-prompt writer
   reconciliation (`PRISM-1ln0p.5`, `PRISM-1ln0p.6`).
8. **Version upgrades** — registry, shadow generations, comparison, promotion,
   and rollback (`PRISM-1ln0p.9`).
9. **Sessions** — version-keyed return recaps and one next card
   (`PRISM-huqnu.13`), then progressive spark-first creation and explicit
   stop/continue/redirect drafting controls (`PRISM-huqnu.24`,
   `PRISM-huqnu.25`).
10. **Author safety and portability** — recovery generations, project-scoped
   `.slate` archives, a crash-safe browser draft journal, recovery
   browsing/section restore, then writer-selected mirrors (`PRISM-huqnu.11`,
   `PRISM-huqnu.28`, `PRISM-huqnu.23`, `PRISM-huqnu.21`).
11. **Clean manuscript export** — DOCX, Markdown, and text by selection, scene,
   chapter, act, or book (`PRISM-huqnu.12`).
12. **Review Circle** — immutable Persona snapshots and verdict-first Room Notes
   (`PRISM-huqnu.14`).
13. **Atmosphere** — local ambient cues, then optional contextual scene plates
   (`PRISM-huqnu.15`, `PRISM-huqnu.16`).
14. **Scale proof** — saga-scale cohesion, recovery, performance, and llama3.2
   usability (`PRISM-1ln0p.7`).
15. **Later publishing/library** — EPUB/PDF and dynamic covers/pages only after
   the writing foundation is proven (`PRISM-huqnu.17`, `PRISM-huqnu.18`).

## Cross-applet roadmap

1. Slate standalone foundation.
2. Story to Slate through **Develop in Slate**.
3. Slate to Story through **Rehearse in Story**.
4. Selective round-trip incorporation with provenance.

No handoff silently synchronizes or rewrites either applet.

## Release gates

- Do not bump Slate or Continuity for architecture-only changes.
- Continuity remains `v0.0` until the writer-facing concern/reconciliation loop,
  shadow-generation upgrade safety, and representative saga-scale cohesion are
  proven together.
- Every public Slate surface is tenant-scoped and covered by LOCAL privacy tests.
- Existing projects migrate without prose loss.
- Human edits survive stale AI results and background jobs.
- Tutorials remain action-led, skippable, resettable, and target-stable.

Detailed normative contracts live in:

- `docs/slate-v1-product-ux-contract.md`
- `docs/slate-continuity-contract.md`
- `docs/story-v1-backend-contract.md`
- `docs/story-v1-frontend-implementation-brief.md`
