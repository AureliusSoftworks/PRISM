---
title: "2026-05-02 · architecture"
type: "lesson"
domain: "architecture"
tags:
  - prism
  - lesson
  - architecture
source: "tasks/lessons.md"
status: "active"
---

# 2026-05-02 · architecture

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-extraction.ts]]

## Referenced by
- _No backlinks yet_

## Trigger
A user prompt like "I love potatoes, don't you?" was stored as "You love potatoes, don't you." instead of the clean fact "You love potatoes."

## Lesson
Memory extraction should strip trailing conversational tag questions before first-person-to-second-person rewriting. Store only the durable user fact, not the social prompt fragment.

## Applies to
`apps/api/src/memory-extraction.ts` `rewriteMemoryText()` and memory extraction regression tests.

## Raw entry
```markdown
### 2026-05-02 · [architecture]
**Trigger**: A user prompt like "I love potatoes, don't you?" was stored as "You love potatoes, don't you." instead of the clean fact "You love potatoes."
**Lesson**: Memory extraction should strip trailing conversational tag questions before first-person-to-second-person rewriting. Store only the durable user fact, not the social prompt fragment.
**Applies to**: `apps/api/src/memory-extraction.ts` `rewriteMemoryText()` and memory extraction regression tests.
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
