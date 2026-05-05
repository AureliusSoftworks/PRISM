---
title: "apps/api/src/__tests__/thread-compaction.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/thread-compaction.test.ts"
status: "active"
---

# apps/api/src/__tests__/thread-compaction.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-summarizer.ts]]
- [[02-apps/api/src/providers.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/thread-compaction.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../memory-summarizer.ts`
- `../providers.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  RECENT_WINDOW_SIZE,
  getLatestThreadSummary,
  summarizeThreadCompact,
} from "../memory-summarizer.ts";
import type { LlmProvider, ProviderMessage } from "../providers.ts";

/**
 * The thread-compaction suite pins the Sandbox-mode memory contract:
 *
 *   1. Short threads never summarize (no tokens burned on nothing).
 *   2. Long threads DO summarize, and the paragraph lands in
 *      `memory_summaries` scoped by conversation_id.
 *   3. Subsequent summarizations feed the PRIOR summary through so the
 *      LLM can compress redundantly-seen content rather than blow up
 *      token budget.
 *   4. Nothing ever lands in Qdrant from this path (unit-tested
 *      implicitly: our mock provider's `embedText` would throw if
 *      called — compaction never calls it).
 *   5. `getLatestThreadSummary` reads back the most recent row,
 *      scoped per-conversation so threads can't cross-contaminate.
 */

/** In-memory DB with just the tables the compaction path touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
