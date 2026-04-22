import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { deleteBot } from "../bots.ts";

/** In-memory DB with just the tables deleteBot touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bot_id TEXT,
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
  `);
  return db;
}

function seedBot(db: DatabaseSync, userId: string, botId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(botId, userId, `Bot ${botId}`, "You are a test bot.", now, now);
}

function seedHistoryReferencingBot(
  db: DatabaseSync,
  userId: string,
  botId: string,
  suffix: string
): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(`conv-${suffix}`, userId, "Test chat", botId, now, now);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(`msg-${suffix}`, `conv-${suffix}`, userId, "assistant", "hi", botId, now);
}

describe("deleteBot", () => {
  it("removes the bot row", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");

    deleteBot(db, "user-1", "bot-1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM bots").get() as { n: number }).n,
      0
    );
  });

  it("nulls out bot_id on past messages and conversations instead of deleting them", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedHistoryReferencingBot(db, "user-1", "bot-1", "1");

    deleteBot(db, "user-1", "bot-1");

    const msg = db
      .prepare("SELECT id, bot_id FROM messages WHERE id = ?")
      .get("msg-1") as { id: string; bot_id: string | null } | undefined;
    assert.ok(msg, "message should still exist");
    assert.equal(msg?.bot_id, null);

    const conv = db
      .prepare("SELECT id, bot_id FROM conversations WHERE id = ?")
      .get("conv-1") as { id: string; bot_id: string | null } | undefined;
    assert.ok(conv, "conversation should still exist");
    assert.equal(conv?.bot_id, null);
  });

  it("rejects deletion attempts by a different user", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");

    assert.throws(
      () => deleteBot(db, "user-2", "bot-1"),
      /Bot not found/
    );

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM bots").get() as { n: number }).n,
      1
    );
  });

  it("throws when the bot does not exist", () => {
    const db = createTestDb();
    assert.throws(
      () => deleteBot(db, "user-1", "does-not-exist"),
      /Bot not found/
    );
  });

  it("leaves other users' bots and cross-bot history untouched", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-1", "bot-2");
    seedBot(db, "user-2", "bot-3");
    seedHistoryReferencingBot(db, "user-1", "bot-2", "2");

    deleteBot(db, "user-1", "bot-1");

    const survivors = db
      .prepare("SELECT id FROM bots ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      survivors.map((b) => b.id),
      ["bot-2", "bot-3"]
    );

    // The bot-2-tagged message should still point at bot-2.
    const msg = db
      .prepare("SELECT bot_id FROM messages WHERE id = ?")
      .get("msg-2") as { bot_id: string | null } | undefined;
    assert.equal(msg?.bot_id, "bot-2");
  });
});
