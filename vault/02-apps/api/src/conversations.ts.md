---
title: "apps/api/src/conversations.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/conversations.ts"
status: "active"
---

# apps/api/src/conversations.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/chat.test.ts]]
- [[02-apps/api/src/__tests__/conversations.test.ts]]
- [[02-apps/api/src/server.ts]]
- [[05-lessons/2026-05-01-2026-05-01-ux-lesson-31]]

## Source path
- `apps/api/src/conversations.ts`

## Import references
- `node:sqlite`
- `./security.ts`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";

export interface ConversationSummary {
  id: string;
  title: string;
  botId: string | null;
  incognito: boolean;
  lastBotId: string | null;
  lastBotColor: string | null;
  hasAssistantReply: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEV_SEED_CHAT_USER_MESSAGE = "Dev tools seeded this sidebar chat.";
const DEV_SEED_CHAT_ASSISTANT_MESSAGE =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

/**
 * Create saved, bot-attributed placeholder chats for Developer Tools.
 *
 * These rows deliberately bypass the normal LLM pipeline: they are only seeded
 * UI fixtures for sidebar density checks, so a static lorem assistant reply is
 * enough and avoids provider/network side effects.
 */
export function createDevSeedConversations(
  db: DatabaseSync,
  userId: string,
  count: number
): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Chat seed count must be a positive integer.");
  }

  const botRows = db
    .prepare(
      "SELECT id FROM bots WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, name ASC"
    )
    .all(userId) as Array<{ id: string }>;

  const insertConversation = db.prepare(
    "INSERT INTO conversations (id, user_id, title, bot_id, incogn

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
