---
title: "apps/api/src/__tests__/memory-validation.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/memory-validation.test.ts"
status: "active"
---

# apps/api/src/__tests__/memory-validation.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-validation.ts]]
- [[02-apps/api/src/providers.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/memory-validation.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `../providers.ts`
- `../memory-validation.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../providers.ts";
import { validateMemoryCandidates } from "../memory-validation.ts";

function providerWithResponse(response: string): LlmProvider {
  return {
    name: "local",
    async generateResponse(): Promise<string> {
      return response;
    },
    async embedText(): Promise<number[]> {
      return [1, 0, 0];
    },
  };
}

function throwingProvider(): LlmProvider {
  return {
    name: "local",
    async generateResponse(): Promise<string> {
      throw new Error("validator unavailable");
    },
    async embedText(): Promise<number[]> {
      return [1, 0, 0];
    },
  };
}

describe("validateMemoryCandidates", () => {
  it("approves clean personal preferences", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "approve",
              text: "You love potatoes.",
              confidence: 0.9,
              reasonCodes: [],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "I love potatoes.",
        candidates: [{ text: "You love potatoes.", confidence: 0.9 }],
      }
    );

    assert.equal(result.candidates.length, 1);

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
