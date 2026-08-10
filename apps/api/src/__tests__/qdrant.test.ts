import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  deleteVector,
  ensureCollection,
  searchVectors,
  upsertVector,
} from "../qdrant.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Qdrant helpers reject non-success HTTP responses", async () => {
  globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;

  await assert.rejects(
    ensureCollection(),
    /Qdrant collection check failed with HTTP 503/u,
  );
  await assert.rejects(
    upsertVector("summary-1", [1], { userId: "user-1" }),
    /Qdrant point upsert failed with HTTP 503/u,
  );
  await assert.rejects(
    searchVectors([1], "user-1"),
    /Qdrant point search failed with HTTP 503/u,
  );
  await assert.rejects(
    deleteVector("summary-1"),
    /Qdrant point deletion failed with HTTP 503/u,
  );
});

test("a Shh-style best-effort vector deletion settles within its timeout", async () => {
  let requestSignal: AbortSignal | null = null;
  globalThis.fetch = ((_input, init) => {
    requestSignal = init?.signal ?? null;
    return new Promise<Response>(() => {
      // Simulate an unresponsive Qdrant transport. qdrantFetch must bound this
      // even if the transport does not settle when its signal is aborted.
    });
  }) as typeof fetch;

  const startedAt = Date.now();
  const [result] = await Promise.allSettled([
    deleteVector("summary-1", { timeoutMs: 20 }),
  ]);

  assert.equal(result?.status, "rejected");
  assert.match(
    result?.status === "rejected" ? String(result.reason) : "",
    /Qdrant point deletion timed out after 20ms/u,
  );
  assert.equal(requestSignal?.aborted, true);
  assert.ok(Date.now() - startedAt < 250, "delete should settle promptly");
});
