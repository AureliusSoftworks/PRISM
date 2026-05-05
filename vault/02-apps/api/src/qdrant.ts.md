---
title: "apps/api/src/qdrant.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/qdrant.ts"
status: "active"
---

# apps/api/src/qdrant.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/memory-summarizer.ts]]
- [[02-apps/api/src/server.ts]]
- [[04-docs/DESIGN.md]]

## Source path
- `apps/api/src/qdrant.ts`

## Import references
- `@localai/config`

## Source preview
```text
import { getAppConfig } from "@localai/config";

const config = getAppConfig();

const COLLECTION_NAME = "memories";
const VECTOR_DIM = 1536;

async function qdrantFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${config.qdrantUrl}${path}`, {
    headers: { "content-type": "application/json" },
    ...options,
  });
}

export async function ensureCollection(): Promise<void> {
  const check = await qdrantFetch(`/collections/${COLLECTION_NAME}`);
  if (check.ok) {
    return;
  }
  await qdrantFetch(`/collections/${COLLECTION_NAME}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: VECTOR_DIM, distance: "Cosine" },
    }),
  });
}

export async function upsertVector(
  pointId: string,
  vector: number[],
  payload: Record<string, unknown>
): Promise<void> {
  const paddedVector = normalizeVector(vector, VECTOR_DIM);
  await qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points: [{ id: pointId, vector: paddedVector, payload }],
    }),
  });
}

export async function searchVectors(
  vector: number[],
  userId: string,
  limit = 5
): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
  const paddedVector = normalizeVector(vector, VECTOR_DIM);
  const response = await qdrantFetch(`/collections/${COLLECTION_NAME}/points/search`, {
    meth

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
