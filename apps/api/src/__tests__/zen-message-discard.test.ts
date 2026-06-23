import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { discardLatestZenAssistantMessage } from "../zen-message-discard.ts";

function createDiscardTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_mode TEXT NOT NULL,
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
  `);
  return db;
}

function seedConversation(
  db: DatabaseSync,
  {
    id = "conv-1",
    userId = "user-1",
    mode = "zen",
  }: {
    id?: string;
    userId?: string;
    mode?: string;
  } = {}
): void {
  db.prepare(
    "INSERT INTO conversations (id, user_id, conversation_mode, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, userId, mode, "2026-01-01T00:00:00.000Z");
}

function seedMessage(
  db: DatabaseSync,
  {
    id,
    conversationId = "conv-1",
    userId = "user-1",
    role = "assistant",
    createdAt,
  }: {
    id: string;
    conversationId?: string;
    userId?: string;
    role?: string;
    createdAt: string;
  }
): void {
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, conversationId, userId, role, `${role} text`, createdAt);
}

describe("discardLatestZenAssistantMessage", () => {
  it("deletes the latest Zen assistant message and clears conversation summaries", () => {
    const db = createDiscardTestDb();
    seedConversation(db);
    seedMessage(db, {
      id: "user-later",
      role: "user",
      createdAt: "2026-01-01T00:00:02.000Z",
    });
    seedMessage(db, {
      id: "assistant-latest",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("summary-1", "user-1", "conv-1", "old summary", "2026-01-01T00:00:03.000Z");

    const result = discardLatestZenAssistantMessage(
      db,
      "user-1",
      "assistant-latest",
      "2026-01-01T00:00:04.000Z"
    );

    assert.deepEqual(result, { conversationId: "conv-1", conversationMode: "zen" });
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE id = ?").get("assistant-latest") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE id = ?").get("user-later") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM memory_summaries WHERE conversation_id = ?").get("conv-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT updated_at FROM conversations WHERE id = ?").get("conv-1") as { updated_at: string }).updated_at,
      "2026-01-01T00:00:04.000Z"
    );
  });

  it("rejects a non-latest assistant message", () => {
    const db = createDiscardTestDb();
    seedConversation(db);
    seedMessage(db, { id: "assistant-old", createdAt: "2026-01-01T00:00:01.000Z" });
    seedMessage(db, { id: "assistant-new", createdAt: "2026-01-01T00:00:02.000Z" });

    assert.throws(
      () => discardLatestZenAssistantMessage(db, "user-1", "assistant-old"),
      /Only the latest Zen assistant message/
    );
  });

  it("rejects non-assistant and non-Zen messages", () => {
    const db = createDiscardTestDb();
    seedConversation(db);
    seedMessage(db, {
      id: "user-message",
      role: "user",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    seedConversation(db, { id: "sandbox-conv", mode: "sandbox" });
    seedMessage(db, {
      id: "sandbox-assistant",
      conversationId: "sandbox-conv",
      createdAt: "2026-01-01T00:00:01.000Z",
    });

    assert.throws(
      () => discardLatestZenAssistantMessage(db, "user-1", "user-message"),
      /Only assistant messages/
    );
    assert.throws(
      () => discardLatestZenAssistantMessage(db, "user-1", "sandbox-assistant"),
      /Only Zen assistant messages/
    );
  });

  it("rejects cross-user messages", () => {
    const db = createDiscardTestDb();
    seedConversation(db, { userId: "user-2" });
    seedMessage(db, {
      id: "other-user-assistant",
      userId: "user-2",
      createdAt: "2026-01-01T00:00:01.000Z",
    });

    assert.throws(
      () => discardLatestZenAssistantMessage(db, "user-1", "other-user-assistant"),
      /Message not found/
    );
  });
});
