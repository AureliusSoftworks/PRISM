import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { retrieveMemorySummaries } from "../memory-summarizer.ts";
import { fallbackEmbedding } from "../providers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("filters orphan and cross-tenant vectors and trusts canonical SQLite text", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const insertSummary = db.prepare(
    `INSERT INTO memory_summaries
       (id, user_id, conversation_id, summary, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  insertSummary.run(
    "canonical-hit",
    "user-1",
    "conversation-1",
    JSON.stringify({
      v: 1,
      kind: "chat_facts",
      mode: "zen",
      summary: "CANONICAL_HEARD_TEXT",
    }),
    "2026-08-09T00:00:00.000Z",
  );
  insertSummary.run(
    "other-tenant-hit",
    "user-2",
    "conversation-2",
    JSON.stringify({
      v: 1,
      kind: "chat_facts",
      mode: "chat",
      summary: "OTHER_TENANT_CANONICAL_TEXT",
    }),
    "2026-08-09T00:00:00.000Z",
  );

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("/api/embeddings")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        prompt?: string;
      };
      return new Response(
        JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/collections/memories")) {
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/collections/memories/points/search")) {
      return new Response(
        JSON.stringify({
          result: [
            {
              id: "canonical-hit",
              score: 0.99,
              payload: { text: "UNHEARD_STALE_VECTOR_TEXT" },
            },
            {
              id: "orphan-hit",
              score: 0.98,
              payload: { text: "ORPHAN_UNHEARD_TEXT" },
            },
            {
              id: "other-tenant-hit",
              score: 0.97,
              payload: { text: "OTHER_TENANT_VECTOR_TEXT" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const results = await retrieveMemorySummaries(
    db,
    "user-1",
    "What do you remember?",
    10,
  );

  assert.deepEqual(results, [
    {
      id: "canonical-hit",
      text: "CANONICAL_HEARD_TEXT",
      score: 0.99,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(results), /UNHEARD|ORPHAN|OTHER_TENANT/u);
  db.close();
});

test("cancels local embedding and Qdrant retrieval when its owning deadline aborts", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE memory_summaries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, summary TEXT NOT NULL);`);
  const controller = new AbortController();
  let embeddingAborted = false;
  let markEmbeddingStarted: (() => void) | null = null;
  const embeddingStarted = new Promise<void>((resolve) => {
    markEmbeddingStarted = resolve;
  });
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    if (String(input).endsWith("/collections/memories")) {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    if (String(input).includes("/api/embeddings")) {
      markEmbeddingStarted?.();
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          embeddingAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  const retrieval = retrieveMemorySummaries(db, "user-1", "late query", 4, {
    signal: controller.signal,
  });
  await embeddingStarted;
  controller.abort("chat deadline");

  assert.deepEqual(await retrieval, []);
  assert.equal(embeddingAborted, true);
  db.close();
});

test("cancels an in-flight Qdrant search after local embedding completes", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE memory_summaries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, summary TEXT NOT NULL);`);
  const controller = new AbortController();
  let qdrantAborted = false;
  let markQdrantStarted: (() => void) | null = null;
  const qdrantStarted = new Promise<void>((resolve) => {
    markQdrantStarted = resolve;
  });
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/collections/memories")) return Promise.resolve(new Response("{}"));
    if (url.includes("/api/embeddings")) {
      return Promise.resolve(Response.json({ embedding: fallbackEmbedding("query") }));
    }
    if (url.endsWith("/collections/memories/points/search")) {
      markQdrantStarted?.();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          qdrantAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const retrieval = retrieveMemorySummaries(db, "user-1", "query", 4, {
    signal: controller.signal,
  });
  await qdrantStarted;
  controller.abort("chat deadline");

  assert.deepEqual(await retrieval, []);
  assert.equal(qdrantAborted, true);
  db.close();
});
