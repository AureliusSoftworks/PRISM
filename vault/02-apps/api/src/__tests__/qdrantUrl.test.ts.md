---
title: "apps/api/src/__tests__/qdrantUrl.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/qdrantUrl.test.ts"
status: "active"
---

# apps/api/src/__tests__/qdrantUrl.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/qdrantUrl.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `@localai/config`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QDRANT_URL, normalizeQdrantUrl } from "@localai/config";

describe("normalizeQdrantUrl", () => {
  it("adds a scheme, fixes bind-all, and strips slashes", () => {
    assert.equal(normalizeQdrantUrl("0.0.0.0:6333"), "http://127.0.0.1:6333");
    assert.equal(
      normalizeQdrantUrl("http://127.0.0.1:6333/"),
      "http://127.0.0.1:6333"
    );
  });

  it("uses the default for empty or invalid input with a console warning for invalid", () => {
    assert.equal(normalizeQdrantUrl(""), DEFAULT_QDRANT_URL);
  });
});

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
