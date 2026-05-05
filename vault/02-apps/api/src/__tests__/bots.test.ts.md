---
title: "apps/api/src/__tests__/bots.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/bots.test.ts"
status: "active"
---

# apps/api/src/__tests__/bots.test.ts

## AI Summary
<!-- kb:summary:start -->
This note matters in PRISM because it ensures that bots are properly integrated into the system, with their identity and prompt being correctly composed to prevent issues like a bot being denied its own name. This helps maintain the integrity of the model and provides a better user experience.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/bots.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/bots.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `@localai/shared`
- `../bots.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  parseStoredBotPrompt,
  serializeStoredBotPrompt,
} from "@localai/shared";
import {
  createBotExportHash,
  composeBotSystemPrompt,
  deleteAllBots,
  deleteBot,
  deleteBots,
  normalizeBotExportHash,
  resolveBotExportHashForCreate,
} from "../bots.ts";

/**
 * The composeBotSystemPrompt suite pins the "bot identity reaches the model"
 * contract: a selected bot's NAME is always folded into the system prompt the
 * provider sees, not just the user-authored system_prompt. This guards the
 * case where someone creates a bot called "Tim" with an empty prompt and the
 * model (without this helper) would deny being Tim entirely.
 */
describe("composeBotSystemPrompt", () => {
  it("prepends an identity preamble when only a name is supplied", () => {
    const prompt = composeBotSystemPrompt("Tim", "");
    assert.ok(prompt, "expected a system prompt when a name is present");
    assert.match(prompt!, /You are Tim\./);
    assert.match(prompt!, /respond as Tim\./);
  });

  it("joins the preamble and user prompt with a blank line", () => {
    const prompt = composeBotSystemPrompt("Frank", "You speak like a sailor.");
    assert.ok(prompt);
    // Identity is first so the model has the persona priming before the
    // user's behavioural instruc

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
