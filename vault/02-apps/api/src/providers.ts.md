---
title: "apps/api/src/providers.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/providers.ts"
status: "active"
---

# apps/api/src/providers.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/__tests__/chat.test.ts]]
- [[02-apps/api/src/__tests__/memory-inference.test.ts]]
- [[02-apps/api/src/__tests__/memory-validation.test.ts]]
- [[02-apps/api/src/__tests__/memory.test.ts]]
- [[02-apps/api/src/__tests__/model-routing.test.ts]]
- [[02-apps/api/src/__tests__/providers.test.ts]]
- [[02-apps/api/src/__tests__/thread-compaction.test.ts]]
- [[02-apps/api/src/chat.ts]]
- [[02-apps/api/src/image-provider.ts]]
- [[02-apps/api/src/memory-inference.ts]]
- [[02-apps/api/src/memory-summarizer.ts]]
- [[02-apps/api/src/memory-validation.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/model-routing.ts]]
- [[02-apps/api/src/server.ts]]
- [[04-docs/DESIGN.md]]

## Source path
- `apps/api/src/providers.ts`

## Import references
- `@localai/config`

## Source preview
```text
import { getAppConfig } from "@localai/config";

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Optional per-call generation overrides, typically supplied by a Bot's configuration. */
export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: "local" | "openai";
  isDefault?: boolean;
  localHost?: "primary" | "secondary";
  hostLabel?: string;
}

export interface ModelCatalog {
  local: ModelCatalogEntry[];
  online: ModelCatalogEntry[];
  defaults: {
    local: string;
    online: string;
  };
}

export interface LocalModelHostStatus {
  configured: boolean;
  reachable: boolean;
  modelCount: number;
}

export interface LlmProvider {
  name: "local" | "openai";
  generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string>;
  embedText(text: string): Promise<number[]>;
}

interface OpenAiConfig {
  apiKey: string;
}

const config = getAppConfig();
export const SECONDARY_OLLAMA_MODEL_PREFIX = "ollama-secondary:";

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_FALLBACK_MODELS = [
  OPENAI_DEFAULT_MODEL,
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
] as const;
const OPENAI_CHAT_MODEL_PREFIXES = [
  "gpt-",
  "o1",
  "o3",
  "o4",
] as const;

/**

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
