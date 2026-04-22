import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { deleteConversation } from "../conversations.ts";

/** Stand up an in-memory DB with just the tables deleteConversation touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
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

  it("preserves images and memory summaries, untying them from the deleted chat", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");

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
