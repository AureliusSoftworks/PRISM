---
title: "apps/api/src/server.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/server.ts"
status: "active"
---

# apps/api/src/server.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/account-retention.ts]]
- [[02-apps/api/src/auth.ts]]
- [[02-apps/api/src/backup.ts]]
- [[02-apps/api/src/bots.ts]]
- [[02-apps/api/src/chat.ts]]
- [[02-apps/api/src/conversations.ts]]
- [[02-apps/api/src/db.ts]]
- [[02-apps/api/src/discovery.ts]]
- [[02-apps/api/src/health.ts]]
- [[02-apps/api/src/image-provider.ts]]
- [[02-apps/api/src/image-retention.ts]]
- [[02-apps/api/src/memory-inference.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/model-routing.ts]]
- [[02-apps/api/src/pairing.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/qdrant.ts]]
- [[02-apps/api/src/security.ts]]
- [[02-apps/api/src/settings.ts]]
- [[02-apps/api/src/types.ts]]
- [[02-apps/api/src/utils.http.ts]]

## Referenced by
- [[04-docs/README.md]]
- [[04-docs/docs/mobile-api-contract.md]]
- [[05-lessons/2026-05-01-2026-05-01-ux-lesson-32]]

## Source path
- `apps/api/src/server.ts`

## Import references
- `node:http`
- `@localai/config`
- `./db.ts`
- `./utils.http.ts`
- `./security.ts`
- `./types.ts`
- `./auth.ts`
- `./health.ts`
- `./pairing.ts`
- `./discovery.ts`
- `./chat.ts`
- `./memory.ts`
- `./memory-inference.ts`
- `./conversations.ts`
- `./bots.ts`
- `./settings.ts`
- `./providers.ts`
- `./model-routing.ts`
- `./backup.ts`
- `./image-provider.ts`
- `./account-retention.ts`
- `./image-retention.ts`
- `./qdrant.ts`
- `@localai/shared`

## Source preview
```text
import { createServer } from "node:http";
import { getAppConfig } from "@localai/config";
import { createDatabase } from "./db.ts";
import { clearCookie, json, readJsonBody, setCookie, setCorsHeaders } from "./utils.http.ts";
import { decryptJson, decryptText, deriveMasterKey, encryptText, hashPassword, randomId, verifyPassword } from "./security.ts";
import type { RouteDefinition, RequestContext } from "./types.ts";
import {
  createClientAccessToken,
  requireValidClientAccess,
  requireValidSession,
  resolveClientAccessToken,
  resolveSessionToken,
} from "./auth.ts";
import { buildHealthResponse } from "./health.ts";
import { consumePairingCode, createPairingCode } from "./pairing.ts";
import { startPrismDiscovery, type StopDiscovery } from "./discovery.ts";
import { processChatMessage, refreshConversationTitle } from "./chat.ts";
import {
  createDevSeedMemories,
  deleteMemoryById,
  deleteOrphanedBotMemories,
  filterConflictingMemories,
  restoreMemory
} from "./memory.ts";
import { inferAndStoreBotMemories } from "./memory-inference.ts";
import { createDevSeedConversations, deleteAllConversations, deleteConversation, deleteConversationsByBot, listConversationSummaries, rewindConversation } from "./conversations.ts";
import {
  composeBotSystemPrompt,
  deleteAllBots,
  deleteBot,
  deleteBots,
  normalizeBotExportHash,
  resolveBotExportHashForCreate,
} from "./bots.t

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
