---
title: "apps/api/src/memory.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/memory.ts"
status: "active"
---

# apps/api/src/memory.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-extraction.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/chat.test.ts]]
- [[02-apps/api/src/__tests__/memory-inference.test.ts]]
- [[02-apps/api/src/__tests__/memory.test.ts]]
- [[02-apps/api/src/chat.ts]]
- [[02-apps/api/src/memory-inference.ts]]
- [[02-apps/api/src/memory-summarizer.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/memory.ts`

## Import references
- `node:sqlite`
- `./security.ts`
- `./providers.ts`
- `@localai/shared`
- `./memory-extraction.ts`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson, randomId } from "./security.ts";
import { embedTextLocal, fallbackEmbedding } from "./providers.ts";
import type { UserMemory } from "@localai/shared";
import type { MemoryCandidate } from "./memory-extraction.ts";
import { analyzeMemoryIntent, extractMemoryCandidates } from "./memory-extraction.ts";

export { analyzeMemoryIntent, extractMemoryCandidates };

interface StoredMemoryPayload {
  text: string;
  embedding: number[];
}

interface DevSeedMemoryOptions {
  randomizeAcrossBots?: boolean;
  random?: () => number;
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
}

type MemoryRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  bot_id: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
  confidence: number;
  source: "direct" | "inferred" | "compiled";
  certainty: number | null;
  source_message_ids: string;
  created_at: string;
};

interface PersistMemoryOptions {
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
  sourceMessageIds?: string[];
}

interface RestoreMemoryOptions {
  conversationId?: string | null;
  botId?: string | null;
  text: string;
  confidence?: number;
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
  sourceMessageIds?: string[];
}

interface StoredMemoryWithEmbeddin

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
