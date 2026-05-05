---
title: "apps/api/src/model-routing.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/model-routing.ts"
status: "active"
---

# apps/api/src/model-routing.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/providers.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/model-routing.test.ts]]
- [[02-apps/api/src/server.ts]]
- [[02-apps/api/src/settings.ts]]

## Source path
- `apps/api/src/model-routing.ts`

## Import references
- `./providers.ts`

## Source preview
```text
import type { ModelCatalog } from "./providers.ts";

export const REQUIRED_LOCAL_MODELS = {
  chat: "llama3.2",
  embedding: "nomic-embed-text",
} as const;

export const REQUIRED_PRIMARY_LOCAL_MODEL_ID = REQUIRED_LOCAL_MODELS.chat;
const REQUIRED_LOCAL_MODEL_ID_SET = new Set<string>(Object.values(REQUIRED_LOCAL_MODELS));

export type Provider = "local" | "openai";

export interface ResolveAutoModelInput {
  provider: Provider;
  explicitModelOverride?: string | null;
  botPreferredModel?: string | null;
  hiddenModelIds: string[];
  catalog: ModelCatalog;
}

export interface ResolvedAutoModel {
  provider: Provider;
  model: string;
  usedRequiredLocalFallback: boolean;
}

export function sanitizeHiddenModelIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => !REQUIRED_LOCAL_MODEL_ID_SET.has(id))
    )
  );
}

function firstVisibleModelId(ids: string[], hidden: Set<string>): string | null {
  return ids.find((id) => id.trim().length > 0 && !hidden.has(id)) ?? null;
}

function providerCatalogIds(catalog: ModelCatalog, provider: Provider): string[] {
  return provider === "local"
    ? catalog.local.map((model) => model.id)
    : catalog.online.map((model) => model.id);
}

export function resolveAutoModel(input: ResolveAutoModelInput): ResolvedAutoModel {
  const hidden = new

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
