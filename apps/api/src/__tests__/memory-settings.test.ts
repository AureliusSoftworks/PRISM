import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import { encryptJson } from "../security.ts";
import {
  clearMemoryProseClass,
  getMemoryProseOverview,
} from "../memory-settings.ts";
import {
  createMemoryAcquisitionReceipt,
  linkDerivedMemoryEvidence,
} from "../memory-ecology.ts";

const USER_KEY = Buffer.alloc(32, 23);
const NOW = "2026-08-11T12:00:00.000Z";

function createDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const insertUser = db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  );
  insertUser.run("user-1", "one@example.com", "One", NOW, NOW);
  insertUser.run("user-2", "two@example.com", "Two", NOW, NOW);
  return db;
}

function insertFact(
  db: DatabaseSync,
  args: { id: string; userId: string; tier: "long_term" | "short_term"; text: string },
): void {
  const encrypted = encryptJson({ text: args.text }, USER_KEY);
  db.prepare(
    `INSERT INTO memories
       (id, user_id, ciphertext, iv, tag, confidence, category, tier,
        durability, source, certainty, source_message_ids, created_at)
     VALUES (?, ?, ?, ?, ?, 0.8, 'general', ?, 0.8, 'direct', 0.8, '[]', ?)`,
  ).run(
    args.id,
    args.userId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    args.tier,
    NOW,
  );
}

function insertSummary(
  db: DatabaseSync,
  args: {
    id: string;
    userId: string;
    kind: "chat_facts" | "thread_compact";
    prose: string;
  },
): void {
  db.prepare(
    `INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at)
     VALUES (?, ?, NULL, ?, ?)`,
  ).run(
    args.id,
    args.userId,
    JSON.stringify({ v: 1, kind: args.kind, summary: args.prose }),
    NOW,
  );
}

function insertZenCheckpoint(
  db: DatabaseSync,
  args: { id: string; userId: string; title: string; text: string; trigger: string },
): void {
  const encrypted = encryptJson(
    { title: args.title, text: args.text, trigger: args.trigger },
    USER_KEY,
  );
  db.prepare(
    `INSERT INTO zen_session_memories
       (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, created_at, expires_at)
     VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    args.id,
    args.userId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    NOW,
    "2026-08-15T12:00:00.000Z",
  );
}

function seedBothUsers(db: DatabaseSync): void {
  insertFact(db, { id: "u1-long", userId: "user-1", tier: "long_term", text: "é" });
  insertFact(db, { id: "u1-short", userId: "user-1", tier: "short_term", text: "cat" });
  insertSummary(db, { id: "u1-recall", userId: "user-1", kind: "chat_facts", prose: "🌈" });
  insertSummary(db, { id: "u1-thread", userId: "user-1", kind: "thread_compact", prose: "work" });
  insertZenCheckpoint(db, { id: "u1-zen", userId: "user-1", title: "A", text: "B", trigger: "C" });

  insertFact(db, { id: "u2-long", userId: "user-2", tier: "long_term", text: "private" });
  insertSummary(db, { id: "u2-thread", userId: "user-2", kind: "thread_compact", prose: "other" });
}

describe("memory settings persistence", () => {
  it("computes user-scoped UTF-8 prose bytes for canonical long- and short-term stores", () => {
    const db = createDb();
    try {
      seedBothUsers(db);
      assert.deepEqual(getMemoryProseOverview(db, "user-1", USER_KEY), {
        longTerm: { recordCount: 2, proseBytes: 6 },
        shortTerm: { recordCount: 3, proseBytes: 12 },
        derived: { recordCount: 0, proseBytes: 0 },
        total: { recordCount: 5, proseBytes: 18 },
      });
    } finally {
      db.close();
    }
  });

  it("clears long-term records and their recall vectors without touching short-term or another user", async () => {
    const db = createDb();
    try {
      seedBothUsers(db);
      const deletedVectorIds: string[] = [];
      const result = await clearMemoryProseClass(db, "user-1", "long_term", {
        deleteVectorById: async (id) => {
          deletedVectorIds.push(id);
        },
      });

      assert.equal(result.deletedRecords, 2);
      assert.deepEqual(deletedVectorIds, ["u1-recall"]);
      assert.deepEqual(getMemoryProseOverview(db, "user-1", USER_KEY), {
        longTerm: { recordCount: 0, proseBytes: 0 },
        shortTerm: { recordCount: 3, proseBytes: 12 },
        derived: { recordCount: 0, proseBytes: 0 },
        total: { recordCount: 3, proseBytes: 12 },
      });
      assert.deepEqual(getMemoryProseOverview(db, "user-2", USER_KEY), {
        longTerm: { recordCount: 1, proseBytes: 7 },
        shortTerm: { recordCount: 1, proseBytes: 5 },
        derived: { recordCount: 0, proseBytes: 0 },
        total: { recordCount: 2, proseBytes: 12 },
      });
    } finally {
      db.close();
    }
  });

  it("clears only short-term facts, summaries, and Zen checkpoints", async () => {
    const db = createDb();
    try {
      seedBothUsers(db);
      const result = await clearMemoryProseClass(db, "user-1", "short_term", {
        deleteVectorById: async () => {
          assert.fail("short-term stores do not own Qdrant recall vectors");
        },
      });

      assert.equal(result.deletedRecords, 3);
      assert.equal(result.deletedFacts, 1);
      assert.equal(result.deletedSummaries, 1);
      assert.equal(result.deletedZenCheckpoints, 1);
      assert.equal(result.vectorCleanup.attempted, 0);
      assert.deepEqual(getMemoryProseOverview(db, "user-1", USER_KEY), {
        longTerm: { recordCount: 2, proseBytes: 6 },
        shortTerm: { recordCount: 0, proseBytes: 0 },
        derived: { recordCount: 0, proseBytes: 0 },
        total: { recordCount: 2, proseBytes: 6 },
      });
    } finally {
      db.close();
    }
  });

  it("clears linked receipts and unsupported Derived opinions with their short-term evidence", async () => {
    const db = createDb();
    try {
      insertFact(db, {
        id: "evidence-a",
        userId: "user-1",
        tier: "short_term",
        text: "First exchange",
      });
      insertFact(db, {
        id: "evidence-b",
        userId: "user-1",
        tier: "short_term",
        text: "Second exchange",
      });
      insertFact(db, {
        id: "evidence-c",
        userId: "user-1",
        tier: "short_term",
        text: "Third exchange",
      });
      const encrypted = encryptJson({ text: "An evidence-backed opinion" }, USER_KEY);
      db.prepare(
        `INSERT INTO memories
          (id, user_id, ciphertext, iv, tag, confidence, base_confidence,
           category, tier, lifecycle, durability, source, certainty,
           source_message_ids, last_reinforced_at, created_at)
         VALUES ('derived', 'user-1', ?, ?, ?, 0.8, 0.8, 'general',
                 'short_term', 'derived', 0.7, 'inferred', 0.8, '[]', ?, ?)`,
      ).run(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        NOW,
        NOW,
      );
      linkDerivedMemoryEvidence({
        db,
        userId: "user-1",
        inferredMemoryId: "derived",
        evidenceMemoryIds: ["evidence-a", "evidence-b", "evidence-c"],
      });
      createMemoryAcquisitionReceipt({
        db,
        userId: "user-1",
        memoryId: "evidence-a",
        kind: "player_memory",
      });

      const result = await clearMemoryProseClass(db, "user-1", "short_term", {
        deleteVectorById: async () => {},
      });

      assert.equal(result.deletedFacts, 3);
      assert.equal(result.deletedDerived, 1);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number })
          .count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memory_evidence_links").get() as {
          count: number;
        }).count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memory_acquisition_receipts").get() as {
          count: number;
        }).count,
        0,
      );
    } finally {
      db.close();
    }
  });
});
