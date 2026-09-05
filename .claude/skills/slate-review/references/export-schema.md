# Slate Review Export V1

Use this reference only when validating, implementing, or repairing the export
contract.

## Envelope

```json
{
  "format": "prism-slate-review-v1",
  "exportedAt": "ISO-8601",
  "project": {
    "id": "project-id",
    "title": "Story title",
    "proseMode": "offline|auto|online",
    "continuityVersion": "0.0",
    "activeGeneration": 0,
    "mirrorProfileVersionId": null,
    "codeRevision": null
  },
  "sections": []
}
```

`sections` may contain one focused synthesized section or several explicitly
selected sections. Do not silently include sibling-book prose.

## Section record

Each section contains:

- `section`: stable ID, title, kind, ordinal, revision, document hash, and prose
  hash.
- `acceptedProse`: the exact writer-visible prose at export time.
- `sources`: immutable Continuity source IDs and evidence metadata used by the
  section.
- `operations`: direction intent, scope, revision fingerprint, provider/model,
  status, proposal hash or text when retained, and acceptance outcome.
- `clarifications`: prompt, exactly three fixed choices, custom-vibe metadata,
  answer, staleness result, and resume operation ID.
- `developerEvents`: ordered safe operational provenance.
- `storyBible`: source-linked character, arc, thread, timeline, relationship,
  knowledge, world, and concern projections relevant to this section.
- `mirror`: pinned profile version and the bounded Voice Card traits used.
- `momentum`: the Live Wire or lit-match state derived for the section.

## Developer event

```json
{
  "schemaVersion": 1,
  "disclosure": "operational_provenance_only",
  "id": "event-id",
  "sequence": 1,
  "projectId": "project-id",
  "sectionId": "section-id",
  "sectionRevision": 3,
  "stage": "intent|brief|preflight|clarification|generation|proposal|acceptance|extraction|reconciliation|promotion|concern|mirror|momentum",
  "kind": "implementation-defined stable kind",
  "summary": "Bounded explicit diagnostic summary",
  "detail": {},
  "sourceIds": [],
  "operationId": null,
  "clarificationId": null,
  "provider": null,
  "model": null,
  "continuityGeneration": 0,
  "createdAt": "ISO-8601"
}
```

Events are append-only, tenant-scoped, section/revision-scoped, and ordered.
They may include user-owned prose excerpts and explicit model outputs needed for
diagnosis. They must exclude credentials, provider secrets, hidden
chain-of-thought, transient transport headers, and unrelated project or sibling
book content.

## Human-readable export

The Markdown representation should preserve the same information in this order:

1. Project and section metadata
2. Accepted prose
3. Writing operations and clarification decisions
4. Ordered Continuity developer transcript
5. Story Bible, Mirror, and momentum projections
6. Machine-readable JSON envelope in a fenced `json` block

The JSON envelope remains authoritative for tooling.
