---
title: "apps/api/src/__tests__/memory.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/memory.test.ts"
status: "active"
---

# apps/api/src/__tests__/memory.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/providers.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/memory.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../providers.ts`
- `../memory.ts`

## Source preview
```text
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fallbackEmbedding } from "../providers.ts";
import {
  analyzeMemoryIntent,
  createDevSeedMemories,
  deleteMemoriesLinkedToMessages,
  deleteOrphanedBotMemories,
  findMemoryByCue,
  extractMemoryCandidates,
  filterConflictingMemories,
  persistMemoryCandidates,
  retrieveRelevantMemories,
} from "../memory.ts";

function createMemoryTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delete_protected INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { prompt?: string };
    return new Response(
      JSON.stri

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
