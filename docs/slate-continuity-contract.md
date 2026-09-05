# Slate Continuity Contract

Continuity is Slate's private narrative framework for keeping long novels and
multi-book series coherent. It is not a public wiki and it is not another
writer. Slate writes; the writer directs; Continuity quietly remembers, checks,
and prepares the smallest useful context.

This contract is normative for `PRISM-1ln0p` and its dependent Slate work.

## Non-negotiable invariants

1. Human prose edits, explicit locks, non-negotiables, and accept/reject choices
   are authoritative.
2. Continuity never blocks direct writing, autosave, opening, or export and
   never silently edits prose. It may pause an AI writing operation before the
   prose-provider call for one material high-confidence conflict.
3. SQLite is the tenant-scoped source of truth. Qdrant may accelerate recall but
   is optional and completely rebuildable.
4. LOCAL work never contacts an external model, embedding service, image
   provider, backup destination, or export service. User-configured paired
   Ollama and ComfyUI hosts are restricted to loopback, private-LAN addresses,
   or `.local` names; public HTTP(S) endpoints are rejected before discovery,
   inference, workflow reads, or image generation.
5. Every derived fact, concern, recap, brief, review, and Atmosphere cue records
   exact source evidence and producer versions.
6. Background work is incremental, coalesced by source revision, idempotent, and
   safe to discard when stale.
7. A failed or unavailable auxiliary model cannot prevent direct editing,
   autosave, project opening, or deterministic export.
8. The writer sees at most one contextual decision at a time. Curated Story
   Bible projections may expose Cast, Arcs, Threads, Timeline, and World, but
   the raw ledger remains private.

## Hierarchy and manuscript authority

- A **series** contains ordered Slate projects, each of which is one book-sized
  work. Standalone projects receive a private single-book series automatically.
- A **book** retains the existing `slate_projects` identity for compatibility.
- Authoritative prose lives in stable, ordered **act**, **chapter**, **scene**,
  or **imported** section records.
- Each section has an integer revision. Saves, AI drafts, revision proposals,
  background extraction, and batch changes carry the revision they read.
- Each section also owns a versioned rich document with stable block IDs. Its
  deterministic plain-text projection remains the input to Continuity, prompts,
  search, and clean export.
- A write with a stale expected revision is rejected rather than merged over a
  newer human edit.
- Full-book reading is assembled from ordered sections and may be paginated or
  virtualized; it is never a second editable manuscript copy.

### Legacy migration

Before migration, save an exact `slate_versions` checkpoint containing the old
structure and manuscript blob. Split only when headings map unambiguously to
the approved structure. Otherwise create one locked-order **Imported
manuscript** section containing the exact original text. The legacy manuscript
column remains a compatibility projection until all callers use sections.

## Immutable sources and provenance

Every settled human edit, accepted draft, accepted revision, import, Story
snapshot, rehearsal discovery, or accepted reviewer direction creates an
immutable Continuity source snapshot identified by a content hash and source
revision. A newer source supersedes an older source; it never mutates it.

Source anchors include:

- immutable source ID
- section ID and section revision when applicable
- exact character offsets
- stable block-relative positions when the source document provides them
- a hash of the quoted evidence
- human, AI, or procedural authority
- provider/model when an LLM contributed
- writer-facing Continuity version plus all internal producer versions

Derived records without valid source evidence are discarded.

## Narrative ledger

The authoritative ledger stores:

- entities and aliases: characters, locations, objects, groups, events,
  concepts, and world rules
- claims scoped to a series, book, or section
- events and chronology keys
- character knowledge and belief state
- relationships and their changing state
- unresolved, due, resolved, abandoned, and intentionally open threads
- source-anchored concerns and their writer-directed resolution
- background jobs and immutable processing provenance
- character profile projections with field locks and explicit provenance
- intended and observed character arcs with planned, seeded, landed, missed,
  revised, or intentionally abandoned beats
- typed narrative dependencies (`before`, `after`, `causes`, `requires`,
  `prevents`, `reveals`, and `resolves`) and timeline branch identity

Claims distinguish **fact**, **belief**, **rumor**, **mystery**, **deliberate
ambiguity**, **intention**, and **superseded** material. Character belief never
silently becomes world truth.

The writer-facing Story Bible keeps four layers distinct: accepted manuscript
evidence, writer-approved canon, future plans, and source-linked AI
interpretations. Editing a projection creates a new human-authority source
rather than mutating derived records in place.

## Deterministic and model responsibilities

PRISM code owns stable IDs, content hashes, changed-range detection, exact
ordering, scope, aliases already confirmed by the writer, constraint checks,
dependency invalidation, source verification, retrieval, token budgeting, and
atomic persistence. Structured Slate actions update known records without an
LLM call whenever possible.

The auxiliary model may perform bounded semantic tasks:

- extract candidate entities, claims, events, and state changes
- propose alias matches that deterministic lookup cannot settle
- classify fact versus belief, rumor, mystery, or ambiguity
- summarize a source revision or session
- propose reconciliation wording

Each task uses a small schema-constrained prompt, validates against source text,
and may retry safely. `llama3.2` is the functional floor. Stronger models may
improve nuance and recall ranking but must not unlock basic correctness.

In ONLINE mode, only high-impact unresolved uncertainty may use the effective
account provider/model. In LOCAL mode, all auxiliary work stays local.

## Incremental lifecycle

1. A settled section revision creates an immutable source snapshot.
2. Deterministic code hashes the new prose, finds changed ranges, resolves known
   aliases, updates exact indexes, and runs exact constraints.
3. A coalesced extraction job processes only the changed source revision.
4. Candidate records are schema-validated and checked against exact evidence.
5. A new ledger generation is built without mutating the active generation.
6. Relevant concerns are deduplicated and ranked.
7. The generation is promoted atomically when compatible; material conclusion
   changes yield one recommendation.
8. Drafting continues against the last active generation while work catches up.

Every derived row belongs to a generation. Active reads resolve through the
series-level active generation, promotion swaps that pointer atomically, and
the previous generation remains available for rollback. Project generation
fields remain compatibility projections while existing archives migrate.

## Context compilation

The default local context target is 8,192 tokens. A focused scene brief contains
only:

- the focused section and its current revision
- adjacent structure and concise summaries
- relevant series/book claims and current entity state
- what present characters know or believe
- locks, voice, non-negotiables, and writer direction
- due unresolved threads

Retrieval never injects the whole corpus. Exact scope and constraints are
selected first; optional semantic recall ranks only the remaining candidates.

## Concerns and reconciliation

Continuity may raise factual contradictions, impossible chronology, knowledge
leaks, object/location/relationship state conflicts, world-rule violations,
non-negotiable conflicts, stage-aware due threads, and ambiguous extraction.

Concerns are quiet, source-anchored, confidence-ranked, and deduplicated. Rumor,
unreliable narration, mystery, and deliberate ambiguity are not errors.

The writer receives one contextual prompt and may:

- update canon
- request a prose revision preview
- mark the statement as belief, rumor, or mystery
- preserve deliberate ambiguity
- defer or resolve a thread
- dismiss a false extraction

Ledger-only decisions may apply directly. Any prose change remains a normal
preview that respects locks and requires acceptance.

Before an AI draft or revision, the structured direction is preflighted against
current locks, canon, character state, knowledge, chronology, and causal rules.
A hard conflict returns a persisted in-canvas question with exactly three
context-specific choices plus `Describe the vibe...`. The answer is
fingerprinted, accepted once, recorded as writer authority, and resumes the
same operation only when its section revision, Continuity generation, and
Mirror version are still current. Soft or uncertain concerns never interrupt.

## Version and upgrade contract

Continuity exposes one writer-facing `v0.x` capability version. Internal schema,
extraction, reconciliation, context, recap, and Atmosphere versions are positive
integers stored with every derived artifact.

Each series stores its active and immediately previous ledger generations.
Projects retain their active and target capability versions plus compatibility
generation projections, upgrade state, and last successful processing time.
Upgrades build a shadow generation from immutable sources, compare conclusions
and retrieval behavior, and promote atomically. A failed or deferred upgrade
keeps the active generation unchanged. Upgrades never rewrite manuscript prose.

Archives with older compatible producer versions migrate forward. Runtimes must
reject newer unsupported Continuity archives before any mutation.

## UX boundary

Continuity appears as background status, a return synopsis, one precise
source-linked concern, or a focused Cast, Arcs, Threads, Timeline, or World
projection. There is no raw editable ledger, arbitrary version picker,
multi-field reconciliation form, or ribbon of continuity tools.

The priority for the single next card is: canon risk, narratively due thread,
material Continuity upgrade, requested Review Circle result, drafting guidance,
then an optional visual suggestion.

## Developer transcript and Slate Review

Continuity appends safe structured developer events for each synthesized
section. Events identify their operation, section revision, stage,
source/concern/clarification IDs, provider/model when applicable, active
generation, timing, and a bounded explicit diagnostic summary. They may retain
user-owned prose or visible model output required to reproduce a failure, but
never credentials, transport secrets, hidden chain-of-thought, or unrelated
tenant/project content.

A writer may export one or more explicitly selected sections as
`prism-slate-review-v1`. JSON is authoritative; Markdown presents the same
accepted prose, operations, clarification decisions, event sequence, Story
Bible projections, Mirror version, and momentum state. `$slate-review` uses
successive exports and focused regressions to improve deterministic contracts,
retrieval, validation, and orchestration without overfitting one story.

## Saga-scale acceptance

Release evaluation includes a compact multi-book CI fixture plus a separate
target-scale fixture approximating seven books and two million words. It must
measure cross-book retrieval accuracy, chronology and knowledge-state checks,
false positives, storage growth, incremental invalidation, token budgets,
latency, failed-job recovery, tenant isolation, and LOCAL privacy.

The deterministic baseline must remain useful without an LLM. `llama3.2` must
complete the bounded auxiliary path. Stronger models should improve quality,
not supply the system's memory or authority.
