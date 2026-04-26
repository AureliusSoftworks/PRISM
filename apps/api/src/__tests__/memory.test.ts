import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider } from "../providers.ts";
import {
  extractMemoryCandidates,
  persistMemoryCandidates,
  retrieveRelevantMemories,
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
      created_at TEXT NOT NULL
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

describe("extractMemoryCandidates", () => {
  it("pulls personal preference statements", () => {
    const candidates = extractMemoryCandidates(
      "I prefer concise answers. My favorite language is TypeScript."
    );
    assert.ok(candidates.length > 0);
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
});
