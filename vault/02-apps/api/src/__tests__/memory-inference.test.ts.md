---
title: "apps/api/src/__tests__/memory-inference.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/memory-inference.test.ts"
status: "active"
---

# apps/api/src/__tests__/memory-inference.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-inference.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[05-lessons/2026-05-02-2026-05-02-architecture-lesson-4]]

## Source path
- `apps/api/src/__tests__/memory-inference.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../providers.ts`
- `../security.ts`
- `../memory-inference.ts`
- `../memory.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fallbackEmbedding, type LlmProvider } from "../providers.ts";
import { decryptJson } from "../security.ts";
import { inferAndStoreBotMemories } from "../memory-inference.ts";
import { persistMemoryCandidates } from "../memory.ts";

function createMemoryInferenceTestDb(): DatabaseSync {
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
  `);
  return db;
}

function inferenceProvider(response: string): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages): Promise<string> {
      if (messages[0]?.content.includes("memory validation critic")) {
        const payload = JSON.parse(messages[1]?.content ?? "{}") as {
          candidates?: Array<{ index: number; text: string; confidence: number }>;
        };
        return JSON.stringify({
          results: (payload.candidates ?? []).map((candidate) => ({
            index

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
