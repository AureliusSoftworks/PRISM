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
- [[02-apps/api/src/__tests__/memory-inference.test.ts]]
- [[02-apps/api/src/memory-inference.ts]]

## Referenced by
- _No backlinks yet_

## Trigger
Memory inference could merge "Potatoes are your favorite" and "Spuds are your favorite" into the lossy synonym-only memory "Potatoes are spuds."

## Lesson
Inferred synonym/equivalence memories must preserve the durable user-fact payload from their parent memories before deleting those parents. For favorite-style facts, the inferred memory should keep both the equivalence and the preference, e.g. "Potatoes are spuds, and they are your favorite." If the model output keeps only one side of the fact, reject the merge and preserve the direct memories instead.

## Applies to
`apps/api/src/memory-inference.ts` merge normalization and `apps/api/src/__tests__/memory-inference.test.ts`.

## Raw entry
```markdown
### 2026-05-02 · [architecture]
**Trigger**: Memory inference could merge "Potatoes are your favorite" and "Spuds are your favorite" into the lossy synonym-only memory "Potatoes are spuds."
**Lesson**: Inferred synonym/equivalence memories must preserve the durable user-fact payload from their parent memories before deleting those parents. For favorite-style facts, the inferred memory should keep both the equivalence and the preference, e.g. "Potatoes are spuds, and they are your favorite." If the model output keeps only one side of the fact, reject the merge and preserve the direct memories instead.
**Applies to**: `apps/api/src/memory-inference.ts` merge normalization and `apps/api/src/__tests__/memory-inference.test.ts`.
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
