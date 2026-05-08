import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createDevSeedConversations,
  deleteAllConversations,
  deleteConversation,
  deleteConversationsByBot,
  getConversationSweepState,
  listConversationSummaries,
  rewindConversation,
  sweepConversations,
  undoLatestConversationSweep,
} from "../conversations.ts";

/** Stand up an in-memory DB with just the tables deleteConversation touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      archived_at TEXT,
      archive_batch_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      glyph TEXT,
      delete_protected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      bot_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      prompt TEXT NOT NULL,
      url TEXT NOT NULL,
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
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_sweep_batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      archived_conversation_ids TEXT NOT NULL,
      summary_conversation_ids TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undo_expires_at TEXT NOT NULL,
      undone_at TEXT
    );
  `);
  return db;
}

function seedChat(db: DatabaseSync, userId: string, conversationId: string): void {
  const now = new Date().toISOString();
  // Suffix child-row IDs with the conversation id so the same helper can
  // seed multiple chats in a single test without colliding on PRIMARY KEY.
  const suffix = conversationId;
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(conversationId, userId, "Test chat", now, now);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(`msg-${suffix}`, conversationId, userId, "user", "hello", now);
  db.prepare(
    "INSERT INTO conversation_exports (id, user_id, conversation_id, markdown, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(`exp-${suffix}`, userId, conversationId, "# export", now);
  db.prepare(
    "INSERT INTO images (id, user_id, conversation_id, prompt, url, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(`img-${suffix}`, userId, conversationId, "a cat", "http://img", now);
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(`sum-${suffix}`, userId, conversationId, "user likes cats", now);
}

function seedBotChat(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string | null
): void {
  seedChat(db, userId, conversationId);
  db.prepare(
    "UPDATE conversations SET bot_id = ? WHERE id = ? AND user_id = ?"
  ).run(botId, conversationId, userId);
}

function seedListConversation(
  db: DatabaseSync,
  options: {
    id: string;
    userId: string;
    title: string;
    updatedAt: string;
    incognito?: boolean;
    archivedAt?: string | null;
    botId?: string | null;
    assistantBotId?: string | null;
  }
): void {
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, bot_id, archived_at, incognito, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    options.id,
    options.userId,
    options.title,
    options.botId ?? null,
    options.archivedAt ?? null,
    options.incognito ? 1 : 0,
    "2026-01-01T00:00:00.000Z",
    options.updatedAt
  );

  if (options.assistantBotId !== undefined) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      `assistant-${options.id}`,
      options.id,
      options.userId,
      "assistant",
      "hello",
      options.assistantBotId,
      options.updatedAt
    );
  }
}

describe("listConversationSummaries", () => {
  it("excludes persisted private conversations from the sidebar list", () => {
    const db = createTestDb();
    seedListConversation(db, {
      id: "saved-1",
      userId: "user-1",
      title: "Saved chat",
      updatedAt: "2026-01-01T00:00:03.000Z",
    });
    seedListConversation(db, {
      id: "private-1",
      userId: "user-1",
      title: "Private chat",
      updatedAt: "2026-01-01T00:00:04.000Z",
      incognito: true,
    });
    seedListConversation(db, {
      id: "other-user",
      userId: "user-2",
      title: "Other user chat",
      updatedAt: "2026-01-01T00:00:05.000Z",
    });

    const conversations = listConversationSummaries(db, "user-1");

    assert.deepEqual(
      conversations.map(c => c.id),
      ["saved-1"]
    );
    assert.ok(conversations.every(c => !c.incognito));
  });

  it("keeps public conversation row metadata for sidebar coloring", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-1",
      "user-1",
      "Storm Bot",
      "#67e8f9",
      "triangle",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    seedListConversation(db, {
      id: "saved-1",
      userId: "user-1",
      title: "Saved chat",
      botId: "bot-1",
      assistantBotId: "bot-1",
      updatedAt: "2026-01-01T00:00:03.000Z",
    });

    const [conversation] = listConversationSummaries(db, "user-1");

    assert.equal(conversation?.botId, "bot-1");
    assert.equal(conversation?.lastBotId, "bot-1");
    assert.equal(conversation?.lastBotColor, "#67e8f9");
    assert.equal(conversation?.hasAssistantReply, true);
  });

  it("hides archived conversations from the sidebar list", () => {
    const db = createTestDb();
    seedListConversation(db, {
      id: "active-1",
      userId: "user-1",
      title: "Active chat",
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    seedListConversation(db, {
      id: "archived-1",
      userId: "user-1",
      title: "Archived chat",
      updatedAt: "2026-01-01T00:00:03.000Z",
      archivedAt: "2026-01-02T00:00:00.000Z",
    });

    const conversations = listConversationSummaries(db, "user-1");
    assert.deepEqual(conversations.map((conversation) => conversation.id), ["active-1"]);
  });
});

describe("deleteConversation", () => {
  it("removes the chat, its messages, and its exports", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");

    deleteConversation(db, "user-1", "chat-1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports").get() as { n: number }).n,
      0
    );
  });

  it("preserves images, summaries, and memories, untying them from the deleted chat", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    insertLinkedMemory(db, "user-1", "chat-1", "memory-chat-1", ["msg-chat-1"]);

    deleteConversation(db, "user-1", "chat-1");

    const image = db
      .prepare("SELECT id, conversation_id FROM images WHERE id = ?")
      .get("img-chat-1") as { id: string; conversation_id: string | null } | undefined;
    assert.ok(image, "image should still exist");
    assert.equal(image?.conversation_id, null);

    const summary = db
      .prepare("SELECT id, conversation_id FROM memory_summaries WHERE id = ?")
      .get("sum-chat-1") as { id: string; conversation_id: string | null } | undefined;
    assert.ok(summary, "memory summary should still exist");
    assert.equal(summary?.conversation_id, null);

    const memory = db
      .prepare("SELECT id, conversation_id FROM memories WHERE id = ?")
      .get("memory-chat-1") as { id: string; conversation_id: string | null } | undefined;
    assert.ok(memory, "memory should still exist");
    assert.equal(memory?.conversation_id, null);
  });

  it("rejects deletion attempts by a different user", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");

    assert.throws(
      () => deleteConversation(db, "user-2", "chat-1"),
      /Conversation not found/
    );

    // Verify the data is still intact after the failed attempt.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations").get() as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
      1
    );
  });

  it("throws when the conversation does not exist", () => {
    const db = createTestDb();
    assert.throws(
      () => deleteConversation(db, "user-1", "does-not-exist"),
      /Conversation not found/
    );
  });

  it("leaves other users' chats untouched", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-2", "chat-2");

    deleteConversation(db, "user-1", "chat-1");

    const otherChat = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get("chat-2") as { id?: string } | undefined;
    assert.equal(otherChat?.id, "chat-2");
  });
});

describe("deleteAllConversations", () => {
  it("removes every chat, its messages, and its exports for the given user", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-1", "chat-2");
    seedChat(db, "user-1", "chat-3");

    const deleted = deleteAllConversations(db, "user-1");

    assert.equal(deleted, 3);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
  });

  it("preserves images and memory summaries across every cleared chat", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-1", "chat-2");

    deleteAllConversations(db, "user-1");

    // Both images should survive, untied from their (now-deleted) chats.
    const images = db
      .prepare(
        "SELECT id, conversation_id FROM images WHERE user_id = ? ORDER BY id"
      )
      .all("user-1") as Array<{ id: string; conversation_id: string | null }>;
    assert.equal(images.length, 2);
    assert.ok(images.every(img => img.conversation_id === null));

    const summaries = db
      .prepare(
        "SELECT id, conversation_id FROM memory_summaries WHERE user_id = ? ORDER BY id"
      )
      .all("user-1") as Array<{ id: string; conversation_id: string | null }>;
    assert.equal(summaries.length, 2);
    assert.ok(summaries.every(sum => sum.conversation_id === null));
  });

  it("returns 0 and is a no-op when the user has no chats", () => {
    const db = createTestDb();
    seedChat(db, "user-2", "chat-2");

    const deleted = deleteAllConversations(db, "user-1");

    assert.equal(deleted, 0);
    // Other user's chat must be intact.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
  });

  it("leaves other users' chats, messages, and exports untouched", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-1", "chat-2");
    seedChat(db, "user-2", "chat-3");

    const deleted = deleteAllConversations(db, "user-1");

    assert.equal(deleted, 2);

    // user-2's row counts should be unchanged.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    // And user-2's artifacts still tied to their chat.
    const otherImage = db
      .prepare("SELECT conversation_id FROM images WHERE user_id = ?")
      .get("user-2") as { conversation_id: string | null } | undefined;
    assert.equal(otherImage?.conversation_id, "chat-3");
  });
});

describe("deleteConversationsByBot", () => {
  it("removes only saved conversations for the requested bot", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat-1", "bot-1");
    seedBotChat(db, "user-1", "bot-chat-2", "bot-1");
    seedBotChat(db, "user-1", "other-bot-chat", "bot-2");
    seedBotChat(db, "user-1", "default-chat", null);
    seedBotChat(db, "user-2", "other-user-bot-chat", "bot-1");

    const deleted = deleteConversationsByBot(db, "user-1", "bot-1");

    assert.equal(deleted, 2);
    const remaining = db
      .prepare("SELECT id FROM conversations ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["default-chat", "other-bot-chat", "other-user-bot-chat"]
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      2
    );
  });

  it("removes Default Prism conversations while preserving linked artifacts", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "default-1", null);
    seedBotChat(db, "user-1", "default-2", null);
    seedBotChat(db, "user-1", "bot-chat", "bot-1");
    seedBotChat(db, "user-2", "other-user-default", null);
    insertLinkedMemory(db, "user-1", "default-1", "memory-default-1", ["msg-default-1"]);
    db.prepare("UPDATE conversations SET incognito = 1 WHERE id = ?").run("default-2");

    const deleted = deleteConversationsByBot(db, "user-1", null);

    assert.equal(deleted, 1);
    const remaining = db
      .prepare("SELECT id FROM conversations ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["bot-chat", "default-2", "other-user-default"]
    );
    const image = db
      .prepare("SELECT conversation_id FROM images WHERE id = ?")
      .get("img-default-1") as { conversation_id: string | null };
    const summary = db
      .prepare("SELECT conversation_id FROM memory_summaries WHERE id = ?")
      .get("sum-default-1") as { conversation_id: string | null };
    const memory = db
      .prepare("SELECT conversation_id FROM memories WHERE id = ?")
      .get("memory-default-1") as { conversation_id: string | null };
    assert.equal(image.conversation_id, null);
    assert.equal(summary.conversation_id, null);
    assert.equal(memory.conversation_id, null);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE conversation_id = ?")
        .get("default-1") as { n: number }).n,
      0
    );
  });

  it("returns 0 when no saved conversations match the bot group", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat", "bot-1");

    const deleted = deleteConversationsByBot(db, "user-1", "bot-2");

    assert.equal(deleted, 0);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      1
    );
  });
});

describe("sweepConversations + undoLatestConversationSweep", () => {
  it("archives visible conversations and creates one summary per bot/default group", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat-1", "bot-1");
    seedBotChat(db, "user-1", "bot-chat-2", "bot-1");
    seedBotChat(db, "user-1", "default-chat-1", null);
    seedBotChat(db, "user-2", "other-user-chat", "bot-1");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-1",
      "user-1",
      "Plankton",
      "#00ff88",
      "bot",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );

    const result = sweepConversations(db, "user-1", "sandbox");

    assert.ok(result.batchId, "sweep should create a batch id");
    assert.equal(result.sweptGroups, 1);
    assert.equal(result.archivedConversationCount, 2);
    assert.equal(result.summaryConversationCount, 1);
    assert.ok(result.undoExpiresAt, "sweep should return undo window expiration");
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NOT NULL"
      ).get("user-1") as { n: number }).n,
      2
    );
    const summaries = listConversationSummaries(db, "user-1");
    assert.equal(summaries.length, 2);
    assert.equal(
      summaries.filter((conversation) => conversation.title.startsWith("Sweep Summary - ")).length,
      1
    );
    const sweepState = getConversationSweepState(db, "user-1");
    assert.equal(sweepState.canUndo, true);
  });

  it("undoes the latest sweep by restoring archived chats and removing summaries", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat-1", "bot-1");
    seedBotChat(db, "user-1", "bot-chat-2", "bot-1");
    seedBotChat(db, "user-1", "default-chat-1", null);
    const sweep = sweepConversations(db, "user-1", "sandbox");
    assert.ok(sweep.batchId, "expected sweep batch id");

    const undo = undoLatestConversationSweep(db, "user-1", sweep.batchId);

    assert.equal(undo.batchId, sweep.batchId);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NOT NULL"
      ).get("user-1") as { n: number }).n,
      0
    );
    const remaining = db
      .prepare(
        "SELECT id, title FROM conversations WHERE user_id = ? ORDER BY id"
      )
      .all("user-1") as Array<{ id: string; title: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["bot-chat-1", "bot-chat-2", "default-chat-1"]
    );
    assert.ok(remaining.every((row) => !row.title.startsWith("Sweep Summary - ")));
    const state = getConversationSweepState(db, "user-1");
    assert.equal(state.canUndo, false);
  });

  it("keeps only one undoable sweep batch at a time", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "chat-1", "bot-1");
    seedBotChat(db, "user-1", "chat-1b", "bot-1");
    sweepConversations(db, "user-1", "sandbox");

    seedBotChat(db, "user-1", "chat-2", "bot-1");
    seedBotChat(db, "user-1", "chat-2b", "bot-1");
    sweepConversations(db, "user-1", "sandbox");

    const activeSweepCount = (
      db.prepare(
        "SELECT COUNT(*) AS n FROM conversation_sweep_batches WHERE user_id = ? AND undone_at IS NULL"
      ).get("user-1") as { n: number }
    ).n;
    assert.equal(activeSweepCount, 1);
  });

  it("returns a no-op when undo is requested without an active sweep batch", () => {
    const db = createTestDb();

    const result = undoLatestConversationSweep(db, "user-1", null);

    assert.equal(result.batchId, null);
    assert.equal(result.archivedConversationCount, 0);
    assert.equal(result.summaryConversationCount, 0);
  });

  it("returns a no-op when no bot group has more than one chat", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "solo-bot-chat", "bot-1");
    seedBotChat(db, "user-1", "solo-default-chat", null);

    const result = sweepConversations(db, "user-1", "sandbox");

    assert.equal(result.batchId, null);
    assert.equal(result.sweptGroups, 0);
    assert.equal(result.archivedConversationCount, 0);
    assert.equal(result.summaryConversationCount, 0);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NOT NULL"
      ).get("user-1") as { n: number }).n,
      0
    );
  });

  it("refuses undo when the sweep batch is expired", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "chat-1", "bot-1");
    seedBotChat(db, "user-1", "chat-2", "bot-1");
    const sweep = sweepConversations(db, "user-1", "sandbox");
    assert.ok(sweep.batchId);
    db.prepare(
      "UPDATE conversation_sweep_batches SET undo_expires_at = ? WHERE id = ?"
    ).run("2000-01-01T00:00:00.000Z", sweep.batchId);

    const undo = undoLatestConversationSweep(db, "user-1", sweep.batchId);

    assert.equal(undo.batchId, null);
    const archived = db
      .prepare("SELECT archived_at FROM conversations WHERE id = ?")
      .get("chat-1") as { archived_at: string | null };
    assert.ok(archived.archived_at, "expired undo should not restore archived chats");
  });
});

describe("createDevSeedConversations", () => {
  it("creates saved sidebar chats with lorem assistant replies", () => {
    const db = createTestDb();
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Ada", "#67e8f9", "bot", now, now);

    const created = createDevSeedConversations(db, "user-1", 2);

    assert.equal(created, 2);
    const conversations = listConversationSummaries(db, "user-1");
    assert.equal(conversations.length, 2);
    assert.ok(conversations.every((conversation) => conversation.hasAssistantReply));
    assert.ok(conversations.every((conversation) => conversation.botId === "bot-1"));
    assert.ok(conversations.every((conversation) => conversation.lastBotId === "bot-1"));
    assert.ok(conversations.every((conversation) => conversation.lastBotColor === "#67e8f9"));

    const messages = db
      .prepare("SELECT role, content, bot_id FROM messages WHERE user_id = ? ORDER BY created_at ASC")
      .all("user-1") as Array<{ role: string; content: string; bot_id: string | null }>;
    assert.equal(messages.length, 4);
    assert.equal(messages.filter((message) => message.role === "assistant").length, 2);
    assert.ok(
      messages
        .filter((message) => message.role === "assistant")
        .every((message) => message.content.includes("Lorem ipsum") && message.bot_id === "bot-1")
    );
  });

  it("falls back to default assistant chats when the user has no bots", () => {
    const db = createTestDb();

    createDevSeedConversations(db, "user-1", 1);

    const [conversation] = listConversationSummaries(db, "user-1");
    assert.equal(conversation?.botId, null);
    assert.equal(conversation?.lastBotId, null);
    assert.equal(conversation?.hasAssistantReply, true);
  });

  it("rejects non-positive seed counts", () => {
    const db = createTestDb();

    assert.throws(
      () => createDevSeedConversations(db, "user-1", 0),
      /positive integer/
    );
  });
});

// Builds a conversation with explicit, orderable timestamps so tests can
// assert precisely which rows the cutoff keeps or drops. Timestamps are
// ISO strings `1970-01-01T00:00:0N.000Z` keyed off each row's index so
// string lex-order matches chronological order — crucial because the
// production query compares `created_at` as TEXT.
function seedConversationAt(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  rows: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    seconds: number;
  }>
): void {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const tsFor = (seconds: number): string => {
    const s = seconds.toString().padStart(2, "0");
    return `1970-01-01T00:00:${s}.000Z`;
  };
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    conversationId,
    userId,
    "Rewind fixture",
    tsFor(first?.seconds ?? 0),
    tsFor(last?.seconds ?? 0)
  );
  const insertMessage = db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const row of rows) {
    insertMessage.run(
      row.id,
      conversationId,
      userId,
      row.role,
      row.content,
      tsFor(row.seconds)
    );
  }
}

function insertSummary(
  db: DatabaseSync,
  userId: string,
  conversationId: string | null,
  id: string,
  summary: string,
  seconds: number
): void {
  const s = seconds.toString().padStart(2, "0");
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, conversationId, summary, `1970-01-01T00:00:${s}.000Z`);
}

function insertLinkedMemory(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  id: string,
  sourceMessageIds: string[]
): void {
  db.prepare(`
    INSERT INTO memories (
      id, user_id, conversation_id, bot_id, ciphertext, iv, tag,
      confidence, source, certainty, source_message_ids, created_at
    )
    VALUES (?, ?, ?, NULL, 'ciphertext', 'iv', 'tag', 0.9, 'compiled', 0.9, ?, ?)
  `).run(
    id,
    userId,
    conversationId,
    JSON.stringify(sourceMessageIds),
    "1970-01-01T00:00:08.000Z"
  );
}

describe("rewindConversation", () => {
  it("truncates the target user message and everything newer, returning the original text", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first question", seconds: 1 },
      { id: "m2", role: "assistant", content: "first reply", seconds: 2 },
      { id: "m3", role: "user", content: "second question", seconds: 3 },
      { id: "m4", role: "assistant", content: "second reply", seconds: 4 },
    ]);

    const result = rewindConversation(db, "user-1", "chat-1", "m3");

    assert.equal(result.content, "second question");
    const remaining = db
      .prepare(
        "SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all("chat-1") as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map(r => r.id),
      ["m1", "m2"]
    );
  });

  it("refuses to rewind on an assistant message", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
      { id: "m2", role: "assistant", content: "hello", seconds: 2 },
    ]);

    assert.throws(
      () => rewindConversation(db, "user-1", "chat-1", "m2"),
      /Only user messages can be rewound/
    );

    // And the thread is unchanged after the rejected call.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number })
        .n,
      2
    );
  });

  it("refuses to rewind a conversation owned by a different user", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
    ]);

    assert.throws(
      () => rewindConversation(db, "user-2", "chat-1", "m1"),
      /Conversation not found/
    );
  });

  it("refuses to rewind when the message id doesn't belong to the conversation", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
    ]);
    seedConversationAt(db, "user-1", "chat-2", [
      { id: "x1", role: "user", content: "other", seconds: 1 },
    ]);

    assert.throws(
      () => rewindConversation(db, "user-1", "chat-1", "x1"),
      /Message not found in conversation/
    );
  });

  it("purges thread-scoped memory_summaries at or after the cutoff while keeping older ones", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
      { id: "m3", role: "user", content: "second", seconds: 5 },
    ]);
    insertSummary(db, "user-1", "chat-1", "sum-old", "from turn 1", 2);
    insertSummary(db, "user-1", "chat-1", "sum-at-cutoff", "from turn 2", 5);
    insertSummary(db, "user-1", "chat-1", "sum-later", "from turn 3", 9);

    rewindConversation(db, "user-1", "chat-1", "m3");

    const remaining = db
      .prepare(
        "SELECT id FROM memory_summaries WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all("chat-1") as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map(r => r.id),
      ["sum-old"]
    );
  });

  it("preserves memories linked to truncated messages", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
      { id: "m3", role: "user", content: "second", seconds: 5 },
      { id: "m4", role: "assistant", content: "second reply", seconds: 6 },
    ]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-old", ["m1"]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-truncated", ["m3"]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-compiled", ["m1", "m3"]);

    const result = rewindConversation(db, "user-1", "chat-1", "m3");
    const remaining = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;

    assert.equal(result.deletedMessages, 2);
    assert.equal(result.deletedMemories, 0);
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["memory-compiled", "memory-old", "memory-truncated"]
    );
  });

  it("leaves summaries for other conversations untouched", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
    ]);
    seedConversationAt(db, "user-1", "chat-2", [
      { id: "x1", role: "user", content: "unrelated", seconds: 1 },
    ]);
    insertSummary(db, "user-1", "chat-2", "sum-other", "unrelated fact", 9);

    rewindConversation(db, "user-1", "chat-1", "m1");

    const stillThere = db
      .prepare("SELECT id FROM memory_summaries WHERE id = ?")
      .get("sum-other") as { id?: string } | undefined;
    assert.equal(stillThere?.id, "sum-other");
  });

  it("leaves other users' messages and summaries intact", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "mine", seconds: 1 },
    ]);
    seedConversationAt(db, "user-2", "chat-2", [
      { id: "o1", role: "user", content: "theirs", seconds: 1 },
    ]);
    insertSummary(db, "user-2", "chat-2", "sum-theirs", "their fact", 9);

    rewindConversation(db, "user-1", "chat-1", "m1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    const sum = db
      .prepare("SELECT id FROM memory_summaries WHERE id = ?")
      .get("sum-theirs") as { id?: string } | undefined;
    assert.equal(sum?.id, "sum-theirs");
  });

  it("updates the conversation's updated_at", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
      { id: "m2", role: "assistant", content: "hello", seconds: 2 },
      { id: "m3", role: "user", content: "again", seconds: 3 },
    ]);
    const before = db
      .prepare("SELECT updated_at FROM conversations WHERE id = ?")
      .get("chat-1") as { updated_at: string };

    rewindConversation(db, "user-1", "chat-1", "m3");

    const after = db
      .prepare("SELECT updated_at FROM conversations WHERE id = ?")
      .get("chat-1") as { updated_at: string };
    // Can't assert exact value (it's new Date().toISOString() inside the
    // function), but it must have advanced past the seed timestamp.
    assert.ok(
      after.updated_at > before.updated_at,
      `expected updated_at to advance (${before.updated_at} → ${after.updated_at})`
    );
  });
});
