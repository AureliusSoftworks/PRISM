import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider } from "../providers.ts";
import {
  createDevSeedMemories,
  deleteOrphanedBotMemories,
  extractMemoryCandidates,
  filterConflictingMemories,
  persistMemoryCandidates,
  retrieveRelevantMemories,
  updateDirectMemoryText,
} from "../memory.ts";

function createMemoryTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
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
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL
    );
  `);
  return db;
}

function stubProvider(): LlmProvider {
  return {
    name: "local",
    async generateResponse(): Promise<string> {
      return "";
    },
    async embedText(): Promise<number[]> {
      return [1, 0, 0];
    },
  };
}

function throwingEmbedProvider(): LlmProvider {
  return {
    name: "local",
    async generateResponse(): Promise<string> {
      return "";
    },
    async embedText(): Promise<number[]> {
      throw new Error("embedding model unavailable");
    },
  };
}

function seedMemoryRow(
  db: DatabaseSync,
  userId: string,
  botId: string | null,
  id: string
): void {
  db.prepare(
    "INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, botId, "ciphertext", "iv", "tag", 0.8, new Date().toISOString());
}

describe("extractMemoryCandidates", () => {
  it("pulls personal preference statements", () => {
    const candidates = extractMemoryCandidates(
      "I prefer concise answers. My favorite language is TypeScript."
    );
    assert.ok(candidates.length > 0);
  });

  it("treats explicit don't-forget instructions as high-confidence memories", () => {
    const candidates = extractMemoryCandidates(
      "Ok, but please don't forget! Please do not talk to me with quotes."
    );

    assert.deepEqual(
      candidates.map((candidate) => candidate.confidence),
      [0.98]
    );
    assert.match(candidates[0]?.text ?? "", /do not talk/i);
  });

  it("ignores cue-only fragments after a substantive remember instruction", () => {
    const candidates = extractMemoryCandidates(
      "Please remember to talk like a Pirate. Do not forget."
    );

    assert.deepEqual(candidates, [
      { text: "To talk like a Pirate.", confidence: 0.98 },
    ]);
  });

  it("rewrites first-person input into concise second-person memory text", () => {
    const candidates = extractMemoryCandidates(
      "Don't forget that I like cheese."
    );

    assert.equal(candidates[0]?.text, "You like cheese.");
    assert.equal(candidates[0]?.confidence, 0.98);
  });

  it("rewrites my/me references to your/you in stored memory text", () => {
    const candidates = extractMemoryCandidates(
      "My favorite drink is coffee."
    );

    assert.match(candidates[0]?.text ?? "", /^Your favorite drink is coffee\.$/);
  });
});

describe("persistMemoryCandidates", () => {
  it("associates saved memories with the source conversation", async () => {
    const db = createMemoryTestDb();

    await persistMemoryCandidates(
      db,
      stubProvider(),
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "The user likes concise answers.", confidence: 0.8 }],
      Buffer.alloc(32, 7)
    );

    const row = db
      .prepare("SELECT user_id, conversation_id, bot_id, confidence FROM memories")
      .get() as
      | {
          user_id: string;
          conversation_id: string | null;
          bot_id: string | null;
          confidence: number;
        }
      | undefined;

    assert.equal(row?.user_id, "user-1");
    assert.equal(row?.conversation_id, "conversation-1");
    assert.equal(row?.bot_id, "bot-1");
    assert.equal(row?.confidence, 0.8);
  });

  it("still stores memories when embedding generation is unavailable", async () => {
    const db = createMemoryTestDb();

    await persistMemoryCandidates(
      db,
      throwingEmbedProvider(),
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "Please don't forget that I dislike quoted replies.", confidence: 0.98 }],
      Buffer.alloc(32, 7)
    );

    const row = db
      .prepare("SELECT bot_id, confidence FROM memories")
      .get() as { bot_id: string | null; confidence: number } | undefined;

    assert.equal(row?.bot_id, "bot-1");
    assert.equal(row?.confidence, 0.98);
  });

  it("retrieves global memories plus the active bot and excludes other bots", async () => {
    const db = createMemoryTestDb();
    const provider = stubProvider();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-global",
      null,
      [{ text: "The user prefers short answers.", confidence: 0.7 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-bot-1",
      "bot-1",
      [{ text: "Bot One remembers the user likes surreal prompts.", confidence: 0.9 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-bot-2",
      "bot-2",
      [{ text: "Bot Two remembers a private joke.", confidence: 0.95 }],
      userKey
    );

    const memories = await retrieveRelevantMemories(
      db,
      provider,
      "user-1",
      "What should you remember?",
      userKey,
      "bot-1",
      10
    );
    const texts = new Set(memories.map((memory) => memory.text));

    assert.equal(texts.has("The user prefers short answers."), true);
    assert.equal(texts.has("Bot One remembers the user likes surreal prompts."), true);
    assert.equal(texts.has("Bot Two remembers a private joke."), false);
    assert.equal(
      memories.some((memory) => memory.botId === "bot-1"),
      true
    );
  });

  it("creates a compiled memory and deletes aligned specifics at strict threshold", async () => {
    const db = createMemoryTestDb();
    const provider = stubProvider();
    const userKey = Buffer.alloc(32, 7);

    const stored = await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "The user likes calm motion.", confidence: 0.9 },
        { text: "The user enjoys gentle interface details.", confidence: 0.91 },
        { text: "The user prefers soft animation pacing.", confidence: 0.92 },
      ],
      userKey
    );

    const rows = db
      .prepare("SELECT source, COUNT(*) AS count FROM memories GROUP BY source")
      .all() as Array<{ source: string; count: number }>;
    const counts = new Map(rows.map((row) => [row.source, row.count]));
    const memories = await retrieveRelevantMemories(
      db,
      provider,
      "user-1",
      "animation preferences",
      userKey,
      "bot-1",
      5
    );

    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.source, "compiled");
    assert.equal(counts.get("direct") ?? 0, 0);
    assert.equal(counts.get("compiled"), 1);
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.source, "compiled");
    assert.match(memories[0]?.text ?? "", /consistently like or value/i);
  });

  it("culminates first-person preference statements like real chat input", async () => {
    const db = createMemoryTestDb();
    const provider = stubProvider();
    const userKey = Buffer.alloc(32, 7);

    const stored = await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "Don't forget that I like calm gentle motion in interfaces.", confidence: 0.98 },
        { text: "Don't forget that I enjoy soft animation pacing.", confidence: 0.98 },
        { text: "Don't forget that I prefer subtle interface transitions.", confidence: 0.98 },
      ],
      userKey
    );

    const rows = db
      .prepare("SELECT source, COUNT(*) AS count FROM memories GROUP BY source")
      .all() as Array<{ source: string; count: number }>;
    const counts = new Map(rows.map((row) => [row.source, row.count]));

    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.source, "compiled");
    assert.equal(counts.get("direct") ?? 0, 0);
    assert.equal(counts.get("compiled"), 1);
  });

  it("keeps specifics when certainty is below the deletion threshold", async () => {
    const db = createMemoryTestDb();
    const provider = stubProvider();
    const userKey = Buffer.alloc(32, 7);

    const stored = await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "The user likes compact controls.", confidence: 0.74 },
        { text: "The user enjoys clear labels.", confidence: 0.75 },
        { text: "The user prefers minimal menus.", confidence: 0.76 },
      ],
      userKey
    );

    const rows = db
      .prepare("SELECT source, COUNT(*) AS count FROM memories GROUP BY source")
      .all() as Array<{ source: string; count: number }>;
    const counts = new Map(rows.map((row) => [row.source, row.count]));

    assert.equal(stored.length, 3);
    assert.equal(counts.get("direct"), 3);
    assert.equal(counts.get("compiled") ?? 0, 0);
  });

  it("does not culminate memories across different bot scopes", async () => {
    const db = createMemoryTestDb();
    const provider = stubProvider();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "The user likes surreal prompts.", confidence: 0.9 },
        { text: "The user enjoys calm color palettes.", confidence: 0.91 },
      ],
      userKey
    );
    await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-2",
      "bot-2",
      [{ text: "The user prefers gentle motion.", confidence: 0.92 }],
      userKey
    );

    const rows = db
      .prepare("SELECT bot_id, source, COUNT(*) AS count FROM memories GROUP BY bot_id, source ORDER BY bot_id")
      .all() as Array<{ bot_id: string | null; source: string; count: number }>;

    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { bot_id: "bot-1", source: "direct", count: 2 },
      { bot_id: "bot-2", source: "direct", count: 1 },
    ]);
  });
});

describe("updateDirectMemoryText", () => {
  it("updates direct memory text", async () => {
    const db = createMemoryTestDb();
    const provider = stubProvider();
    const userKey = Buffer.alloc(32, 7);
    const [memory] = await persistMemoryCandidates(
      db,
      provider,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "The user likes abrupt controls.", confidence: 0.8 }],
      userKey
    );

    const updated = updateDirectMemoryText(
      db,
      "user-1",
      memory.id,
      "The user likes gentle controls.",
      userKey
    );

    assert.equal(updated.text, "The user likes gentle controls.");
    const retrieved = await retrieveRelevantMemories(
      db,
      provider,
      "user-1",
      "controls",
      userKey,
      "bot-1",
      1
    );
    assert.equal(retrieved[0]?.text, "The user likes gentle controls.");
  });

  it("rejects inferred memory edits", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);
    const [memory] = await persistMemoryCandidates(
      db,
      stubProvider(),
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "The user generally likes soft motion.", confidence: 0.8 }],
      userKey,
      { source: "inferred" }
    );

    assert.throws(
      () => updateDirectMemoryText(db, "user-1", memory.id, "New text.", userKey),
      /Inferred memories cannot be edited/
    );
  });
});

describe("createDevSeedMemories", () => {
  it("distributes seeded memories across the provided bots", () => {
    const db = createMemoryTestDb();
    const created = createDevSeedMemories(
      db,
      "user-1",
      Buffer.alloc(32, 7),
      5,
      ["bot-1", "bot-2"]
    );

    const rows = db
      .prepare("SELECT bot_id FROM memories ORDER BY created_at ASC")
      .all() as Array<{ bot_id: string | null }>;

    assert.equal(created, 5);
    assert.deepEqual(
      rows.map((row) => row.bot_id),
      ["bot-1", "bot-2", "bot-1", "bot-2", "bot-1"]
    );
  });

  it("can seed all-bot memories unevenly with empty bots", () => {
    const db = createMemoryTestDb();
    const randomValues = [0.1, 0.6, 0.2, 0.8, 0.15, 0.45, 0.75];
    let randomIndex = 0;
    const created = createDevSeedMemories(
      db,
      "user-1",
      Buffer.alloc(32, 7),
      6,
      ["bot-1", "bot-2", "bot-3", "bot-4"],
      {
        randomizeAcrossBots: true,
        random: () => randomValues[randomIndex++ % randomValues.length] ?? 0,
      }
    );

    const rows = db
      .prepare("SELECT bot_id, COUNT(*) AS count FROM memories GROUP BY bot_id")
      .all() as Array<{ bot_id: string | null; count: number }>;
    const counts = new Map(rows.map((row) => [row.bot_id, row.count]));

    assert.equal(created, 6);
    assert.equal(counts.size, 3);
    assert.deepEqual(
      [...counts.values()].sort((a, b) => a - b),
      [1, 2, 3]
    );
  });

  it("rejects memory seeding when there are no target bots", () => {
    const db = createMemoryTestDb();

    assert.throws(
      () => createDevSeedMemories(db, "user-1", Buffer.alloc(32, 7), 1, []),
      /at least one bot/i
    );
  });
});

describe("deleteOrphanedBotMemories", () => {
  it("deletes bot-scoped memories whose bot no longer exists", () => {
    const db = createMemoryTestDb();
    db.prepare("INSERT INTO bots (id, user_id) VALUES (?, ?)").run("bot-live", "user-1");
    db.prepare("INSERT INTO bots (id, user_id) VALUES (?, ?)").run("bot-other-user", "user-2");
    seedMemoryRow(db, "user-1", "bot-live", "memory-live");
    seedMemoryRow(db, "user-1", "bot-deleted", "memory-orphan");
    seedMemoryRow(db, "user-1", null, "memory-global");
    seedMemoryRow(db, "user-2", "bot-other-user", "memory-other-user");

    const deleted = deleteOrphanedBotMemories(db, "user-1");

    const rows = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.equal(deleted, 1);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["memory-global", "memory-live", "memory-other-user"]
    );
  });
});

describe("filterConflictingMemories", () => {
  it("keeps the highest-confidence memory for the same single-value fact", () => {
    const memories = filterConflictingMemories([
      {
        id: "memory-low",
        userId: "user-1",
        createdAt: "2026-04-30T21:00:00.000Z",
        confidence: 0.69,
        text: "My favorite sandwich is a lemon",
      },
      {
        id: "memory-high",
        userId: "user-1",
        createdAt: "2026-04-30T21:01:00.000Z",
        confidence: 0.7,
        text: "My favorite sandwich is a burger",
      },
      {
        id: "memory-other",
        userId: "user-1",
        createdAt: "2026-04-30T21:02:00.000Z",
        confidence: 0.66,
        text: "My favorite drink is lemonade",
      },
    ]);

    assert.deepEqual(
      memories.map((memory) => memory.id),
      ["memory-high", "memory-other"]
    );
  });

  it("keeps the newest memory when conflicting memories have equal confidence", () => {
    const memories = filterConflictingMemories([
      {
        id: "memory-one",
        userId: "user-1",
        createdAt: "2026-04-30T21:00:00.000Z",
        confidence: 0.7,
        text: "My favorite sandwich is a lemon",
      },
      {
        id: "memory-two",
        userId: "user-1",
        createdAt: "2026-04-30T21:01:00.000Z",
        confidence: 0.7,
        text: "My favorite sandwich is a burger",
      },
    ]);

    assert.deepEqual(
      memories.map((memory) => memory.id),
      ["memory-two"]
    );
  });
});
