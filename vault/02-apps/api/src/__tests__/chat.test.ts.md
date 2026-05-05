---
title: "apps/api/src/__tests__/chat.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/chat.test.ts"
status: "active"
---

# apps/api/src/__tests__/chat.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it provides a test environment for the chat functionality, ensuring that the API behaves correctly with mock data and a simulated database. By setting up this test environment, developers can verify the integrity of their code changes without relying on external services or actual user interactions.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/chat.ts]]
- [[02-apps/api/src/conversations.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/providers.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/chat.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../chat.ts`
- `../conversations.ts`
- `../memory.ts`
- `../providers.ts`

## Source preview
```text
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  parseTitleResponse,
  processChatMessage,
  refreshConversationTitle,
  sanitizeConversationTitle,
} from "../chat.ts";
import { rewindConversation } from "../conversations.ts";
import { persistMemoryCandidates } from "../memory.ts";
import { fallbackEmbedding } from "../providers.ts";

const originalFetch = globalThis.fetch;

/** 32 bytes for AES-256-GCM used by memory encryption in tests. */
const CHAT_TEST_USER_KEY = Buffer.alloc(32, 7);

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createChatTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bot_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      bot_id TEXT,
      tool_payload TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
