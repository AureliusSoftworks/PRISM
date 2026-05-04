import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fallbackEmbedding, type LlmProvider } from "../providers.ts";
import { decryptJson } from "../security.ts";
import { inferAndStoreBotMemories } from "../memory-inference.ts";
import { persistMemoryCandidates } from "../memory.ts";

function createMemoryInferenceTestDb(): DatabaseSync {
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
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function inferenceProvider(response: string): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages): Promise<string> {
      if (messages[0]?.content.includes("memory validation critic")) {
        const payload = JSON.parse(messages[1]?.content ?? "{}") as {
          candidates?: Array<{ index: number; text: string; confidence: number }>;
        };
        return JSON.stringify({
          results: (payload.candidates ?? []).map((candidate) => ({
            index: candidate.index,
            decision: "approve",
            text: candidate.text,
            confidence: candidate.confidence,
            reasonCodes: [],
          })),
        });
      }
      return response;
    },
    async embedText(text: string): Promise<number[]> {
      return fallbackEmbedding(text);
    },
  };
}

async function seedDirectMemories(
  db: DatabaseSync,
  userKey: Buffer,
  texts: string[]
): Promise<void> {
  await persistMemoryCandidates(
    db,
    "user-1",
    "conversation-1",
    "bot-1",
    texts.map((text) => ({ text, confidence: 0.92 })),
    userKey,
    { sourceMessageIds: ["message-1"] }
  );
}

function memoryRows(db: DatabaseSync): Array<{
  source: string;
  certainty: number | null;
  source_message_ids: string;
  ciphertext: string;
  iv: string;
  tag: string;
}> {
  return db
    .prepare("SELECT source, certainty, source_message_ids, ciphertext, iv, tag FROM memories ORDER BY source")
    .all() as Array<{
    source: string;
    certainty: number | null;
    source_message_ids: string;
    ciphertext: string;
    iv: string;
    tag: string;
  }>;
}

describe("inferAndStoreBotMemories", () => {
  it("merges direct clues into one inferred memory and deletes parents", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(
      JSON.stringify({
        merges: [
          {
            text: "Your favorite instrument is the piano.",
            parentIndices: [1, 2],
            certainty: 0.92,
          },
        ],
      })
    );
    await seedDirectMemories(db, userKey, [
      "Your favorite instrument has black and white keys.",
      "You like to play the piano.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);
    const payload = decryptJson(
      {
        ciphertext: rows[0]?.ciphertext ?? "",
        iv: rows[0]?.iv ?? "",
        tag: rows[0]?.tag ?? "",
      },
      userKey
    ) as { text?: string };

    assert.equal(created.length, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.source, "inferred");
    assert.equal(rows[0]?.certainty, 0.92);
    assert.equal(payload.text, "Your favorite instrument is the piano.");
    assert.deepEqual(JSON.parse(rows[0]?.source_message_ids ?? "[]"), ["message-1"]);
  });

  it("preserves favorite payload when merging synonym memories", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(
      JSON.stringify({
        merges: [
          {
            text: "Potatoes are spuds.",
            parentIndices: [1, 2],
            certainty: 0.9,
          },
        ],
      })
    );
    await seedDirectMemories(db, userKey, [
      "Potatoes are your favorite.",
      "Spuds are your favorite.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);
    const payload = decryptJson(
      {
        ciphertext: rows[0]?.ciphertext ?? "",
        iv: rows[0]?.iv ?? "",
        tag: rows[0]?.tag ?? "",
      },
      userKey
    ) as { text?: string };

    assert.equal(created.length, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.source, "inferred");
    assert.equal(payload.text, "Potatoes are spuds, and they are your favorite.");
  });

  it("preserves specific favorite descriptors when merging synonyms", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(
      JSON.stringify({
        merges: [
          {
            text: "Potatoes are spuds.",
            parentIndices: [1, 2],
            certainty: 0.91,
          },
        ],
      })
    );
    await seedDirectMemories(db, userKey, [
      "Potatoes are your favorite comfort food.",
      "Spuds are your favorite comfort food.",
    ]);

    await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);
    const payload = decryptJson(
      {
        ciphertext: rows[0]?.ciphertext ?? "",
        iv: rows[0]?.iv ?? "",
        tag: rows[0]?.tag ?? "",
      },
      userKey
    ) as { text?: string };

    assert.equal(rows.length, 1);
    assert.equal(
      payload.text,
      "Potatoes are spuds, and they are your favorite comfort food."
    );
  });

  it("rejects favorite merges that drop one synonym subject", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(
      JSON.stringify({
        merges: [
          {
            text: "Spuds are your favorite.",
            parentIndices: [1, 2],
            certainty: 0.9,
          },
        ],
      })
    );
    await seedDirectMemories(db, userKey, [
      "Potatoes are your favorite.",
      "Spuds are your favorite.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);

    assert.equal(created.length, 0);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.source), ["direct", "direct"]);
  });

  it("rejects inferred task assumptions that drop an existing preference", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(
      JSON.stringify({
        merges: [
          {
            text: "Write an email to your landlord about the sink leak.",
            parentIndices: [1, 2],
            certainty: 0.96,
          },
        ],
      })
    );
    await seedDirectMemories(db, userKey, [
      "You dislike overly formal writing.",
      "Write a quick email to your landlord about the sink leak.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);

    assert.equal(created.length, 0);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.source), ["direct", "direct"]);
  });

  it("leaves unrelated direct memories unchanged", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(JSON.stringify({ merges: [] }));
    await seedDirectMemories(db, userKey, [
      "You like cheese.",
      "Your favorite color is blue.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);

    assert.equal(created.length, 0);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.source), ["direct", "direct"]);
  });

  it("ignores malformed model output without throwing", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider("Sure, I can merge those memories.");
    await seedDirectMemories(db, userKey, [
      "Your favorite instrument has black and white keys.",
      "You like to play the piano.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);

    assert.equal(created.length, 0);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.source), ["direct", "direct"]);
  });

  it("rejects low-certainty inferred merges", async () => {
    const db = createMemoryInferenceTestDb();
    const userKey = Buffer.alloc(32, 7);
    const provider = inferenceProvider(
      JSON.stringify({
        merges: [
          {
            text: "Your favorite instrument is the piano.",
            parentIndices: [1, 2],
            certainty: 0.5,
          },
        ],
      })
    );
    await seedDirectMemories(db, userKey, [
      "Your favorite instrument has black and white keys.",
      "You like to play the piano.",
    ]);

    const created = await inferAndStoreBotMemories(
      db,
      provider,
      "user-1",
      "bot-1",
      userKey
    );
    const rows = memoryRows(db);

    assert.equal(created.length, 0);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.source), ["direct", "direct"]);
  });
});
