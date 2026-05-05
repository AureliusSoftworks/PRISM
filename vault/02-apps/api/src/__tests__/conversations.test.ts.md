---
title: "apps/api/src/__tests__/conversations.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/conversations.test.ts"
status: "active"
---

# apps/api/src/__tests__/conversations.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it provides a standardized way to set up and test the database schema for conversations, ensuring consistency across different tests and scenarios. By using an in-memory DB with specific tables, developers can focus on testing conversation-related functionality without worrying about external dependencies or data persistence.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/conversations.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/conversations.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../conversations.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createDevSeedConversations,
  deleteAllConversations,
  deleteConversation,
  deleteConversationsByBot,
  listConversationSummaries,
  rewindConversation,
} from "../conversations.ts";

/** Stand up an in-memory DB with just the tables deleteConversation touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bot_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      glyph TEXT,
      delete_protected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      bot_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NO

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
