import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  botPowerSourceHashV1,
  parseStoredBotPrompt,
  serializeStoredBotPrompt,
} from "@localai/shared";
import {
  createBotExportHash,
  composeBotSystemPrompt,
  deleteAllBots,
  deleteBot,
  deleteBots,
  deleteSelectedBots,
  normalizeBotExportHash,
  patchSelectedBots,
  resolveBotExportHashForCreate,
  setSelectedBotsDeleteProtection,
  type SelectedBotPatch,
} from "../bots.ts";

/**
 * The composeBotSystemPrompt suite pins the "bot identity reaches the model"
 * contract: a selected bot's NAME is always folded into the system prompt the
 * provider sees, not just the user-authored system_prompt. This guards the
 * case where someone creates a bot called "Tim" with an empty prompt and the
 * model (without this helper) would deny being Tim entirely.
 */
describe("composeBotSystemPrompt", () => {
  it("prepends an identity preamble when only a name is supplied", () => {
    const prompt = composeBotSystemPrompt("Tim", "");
    assert.ok(prompt, "expected a system prompt when a name is present");
    assert.match(prompt!, /You are Tim\./);
    assert.match(prompt!, /respond as Tim\./);
  });

  it("joins the preamble and user prompt with a blank line", () => {
    const prompt = composeBotSystemPrompt("Frank", "You speak like a sailor.");
    assert.ok(prompt);
    // Identity is first so the model has the persona priming before the
    // user's behavioural instructions take effect.
    assert.match(prompt!, /^You are Frank\./);
    assert.match(prompt!, /\n\nYou speak like a sailor\.$/);
  });

  it("trims whitespace on both fields before composing", () => {
    const prompt = composeBotSystemPrompt("  Tim  ", "   You help with code.   ");
    assert.ok(prompt);
    assert.match(prompt!, /^You are Tim\./);
    assert.match(prompt!, /You help with code\.$/);
    assert.doesNotMatch(prompt!, /  /); // no double spaces leaked through
  });

  it("falls back to the raw system prompt when no name is present", () => {
    assert.equal(
      composeBotSystemPrompt(undefined, "You are a haiku poet."),
      "You are a haiku poet."
    );
    assert.equal(
      composeBotSystemPrompt(null, "You are a haiku poet."),
      "You are a haiku poet."
    );
    assert.equal(
      composeBotSystemPrompt("", "You are a haiku poet."),
      "You are a haiku poet."
    );
  });

  it("returns undefined when both fields are missing/blank (Default bot case)", () => {
    assert.equal(composeBotSystemPrompt(undefined, undefined), undefined);
    assert.equal(composeBotSystemPrompt(null, null), undefined);
    assert.equal(composeBotSystemPrompt("", ""), undefined);
    assert.equal(composeBotSystemPrompt("   ", "   "), undefined);
  });

  it("strips structured bot-editor metadata before composing with name", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.purpose.statement = "a meticulous proofreader";
    profile.core.traits = "careful, specific, allergic to vague wording";
    const stored = serializeStoredBotPrompt(profile, "Rita");
    const prompt = composeBotSystemPrompt("Rita", stored);
    assert.ok(prompt);
    assert.doesNotMatch(prompt!, /PRISM_BOT_META/);
    assert.match(prompt!, /^You are Rita\./);
    assert.match(prompt!, /Purpose:\nYou are Rita, a meticulous proofreader\./);
    assert.match(prompt!, /Traits: careful, specific, allergic to vague wording/);
  });

  it("handles odd-character names without crashing or mangling", () => {
    const prompt = composeBotSystemPrompt("DJ K-Razor", "");
    assert.ok(prompt);
    assert.match(prompt!, /You are DJ K-Razor\./);
  });

  it("adds gentle rejection guidance when flirt mode is disabled", () => {
    const prompt = composeBotSystemPrompt("Tim", "Stay concise.", false);
    assert.ok(prompt);
    assert.match(prompt!, /decline gently in character/i);
    assert.match(prompt!, /avoid policy-style refusal wording/i);
  });

  it("adds reciprocal roleplay guidance when flirt mode is enabled", () => {
    const prompt = composeBotSystemPrompt("Tim", "Stay concise.", true);
    assert.ok(prompt);
    assert.match(prompt!, /engage in consensual flirt or romantic roleplay/i);
    assert.match(prompt!, /stays respectful and in character/i);
  });

  it("appends only ready enabled Powers to every composed bot persona", () => {
    const name = "Respirator";
    const intent = "Mechanical breathing punctuates physical beats.";
    const prompt = composeBotSystemPrompt("Vader", "Stay imposing.", false, [
      {
        version: 1,
        id: "respirator",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Breathe mechanically during physical beats.",
          observerCue: "Others hear the respirator.",
          effects: [],
          ruleLabels: [],
        },
      },
      {
        version: 1,
        id: "draft-power",
        name: "Draft Power",
        intent: "DRAFT_MARKER must never reach a provider.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
      {
        version: 1,
        id: "disabled-power",
        name: "Disabled Power",
        intent: "DISABLED_MARKER must never reach a provider.",
        enabled: false,
        compileStatus: "draft",
        compiled: null,
      },
    ]);

    assert.match(prompt ?? "", /Active Powers:/u);
    assert.match(prompt ?? "", /Respirator: Breathe mechanically/u);
    assert.match(prompt ?? "", /the user can always perceive and hear you/u);
    assert.doesNotMatch(prompt ?? "", /DRAFT_MARKER|DISABLED_MARKER/u);
  });
});

describe("bot export hash helpers", () => {
  it("creates 32-char hex hashes", () => {
    const hash = createBotExportHash();
    assert.match(hash, /^[a-f0-9]{32}$/i);
  });

  it("normalizes valid hashes and rejects invalid values", () => {
    assert.equal(
      normalizeBotExportHash("  AABBCCDDEEFF00112233445566778899  "),
      "aabbccddeeff00112233445566778899"
    );
    assert.equal(normalizeBotExportHash("short"), null);
    assert.equal(normalizeBotExportHash(42), null);
  });

  it("keeps a provided valid hash when not already present", () => {
    const resolved = resolveBotExportHashForCreate({
      incomingHash: "aabbccddeeff00112233445566778899",
      hasExistingHash: () => false,
    });
    assert.equal(resolved, "aabbccddeeff00112233445566778899");
  });

  it("rejects a duplicate imported hash", () => {
    assert.throws(
      () =>
        resolveBotExportHashForCreate({
          incomingHash: "aabbccddeeff00112233445566778899",
          hasExistingHash: () => true,
        }),
      /already in your library/i
    );
  });

  it("generates a fresh hash when legacy payload has no hash", () => {
    const resolved = resolveBotExportHashForCreate({
      hasExistingHash: () => false,
      createHash: () => "0123456789abcdef0123456789abcdef",
    });
    assert.equal(resolved, "0123456789abcdef0123456789abcdef");
  });
});

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
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      local_image_model TEXT,
      openai_image_model TEXT,
      color TEXT,
      glyph TEXT,
      delete_protected INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
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
    CREATE TABLE bot_relationships (
      user_id TEXT NOT NULL,
      source_bot_id TEXT NOT NULL,
      target_bot_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'neutral',
      mood_key TEXT NOT NULL DEFAULT 'neutral',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source_bot_id, target_bot_id)
    );
  `);
  return db;
}

function seedBot(
  db: DatabaseSync,
  userId: string,
  botId: string,
  updatedAt = new Date().toISOString(),
  deleteProtected = false
): void {
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt, delete_protected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    botId,
    userId,
    `Bot ${botId}`,
    "You are a test bot.",
    deleteProtected ? 1 : 0,
    updatedAt,
    updatedAt
  );
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

function seedMemory(
  db: DatabaseSync,
  userId: string,
  botId: string | null,
  memoryId: string
): void {
  db.prepare(
    "INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    memoryId,
    userId,
    null,
    botId,
    "ciphertext",
    "iv",
    "tag",
    0.8,
    new Date().toISOString()
  );
}

function seedRelationship(
  db: DatabaseSync,
  userId: string,
  sourceBotId: string,
  targetBotId: string
): void {
  db.prepare(
    "INSERT INTO bot_relationships (user_id, source_bot_id, target_bot_id, updated_at) VALUES (?, ?, ?, ?)"
  ).run(userId, sourceBotId, targetBotId, new Date().toISOString());
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

  it("deletes memories scoped to the deleted bot", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-1", "bot-2");
    seedMemory(db, "user-1", "bot-1", "memory-deleted");
    seedMemory(db, "user-1", "bot-2", "memory-other-bot");
    seedMemory(db, "user-1", null, "memory-global");
    seedMemory(db, "user-2", "bot-1", "memory-other-user");

    deleteBot(db, "user-1", "bot-1");

    const rows = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      rows.map((row) => row.id),
      ["memory-global", "memory-other-bot", "memory-other-user"]
    );
  });

  it("deletes directed relationship rows involving the deleted bot", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-1", "bot-2");
    seedBot(db, "user-1", "bot-3");
    seedRelationship(db, "user-1", "bot-1", "bot-2");
    seedRelationship(db, "user-1", "bot-2", "bot-1");
    seedRelationship(db, "user-1", "bot-2", "bot-3");

    deleteBot(db, "user-1", "bot-1");

    const rows = db
      .prepare("SELECT source_bot_id, target_bot_id FROM bot_relationships")
      .all() as Array<{ source_bot_id: string; target_bot_id: string }>;
    assert.deepEqual(
      rows.map((row) => ({
        source_bot_id: row.source_bot_id,
        target_bot_id: row.target_bot_id,
      })),
      [{ source_bot_id: "bot-2", target_bot_id: "bot-3" }]
    );
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

  it("blocks deletion when the bot is protected", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1", new Date().toISOString(), true);
    seedHistoryReferencingBot(db, "user-1", "bot-1", "1");
    seedMemory(db, "user-1", "bot-1", "memory-protected");

    assert.throws(
      () => deleteBot(db, "user-1", "bot-1"),
      /This bot is protected/
    );

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM bots WHERE id = ?")
        .get("bot-1") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get("msg-1") as { bot_id: string | null }).bot_id,
      "bot-1"
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM memories WHERE id = ?")
        .get("memory-protected") as { bot_id: string | null }).bot_id,
      "bot-1"
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

describe("deleteBots", () => {
  it("removes the newest limited set and leaves older bots intact", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "old", "2026-01-01T00:00:00.000Z");
    seedBot(db, "user-1", "middle", "2026-01-02T00:00:00.000Z");
    seedBot(db, "user-1", "new", "2026-01-03T00:00:00.000Z");
    seedHistoryReferencingBot(db, "user-1", "new", "new");
    seedHistoryReferencingBot(db, "user-1", "middle", "middle");
    seedMemory(db, "user-1", "old", "memory-old");
    seedMemory(db, "user-1", "middle", "memory-middle");
    seedMemory(db, "user-1", "new", "memory-new");
    seedMemory(db, "user-1", null, "memory-global");

    const deleted = deleteBots(db, "user-1", 2);

    assert.equal(deleted, 2);
    const survivors = db
      .prepare("SELECT id FROM bots ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      survivors.map((bot) => bot.id),
      ["old"]
    );

    for (const suffix of ["new", "middle"]) {
      const msg = db
        .prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get(`msg-${suffix}`) as { bot_id: string | null } | undefined;
      assert.equal(msg?.bot_id, null);
    }
    const memories = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      memories.map((memory) => memory.id),
      ["memory-global", "memory-old"]
    );
  });

  it("stays scoped to the acting user", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "mine-1", "2026-01-01T00:00:00.000Z");
    seedBot(db, "user-1", "mine-2", "2026-01-02T00:00:00.000Z");
    seedBot(db, "user-2", "theirs", "2026-01-03T00:00:00.000Z");
    seedHistoryReferencingBot(db, "user-2", "theirs", "theirs");
    seedMemory(db, "user-2", "theirs", "memory-theirs");

    const deleted = deleteBots(db, "user-1", 10);

    assert.equal(deleted, 2);
    const survivor = db
      .prepare("SELECT id FROM bots WHERE user_id = ?")
      .get("user-2") as { id: string } | undefined;
    assert.equal(survivor?.id, "theirs");
    const msg = db
      .prepare("SELECT bot_id FROM messages WHERE id = ?")
      .get("msg-theirs") as { bot_id: string | null } | undefined;
    assert.equal(msg?.bot_id, "theirs");
    const memory = db
      .prepare("SELECT bot_id FROM memories WHERE id = ?")
      .get("memory-theirs") as { bot_id: string | null } | undefined;
    assert.equal(memory?.bot_id, "theirs");
  });

  it("skips protected bots when deleting a limited newest set", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "old", "2026-01-01T00:00:00.000Z");
    seedBot(db, "user-1", "protected-new", "2026-01-03T00:00:00.000Z", true);
    seedBot(db, "user-1", "unprotected-new", "2026-01-02T00:00:00.000Z");
    seedHistoryReferencingBot(db, "user-1", "protected-new", "protected");
    seedHistoryReferencingBot(db, "user-1", "unprotected-new", "unprotected");
    seedMemory(db, "user-1", "protected-new", "memory-protected");
    seedMemory(db, "user-1", "unprotected-new", "memory-unprotected");

    const deleted = deleteBots(db, "user-1", 10);

    assert.equal(deleted, 2);
    const survivors = db
      .prepare("SELECT id FROM bots ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      survivors.map((bot) => bot.id),
      ["protected-new"]
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get("msg-protected") as { bot_id: string | null }).bot_id,
      "protected-new"
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM memories WHERE id = ?")
        .get("memory-protected") as { bot_id: string | null }).bot_id,
      "protected-new"
    );
  });
});

/**
 * The deleteAllBots suite pins the bulk-clear behaviour used by the Bots panel
 * press-and-hold "delete all" affordance. The contract mirrors deleteBot
 * applied in aggregate: history survives with bot_id nulled out, and the
 * operation stays strictly scoped to the acting user.
 */
describe("deleteAllBots", () => {
  it("returns 0 and no-ops when the user has no bots", () => {
    const db = createTestDb();
    const deleted = deleteAllBots(db, "user-1");
    assert.equal(deleted, 0);
  });

  it("removes every bot for the caller and reports the count", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-1", "bot-2");
    seedBot(db, "user-1", "bot-3");

    const deleted = deleteAllBots(db, "user-1");

    assert.equal(deleted, 3);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM bots WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
  });

  it("deletes bot-scoped memories while preserving global memories", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-1", "bot-2");
    seedMemory(db, "user-1", "bot-1", "memory-bot-1");
    seedMemory(db, "user-1", "bot-2", "memory-bot-2");
    seedMemory(db, "user-1", null, "memory-global");
    seedMemory(db, "user-2", "bot-2", "memory-other-user");

    deleteAllBots(db, "user-1");

    const rows = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      rows.map((row) => row.id),
      ["memory-global", "memory-other-user"]
    );
  });

  it("nulls bot_id on the caller's history rows instead of deleting them", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-1", "bot-2");
    seedHistoryReferencingBot(db, "user-1", "bot-1", "a");
    seedHistoryReferencingBot(db, "user-1", "bot-2", "b");

    deleteAllBots(db, "user-1");

    for (const suffix of ["a", "b"]) {
      const msg = db
        .prepare("SELECT id, bot_id FROM messages WHERE id = ?")
        .get(`msg-${suffix}`) as { id: string; bot_id: string | null } | undefined;
      assert.ok(msg, `message ${suffix} should still exist`);
      assert.equal(msg?.bot_id, null);

      const conv = db
        .prepare("SELECT id, bot_id FROM conversations WHERE id = ?")
        .get(`conv-${suffix}`) as { id: string; bot_id: string | null } | undefined;
      assert.ok(conv, `conversation ${suffix} should still exist`);
      assert.equal(conv?.bot_id, null);
    }
  });

  it("strictly scopes to the acting user — other users' bots and history are untouched", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "bot-1");
    seedBot(db, "user-2", "bot-2");
    seedBot(db, "user-2", "bot-3");
    seedHistoryReferencingBot(db, "user-2", "bot-2", "2");
    seedMemory(db, "user-2", "bot-2", "memory-user-2");

    const deleted = deleteAllBots(db, "user-1");

    assert.equal(deleted, 1);

    const survivors = db
      .prepare("SELECT id FROM bots ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      survivors.map((b) => b.id),
      ["bot-2", "bot-3"]
    );

    // user-2's history should keep its bot_id intact.
    const msg = db
      .prepare("SELECT bot_id FROM messages WHERE id = ?")
      .get("msg-2") as { bot_id: string | null } | undefined;
    assert.equal(msg?.bot_id, "bot-2");
    const conv = db
      .prepare("SELECT bot_id FROM conversations WHERE id = ?")
      .get("conv-2") as { bot_id: string | null } | undefined;
    assert.equal(conv?.bot_id, "bot-2");
    const memory = db
      .prepare("SELECT bot_id FROM memories WHERE id = ?")
      .get("memory-user-2") as { bot_id: string | null } | undefined;
    assert.equal(memory?.bot_id, "bot-2");
  });

  it("keeps protected bots during delete-all and reports only deleted bots", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "protected", "2026-01-03T00:00:00.000Z", true);
    seedBot(db, "user-1", "unprotected-1");
    seedBot(db, "user-1", "unprotected-2");
    seedHistoryReferencingBot(db, "user-1", "protected", "protected");
    seedHistoryReferencingBot(db, "user-1", "unprotected-1", "unprotected-1");
    seedMemory(db, "user-1", "protected", "memory-protected");
    seedMemory(db, "user-1", "unprotected-1", "memory-unprotected");

    const deleted = deleteAllBots(db, "user-1");

    assert.equal(deleted, 2);
    const survivors = db
      .prepare("SELECT id FROM bots ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      survivors.map((bot) => bot.id),
      ["protected"]
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get("msg-protected") as { bot_id: string | null }).bot_id,
      "protected"
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get("msg-unprotected-1") as { bot_id: string | null }).bot_id,
      null
    );
    assert.deepEqual(
      (db.prepare("SELECT id FROM memories ORDER BY id").all() as Array<{ id: string }>)
        .map((memory) => memory.id),
      ["memory-protected"]
    );
  });

  it("deletes protected bots when explicitly requested", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "protected", "2026-01-03T00:00:00.000Z", true);
    seedBot(db, "user-1", "unprotected");
    seedBot(db, "user-2", "theirs", "2026-01-04T00:00:00.000Z", true);
    seedHistoryReferencingBot(db, "user-1", "protected", "protected");
    seedHistoryReferencingBot(db, "user-1", "unprotected", "unprotected");
    seedHistoryReferencingBot(db, "user-2", "theirs", "theirs");
    seedMemory(db, "user-1", "protected", "memory-protected");
    seedMemory(db, "user-1", "unprotected", "memory-unprotected");
    seedMemory(db, "user-2", "theirs", "memory-theirs");

    const deleted = deleteAllBots(db, "user-1", { includeProtected: true });

    assert.equal(deleted, 2);
    assert.deepEqual(
      (db.prepare("SELECT id FROM bots ORDER BY id").all() as Array<{ id: string }>).map(
        (bot) => bot.id
      ),
      ["theirs"]
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get("msg-protected") as { bot_id: string | null }).bot_id,
      null
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?")
        .get("msg-theirs") as { bot_id: string | null }).bot_id,
      "theirs"
    );
    assert.deepEqual(
      (db.prepare("SELECT id FROM memories ORDER BY id").all() as Array<{ id: string }>).map(
        (memory) => memory.id
      ),
      ["memory-theirs"]
    );
  });
});

describe("deleteSelectedBots", () => {
  it("deletes only selected unprotected bots and reports protected skips", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "protected", "2026-01-03T00:00:00.000Z", true);
    seedBot(db, "user-1", "delete-a");
    seedBot(db, "user-1", "delete-b");
    seedHistoryReferencingBot(db, "user-1", "delete-a", "delete-a");
    seedHistoryReferencingBot(db, "user-1", "protected", "protected");
    seedMemory(db, "user-1", "delete-a", "memory-delete-a");
    seedMemory(db, "user-1", "protected", "memory-protected");

    const result = deleteSelectedBots(db, "user-1", [
      "delete-a",
      "delete-b",
      "protected",
    ]);

    assert.deepEqual(result, { deleted: 2, protectedSkipped: 1 });
    assert.deepEqual(
      (db.prepare("SELECT id FROM bots ORDER BY id").all() as Array<{ id: string }>).map(
        (row) => row.id
      ),
      ["protected"]
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?").get("msg-delete-a") as {
        bot_id: string | null;
      }).bot_id,
      null
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM messages WHERE id = ?").get("msg-protected") as {
        bot_id: string | null;
      }).bot_id,
      "protected"
    );
    assert.deepEqual(
      (db.prepare("SELECT id FROM memories ORDER BY id").all() as Array<{ id: string }>).map(
        (row) => row.id
      ),
      ["memory-protected"]
    );
  });
});

describe("setSelectedBotsDeleteProtection", () => {
  it("protects selected owned bots and ignores other users", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "a");
    seedBot(db, "user-1", "b");
    seedBot(db, "user-2", "theirs");

    const result = setSelectedBotsDeleteProtection(
      db,
      "user-1",
      ["a", "b", "theirs"],
      true
    );

    assert.deepEqual(result, { updated: 2 });
    assert.deepEqual(
      (db.prepare("SELECT id, delete_protected FROM bots ORDER BY id").all() as Array<{
        id: string;
        delete_protected: number;
      }>).map((row) => [row.id, row.delete_protected]),
      [
        ["a", 1],
        ["b", 1],
        ["theirs", 0],
      ]
    );
  });

  it("allows deletion for selected protected bots", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "protected-a", "2026-01-01T00:00:00.000Z", true);
    seedBot(db, "user-1", "protected-b", "2026-01-02T00:00:00.000Z", true);
    seedBot(db, "user-1", "still-protected", "2026-01-03T00:00:00.000Z", true);

    const result = setSelectedBotsDeleteProtection(
      db,
      "user-1",
      ["protected-a", "protected-b"],
      false
    );

    assert.deepEqual(result, { updated: 2 });
    assert.deepEqual(
      (db.prepare("SELECT id, delete_protected FROM bots ORDER BY id").all() as Array<{
        id: string;
        delete_protected: number;
      }>).map((row) => [row.id, row.delete_protected]),
      [
        ["protected-a", 0],
        ["protected-b", 0],
        ["still-protected", 1],
      ]
    );
  });
});

describe("patchSelectedBots", () => {
  it("updates only selected owned bots and dedupes ids", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "a");
    seedBot(db, "user-1", "b");
    seedBot(db, "user-2", "theirs");

    const result = patchSelectedBots(
      db,
      "user-1",
      ["a", "b", "a", "theirs", "missing"],
      { color: "#112233" }
    );

    assert.equal(result.updated, 2);
    assert.deepEqual(new Set(result.ids), new Set(["a", "b"]));
    assert.deepEqual(
      (db.prepare("SELECT id, user_id, color FROM bots ORDER BY id").all() as Array<{
        id: string;
        user_id: string;
        color: string | null;
      }>).map((row) => [row.id, row.user_id, row.color]),
      [
        ["a", "user-1", "#112233"],
        ["b", "user-1", "#112233"],
        ["theirs", "user-2", null],
      ]
    );
  });

  it("updates every batch-edit identity field", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "a");
    seedBot(db, "user-1", "b");

    const result = patchSelectedBots(db, "user-1", ["a", "b"], {
      color: "#abcdef",
      glyph: "triangle",
    });

    assert.equal(result.updated, 2);
    const rows = db
      .prepare(
        `SELECT color, glyph
         FROM bots
         WHERE user_id = ?
         ORDER BY id`
      )
      .all("user-1") as Array<{
        color: string | null;
        glyph: string | null;
      }>;
    assert.deepEqual(
      rows.map((row) => [
        row.color,
        row.glyph,
      ]),
      [
        ["#abcdef", "triangle"],
        ["#abcdef", "triangle"],
      ]
    );
  });

  it("ignores legacy per-bot model fields", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "a");
    db.prepare(
      `UPDATE bots
       SET local_model = 'old-local',
           online_model = 'old-online',
           local_image_model = 'old-local-image',
           openai_image_model = 'old-openai-image'
       WHERE id = ?`
    ).run("a");

    const result = patchSelectedBots(
      db,
      "user-1",
      ["a"],
      {
        localModel: "new-local",
        onlineModel: "new-online",
        localImageModel: "new-local-image",
        openaiImageModel: "new-openai-image",
      } as unknown as SelectedBotPatch
    );

    assert.deepEqual(result, { updated: 0, ids: [] });
    const row = db
      .prepare(
        "SELECT local_model, online_model, local_image_model, openai_image_model FROM bots WHERE id = ?"
      )
      .get("a") as {
        local_model: string | null;
        online_model: string | null;
        local_image_model: string | null;
        openai_image_model: string | null;
      };
    assert.deepEqual(
      [row.local_model, row.online_model, row.local_image_model, row.openai_image_model],
      ["old-local", "old-online", "old-local-image", "old-openai-image"]
    );
  });

  it("no-ops cleanly for empty ids or an empty patch", () => {
    const db = createTestDb();
    seedBot(db, "user-1", "a");

    assert.deepEqual(patchSelectedBots(db, "user-1", [], { color: "#123456" }), {
      updated: 0,
      ids: [],
    });
    assert.deepEqual(patchSelectedBots(db, "user-1", ["a"], {}), {
      updated: 0,
      ids: [],
    });
    assert.equal(
      (db.prepare("SELECT color FROM bots WHERE id = ?").get("a") as {
        color: string | null;
      }).color,
      null
    );
  });
});
