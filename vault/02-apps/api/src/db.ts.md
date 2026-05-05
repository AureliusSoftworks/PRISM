---
title: "apps/api/src/db.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/db.ts"
status: "active"
---

# apps/api/src/db.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/__tests__/db.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/db.ts`

## Import references
- `node:sqlite`
- `node:fs`
- `node:path`
- `node:url`
- `@localai/shared`

## Source preview
```text
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserProfile, Conversation, ChatMessage, UserMemory } from "@localai/shared";

export interface DbUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  wrappedUserKey: string;
  wrappedUserKeyIv: string;
  wrappedUserKeyTag: string;
  theme: "light" | "dark" | "system";
  preferredProvider: "local" | "openai";
  providerLocked: number;
  autoMemory: number;
  autoSwitchModel: number;
  secondaryOllamaHost: string | null;
  openAiKeyCiphertext: string | null;
  openAiKeyIv: string | null;
  openAiKeyTag: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface DbMemoryRecord {
  id: string;
  userId: string;
  ciphertext: string;
  iv: string;
  tag: string;
  confidence: number;
  source: "direct" | "inferred" | "compiled";
  certainty: number | null;
  sourceMessageIds: string;
  createdAt: string;
}

export function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  if (process.env.LOCALAI_DATA_DIR) {
    return join(process.env.LOCALAI_DATA_DIR, "localai.db");
  }
  const srcDir = fileURLToPath(new URL(".", import.meta.url));
  return join(srcDir, "..", "data", "localai.db"

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
