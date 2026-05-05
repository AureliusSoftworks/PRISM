---
title: "packages/shared/src/botCustomizerModels.test.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/botCustomizerModels.test.ts"
status: "active"
---

# packages/shared/src/botCustomizerModels.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[03-packages/shared/src/botCustomizerModels.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `packages/shared/src/botCustomizerModels.test.ts`

## Import references
- `node:assert/strict`
- `node:test`
- `./botCustomizerModels.ts`

## Source preview
```text
import assert from "node:assert/strict";
import test from "node:test";
import {
  collectHiddenByDefaultModelIdsFromCatalog,
  isBotCustomizerModelHiddenByDefault,
} from "./botCustomizerModels.ts";

test("embedding-style ids default hidden", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("mxbai-embed-large"), true);
  assert.equal(isBotCustomizerModelHiddenByDefault("text-embedding-3-large"), true);
  assert.equal(isBotCustomizerModelHiddenByDefault("nomic-embed-text"), true);
});

test("general chat ids stay visible by default list logic", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("mistral"), false);
  assert.equal(isBotCustomizerModelHiddenByDefault("llama3.2:latest"), false);
});

test("vision / llava default hidden", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("llava:latest"), true);
  assert.equal(isBotCustomizerModelHiddenByDefault("moondream"), true);
});

test("embedded substring does not false-positive embed rule", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("someembeddedname"), false);
});

test("catalog merge collects and sorts", () => {
  assert.deepEqual(
    collectHiddenByDefaultModelIdsFromCatalog(["mistral", "llava"], ["text-embedding-3-small"]),
    ["llava", "text-embedding-3-small"]
  );
});

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
