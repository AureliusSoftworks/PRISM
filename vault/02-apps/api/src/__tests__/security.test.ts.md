---
title: "apps/api/src/__tests__/security.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/security.test.ts"
status: "active"
---

# apps/api/src/__tests__/security.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/security.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/security.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `../security.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveMasterKey, decryptText, encryptText } from "../security.ts";

describe("encryption round trip", () => {
  it("encrypts and decrypts user payloads", () => {
    const key = deriveMasterKey("test-master-key");
    const encrypted = encryptText("secret", key);
    const decrypted = decryptText(encrypted, key);
    assert.equal(decrypted, "secret");
  });
});

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
