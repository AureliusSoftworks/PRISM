import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import { encryptJson } from "../security.ts";
import { persistMemoryCandidates } from "../memory.ts";
import {
  DEFAULT_MEMORY_ECOLOGY_SETTINGS,
  MemoryEcologySettingsInputError,
  createMemoryAcquisitionReceipt,
  effectiveShortTermConfidence,
  forgetMemoryFromLatestReceipt,
  latestPlayerMemoryReceipt,
  linkDerivedMemoryEvidence,
  listUnreadMemoryAcquisitionReceipts,
  markMemoryAcquisitionReceiptRead,
  markSessionBotRelationMemoryReceiptsRead,
  materializeShortTermMemoryDecay,
  memoryCandidatePassesAcquisition,
  readMemoryEcologySettings,
  recordRelationshipProjectionBase,
  resolveMemoryEcologySettingsPatch,
  writeMemoryEcologySettings,
} from "../memory-ecology.ts";

const USER_KEY = Buffer.alloc(32, 41);
const USER_ID = "user-1";

function createDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at)
     VALUES (?, 'memory@example.com', 'Memory', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run(USER_ID, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
  return db;
}

function insertMemory(
  db: DatabaseSync,
  args: {
    id: string;
    confidence: number;
    baseConfidence?: number;
    tier?: "short_term" | "long_term";
    lifecycle?: "short_term" | "long_term" | "derived";
    source?: "direct" | "inferred";
    certainty?: number;
    botId?: string;
    targetBotId?: string;
    category?: "general" | "user" | "bot_relation";
    lastReinforcedAt?: string;
  },
): void {
  const encrypted = encryptJson({ text: `Memory ${args.id}` }, USER_KEY);
  const tier = args.tier ?? "short_term";
  const lifecycle = args.lifecycle ?? tier;
  const lastReinforcedAt =
    args.lastReinforcedAt ?? "2026-08-01T00:00:00.000Z";
  db.prepare(
    `INSERT INTO memories
      (id, user_id, bot_id, target_bot_id, ciphertext, iv, tag, confidence,
       base_confidence, category, tier, lifecycle, durability, source,
       certainty, source_message_ids, last_reinforced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.7, ?, ?, '[]', ?, ?)`,
  ).run(
    args.id,
    USER_ID,
    args.botId ?? null,
    args.targetBotId ?? null,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    args.confidence,
    args.baseConfidence ?? args.confidence,
    args.category ?? "user",
    tier,
    lifecycle,
    args.source ?? (lifecycle === "derived" ? "inferred" : "direct"),
    args.certainty ?? args.confidence,
    lastReinforcedAt,
    lastReinforcedAt,
  );
}

describe("memory ecology settings", () => {
  it("validates the complete partial settings contract", () => {
    const next = resolveMemoryEcologySettingsPatch(
      {
        learnAboutPlayer: false,
        learnAboutBots: true,
        acquisitionSensitivity: "curious",
        shortTermRetentionDays: 365,
        longTermPromotionThreshold: 0.7,
        inferredMinEvidenceCount: 8,
        inferredConfidenceThreshold: 0.95,
      },
      DEFAULT_MEMORY_ECOLOGY_SETTINGS,
    );
    assert.deepEqual(next, {
      learnAboutPlayer: false,
      learnAboutBots: true,
      acquisitionSensitivity: "curious",
      shortTermRetentionDays: 365,
      longTermPromotionThreshold: 0.7,
      inferredMinEvidenceCount: 8,
      inferredConfidenceThreshold: 0.95,
    });
    assert.throws(
      () =>
        resolveMemoryEcologySettingsPatch(
          { shortTermRetentionDays: 0 },
          DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        ),
      MemoryEcologySettingsInputError,
    );
    assert.throws(
      () =>
        resolveMemoryEcologySettingsPatch(
          { longTermPromotionThreshold: 0.69 },
          DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        ),
      MemoryEcologySettingsInputError,
    );
  });

  it("gates automatic learning independently and honors sensitivity", () => {
    const settings = {
      ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
      learnAboutPlayer: false,
      learnAboutBots: true,
      acquisitionSensitivity: "cautious" as const,
    };
    assert.equal(memoryCandidatePassesAcquisition(settings, "user", 0.99), false);
    assert.equal(
      memoryCandidatePassesAcquisition(settings, "bot_relation", 0.69),
      false,
    );
    assert.equal(
      memoryCandidatePassesAcquisition(settings, "bot_relation", 0.7),
      true,
    );
  });

  it("round-trips account settings and keeps the legacy aggregate in sync", () => {
    const db = createDb();
    try {
      const next = {
        ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        learnAboutPlayer: false,
        learnAboutBots: true,
        shortTermRetentionDays: 45,
      };
      writeMemoryEcologySettings(db, USER_ID, next);
      assert.deepEqual(readMemoryEcologySettings(db, USER_ID), next);
      const legacy = db
        .prepare("SELECT auto_memory FROM users WHERE id = ?")
        .get(USER_ID) as { auto_memory: number };
      assert.equal(legacy.auto_memory, 1);
    } finally {
      db.close();
    }
  });
});

describe("memory ecology decay and support", () => {
  it("decays once per elapsed day, survives offline time, and expires at zero", () => {
    assert.equal(
      effectiveShortTermConfidence({
        baseConfidence: 0.8,
        lastReinforcedAt: "2026-08-01T00:00:00.000Z",
        retentionDays: 10,
        now: new Date("2026-08-06T23:59:59.000Z"),
      }),
      0.4,
    );
    const db = createDb();
    try {
      writeMemoryEcologySettings(db, USER_ID, {
        ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        shortTermRetentionDays: 10,
      });
      insertMemory(db, {
        id: "short",
        confidence: 0.8,
        lastReinforcedAt: "2026-08-01T00:00:00.000Z",
      });
      insertMemory(db, {
        id: "long",
        confidence: 0.93,
        tier: "long_term",
        lifecycle: "long_term",
      });

      materializeShortTermMemoryDecay(
        db,
        USER_ID,
        new Date("2026-08-06T23:59:59.000Z"),
      );
      const halfway = db
        .prepare("SELECT confidence FROM memories WHERE id = 'short'")
        .get() as { confidence: number };
      assert.equal(halfway.confidence, 0.4);
      materializeShortTermMemoryDecay(
        db,
        USER_ID,
        new Date("2026-08-11T00:00:00.000Z"),
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'short'").get()
          .count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT confidence FROM memories WHERE id = 'long'").get() as {
          confidence: number;
        }).confidence,
        0.93,
      );
    } finally {
      db.close();
    }
  });

  it("applies accrued decay before reinforcement, resets the clock, and promotes at the configured threshold", async () => {
    const db = createDb();
    try {
      writeMemoryEcologySettings(db, USER_ID, {
        ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        shortTermRetentionDays: 10,
        longTermPromotionThreshold: 0.7,
      });
      const [initial] = await persistMemoryCandidates(
        db,
        USER_ID,
        "conversation-1",
        "bot-a",
        [{ text: "You prefer concise practical answers.", confidence: 0.6 }],
        USER_KEY,
        { certainty: 0.6, sourceMessageIds: ["message-1"] },
      );
      const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
      db.prepare(
        `UPDATE memories
            SET confidence = 0.6, base_confidence = 0.6,
                last_reinforced_at = ?, created_at = ?
          WHERE id = ?`,
      ).run(fiveDaysAgo, fiveDaysAgo, initial!.id);

      const [reinforced] = await persistMemoryCandidates(
        db,
        USER_ID,
        "conversation-2",
        "bot-a",
        [{ text: "You prefer concise practical answers.", confidence: 0.68 }],
        USER_KEY,
        { certainty: 0.68, sourceMessageIds: ["message-2"] },
      );
      assert.equal(reinforced?.id, initial?.id);
      assert.equal(reinforced?.tier, "long_term");
      assert.equal(reinforced?.lifecycle, "long_term");
      assert.ok(Date.parse(reinforced?.lastReinforcedAt ?? "") > Date.parse(fiveDaysAgo));
    } finally {
      db.close();
    }
  });

  it("immediately expires existing memories when retention is shortened past their age", () => {
    const db = createDb();
    try {
      writeMemoryEcologySettings(db, USER_ID, {
        ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        shortTermRetentionDays: 30,
      });
      const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
      insertMemory(db, {
        id: "retention-change",
        confidence: 0.8,
        lastReinforcedAt: fourDaysAgo,
      });
      materializeShortTermMemoryDecay(db, USER_ID);
      assert.equal(
        (db
          .prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'retention-change'")
          .get() as { count: number }).count,
        1,
      );
      writeMemoryEcologySettings(db, USER_ID, {
        ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        shortTermRetentionDays: 3,
      });
      materializeShortTermMemoryDecay(db, USER_ID);
      assert.equal(
        (db
          .prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'retention-change'")
          .get() as { count: number }).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("weakens Derived confidence, preserves long-term anchors, and collapses unsupported opinions", () => {
    const db = createDb();
    try {
      writeMemoryEcologySettings(db, USER_ID, {
        ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        shortTermRetentionDays: 10,
        inferredMinEvidenceCount: 2,
      });
      insertMemory(db, {
        id: "short-evidence",
        confidence: 0.8,
        baseConfidence: 0.8,
      });
      insertMemory(db, {
        id: "long-anchor",
        confidence: 0.92,
        tier: "long_term",
        lifecycle: "long_term",
      });
      insertMemory(db, {
        id: "derived",
        confidence: 0.8,
        baseConfidence: 0.8,
        lifecycle: "derived",
        source: "inferred",
        certainty: 0.8,
      });
      insertMemory(db, {
        id: "historical-derived",
        confidence: 0.73,
        lifecycle: "derived",
        source: "inferred",
        certainty: 0.73,
      });
      linkDerivedMemoryEvidence({
        db,
        userId: USER_ID,
        inferredMemoryId: "derived",
        evidenceMemoryIds: ["short-evidence", "long-anchor"],
      });

      materializeShortTermMemoryDecay(
        db,
        USER_ID,
        new Date("2026-08-06T00:00:00.000Z"),
      );
      const derived = db
        .prepare("SELECT confidence FROM memories WHERE id = 'derived'")
        .get() as { confidence: number };
      assert.ok(Math.abs(derived.confidence - 0.6) < 0.000_001);

      db.prepare("DELETE FROM memories WHERE id = 'short-evidence'").run();
      materializeShortTermMemoryDecay(
        db,
        USER_ID,
        new Date("2026-08-06T00:00:00.000Z"),
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'derived'").get() as {
          count: number;
        }).count,
        0,
      );
      assert.equal(
        (db
          .prepare(
            "SELECT COUNT(*) AS count FROM memories WHERE id = 'historical-derived'",
          )
          .get() as { count: number }).count,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("removes a known derivation after every linked source is deleted", () => {
    const db = createDb();
    try {
      insertMemory(db, { id: "source-a", confidence: 0.8 });
      insertMemory(db, { id: "source-b", confidence: 0.82 });
      insertMemory(db, {
        id: "known-derived",
        confidence: 0.8,
        lifecycle: "derived",
        source: "inferred",
      });
      linkDerivedMemoryEvidence({
        db,
        userId: USER_ID,
        inferredMemoryId: "known-derived",
        evidenceMemoryIds: ["source-a", "source-b"],
      });

      db.prepare("DELETE FROM memories WHERE id IN ('source-a', 'source-b')").run();
      materializeShortTermMemoryDecay(db, USER_ID);

      assert.equal(
        (db
          .prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'known-derived'")
          .get() as { count: number }).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("removes relationship projections when their evidence disappears", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO bot_relationships
          (user_id, source_bot_id, target_bot_id, score, band, mood_key,
           trend, last_reason, recent_reasons, updated_at)
         VALUES (?, 'bot-a', 'bot-b', 90, 'warm', 'joyful', 'up',
                 'Supported opinion', '["A recent warm exchange"]', ?)`,
      ).run(USER_ID, "2026-08-01T00:00:00.000Z");
      insertMemory(db, {
        id: "edge-evidence",
        confidence: 0.8,
        baseConfidence: 0.8,
        botId: "bot-a",
        targetBotId: "bot-b",
        category: "bot_relation",
      });
      recordRelationshipProjectionBase({
        db,
        userId: USER_ID,
        sourceBotId: "bot-a",
        targetBotId: "bot-b",
        baseScore: 90,
      });
      materializeShortTermMemoryDecay(
        db,
        USER_ID,
        new Date("2026-08-16T00:00:00.000Z"),
      );
      const decayed = db
        .prepare(
          "SELECT score FROM bot_relationships WHERE user_id = ? AND source_bot_id = 'bot-a'",
        )
        .get(USER_ID) as { score: number };
      assert.equal(decayed.score, 70);

      db.prepare("DELETE FROM memories WHERE id = 'edge-evidence'").run();
      materializeShortTermMemoryDecay(db, USER_ID);
      assert.equal(
        (db
          .prepare(
            "SELECT COUNT(*) AS count FROM bot_relationships WHERE user_id = ? AND source_bot_id = 'bot-a'",
          )
          .get(USER_ID) as { count: number }).count,
        0,
      );
    } finally {
      db.close();
    }
  });
});

describe("memory acquisition receipts", () => {
  it("persists unread state and resolves the latest notified player memory exactly", () => {
    const db = createDb();
    try {
      const latestAt = new Date();
      const olderAt = new Date(latestAt.getTime() - 1_000);
      insertMemory(db, {
        id: "older",
        confidence: 0.8,
        botId: "bot-a",
        lastReinforcedAt: olderAt.toISOString(),
      });
      insertMemory(db, {
        id: "latest",
        confidence: 0.82,
        botId: "bot-a",
        lastReinforcedAt: latestAt.toISOString(),
      });
      createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "older",
        learnerBotId: "bot-a",
        conversationId: "conversation-1",
        kind: "player_memory",
        createdAt: olderAt.toISOString(),
      });
      const latestReceipt = createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "latest",
        learnerBotId: "bot-a",
        conversationId: "conversation-1",
        kind: "player_memory",
        createdAt: latestAt.toISOString(),
      });
      assert.equal(
        latestPlayerMemoryReceipt({
          db,
          userId: USER_ID,
          conversationId: "conversation-1",
          botId: "bot-a",
        })?.memory_id,
        "latest",
      );
      assert.equal(listUnreadMemoryAcquisitionReceipts(db, USER_ID).length, 2);
      assert.equal(
        markMemoryAcquisitionReceiptRead(db, USER_ID, latestReceipt.id),
        true,
      );
      assert.deepEqual(
        listUnreadMemoryAcquisitionReceipts(db, USER_ID).map((row) => row.memory_id),
        ["older"],
      );
      assert.equal(
        forgetMemoryFromLatestReceipt({
          db,
          userId: USER_ID,
          conversationId: "conversation-1",
          botId: "bot-a",
        }),
        "latest",
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'older'").get() as {
          count: number;
        }).count,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("treats simultaneous latest receipts as ambiguous", () => {
    const db = createDb();
    try {
      insertMemory(db, { id: "same-time-a", confidence: 0.8, botId: "bot-a" });
      insertMemory(db, { id: "same-time-b", confidence: 0.82, botId: "bot-a" });
      for (const memoryId of ["same-time-a", "same-time-b"]) {
        createMemoryAcquisitionReceipt({
          db,
          userId: USER_ID,
          memoryId,
          learnerBotId: "bot-a",
          conversationId: "conversation-1",
          kind: "player_memory",
          createdAt: "2026-08-02T00:00:00.000Z",
        });
      }

      assert.equal(
        latestPlayerMemoryReceipt({
          db,
          userId: USER_ID,
          conversationId: "conversation-1",
          botId: "bot-a",
        }),
        null,
      );
      assert.equal(
        forgetMemoryFromLatestReceipt({
          db,
          userId: USER_ID,
          conversationId: "conversation-1",
          botId: "bot-a",
        }),
        null,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as {
          count: number;
        }).count,
        2,
      );
    } finally {
      db.close();
    }
  });

  it("filters unread bot indicators without loading player receipts", () => {
    const db = createDb();
    try {
      insertMemory(db, { id: "player-memory", confidence: 0.8, botId: "bot-a" });
      insertMemory(db, {
        id: "bot-memory",
        confidence: 0.82,
        botId: "bot-a",
        targetBotId: "bot-b",
      });
      createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "player-memory",
        learnerBotId: "bot-a",
        conversationId: "conversation-1",
        kind: "player_memory",
      });
      createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "bot-memory",
        learnerBotId: "bot-a",
        targetBotId: "bot-b",
        conversationId: "conversation-1",
        kind: "bot_relation",
      });

      assert.deepEqual(
        listUnreadMemoryAcquisitionReceipts(db, USER_ID, "bot_relation").map(
          (row) => row.memory_id,
        ),
        ["bot-memory"],
      );
      assert.deepEqual(
        listUnreadMemoryAcquisitionReceipts(db, USER_ID, "player_memory").map(
          (row) => row.memory_id,
        ),
        ["player-memory"],
      );
    } finally {
      db.close();
    }
  });

  it("resolves only unread bot-relation receipts from the completed session", () => {
    const db = createDb();
    try {
      for (const id of ["signal-bot", "signal-player", "coffee-bot"]) {
        insertMemory(db, { id, confidence: 0.82, botId: "bot-a" });
      }
      createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "signal-bot",
        learnerBotId: "bot-a",
        targetBotId: "bot-b",
        conversationId: "signal-episode-1",
        kind: "bot_relation",
      });
      createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "signal-player",
        learnerBotId: "bot-a",
        conversationId: "signal-episode-1",
        kind: "player_memory",
      });
      createMemoryAcquisitionReceipt({
        db,
        userId: USER_ID,
        memoryId: "coffee-bot",
        learnerBotId: "bot-a",
        targetBotId: "bot-b",
        conversationId: "coffee-session-1",
        kind: "bot_relation",
      });

      assert.equal(
        markSessionBotRelationMemoryReceiptsRead(
          db,
          USER_ID,
          "signal-episode-1",
          "2026-08-12T00:00:00.000Z",
        ),
        1,
      );
      assert.deepEqual(
        listUnreadMemoryAcquisitionReceipts(db, USER_ID).map((row) => row.memory_id),
        ["coffee-bot", "signal-player"],
      );
    } finally {
      db.close();
    }
  });
});
