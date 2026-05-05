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
- [[02-apps/api/src/memory-inference.ts]]

## Referenced by
- _No backlinks yet_

## Trigger
A one-off task prompt, "Write a quick email to my landlord about the sink leak," became an inferred ASSUMPTION memory because the extractor treated any sentence containing "my" as personal.

## Lesson
Imperative task requests are working context, not durable memory, even when they contain first-person possessives. Block command-style requests at direct extraction, and reject inferred task-like merges that would delete real preference memories.

## Applies to
`apps/api/src/memory-extraction.ts` task request filtering and `apps/api/src/memory-inference.ts` task-like merge guard.

## Raw entry
```markdown
### 2026-05-02 · [architecture]
**Trigger**: A one-off task prompt, "Write a quick email to my landlord about the sink leak," became an inferred ASSUMPTION memory because the extractor treated any sentence containing "my" as personal.
**Lesson**: Imperative task requests are working context, not durable memory, even when they contain first-person possessives. Block command-style requests at direct extraction, and reject inferred task-like merges that would delete real preference memories.
**Applies to**: `apps/api/src/memory-extraction.ts` task request filtering and `apps/api/src/memory-inference.ts` task-like merge guard.
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
