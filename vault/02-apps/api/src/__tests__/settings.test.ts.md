---
title: "apps/api/src/__tests__/settings.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/settings.test.ts"
status: "active"
---

# apps/api/src/__tests__/settings.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/settings.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/settings.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `../settings.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseHiddenBotModelIds,
  resolveNextSettings,
  sanitizeOpenAiKeyInput,
  type CurrentSettings,
} from "../settings.ts";

/**
 * These tests pin the PATCH /api/settings semantics. They exist because the
 * server has regressed twice on "obvious" fields:
 *   - `theme === "system"` was silently rejected, making the cycle button
 *     feel broken even though the frontend was doing the right thing.
 *   - `providerLocked` wasn't persisted, so the padlock felt random.
 * If a future change drops any of these cases, node --test will shout.
 */

function baseline(overrides: Partial<CurrentSettings> = {}): CurrentSettings {
  return {
    theme: "dark",
    preferredProvider: "local",
    providerLocked: 0,
    autoMemory: 1,
    hiddenBotModelIds: "[]",
    secondaryOllamaHost: null,
    primaryOllamaHost: "http://localhost:11434",
    ...overrides,
  };
}

describe("resolveNextSettings — theme", () => {
  it("accepts 'light'", () => {
    const next = resolveNextSettings({ theme: "light" }, baseline());
    assert.equal(next.theme, "light");
  });

  it("accepts 'dark'", () => {
    const next = resolveNextSettings({ theme: "dark" }, baseline({ theme: "light" }));
    assert.equal(next.theme, "dark");
  });

  it("accepts 'system' (this is the previously-regressed case)", () => {
    cons

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
