---
title: "apps/api/src/chat.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/chat.ts"
status: "active"
---

# apps/api/src/chat.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-summarizer.ts]]
- [[02-apps/api/src/memory-validation.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/chat.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/chat.ts`

## Import references
- `node:sqlite`
- `@localai/config`
- `./security.ts`
- `./memory.ts`
- `./memory-validation.ts`
- `./providers.ts`
- `./memory-summarizer.ts`
- `@localai/shared`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import { getAppConfig } from "@localai/config";
import { randomId } from "./security.ts";
import {
  analyzeMemoryIntent,
  deleteMemoryById,
  findMemoryByCue,
  persistMemoryCandidates,
  retrieveRecentMemoriesForStarter,
  retrieveRelevantMemories,
} from "./memory.ts";
import {
  validateMemoryCandidates,
  type MemoryValidationReasonCode,
  type MemoryValidationStatus,
} from "./memory-validation.ts";
import {
  getAuxiliaryProvider,
  selectProvider,
  OPENAI_DEFAULT_MODEL,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";
import {
  RECENT_WINDOW_SIZE,
  getLatestThreadSummary,
  retrieveMemorySummaries,
  summarizeAndStoreMemories,
  summarizeThreadCompact,
} from "./memory-summarizer.ts";
import type {
  AskQuestionPayload,
  ChatMessage,
  ChatMode,
  Conversation,
  OpinionBand,
  OpinionTrend,
  SessionOpinion,
} from "@localai/shared";
import {
  hydrateAssistantMessageParts,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  parseAssistantPrismTools,
  serializeAskQuestionTool,
} from "@localai/shared";

const config = getAppConfig();

/** POST /api/chat returns this shape; `conversationStarters` is present only after a starter turn. */
export interface ProcessChatMessageResult {
  conversation: Conversation;
  conversationStarters?: string[];
  opinion?: SessionOpinion;
  memoryLearn

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
