import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  RECENT_WINDOW_SIZE,
  getLatestSandboxBotStatusSummary,
  getThreadCompactionDebug,
  getLatestThreadDisplaySummary,
  getLatestThreadSummary,
  summarizeSandboxBotStatus,
  summarizeThreadCompact,
} from "../memory-summarizer.ts";
import { persistMemoryCandidates, restoreMemory } from "../memory.ts";
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
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'user',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE bot_opinions (
      user_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      score REAL,
      band TEXT,
      trend TEXT,
      last_reason TEXT,
      PRIMARY KEY (user_id, bot_scope_key)
    );
    CREATE TABLE conversation_opinions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      score REAL,
      trend TEXT,
      last_reason TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE session_opinions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      score REAL,
      trend TEXT,
      last_reason TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedUser(db: DatabaseSync, userId: string, displayName: string): void {
  db.prepare("INSERT INTO users (id, display_name) VALUES (?, ?)")
    .run(userId, displayName);
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

function seedSandboxConversation(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  title: string;
  botId: string;
  updatedAt: string;
  incognito?: boolean;
}): void {
  const { db, userId, conversationId, title, botId, updatedAt, incognito = false } = args;
  db.prepare(
    `INSERT INTO conversations (
      id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
    ) VALUES (?, ?, ?, 'sandbox', ?, ?, ?, ?)`
  ).run(
    conversationId,
    userId,
    title,
    botId,
    incognito ? 1 : 0,
    updatedAt,
    updatedAt
  );
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
    assert.match(row?.summary ?? "", /conversation-about-foo/);
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

  it("forces a manual summary run even when below the live window", async () => {
    const db = createTestDb();
    const { provider } = stubProvider("manual-summary");
    seedMessages(db, "user-1", "conv-1", 5, Date.now());

    const result = await summarizeThreadCompact(db, provider, "user-1", "conv-1", {
      mode: "sandbox",
      reason: "manual",
      force: true,
    });

    assert.equal(result.triggered, true);
    const row = db
      .prepare("SELECT summary FROM memory_summaries LIMIT 1")
      .get() as { summary: string } | undefined;
    assert.match(row?.summary ?? "", /manual-summary/);
  });

  it("retains persisted transcript rows after chat-mode compaction", async () => {
    const db = createTestDb();
    const { provider } = stubProvider("chat-mode-summary");
    seedMessages(db, "user-1", "conv-1", RECENT_WINDOW_SIZE + 3, Date.now());

    const beforeCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND conversation_id = ?")
        .get("user-1", "conv-1") as { n: number }
    ).n;
    assert.equal(beforeCount, RECENT_WINDOW_SIZE + 3);

    const result = await summarizeThreadCompact(db, provider, "user-1", "conv-1", {
      mode: "chat",
      reason: "manual",
      force: true,
    });
    assert.equal(result.triggered, true);

    const afterCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND conversation_id = ?")
        .get("user-1", "conv-1") as { n: number }
    ).n;
    assert.equal(
      afterCount,
      beforeCount,
      "chat-mode compaction should preserve transcript rows for persisted chat history"
    );
    const displaySummary = getLatestThreadDisplaySummary(db, "user-1", "conv-1", "chat");
    assert.equal(displaySummary, "chat-mode-summary.");
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

describe("getLatestThreadDisplaySummary", () => {
  it("falls back to internal summary for legacy rows without displaySummary", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "s1",
      "user-1",
      "conv-1",
      JSON.stringify({
        v: 1,
        kind: "thread_compact",
        mode: "chat",
        summary: "legacy technical summary",
      }),
      new Date().toISOString()
    );
    assert.equal(
      getLatestThreadDisplaySummary(db, "user-1", "conv-1", "chat"),
      "legacy technical summary"
    );
  });

  it("exposes both Zen display and internal summaries in debug state", () => {
    const db = createTestDb();
    const createdAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "s1",
      "user-1",
      "conv-1",
      JSON.stringify({
        v: 1,
        kind: "thread_compact",
        mode: "zen",
        summary: "internal technical summary",
        displaySummary: "I'm carrying forward the user's next step.",
      }),
      createdAt
    );

    const debug = getThreadCompactionDebug(db, "user-1", "conv-1", "zen");
    assert.equal(debug.latestSummary, "internal technical summary");
    assert.equal(
      debug.latestDisplaySummary,
      "I'm carrying forward the user's next step."
    );
    assert.equal(debug.latestSummaryAt, createdAt);
  });
});

describe("summarizeSandboxBotStatus", () => {
  it("builds a bot-level recap from sandbox conversations and reads it back", async () => {
    const db = createTestDb();
    seedUser(db, "user-1", "Jared");
    db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)")
      .run("bot-1", "user-1", "Patrick");
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    seedSandboxConversation({
      db,
      userId: "user-1",
      conversationId: "conv-a",
      title: "Shipwreck Explorations",
      botId: "bot-1",
      updatedAt: new Date(now + 1000).toISOString(),
    });
    seedSandboxConversation({
      db,
      userId: "user-1",
      conversationId: "conv-b",
      title: "Seashells",
      botId: "bot-1",
      updatedAt: new Date(now + 2000).toISOString(),
    });
    seedSandboxConversation({
      db,
      userId: "user-1",
      conversationId: "conv-private",
      title: "Private topic",
      botId: "bot-1",
      updatedAt: new Date(now + 3000).toISOString(),
      incognito: true,
    });
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sum-a",
      "user-1",
      "conv-a",
      JSON.stringify({
        v: 1,
        kind: "thread_compact",
        mode: "sandbox",
        summary: "We explored hidden caves and found a calmer routine.",
      }),
      new Date(now + 4000).toISOString()
    );
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sum-b",
      "user-1",
      "conv-b",
      JSON.stringify({
        v: 1,
        kind: "thread_compact",
        mode: "sandbox",
        summary: "You wanted practical next steps and we narrowed two options.",
      }),
      new Date(now + 5000).toISOString()
    );
    const { provider, calls } = stubProvider(
      "I'm helping the user balance curiosity with practical next steps."
    );

    const result = await summarizeSandboxBotStatus(db, provider, "user-1", "bot-1");

    assert.equal(result.triggered, true);
    assert.equal(calls.length, 1);
    const prompt = calls[0]?.find((message) => message.role === "user")?.content ?? "";
    assert.match(prompt, /Shipwreck Explorations/);
    assert.match(prompt, /Seashells/);
    assert.match(prompt, /User name: Jared/);
    assert.doesNotMatch(prompt, /Private topic/);
    assert.equal(
      getLatestSandboxBotStatusSummary(db, "user-1", "bot-1"),
      "I'm helping Jared balance curiosity with practical next steps."
    );
  });

  it("uses saved memories but excludes global session summaries from bot recaps", async () => {
    const db = createTestDb();
    const userKey = Buffer.alloc(32, 7);
    seedUser(db, "user-1", "Jared");
    db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)")
      .run("bot-1", "user-1", "Sandy");
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    seedSandboxConversation({
      db,
      userId: "user-1",
      conversationId: "conv-sandy",
      title: "Fresh Start",
      botId: "bot-1",
      updatedAt: new Date(now + 1000).toISOString(),
    });
    await persistMemoryCandidates(
      db,
      "user-1",
      "default-memory-source",
      null,
      [{ text: "Jared likes surreal but calming fidget-toy interfaces.", confidence: 0.9 }],
      userKey
    );
    await restoreMemory(db, "user-1", userKey, {
      conversationId: "default-memory-source",
      botId: "bot-1",
      text: "Your account display name is Jared.",
      confidence: 0.96,
      certainty: 0.96,
      category: "user",
      tier: "long_term",
      durability: 1,
      source: "about_you",
    });
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, NULL, ?, ?)"
    ).run(
      "global-session-summary",
      "user-1",
      JSON.stringify({
        v: 1,
        kind: "chat_facts",
        summary: `- Jared loves Rick James' "Super Freak".\n- Dev tools repeated themselves.`,
      }),
      new Date(now + 2000).toISOString()
    );
    const { provider, calls } = stubProvider(
      "I'm remembering Jared likes surreal but calming interfaces."
    );

    const result = await summarizeSandboxBotStatus(db, provider, "user-1", "bot-1", {
      userKey,
    });

    assert.equal(result.triggered, true);
    const prompt = calls[0]?.find((message) => message.role === "user")?.content ?? "";
    assert.match(prompt, /surreal but calming fidget-toy interfaces/);
    assert.doesNotMatch(prompt, /account display name is Jared/i);
    assert.doesNotMatch(prompt, /prefer(?:s)? to be called Jared/i);
    assert.doesNotMatch(prompt, /Rick James/);
    assert.doesNotMatch(prompt, /Dev tools repeated/);
  });

  it("does not build a bot-status summary from only protected account bootstrap memory", async () => {
    const db = createTestDb();
    const userKey = Buffer.alloc(32, 7);
    seedUser(db, "user-1", "Jared");
    db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)")
      .run("bot-1", "user-1", "Sandy");
    await restoreMemory(db, "user-1", userKey, {
      botId: "bot-1",
      text: "Your account display name is Jared.",
      confidence: 0.96,
      certainty: 0.96,
      category: "user",
      tier: "long_term",
      durability: 1,
      source: "about_you",
    });
    const { provider, calls } = stubProvider("unused");

    const result = await summarizeSandboxBotStatus(db, provider, "user-1", "bot-1", {
      userKey,
    });

    assert.equal(result.triggered, false);
    assert.equal(calls.length, 0);
    assert.equal(getLatestSandboxBotStatusSummary(db, "user-1", "bot-1"), null);
  });

  it("no-ops when there is no sandbox conversation context for the bot", async () => {
    const db = createTestDb();
    db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)")
      .run("bot-1", "user-1", "Patrick");
    const { provider } = stubProvider("unused");

    const result = await summarizeSandboxBotStatus(db, provider, "user-1", "bot-1");

    assert.equal(result.triggered, false);
    assert.equal(getLatestSandboxBotStatusSummary(db, "user-1", "bot-1"), null);
  });

  it("clears stale bot status when the bot has no valid recap sources", async () => {
    const db = createTestDb();
    db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)")
      .run("bot-1", "user-1", "Patrick");
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, NULL, ?, ?)"
    ).run(
      "stale-status",
      "user-1",
      JSON.stringify({
        v: 1,
        kind: "sandbox_bot_status",
        mode: "sandbox",
        botId: "bot-1",
        summary: "I'm carrying over another bot's private thread.",
        displaySummary: "I'm carrying over another bot's private thread.",
      }),
      new Date().toISOString()
    );
    const { provider } = stubProvider("unused");

    const result = await summarizeSandboxBotStatus(db, provider, "user-1", "bot-1");

    assert.equal(result.triggered, false);
    assert.equal(getLatestSandboxBotStatusSummary(db, "user-1", "bot-1"), null);
  });

  it("stores a resilient fallback when recap rewrite comes back empty", async () => {
    const db = createTestDb();
    seedUser(db, "user-1", "Jared");
    db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)")
      .run("bot-1", "user-1", "Patrick");
    const now = new Date().toISOString();
    seedSandboxConversation({
      db,
      userId: "user-1",
      conversationId: "conv-a",
      title: "Forgiveness",
      botId: "bot-1",
      updatedAt: now,
    });
    seedMessages(db, "user-1", "conv-a", 4, Date.now());
    const { provider } = stubProvider("   ");

    const result = await summarizeSandboxBotStatus(db, provider, "user-1", "bot-1");

    assert.equal(result.triggered, true);
    assert.equal(
      getLatestSandboxBotStatusSummary(db, "user-1", "bot-1"),
      "I'm staying aligned with Jared's direction and keeping momentum moving forward."
    );
  });
});
