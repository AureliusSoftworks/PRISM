---
title: "apps/api/src/__tests__/db.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/db.test.ts"
status: "active"
---

# apps/api/src/__tests__/db.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it ensures that the `resolveDbPath` function behaves correctly when both `DB_PATH` and `LOCALAI_DATA_DIR` environment variables are set, allowing for explicit deployments of databases.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/db.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/db.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:fs`
- `node:os`
- `node:path`
- `../db.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, resolveDbPath } from "../db.ts";

describe("resolveDbPath", () => {
  it("prefers DB_PATH for existing explicit deployments", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = "/tmp/prism-explicit.db";
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), "/tmp/prism-explicit.db");
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });

  it("stores mac app data under LOCALAI_DATA_DIR when provided", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    delete process.env.DB_PATH;
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), join("/tmp/prism-data", "localai.db"));
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });
});

describe("createDatabase bot export hash migration", () => {
  it("ensures bots.export_hash exists and backfills missing values", () => {
    c

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
