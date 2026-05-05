---
title: "packages/shared/src/prismTool.test.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/prismTool.test.ts"
status: "active"
---

# packages/shared/src/prismTool.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[03-packages/shared/src/prismTool.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `packages/shared/src/prismTool.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `./prismTool.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hydrateAssistantMessageParts,
  parseAssistantPrismTools,
  parseStoredToolPayload,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  serializeAskQuestionTool,
  type AskQuestionPayload,
} from "./prismTool.ts";

function validAskJson(): AskQuestionPayload {
  return {
    v: 1,
    name: "AskQuestion",
    prompt: "Pick a mood.",
    options: [
      { id: "a", label: "🟢 Bright" },
      { id: "b", label: "🟡 Moody" },
      { id: "c", label: "🔴 Raw" },
    ],
  };
}

describe("parseAssistantPrismTools", () => {
  it("returns display-only prose when no tool block is present", () => {
    const raw = "Just chatting.\nNo tools here.";
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, raw);
    assert.equal(out.askQuestion, undefined);
  });

  it("does not strip when the closing delimiter is missing", () => {
    const raw = `Hello.\n${PRISM_TOOL_START}\n{"v":1`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, raw);
    assert.equal(out.askQuestion, undefined);
  });

  it("parses a valid envelope and trims display prose", () => {
    const inner = serializeAskQuestionTool(validAskJson());
    const raw = `Opening line.\n\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    as

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
