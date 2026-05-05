---
title: "apps/api/src/memory-summarizer.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/memory-summarizer.ts"
status: "active"
---

# apps/api/src/memory-summarizer.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-validation.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/qdrant.ts]]
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/thread-compaction.test.ts]]
- [[02-apps/api/src/chat.ts]]

## Source path
- `apps/api/src/memory-summarizer.ts`

## Import references
- `node:sqlite`
- `./security.ts`
- `./providers.ts`
- `./qdrant.ts`
- `./memory.ts`
- `./memory-validation.ts`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import { embedTextLocal, type LlmProvider } from "./providers.ts";
import { upsertVector, ensureCollection, searchVectors } from "./qdrant.ts";
import { persistMemoryCandidates } from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";

/**
 * Chat-mode summarizer prompt: extracts cross-thread personal facts the
 * model should remember about the user even in unrelated conversations.
 * Output feeds `memory_summaries` AND Qdrant for similarity retrieval.
 */
const FACT_EXTRACTION_PROMPT = `You are a memory extraction assistant. Given a conversation thread, extract 1-3 concise factual bullet points about the user's preferences, facts about them, or key decisions. Respond ONLY with the bullet points, one per line. If there is nothing worth remembering, respond with "NONE".`;

/**
 * Sandbox-mode thread-compaction prompt: rolls earlier messages (plus any
 * prior rolling summary) into ONE compact paragraph that lets the model
 * keep threading context once older turns roll off the live window. Scope
 * is strictly the current conversation — output is never indexed into
 * Qdrant and never surfaced in the sidebar.
 */
const ROLLING_COMPACT_PROMPT = `You are compacting an ongoing conversation thread so the model can keep threading it even after older turns roll ou

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
