---
title: "apps/api/src/image-retention.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/image-retention.ts"
status: "active"
---

# apps/api/src/image-retention.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/__tests__/image-retention.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/image-retention.ts`

## Import references
- `node:sqlite`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";

/**
 * Generated images (OpenAI DALL-E URLs) expire on OpenAI's side within an
 * hour, so rows past a certain age are just broken-image placeholders in
 * the gallery. Wipe them after 30 days to keep the user's DB clean and
 * avoid the impression that the app is hoarding dead references.
 */
export const GENERATED_IMAGE_RETENTION_DAYS = 30;

/**
 * Cadence for the background purge. Matches the account-retention cadence
 * so the two periodic jobs share a single "housekeeping heartbeat".
 */
export const GENERATED_IMAGE_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function getGeneratedImageCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() -
      GENERATED_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isExpiredImage(createdAt: string, now = new Date()): boolean {
  return (
    new Date(createdAt).getTime() < getGeneratedImageCutoff(now).getTime()
  );
}

/**
 * Delete every image row whose `created_at` is older than the retention
 * cutoff. Returns the number of rows removed so callers can log / report.
 *
 * Images are URL references only (OpenAI hosts the pixels, and those URLs
 * are already expired by the time the row ages), so there's nothing to
 * clean up on the filesystem.
 */
export function purgeExpiredImages(
  db: DatabaseSync,
  now = new Date()
): number {
  const cu

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
