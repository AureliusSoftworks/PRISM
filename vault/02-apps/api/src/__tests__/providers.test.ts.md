---
title: "apps/api/src/__tests__/providers.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/providers.test.ts"
status: "active"
---

# apps/api/src/__tests__/providers.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/providers.ts]]

## Referenced by
- [[04-docs/DESIGN.md]]
- [[04-docs/README.md]]
- [[06-releases/v0.1.0-preproduction]]

## Source path
- `apps/api/src/__tests__/providers.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `../providers.ts`

## Source preview
```text
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelCatalog,
  checkLocalModelHostStatus,
  embedTextLocal,
  getAuxiliaryProvider,
  LocalOllamaProvider,
  OpenAiProvider,
  readOpenAiErrorMessage,
  SECONDARY_OLLAMA_MODEL_PREFIX,
  selectProvider,
} from "../providers.ts";

/**
 * These tests pin the LOCAL privacy invariant: when a user (or bot, or
 * auto-switch, or anything else) has asked for LOCAL, selectProvider must
 * return the Ollama-backed provider no matter what other inputs look like.
 * If this test ever needs to be weakened, think hard — it's the thing
 * keeping the "LOCAL" badge honest.
 */
describe("selectProvider", () => {
  describe("LOCAL mode invariant", () => {
    it("returns LocalOllamaProvider when preferredProvider is 'local'", () => {
      const provider = selectProvider("local");
      assert.ok(provider instanceof LocalOllamaProvider);
      assert.equal(provider.name, "local");
    });

    it("stays local even when an OpenAI key is available", () => {
      // A key being present must not silently escalate a LOCAL turn.
      const provider = selectProvider("local", "sk-real-looking-key");
      assert.ok(provider instanceof LocalOllamaProvider);
      assert.ok(!(provider instanceof OpenAiProvider));
    });

    it("stays local across many calls with varied key inputs"

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
