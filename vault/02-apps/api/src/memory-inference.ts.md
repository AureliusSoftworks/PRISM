---
title: "apps/api/src/memory-inference.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/memory-inference.ts"
status: "active"
---

# apps/api/src/memory-inference.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-validation.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/memory-inference.test.ts]]
- [[02-apps/api/src/server.ts]]
- [[05-lessons/2026-05-02-2026-05-02-architecture-lesson-4]]
- [[05-lessons/2026-05-02-2026-05-02-architecture-lesson-5]]

## Source path
- `apps/api/src/memory-inference.ts`

## Import references
- `node:sqlite`
- `@localai/shared`
- `./providers.ts`
- `./security.ts`
- `./memory.ts`
- `./memory-validation.ts`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import type { UserMemory } from "@localai/shared";
import type { LlmProvider } from "./providers.ts";
import { decryptJson } from "./security.ts";
import { deleteMemoryById, restoreMemory } from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";

type DirectMemoryRow = {
  id: string;
  conversation_id: string | null;
  bot_id: string | null;
  confidence: number;
  source: "direct";
  certainty: number | null;
  source_message_ids: string;
  ciphertext: string;
  iv: string;
  tag: string;
  created_at: string;
};

type InferenceMerge = {
  text: string;
  parentIndices: number[];
  certainty: number;
};

type InferenceResponse = {
  merges?: unknown;
};

type DirectMemoryCandidate = {
  row: DirectMemoryRow;
  text: string;
  sourceMessageIds: string[];
};

type ValidatedInferenceMerge = {
  text: string;
  parents: DirectMemoryCandidate[];
  certainty: number;
};

type EquivalenceMemory = {
  left: string;
  verb: "is" | "are";
  right: string;
};

type FavoriteMemoryFact = {
  subject: string;
  descriptor: string;
};

type PreferenceMemoryFact = {
  verb: string;
  object: string;
};

const INFERENCE_LOOKBACK_LIMIT = 12;
const INFERENCE_MIN_PARENT_COUNT = 2;
const INFERENCE_MIN_CERTAINTY = 0.78;
const TASK_LIKE_MEMORY_PATTERN =
  /^(?:please\s+)?(?:write|draft|compose|create|make|generate|summa

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
