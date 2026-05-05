---
title: "apps/api/src/__tests__/image-retention.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/image-retention.test.ts"
status: "active"
---

# apps/api/src/__tests__/image-retention.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/image-retention.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/image-retention.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `../image-retention.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  GENERATED_IMAGE_RETENTION_DAYS,
  getGeneratedImageCutoff,
  isExpiredImage,
  purgeExpiredImages,
} from "../image-retention.ts";

/** Minimal images table matching the shape purgeExpiredImages touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedImage(
  db: DatabaseSync,
  id: string,
  createdAt: string
): void {
  db.prepare(
    "INSERT INTO images (id, user_id, prompt, url, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, "user-1", "a cat", "http://example.com/cat.png", createdAt);
}

describe("generated image retention", () => {
  it("computes the cutoff from the configured retention window", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");
    const cutoff = getGeneratedImageCutoff(now);
    assert.equal(cutoff.toISOString(), "2026-03-23T00:00:00.000Z");
    assert.equal(GENERATED_IMAGE_RETENTION_DAYS, 30);
  });

  it("flags images as expired only after the cutoff", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");
    // 30 days + 1 second old -> expi

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
