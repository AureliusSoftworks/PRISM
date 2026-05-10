import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  botBelongsToUser,
  conversationHasAssistantWithBotId,
  resolveConversationForSandboxImageGenerate,
  resolveImageGeneratePersistence,
  resolveSandboxImageBotAttribution,
  resolveStandaloneBotImageForGenerate,
} from "../image-generate-resolve.ts";

function makeConversationDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "c-sandbox",
    "u1",
    "S",
    "sandbox",
    null,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "c-chat",
    "u1",
    "C",
    "chat",
    null,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  return db;
}

describe("resolveConversationForSandboxImageGenerate", () => {
  it("accepts sandbox rows", () => {
    const db = makeConversationDb();
    const r = resolveConversationForSandboxImageGenerate(db, "u1", "c-sandbox");
    assert.equal(r.ok, true);
  });

  it("rejects chat-mode rows", () => {
    const db = makeConversationDb();
    const r = resolveConversationForSandboxImageGenerate(db, "u1", "c-chat");
    assert.equal(r.ok, false);
  });

  it("rejects missing conversations", () => {
    const db = makeConversationDb();
    const r = resolveConversationForSandboxImageGenerate(db, "u1", "nope");
    assert.equal(r.ok, false);
  });
});

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT ''
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
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt) VALUES (?, ?, ?, ?)"
  ).run("bot-a", "u1", "A", "");
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt) VALUES (?, ?, ?, ?)"
  ).run("bot-b", "u1", "B", "");
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("m1", "conv1", "u1", "assistant", "hi", "bot-b", "2026-01-01T00:00:00.000Z");
  return db;
}

describe("resolveSandboxImageBotAttribution", () => {
  it("uses the conversation lock when body botId is omitted", () => {
    const db = makeDb();
    const r = resolveSandboxImageBotAttribution({
      db,
      userId: "u1",
      conversationId: "conv1",
      conversationLockedBotId: "bot-a",
      bodyBotId: undefined,
    });
    assert.deepEqual(r, {
      ok: true,
      persistedBotId: "bot-a",
      personaBotId: "bot-a",
    });
  });

  it("accepts body botId when it matches the locked bot", () => {
    const db = makeDb();
    const r = resolveSandboxImageBotAttribution({
      db,
      userId: "u1",
      conversationId: "conv1",
      conversationLockedBotId: "bot-a",
      bodyBotId: "bot-a",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.persistedBotId, "bot-a");
    }
  });

  it("accepts body botId when an assistant message used that bot in the thread", () => {
    const db = makeDb();
    const r = resolveSandboxImageBotAttribution({
      db,
      userId: "u1",
      conversationId: "conv1",
      conversationLockedBotId: "bot-a",
      bodyBotId: "bot-b",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.persistedBotId, "bot-b");
    }
  });

  it("rejects body botId with no thread evidence", () => {
    const db = makeDb();
    const r = resolveSandboxImageBotAttribution({
      db,
      userId: "u1",
      conversationId: "conv1",
      conversationLockedBotId: null,
      bodyBotId: "bot-a",
    });
    assert.equal(r.ok, false);
  });

  it("rejects unknown bots", () => {
    const db = makeDb();
    const r = resolveSandboxImageBotAttribution({
      db,
      userId: "u1",
      conversationId: "conv1",
      conversationLockedBotId: "bot-a",
      bodyBotId: "nope",
    });
    assert.equal(r.ok, false);
  });
});

describe("resolveStandaloneBotImageForGenerate", () => {
  it("accepts a valid bot without a conversation (API 200 persistence contract)", () => {
    const db = makeDb();
    const r = resolveStandaloneBotImageForGenerate(db, "u1", "bot-a");
    assert.deepEqual(r, {
      ok: true,
      conversationIdForInsert: null,
      persistedBotId: "bot-a",
      personaBotId: "bot-a",
    });
  });

  it("requires botId when there is no conversation", () => {
    const db = makeDb();
    const r = resolveStandaloneBotImageForGenerate(db, "u1", undefined);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /Select a bot or open a Sandbox chat/);
    }
  });

  it("rejects unknown bots", () => {
    const db = makeDb();
    const r = resolveStandaloneBotImageForGenerate(db, "u1", "nope");
    assert.equal(r.ok, false);
  });
});

function makePersistenceIntegrationDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT ''
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
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "c-sb",
    "u1",
    "Sandbox",
    "sandbox",
    "bot-a",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "c-plain",
    "u1",
    "Chat",
    "chat",
    null,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt) VALUES (?, ?, ?, ?)"
  ).run("bot-a", "u1", "A", "");
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt) VALUES (?, ?, ?, ?)"
  ).run("bot-b", "u1", "B", "");
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "m1",
    "c-sb",
    "u1",
    "assistant",
    "hi",
    "bot-b",
    "2026-01-01T00:00:00.000Z"
  );
  return db;
}

describe("resolveImageGeneratePersistence (POST /api/images/generate)", () => {
  it("botId only: conversation_id null, bot_id set (matches 200 insert row)", () => {
    const db = makePersistenceIntegrationDb();
    const r = resolveImageGeneratePersistence({
      db,
      userId: "u1",
      conversationIdRaw: "",
      bodyBotId: "bot-b",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.conversationIdForInsert, null);
      assert.equal(r.persistedBotId, "bot-b");
      assert.equal(r.personaBotId, "bot-b");
    }
  });

  it("reject when neither conversation nor bot", () => {
    const db = makePersistenceIntegrationDb();
    const r = resolveImageGeneratePersistence({
      db,
      userId: "u1",
      conversationIdRaw: "",
      bodyBotId: undefined,
    });
    assert.equal(r.ok, false);
  });

  it("with Sandbox conversation uses thread attribution when body botId omitted", () => {
    const db = makePersistenceIntegrationDb();
    const r = resolveImageGeneratePersistence({
      db,
      userId: "u1",
      conversationIdRaw: "c-sb",
      bodyBotId: undefined,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.conversationIdForInsert, "c-sb");
      assert.equal(r.persistedBotId, "bot-a");
      assert.equal(r.personaBotId, "bot-a");
    }
  });

  it("rejects non-Sandbox conversation id", () => {
    const db = makePersistenceIntegrationDb();
    const r = resolveImageGeneratePersistence({
      db,
      userId: "u1",
      conversationIdRaw: "c-plain",
      bodyBotId: "bot-a",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /Sandbox/);
    }
  });
});

describe("helpers", () => {
  it("botBelongsToUser is scoped to the account", () => {
    const db = makeDb();
    assert.equal(botBelongsToUser(db, "u1", "bot-a"), true);
    assert.equal(botBelongsToUser(db, "other", "bot-a"), false);
  });

  it("conversationHasAssistantWithBotId detects assistant rows", () => {
    const db = makeDb();
    assert.equal(
      conversationHasAssistantWithBotId(db, "conv1", "bot-b"),
      true
    );
    assert.equal(
      conversationHasAssistantWithBotId(db, "conv1", "bot-a"),
      false
    );
  });
});
