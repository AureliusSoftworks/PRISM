---
title: "apps/api/src/__tests__/model-routing.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/model-routing.test.ts"
status: "active"
---

# apps/api/src/__tests__/model-routing.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/model-routing.ts]]
- [[02-apps/api/src/providers.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/model-routing.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `../model-routing.ts`
- `../providers.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  resolveAutoModel,
  sanitizeHiddenModelIds,
} from "../model-routing.ts";
import type { ModelCatalog } from "../providers.ts";

function catalog(overrides: Partial<ModelCatalog> = {}): ModelCatalog {
  return {
    local: [
      {
        id: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
        label: "Llama3.2",
        provider: "local",
        isDefault: true,
        localHost: "primary",
      },
      { id: "mistral:latest", label: "Mistral", provider: "local", localHost: "primary" },
    ],
    online: [
      { id: "gpt-4o-mini", label: "GPT 4o Mini", provider: "openai", isDefault: true },
      { id: "gpt-4o", label: "GPT 4o", provider: "openai" },
      { id: "gpt-4.1-mini", label: "GPT 4.1 Mini", provider: "openai" },
    ],
    defaults: {
      local: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
      online: "gpt-4o-mini",
    },
    ...overrides,
  };
}

describe("resolveAutoModel", () => {
  it("uses a visible bot preferred model before catalog fallbacks", () => {
    const resolved = resolveAutoModel({
      provider: "openai",
      botPreferredModel: "gpt-4.1-mini",
      hiddenModelIds: [],
      catalog: catalog(),
    });

    assert.deepEqual(resolved, {
      provider: "openai",
      model: "gpt-4.1-mini",
      usedRequire

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
