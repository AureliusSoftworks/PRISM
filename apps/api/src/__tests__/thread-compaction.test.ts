import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  RECENT_WINDOW_SIZE,
  getLatestThreadSummary,
  summarizeThreadCompact,
} from "../memory-summarizer.ts";
import type { LlmProvider, ProviderMessage } from "../providers.ts";

/**
 * The thread-compaction suite pins the Sandbox-mode memory contract:
 *
 *   1. Short threads never summarize (no tokens burned on nothing).
 *   2. Long threads DO summarize, and the paragraph lands in
 *      `memory_summaries` scoped by conversation_id.
 *   3. Subsequent summarizations feed the PRIOR summary through so the
 *      LLM can compress redundantly-seen content rather than blow up
 *      token budget.
 *   4. Nothing ever lands in Qdrant from this path (unit-tested
 *      implicitly: our mock provider's `embedText` would throw if
 *      called — compaction never calls it).
 *   5. `getLatestThreadSummary` reads back the most recent row,
 *      scoped per-conversation so threads can't cross-contaminate.
 */

/** In-memory DB with just the tables the compaction path touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

/**
 * Capturing LlmProvider stub. `generateResponse` records every call so we
 * can assert what content was fed in; `embedText` throws so any accidental
 * Qdrant path in the code-under-test surfaces loudly in the test run.
 */
function stubProvider(response = "compacted paragraph"): {
  provider: LlmProvider;
  calls: ProviderMessage[][];
} {
  const calls: ProviderMessage[][] = [];
  const provider: LlmProvider = {
    name: "local",
    async generateResponse(messages: ProviderMessage[]): Promise<string> {
      calls.push(messages);
      return response;
    },
    async embedText(): Promise<number[]> {
      throw new Error(
        "Thread compaction must never embed — it would leak into cross-thread recall."
      );
    },
  };
  return { provider, calls };
}

function seedMessages(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  count: number,
  baseTime: number
): void {
  const insert = db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (let index = 0; index < count; index += 1) {
    const role = index % 2 === 0 ? "user" : "assistant";
    const createdAt = new Date(baseTime + index * 1000).toISOString();
    insert.run(
      `msg-${conversationId}-${index}`,
      conversationId,
      userId,
      role,
      `message ${index}`,
      createdAt
    );
  }
}

describe("summarizeThreadCompact", () => {
  it(`no-ops when the thread is within the ${RECENT_WINDOW_SIZE}-message window`, async () => {
    const db = createTestDb();
    const { provider, calls } = stubProvider();
    seedMessages(db, "user-1", "conv-1", RECENT_WINDOW_SIZE, Date.now());

    await summarizeThreadCompact(db, provider, "user-1", "conv-1");

    assert.equal(
      calls.length,
      0,
      "should not call the model when compaction is unnecessary"
    );
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM memory_summaries")
      .get() as { n: number };
    assert.equal(rows.n, 0, "should write nothing when compaction is unnecessary");
  });

  it("writes a summary once the thread exceeds the window", async () => {
    const db = createTestDb();
    const { provider, calls } = stubProvider("conversation-about-foo");
    seedMessages(db, "user-1", "conv-1", RECENT_WINDOW_SIZE + 5, Date.now());

    await summarizeThreadCompact(db, provider, "user-1", "conv-1");

    assert.equal(calls.length, 1, "should call the model exactly once");
    // The summarizer should have fed the 5 oldest messages (those that
    // don't fit in the live window) to the LLM.
    const userPrompt = calls[0]?.find((m) => m.role === "user")?.content ?? "";
    assert.match(userPrompt, /Earlier messages to fold in/);
    assert.match(userPrompt, /message 0/);
    assert.match(userPrompt, /message 4/);
    // Messages that still fit in the window must NOT be re-sent.
    assert.doesNotMatch(
      userPrompt,
      /message 5\b/,
      "in-window messages should not be re-summarized"
    );

    const row = db
      .prepare(
        "SELECT user_id, conversation_id, summary FROM memory_summaries LIMIT 1"
      )
      .get() as
      | { user_id: string; conversation_id: string; summary: string }
      | undefined;
    assert.equal(row?.user_id, "user-1");
    assert.equal(row?.conversation_id, "conv-1");
    assert.equal(row?.summary, "conversation-about-foo");
  });

  it("threads the prior summary through on subsequent passes", async () => {
    const db = createTestDb();
    const base = Date.UTC(2025, 0, 1, 0, 0, 0);

    // First pass: thread has 32 messages (2 over the window).
    seedMessages(db, "user-1", "conv-1", RECENT_WINDOW_SIZE + 2, base);
    const first = stubProvider("first-pass summary");
    await summarizeThreadCompact(db, first.provider, "user-1", "conv-1");

    // Sanity: the first pass should have created exactly one summary row.
    const firstPassRowCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memory_summaries")
        .get() as { n: number }
    ).n;
    assert.equal(firstPassRowCount, 1);

    // Second pass: add 3 more messages so 5 messages are now outside
    // the window. The contract is that the prior summary gets fed back
    // into the next compaction so the LLM can merge continuity —
    // dedup/compression is the LLM's job, not the caller's.
    const newCount = 3;
    const insert = db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const laterBase = base + (RECENT_WINDOW_SIZE + 10) * 1000;
    for (let index = 0; index < newCount; index += 1) {
      insert.run(
        `msg-conv-1-late-${index}`,
        "conv-1",
        "user-1",
        index % 2 === 0 ? "user" : "assistant",
        `later-message ${index}`,
        new Date(laterBase + index * 1000).toISOString()
      );
    }

    const second = stubProvider("second-pass summary");
    await summarizeThreadCompact(db, second.provider, "user-1", "conv-1");

    assert.equal(second.calls.length, 1, "second pass should summarize once");
    const secondPrompt =
      second.calls[0]?.find((m) => m.role === "user")?.content ?? "";

    // Prior summary must be threaded into the new compaction so the
    // LLM has continuity with what it said earlier.
    assert.match(secondPrompt, /Prior summary/);
    assert.match(secondPrompt, /first-pass summary/);

    // The full "older" slice (pre-window) gets fed in, and the LLM is
    // responsible for compressing it against the prior summary.
    assert.match(secondPrompt, /Earlier messages to fold in/);

    // Two resulting rows now (first-pass + second-pass); the reader
    // helper should prefer the most recent one.
    const total = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memory_summaries")
        .get() as { n: number }
    ).n;
    assert.equal(total, 2);
  });

  it("skips the write when the provider returns an empty summary", async () => {
    const db = createTestDb();
    seedMessages(db, "user-1", "conv-1", RECENT_WINDOW_SIZE + 3, Date.now());
    const { provider } = stubProvider("   ");

    await summarizeThreadCompact(db, provider, "user-1", "conv-1");

    const total = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memory_summaries")
        .get() as { n: number }
    ).n;
    assert.equal(total, 0, "blank LLM output must not land in storage");
  });
});

describe("getLatestThreadSummary", () => {
  it("returns null when no summary exists yet", () => {
    const db = createTestDb();
    assert.equal(getLatestThreadSummary(db, "user-1", "conv-1"), null);
  });

  it("returns the most recent summary's text, scoped per conversation", () => {
    const db = createTestDb();
    const baseTime = Date.UTC(2025, 0, 1, 0, 0, 0);
    const insert = db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    // Two older summaries on conv-1, one on conv-2. The latest on conv-1
    // must be the one we read back, and conv-2's summary must never
    // bleed through.
    insert.run(
      "s1",
      "user-1",
      "conv-1",
      "old on conv-1",
      new Date(baseTime).toISOString()
    );
    insert.run(
      "s2",
      "user-1",
      "conv-1",
      "new on conv-1",
      new Date(baseTime + 5000).toISOString()
    );
    insert.run(
      "s3",
      "user-1",
      "conv-2",
      "only on conv-2",
      new Date(baseTime + 10000).toISOString()
    );

    assert.equal(getLatestThreadSummary(db, "user-1", "conv-1"), "new on conv-1");
    assert.equal(getLatestThreadSummary(db, "user-1", "conv-2"), "only on conv-2");
  });

  it("refuses to cross the user_id boundary", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("s1", "user-1", "conv-1", "private", new Date().toISOString());

    assert.equal(
      getLatestThreadSummary(db, "user-2", "conv-1"),
      null,
      "must not surface another user's summary even on a matching conversation_id"
    );
  });
});
