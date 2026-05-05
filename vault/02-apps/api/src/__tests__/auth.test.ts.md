---
title: "apps/api/src/__tests__/auth.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/auth.test.ts"
status: "active"
---

# apps/api/src/__tests__/auth.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it ensures the security of authentication tokens by validating and parsing bearer tokens correctly, preventing potential vulnerabilities such as token tampering or unauthorized access. By thoroughly testing the `parseBearerToken` function, this note helps to guarantee the integrity of client access tokens and sessions.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/auth.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/auth.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../auth.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  CLIENT_ACCESS_COOKIE_NAME,
  createClientAccessToken,
  parseBearerToken,
  requireValidClientAccess,
  requireValidSession,
  resolveClientAccessToken,
  resolveSessionToken,
} from "../auth.ts";

function createSessionDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

function createClientAccessDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE client_access_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("parseBearerToken", () => {
  it("accepts bearer tokens with flexible casing and whitespace", () => {
    assert.equal(parseBearerToken("Bearer abc123"), "abc123");
    assert.equal(parseBearerToken("bearer   abc123   "), "abc123");
  });

  it("rejects malformed authorization headers", () => {
    assert.equal(parseBearerToken(undefined), null);
    assert.equal(parseBearerToken("Basic abc123"), null);
    assert.equal(parseBearerToken("Bearer"), null);
    assert.equal(parseBearerToken(""), null);
  });
});

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
