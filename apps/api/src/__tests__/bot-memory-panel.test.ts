import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadBotMemoryPanelPayload } from "../bot-memory-panel.ts";
import { encryptJson } from "../security.ts";

const USER_KEY = Buffer.alloc(32, 7);

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bot_id TEXT
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
      category TEXT NOT NULL DEFAULT 'general',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE session_opinions (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      bot_id TEXT,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'warming',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_scope_key)
    );
    CREATE TABLE bot_opinions (
      user_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      bot_id TEXT,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'open',
      boundary_level TEXT NOT NULL DEFAULT 'none',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      repair_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, bot_scope_key)
    );
    CREATE TABLE memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)").run("bot-1", "user-1", "Aster");
  db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)").run("bot-2", "user-1", "Beryl");
  db.prepare("INSERT INTO bots (id, user_id, name) VALUES (?, ?, ?)").run("bot-other", "user-2", "Other");
  db.prepare("INSERT INTO conversations (id, user_id, bot_id) VALUES (?, ?, ?)").run("conv-1", "user-1", "bot-1");
  db.prepare("INSERT INTO conversations (id, user_id, bot_id) VALUES (?, ?, ?)").run("conv-2", "user-1", "bot-2");
  db.prepare("INSERT INTO conversations (id, user_id, bot_id) VALUES (?, ?, ?)").run("conv-other", "user-2", "bot-other");
  return db;
}

function insertMemory(
  db: DatabaseSync,
  args: {
    id: string;
    userId?: string;
    botId: string | null;
    text: string;
    source?: "direct" | "inferred" | "compiled" | "about_you";
    category?: "general" | "user" | "bot_relation";
    tier?: "short_term" | "long_term";
    confidence?: number;
    certainty?: number;
    durability?: number;
    createdAt?: string;
  }
): void {
  const encrypted = encryptJson({ text: args.text }, USER_KEY);
  db.prepare(
    `INSERT INTO memories (
       id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence,
       category, tier, durability, source, certainty, source_message_ids, created_at
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    args.id,
    args.userId ?? "user-1",
    args.botId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    args.confidence ?? 0.8,
    args.category ?? "general",
    args.tier ?? "short_term",
    args.durability ?? 0.5,
    args.source ?? "direct",
    args.certainty ?? args.confidence ?? 0.8,
    JSON.stringify(["m-1"]),
    args.createdAt ?? `2026-01-01T00:00:0${args.id.slice(-1)}.000Z`
  );
}

describe("loadBotMemoryPanelPayload", () => {
  it("separates bot memories from protected about-you memories and scopes rows to the bot", () => {
    const db = createTestDb();
    insertMemory(db, {
      id: "mem-1",
      botId: "bot-1",
      text: "You prefer practical answers.",
      category: "user",
      confidence: 0.9,
    });
    insertMemory(db, {
      id: "mem-2",
      botId: "bot-1",
      text: "Aster assumes you like quiet pacing.",
      source: "inferred",
      certainty: 0.54,
    });
    insertMemory(db, {
      id: "mem-3",
      botId: "bot-1",
      text: "You prefer to be called Jay.",
      source: "about_you",
      category: "user",
      tier: "long_term",
      confidence: 0.99,
      durability: 1,
    });
    insertMemory(db, { id: "mem-4", botId: "bot-2", text: "Beryl remembers a different thing." });
    insertMemory(db, { id: "mem-5", botId: null, text: "Prism global memory." });

    const panel = loadBotMemoryPanelPayload({
      db,
      userId: "user-1",
      userKey: USER_KEY,
      botId: "bot-1",
    });

    assert.deepEqual(
      panel.memories.map((memory) => memory.text).sort(),
      ["You assume you like quiet pacing.", "You prefer practical answers."].sort()
    );
    assert.deepEqual(panel.aboutYouMemories.map((memory) => memory.text), [
      "You prefer to be called Jay.",
    ]);
    assert.equal(panel.counts.total, 3);
    assert.equal(panel.counts.visible, 2);
    assert.equal(panel.counts.protectedAboutYou, 1);
    assert.equal(panel.counts.bySource.direct, 1);
    assert.equal(panel.counts.bySource.inferred, 1);
    assert.equal(panel.counts.bySource.about_you, 1);
    assert.equal(panel.counts.byTier.long_term, 1);
    assert.equal(panel.counts.byCategory.user, 2);
  });

  it("validates bot and conversation ownership", () => {
    const db = createTestDb();

    assert.throws(
      () =>
        loadBotMemoryPanelPayload({
          db,
          userId: "user-1",
          userKey: USER_KEY,
          botId: "bot-other",
        }),
      /Bot not found/
    );
    assert.throws(
      () =>
        loadBotMemoryPanelPayload({
          db,
          userId: "user-1",
          userKey: USER_KEY,
          botId: "bot-1",
          conversationId: "conv-other",
        }),
      /Conversation not found/
    );
  });

  it("returns durable bot opinion and only the matching conversation opinion", () => {
    const db = createTestDb();
    db.prepare(
      `INSERT INTO bot_opinions (
         user_id, bot_scope_key, bot_id, score, band, boundary_level, trend,
         last_reason, recent_reasons, repair_count, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "user-1",
      "bot-1",
      "bot-1",
      84,
      "bonded",
      "none",
      "up",
      "A warmer pattern held.",
      JSON.stringify(["A warmer pattern held."]),
      2,
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO session_opinions (
         user_id, conversation_id, bot_scope_key, bot_id, score, band, trend,
         last_reason, recent_reasons, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "user-1",
      "conv-1",
      "bot-1",
      "bot-1",
      72,
      "trusting",
      "steady",
      "This chat feels settled.",
      JSON.stringify(["This chat feels settled."]),
      "2026-01-01T00:00:00.000Z"
    );

    const withConversation = loadBotMemoryPanelPayload({
      db,
      userId: "user-1",
      userKey: USER_KEY,
      botId: "bot-1",
      conversationId: "conv-1",
    });
    const withoutConversation = loadBotMemoryPanelPayload({
      db,
      userId: "user-1",
      userKey: USER_KEY,
      botId: "bot-1",
    });
    const otherConversation = loadBotMemoryPanelPayload({
      db,
      userId: "user-1",
      userKey: USER_KEY,
      botId: "bot-1",
      conversationId: "conv-2",
    });

    assert.equal(withConversation.botOpinion?.band, "bonded");
    assert.equal(withConversation.botOpinion?.repairCount, 2);
    assert.equal(withConversation.sessionOpinion?.band, "trusting");
    assert.equal(withConversation.sessionOpinion?.lastReason, "This chat feels settled.");
    assert.equal(withoutConversation.sessionOpinion, null);
    assert.equal(otherConversation.sessionOpinion, null);
  });

  it("reads existing bot status notes without creating new summary records", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, NULL, ?, ?)"
    ).run(
      "summary-1",
      "user-1",
      JSON.stringify({
        v: 1,
        kind: "sandbox_bot_status",
        mode: "sandbox",
        botId: "bot-1",
        summary: "I'm holding onto Jay's practical direction.",
        displaySummary: "I'm holding onto Jay's practical direction.",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      "2026-01-01T00:00:00.000Z"
    );
    const before = (
      db.prepare("SELECT COUNT(*) AS n FROM memory_summaries").get() as { n: number }
    ).n;

    const panel = loadBotMemoryPanelPayload({
      db,
      userId: "user-1",
      userKey: USER_KEY,
      botId: "bot-1",
    });
    const after = (
      db.prepare("SELECT COUNT(*) AS n FROM memory_summaries").get() as { n: number }
    ).n;

    assert.equal(panel.botStatusSummary, "I'm holding onto Jay's practical direction.");
    assert.equal(after, before);
  });
});
