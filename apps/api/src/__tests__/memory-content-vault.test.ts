import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { restoreFactoryDefaultsInDatabase } from "../account-reset.ts";
import {
  createOpaqueCanarySurfaceId,
  scanForPlaintextCanary,
} from "../account-content-canary.ts";
import { getAppletSessionNote } from "../applet-session-notes.ts";
import {
  CORE_CONTENT_VAULT_CONTRACT_VERSION,
  MEMORY_CONTENT_VAULT_TABLES,
  activateCoreContentVaultV2,
  coreContentVaultStableRowIdV2,
  ensureCoreContentVaultStorageSchemaV2,
} from "../core-content-vault.ts";
import { initializeDatabase } from "../db.ts";
import { ensureMemoryEcologyMemorySchema } from "../memory-ecology.ts";
import {
  deriveMasterKey,
  encryptJson,
  encryptText,
} from "../security.ts";
import { getUserNote, ensureUserNotesSchema } from "../user-notes.ts";

const NOW = "2026-09-01T21:00:00.000Z";
const LATER = "2026-09-01T21:01:00.000Z";
const MASTER_SECRET = "memory-content-vault-test-master";
const OWNER_IDS = ["memory-owner-a", "memory-owner-b", "memory-owner-c", "memory-owner-d"] as const;

interface FamilyIds {
  botA: string;
  botB: string;
  conversation: string;
  message: string;
  memory: string;
  evidenceMemory: string;
  summary: string;
  zenMemory: string;
  note: string;
  receipt: string;
  spark: string;
}

interface VaultFixture {
  db: DatabaseSync;
  userKeys: Map<string, Buffer>;
  close(): void;
}

function addLegacyOwner(
  db: DatabaseSync,
  ownerId: string,
  userKey: Buffer,
  legacyMasterKey: Buffer,
): void {
  const wrapped = encryptText(userKey.toString("base64"), legacyMasterKey);
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, ?, 'hash', 'salt', ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    `${ownerId}@example.com`,
    ownerId.toUpperCase(),
    wrapped.ciphertext,
    wrapped.iv,
    wrapped.tag,
    NOW,
    NOW,
  );
}

function createVaultFixture(ownerIds: readonly string[] = OWNER_IDS): VaultFixture {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const userKeys = new Map<string, Buffer>();
  const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
  try {
    ownerIds.forEach((ownerId, index) => {
      const userKey = Buffer.alloc(32, index + 31);
      userKeys.set(ownerId, userKey);
      addLegacyOwner(db, ownerId, userKey, legacyMasterKey);
    });
  } finally {
    legacyMasterKey.fill(0);
  }
  activateCoreContentVaultV2({ db, masterSecret: MASTER_SECRET });
  return {
    db,
    userKeys,
    close() {
      for (const key of userKeys.values()) key.fill(0);
      db.close();
    },
  };
}

function insertFamilyRows(args: {
  db: DatabaseSync;
  ownerId: string;
  marker: string;
  canary: string;
  userKey: Buffer;
}): FamilyIds {
  const { db, ownerId, marker, canary, userKey } = args;
  const ids: FamilyIds = {
    botA: `memory-bot-a-${marker}`,
    botB: `memory-bot-b-${marker}`,
    conversation: `memory-conversation-${marker}`,
    message: `memory-message-${marker}`,
    memory: `memory-row-${marker}`,
    evidenceMemory: `memory-evidence-${marker}`,
    summary: `memory-summary-${marker}`,
    zenMemory: `zen-memory-${marker}`,
    note: `user-note-${marker}`,
    receipt: `memory-receipt-${marker}`,
    spark: `coffee-spark-${marker}`,
  };
  const primaryInner = encryptJson(
    { text: `Remembered ${canary}`, embedding: null },
    userKey,
  );
  const evidenceInner = encryptJson(
    { text: `Evidence ${canary}`, embedding: null },
    userKey,
  );
  const zenInner = encryptJson({ summary: `Zen ${canary}` }, userKey);
  const noteInner = encryptJson({ body: `Note body ${canary}` }, userKey);

  for (const [botId, suffix] of [
    [ids.botA, "A"],
    [ids.botB, "B"],
  ] as const) {
    db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      botId,
      ownerId,
      `Memory Bot ${suffix} ${marker}`,
      `Private prompt ${suffix} ${canary}`,
      NOW,
      NOW,
    );
  }
  db.prepare(
    `INSERT INTO conversations
       (id, user_id, title, conversation_mode, bot_id, created_at, updated_at)
     VALUES (?, ?, ?, 'coffee', ?, ?, ?)`,
  ).run(
    ids.conversation,
    ownerId,
    `Memory conversation ${canary}`,
    ids.botA,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO messages
       (id, conversation_id, user_id, role, content, bot_id, created_at)
     VALUES (?, ?, ?, 'user', ?, ?, ?)`,
  ).run(
    ids.message,
    ids.conversation,
    ownerId,
    `Memory source message ${canary}`,
    ids.botA,
    NOW,
  );
  const insertMemory = db.prepare(
    `INSERT INTO memories (
       id, user_id, conversation_id, bot_id, target_bot_id,
       ciphertext, iv, tag, confidence, category, tier, durability, source,
       certainty, source_message_ids, base_confidence, lifecycle,
       evidence_lineage_known, last_reinforced_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertMemory.run(
    ids.memory,
    ownerId,
    ids.conversation,
    ids.botA,
    ids.botB,
    primaryInner.ciphertext,
    primaryInner.iv,
    primaryInner.tag,
    0.91,
    `category-${canary}`,
    "long_term",
    0.87,
    "direct",
    0.93,
    JSON.stringify([ids.message]),
    0.9,
    "long_term",
    1,
    NOW,
    NOW,
  );
  insertMemory.run(
    ids.evidenceMemory,
    ownerId,
    ids.conversation,
    ids.botA,
    null,
    evidenceInner.ciphertext,
    evidenceInner.iv,
    evidenceInner.tag,
    0.82,
    `evidence-${canary}`,
    "short_term",
    0.72,
    "direct",
    0.8,
    JSON.stringify([ids.message]),
    0.8,
    "short_term",
    0,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO memory_summaries
       (id, user_id, conversation_id, summary, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(ids.summary, ownerId, ids.conversation, `Summary ${canary}`, NOW);
  db.prepare(
    `INSERT INTO zen_session_memories
       (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ids.zenMemory,
    ownerId,
    ids.conversation,
    ids.botA,
    zenInner.ciphertext,
    zenInner.iv,
    zenInner.tag,
    NOW,
    "2026-10-01T21:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO user_notes
       (id, user_id, title, ciphertext, iv, tag, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ids.note,
    ownerId,
    `Note title ${canary}`,
    noteInner.ciphertext,
    noteInner.iv,
    noteInner.tag,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO memory_evidence_links
       (user_id, inferred_memory_id, evidence_memory_id, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(ownerId, ids.memory, ids.evidenceMemory, NOW);
  db.prepare(
    `INSERT INTO memory_acquisition_receipts
       (id, user_id, memory_id, learner_bot_id, target_bot_id,
        conversation_id, kind, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ids.receipt,
    ownerId,
    ids.memory,
    ids.botA,
    ids.botB,
    ids.conversation,
    `receipt-${canary}`,
    NOW,
    null,
  );
  db.prepare(
    `INSERT OR REPLACE INTO memory_relationship_projections
       (user_id, source_bot_id, target_bot_id, base_score, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(ownerId, ids.botA, ids.botB, 64.5, NOW);
  db.prepare(
    `INSERT OR REPLACE INTO bot_relationships
       (user_id, source_bot_id, target_bot_id, score, band, mood_key, trend,
        last_reason, recent_reasons, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.botA,
    ids.botB,
    72,
    "warm",
    "joyful",
    "rising",
    `Relationship ${canary}`,
    JSON.stringify([`Recent relationship ${canary}`]),
    NOW,
  );
  db.prepare(
    `INSERT INTO applet_session_notes
       (user_id, surface, session_id, body, captures_json, created_at, updated_at)
     VALUES (?, 'coffee', ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.conversation,
    `Applet note ${canary}`,
    JSON.stringify([
      { body: `Capture ${canary}`, startedAt: NOW, committedAt: NOW },
    ]),
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO coffee_context_sparks (
       id, user_id, conversation_id, source_applet, source_session_id,
       source_title, source_date, source_role, source_participant_bot_ids,
       inspired_bot_id, display_prompt, state, created_at, updated_at
     ) VALUES (?, ?, ?, 'coffee', ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
  ).run(
    ids.spark,
    ownerId,
    ids.conversation,
    ids.conversation,
    `Source title ${canary}`,
    NOW,
    `source-role-${canary}`,
    JSON.stringify([ids.botA, ids.botB]),
    ids.botA,
    `Spark prompt ${canary}`,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO coffee_context_spark_runs
       (user_id, conversation_id, generated_at)
     VALUES (?, ?, ?)`,
  ).run(ownerId, ids.conversation, NOW);
  db.prepare(
    `INSERT OR REPLACE INTO bot_global_moods
       (user_id, bot_id, mood_key, source, updated_at)
     VALUES (?, ?, 'warm', 'signal_feedback', ?)`,
  ).run(ownerId, ids.botA, NOW);
  db.prepare(
    `INSERT OR REPLACE INTO prism_mood_state (
       user_id, conversation_id, mode, mood_key, confidence, annoyance, warmth,
       engagement, restraint, recent_deltas, ignore_until, ignore_cooldown_ms,
       ignore_forgiveness_chance, ignore_penalty_level, frozen, updated_at
     ) VALUES (?, ?, 'coffee', 'warm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.conversation,
    0.81,
    0.13,
    0.88,
    0.76,
    0.66,
    JSON.stringify([{ reason: canary, delta: 0.2 }]),
    null,
    1_000,
    0.4,
    2,
    0,
    NOW,
  );
  db.prepare(
    `INSERT OR IGNORE INTO prism_mood_events
       (user_id, conversation_id, message_id, event_type, created_at, payload_json)
     VALUES (?, ?, ?, 'turn', ?, ?)`,
  ).run(
    ownerId,
    ids.conversation,
    ids.message,
    NOW,
    JSON.stringify({ canary }),
  );
  db.prepare(
    `INSERT OR REPLACE INTO session_opinions
       (user_id, conversation_id, bot_scope_key, bot_id, score, band, trend,
        last_reason, recent_reasons, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.conversation,
    ids.botA,
    ids.botA,
    67,
    "warm",
    "rising",
    `Session opinion ${canary}`,
    JSON.stringify([`Session recent ${canary}`]),
    NOW,
  );
  db.prepare(
    `INSERT OR REPLACE INTO bot_opinions
       (user_id, bot_scope_key, bot_id, score, band, boundary_level, trend,
        last_reason, recent_reasons, repair_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.botA,
    ids.botA,
    69,
    "open",
    "gentle",
    "rising",
    `Bot opinion ${canary}`,
    JSON.stringify([`Bot recent ${canary}`]),
    3,
    NOW,
  );
  db.prepare(
    `INSERT OR REPLACE INTO coffee_bot_social_state
       (user_id, conversation_id, bot_id, disposition, values_friction,
        restraint, engagement, leave_pressure, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ownerId, ids.conversation, ids.botA, 0.71, 0.19, 0.64, 0.83, 0.08, NOW);
  db.prepare(
    `INSERT OR REPLACE INTO coffee_directional_irritation
       (user_id, conversation_id, subject_bot_id, target_bot_id, intensity,
        updated_at, last_transition_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.conversation,
    ids.botA,
    ids.botB,
    0.26,
    NOW,
    `transition-${marker}`,
  );
  db.prepare(
    `INSERT OR IGNORE INTO coffee_directional_irritation_ledger
       (user_id, conversation_id, transition_id, reason, subject_bot_id,
        target_bot_id, before_intensity, after_intensity, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    ids.conversation,
    `transition-${marker}`,
    `Irritation ${canary}`,
    ids.botA,
    ids.botB,
    0.11,
    0.26,
    NOW,
  );
  db.prepare(
    `INSERT OR REPLACE INTO coffee_cup_top_offs
       (user_id, conversation_id, bot_id, progress_before, progress_after,
        topped_off_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(ownerId, ids.conversation, ids.botA, 0.31, 0.74, NOW, NOW);
  return ids;
}

function physicalEncryptedFixtures(
  db: DatabaseSync,
  ownerId: string,
): Array<{
  opaqueSurfaceId: string;
  kind: "sqlite-main";
  bytes: Uint8Array;
}> {
  const fixtures: Array<{
    opaqueSurfaceId: string;
    kind: "sqlite-main";
    bytes: Uint8Array;
  }> = [];
  for (const table of MEMORY_CONTENT_VAULT_TABLES) {
    const encrypted = Object.entries(table.columns).flatMap(
      ([column, contract]) =>
        contract.disposition === "encrypted" ? [column] : [],
    );
    if (encrypted.length === 0) continue;
    const rows = db
      .prepare(
        `SELECT ${encrypted.map((column) => `"${column}"`).join(", ")}
           FROM main."${table.table}"
          WHERE user_id = ?`,
      )
      .all(ownerId) as Array<Record<string, unknown>>;
    rows.forEach((row, rowIndex) => {
      for (const column of encrypted) {
        const value = row[column];
        if (value === null) continue;
        assert.ok(
          value instanceof Uint8Array,
          `${table.table}.${column} must be a Vault V2 BLOB`,
        );
        fixtures.push({
          opaqueSurfaceId: createOpaqueCanarySurfaceId(
            "sqlite-main",
            `${table.table}:${column}:${rowIndex}`,
          ),
          kind: "sqlite-main",
          bytes: value,
        });
      }
    });
  }
  return fixtures;
}

function familyRowCount(
  db: DatabaseSync,
  table: string,
  ownerId: string,
): number {
  return Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS count FROM main."${table}" WHERE user_id = ?`)
        .get(ownerId) as { count: number }
    ).count,
  );
}

describe("memory-content Vault exact contract", () => {
  it("covers the 14 required tables plus every canonical opinion and Coffee relationship derivative", () => {
    assert.deepEqual(
      MEMORY_CONTENT_VAULT_TABLES.map((entry) => entry.table),
      [
        "memories",
        "memory_summaries",
        "zen_session_memories",
        "user_notes",
        "memory_evidence_links",
        "memory_acquisition_receipts",
        "memory_relationship_projections",
        "bot_relationships",
        "applet_session_notes",
        "coffee_context_sparks",
        "coffee_context_spark_runs",
        "bot_global_moods",
        "prism_mood_state",
        "prism_mood_events",
        "session_opinions",
        "bot_opinions",
        "coffee_bot_social_state",
        "coffee_directional_irritation",
        "coffee_directional_irritation_ledger",
        "coffee_cup_top_offs",
      ],
    );
    const relationships = MEMORY_CONTENT_VAULT_TABLES.find(
      (entry) => entry.table === "bot_relationships",
    );
    const mood = MEMORY_CONTENT_VAULT_TABLES.find(
      (entry) => entry.table === "prism_mood_state",
    );
    const links = MEMORY_CONTENT_VAULT_TABLES.find(
      (entry) => entry.table === "memory_evidence_links",
    );
    assert.deepEqual(relationships?.stableRowColumns, ["source_bot_id", "target_bot_id"]);
    assert.equal(relationships?.columns.score.disposition, "encrypted");
    assert.equal(relationships?.columns.recent_reasons.disposition, "encrypted");
    assert.equal(mood?.columns.mood_key.disposition, "encrypted");
    assert.equal(mood?.columns.frozen.disposition, "encrypted");
    assert.equal(links?.columns.inferred_memory_id.disposition, "operational");
    assert.equal(
      coreContentVaultStableRowIdV2("memories", ["single-id"]),
      "single-id",
    );
    assert.notEqual(
      coreContentVaultStableRowIdV2("bot_relationships", ["ab", "c"]),
      coreContentVaultStableRowIdV2("bot_relationships", ["a", "bc"]),
    );
  });
});

describe("memory-content Vault four-owner isolation", () => {
  it("keeps CRUD, physical ciphertext, reset, and account deletion owner-confined", () => {
    const fixture = createVaultFixture();
    const rows = new Map<string, FamilyIds>();
    try {
      OWNER_IDS.forEach((ownerId, index) => {
        const marker = String.fromCharCode(97 + index);
        const canary = `PRISM-2-6-OWNER-${marker}-CANARY`;
        rows.set(
          ownerId,
          insertFamilyRows({
            db: fixture.db,
            ownerId,
            marker,
            canary,
            userKey: fixture.userKeys.get(ownerId)!,
          }),
        );
        const fixtures = physicalEncryptedFixtures(fixture.db, ownerId);
        assert.ok(fixtures.length > 45);
        assert.equal(
          scanForPlaintextCanary(canary, fixtures).totalMatchCount,
          0,
        );
        assert.equal(
          (
            fixture.db
              .prepare(
                "SELECT summary FROM memory_summaries WHERE user_id = ? AND id = ?",
              )
              .get(ownerId, rows.get(ownerId)!.summary) as { summary: string }
          ).summary,
          `Summary ${canary}`,
        );
        assert.equal(
          getUserNote(
            fixture.db,
            ownerId,
            fixture.userKeys.get(ownerId)!,
            { id: rows.get(ownerId)!.note },
          ).body,
          `Note body ${canary}`,
        );
        assert.equal(
          getAppletSessionNote(
            fixture.db,
            ownerId,
            "coffee",
            rows.get(ownerId)!.conversation,
          )?.body,
          `Applet note ${canary}`,
        );
      });

      const ownerA = rows.get(OWNER_IDS[0])!;
      const wrongSummary = fixture.db
        .prepare(
          "SELECT summary FROM memory_summaries WHERE user_id = ? AND id = ?",
        )
        .get(OWNER_IDS[1], ownerA.summary);
      const missingSummary = fixture.db
        .prepare(
          "SELECT summary FROM memory_summaries WHERE user_id = ? AND id = ?",
        )
        .get(OWNER_IDS[1], "missing-summary");
      assert.equal(wrongSummary, undefined);
      assert.equal(missingSummary, undefined);
      assert.equal(
        getAppletSessionNote(
          fixture.db,
          OWNER_IDS[1],
          "coffee",
          ownerA.conversation,
        ),
        null,
      );

      fixture.db
        .prepare(
          `UPDATE bot_relationships
              SET score = ?, last_reason = ?, updated_at = ?
            WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
        )
        .run(
          77,
          "Updated only for owner c",
          LATER,
          OWNER_IDS[2],
          rows.get(OWNER_IDS[2])!.botA,
          rows.get(OWNER_IDS[2])!.botB,
        );
      assert.equal(
        (
          fixture.db
            .prepare(
              `SELECT score FROM bot_relationships
                WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
            )
            .get(
              OWNER_IDS[2],
              rows.get(OWNER_IDS[2])!.botA,
              rows.get(OWNER_IDS[2])!.botB,
            ) as { score: number }
        ).score,
        77,
      );
      assert.equal(
        (
          fixture.db
            .prepare(
              `SELECT score FROM bot_relationships
                WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
            )
            .get(
              OWNER_IDS[3],
              rows.get(OWNER_IDS[3])!.botA,
              rows.get(OWNER_IDS[3])!.botB,
            ) as { score: number }
        ).score,
        72,
      );

      restoreFactoryDefaultsInDatabase(fixture.db, OWNER_IDS[0], LATER);
      for (const table of MEMORY_CONTENT_VAULT_TABLES) {
        assert.equal(familyRowCount(fixture.db, table.table, OWNER_IDS[0]), 0);
        assert.ok(
          familyRowCount(fixture.db, table.table, OWNER_IDS[2]) > 0,
          `${table.table} for owner c must survive owner a reset`,
        );
      }

      fixture.db.prepare("DELETE FROM users WHERE id = ?").run(OWNER_IDS[1]);
      for (const table of MEMORY_CONTENT_VAULT_TABLES) {
        assert.equal(familyRowCount(fixture.db, table.table, OWNER_IDS[1]), 0);
        assert.ok(
          familyRowCount(fixture.db, table.table, OWNER_IDS[3]) > 0,
          `${table.table} for owner d must survive owner b deletion`,
        );
      }
    } finally {
      fixture.close();
    }
  });
});

describe("memory-content Vault authenticated composite bindings", () => {
  it("rejects owner, row, column, and tamper transplants for composite rows", () => {
    const fixture = createVaultFixture([OWNER_IDS[0], OWNER_IDS[1]]);
    try {
      const a = insertFamilyRows({
        db: fixture.db,
        ownerId: OWNER_IDS[0],
        marker: "transplant-a",
        canary: "TRANSPLANT-A-CANARY",
        userKey: fixture.userKeys.get(OWNER_IDS[0])!,
      });
      const b = insertFamilyRows({
        db: fixture.db,
        ownerId: OWNER_IDS[1],
        marker: "transplant-b",
        canary: "TRANSPLANT-B-CANARY",
        userKey: fixture.userKeys.get(OWNER_IDS[1])!,
      });
      fixture.db.prepare(
        `INSERT OR REPLACE INTO bot_relationships
           (user_id, source_bot_id, target_bot_id, score, band, mood_key,
            trend, last_reason, recent_reasons, updated_at)
         VALUES (?, ?, ?, 31, 'tense', 'guarded', 'falling', 'Reverse', '[]', ?)`,
      ).run(OWNER_IDS[0], a.botB, a.botA, NOW);

      const raw = (
        ownerId: string,
        sourceBotId: string,
        targetBotId: string,
        column: "score" | "band",
      ): Buffer => {
        const row = fixture.db
          .prepare(
            `SELECT "${column}" AS value
               FROM main.bot_relationships
              WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
          )
          .get(ownerId, sourceBotId, targetBotId) as { value: Uint8Array };
        assert.ok(row.value instanceof Uint8Array);
        return Buffer.from(row.value);
      };
      const write = (
        ownerId: string,
        sourceBotId: string,
        targetBotId: string,
        column: "score" | "band",
        value: Uint8Array,
      ): void => {
        fixture.db
          .prepare(
            `UPDATE main.bot_relationships
                SET "${column}" = ?
              WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
          )
          .run(value, ownerId, sourceBotId, targetBotId);
      };
      const read = (ownerId: string, sourceBotId: string, targetBotId: string) =>
        fixture.db
          .prepare(
            `SELECT score, band FROM bot_relationships
              WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
          )
          .get(ownerId, sourceBotId, targetBotId);

      const aScore = raw(OWNER_IDS[0], a.botA, a.botB, "score");
      const aReverseScore = raw(OWNER_IDS[0], a.botB, a.botA, "score");
      const aBand = raw(OWNER_IDS[0], a.botA, a.botB, "band");
      const bScore = raw(OWNER_IDS[1], b.botA, b.botB, "score");

      write(OWNER_IDS[0], a.botB, a.botA, "score", aScore);
      assert.throws(() => read(OWNER_IDS[0], a.botB, a.botA));
      write(OWNER_IDS[0], a.botB, a.botA, "score", aReverseScore);

      write(OWNER_IDS[0], a.botA, a.botB, "band", aScore);
      assert.throws(() => read(OWNER_IDS[0], a.botA, a.botB));
      write(OWNER_IDS[0], a.botA, a.botB, "band", aBand);

      write(OWNER_IDS[1], b.botA, b.botB, "score", aScore);
      assert.throws(() => read(OWNER_IDS[1], b.botA, b.botB));
      write(OWNER_IDS[1], b.botA, b.botB, "score", bScore);

      const tampered = Buffer.from(aScore);
      tampered[tampered.length - 1] ^= 0x01;
      write(OWNER_IDS[0], a.botA, a.botB, "score", tampered);
      assert.equal(
        read(OWNER_IDS[1], a.botA, a.botB),
        undefined,
      );
      assert.throws(() => read(OWNER_IDS[0], a.botA, a.botB));
    } finally {
      fixture.close();
    }
  });
});

describe("memory-content Vault legacy migration and startup ordering", () => {
  it("migrates four owners, scrubs SQLite/WAL, resumes idempotently, and rejects ordinary plaintext", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-memory-vault-"));
    const dbPath = join(tempDir, "memory-vault.sqlite");
    const userKeys = new Map<string, Buffer>();
    const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
    let db: DatabaseSync | null = null;
    try {
      db = initializeDatabase(new DatabaseSync(dbPath));
      OWNER_IDS.forEach((ownerId, index) => {
        const userKey = Buffer.alloc(32, index + 61);
        userKeys.set(ownerId, userKey);
        addLegacyOwner(db!, ownerId, userKey, legacyMasterKey);
        insertFamilyRows({
          db: db!,
          ownerId,
          marker: `legacy-${index}`,
          canary: `PRISM-2-6-LEGACY-${index}-CANARY`,
          userKey,
        });
      });
      db.close();
      db = null;
      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);

      ensureUserNotesSchema(db);
      ensureMemoryEcologyMemorySchema(db);
      OWNER_IDS.forEach((ownerId, index) => {
        const summary = db!
          .prepare(
            "SELECT summary FROM memory_summaries WHERE user_id = ? AND id = ?",
          )
          .get(ownerId, `memory-summary-legacy-${index}`) as { summary: string };
        assert.equal(summary.summary, `Summary PRISM-2-6-LEGACY-${index}-CANARY`);
        assert.ok(physicalEncryptedFixtures(db!, ownerId).length > 45);
        assert.deepEqual(
          {
            ...(db!
              .prepare(
                `SELECT phase, completed_units, total_units
                   FROM main.core_content_vault_migrations
                  WHERE user_id = ? AND contract_version = ?`,
              )
              .get(ownerId, CORE_CONTENT_VAULT_CONTRACT_VERSION) as Record<
              string,
              unknown
            >),
          },
          {
            phase: "complete",
            completed_units: (
              db!
                .prepare(
                  `SELECT total_units
                     FROM main.core_content_vault_migrations
                    WHERE user_id = ? AND contract_version = ?`,
                )
                .get(ownerId, CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
                total_units: number;
              }
            ).total_units,
            total_units: (
              db!
                .prepare(
                  `SELECT total_units
                     FROM main.core_content_vault_migrations
                    WHERE user_id = ? AND contract_version = ?`,
                )
                .get(ownerId, CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
                total_units: number;
              }
            ).total_units,
          },
        );
      });

      db.close();
      db = null;
      const diskFixtures = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
        .filter(existsSync)
        .map((path) => ({
          opaqueSurfaceId: createOpaqueCanarySurfaceId(
            "sqlite-file",
            path.slice(dbPath.length),
          ),
          kind: path.endsWith("-wal")
            ? ("sqlite-wal" as const)
            : path.endsWith("-shm")
              ? ("sqlite-shm" as const)
              : ("sqlite-main" as const),
          bytes: readFileSync(path),
        }));
      for (let index = 0; index < OWNER_IDS.length; index += 1) {
        assert.equal(
          scanForPlaintextCanary(
            `PRISM-2-6-LEGACY-${index}-CANARY`,
            diskFixtures,
          ).totalMatchCount,
          0,
        );
      }

      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
      db.prepare(
        `UPDATE main.core_content_vault_migrations
            SET phase = 'migrating'
          WHERE user_id = ? AND contract_version = ?`,
      ).run(OWNER_IDS[0], CORE_CONTENT_VAULT_CONTRACT_VERSION);
      db.close();
      db = null;
      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
      assert.equal(
        (
          db
            .prepare(
              `SELECT phase FROM main.core_content_vault_migrations
                WHERE user_id = ? AND contract_version = ?`,
            )
            .get(OWNER_IDS[0], CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
            phase: string;
          }
        ).phase,
        "complete",
      );

      db.prepare(
        `UPDATE main.memory_summaries
            SET summary = ?
          WHERE user_id = ? AND id = ?`,
      ).run(
        "ORDINARY-PLAINTEXT-INJECTION",
        OWNER_IDS[0],
        "memory-summary-legacy-0",
      );
      assert.throws(() =>
        db!
          .prepare(
            "SELECT summary FROM memory_summaries WHERE user_id = ? AND id = ?",
          )
          .get(OWNER_IDS[0], "memory-summary-legacy-0"),
      );
    } finally {
      legacyMasterKey.fill(0);
      for (const key of userKeys.values()) key.fill(0);
      db?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("upgrades a database completed under the 2.5 contract before installing expanded views", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-memory-vault-upgrade-"));
    const dbPath = join(tempDir, "memory-vault-upgrade.sqlite");
    const ownerId = OWNER_IDS[0];
    const userKey = Buffer.alloc(32, 91);
    const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
    let db: DatabaseSync | null = null;
    try {
      db = initializeDatabase(new DatabaseSync(dbPath));
      addLegacyOwner(db, ownerId, userKey, legacyMasterKey);
      const ids = insertFamilyRows({
        db,
        ownerId,
        marker: "contract-two",
        canary: "PRISM-2-5-UPGRADE-CANARY",
        userKey,
      });
      activateCoreContentVaultV2({ db, masterSecret: MASTER_SECRET });
      const originalBotNameEnvelope = Buffer.from(
        (
          db
            .prepare("SELECT name FROM main.bots WHERE user_id = ? AND id = ?")
            .get(ownerId, ids.botA) as { name: Uint8Array }
          ).name,
      );
      assert.equal(
        originalBotNameEnvelope.includes(
          Buffer.from("Memory Bot A contract-two", "utf8"),
        ),
        false,
      );
      db.close();
      db = null;

      // Recreate the durable state left by the authoritative 2.5 contract:
      // core rows are already Vault V2, while the newly assigned family is
      // still ordinary SQLite content and only contract 2 is complete.
      db = new DatabaseSync(dbPath);
      db.prepare(
        "DELETE FROM core_content_vault_migrations WHERE user_id = ?",
      ).run(ownerId);
      db.prepare(
        `INSERT INTO core_content_vault_migrations
           (user_id, contract_version, phase, completed_units, total_units, updated_at)
         VALUES (?, 2, 'complete', 0, 0, ?)`,
      ).run(ownerId, NOW);
      db.prepare(
        "UPDATE main.memory_summaries SET summary = ? WHERE user_id = ? AND id = ?",
      ).run("Summary from contract 2", ownerId, ids.summary);
      db.close();
      db = null;

      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
      assert.equal(CORE_CONTENT_VAULT_CONTRACT_VERSION, 3);
      assert.equal(
        (
          db
            .prepare(
              "SELECT summary FROM memory_summaries WHERE user_id = ? AND id = ?",
            )
            .get(ownerId, ids.summary) as { summary: string }
        ).summary,
        "Summary from contract 2",
      );
      assert.equal(
        (
          db
            .prepare("SELECT name FROM bots WHERE user_id = ? AND id = ?")
            .get(ownerId, ids.botA) as { name: string }
        ).name,
        "Memory Bot A contract-two",
      );
      const upgradedBotNameEnvelope = Buffer.from(
        (
          db
            .prepare("SELECT name FROM main.bots WHERE user_id = ? AND id = ?")
            .get(ownerId, ids.botA) as { name: Uint8Array }
        ).name,
      );
      assert.equal(
        upgradedBotNameEnvelope.includes(
          Buffer.from("Memory Bot A contract-two", "utf8"),
        ),
        false,
      );
      assert.ok(
        (
          db
            .prepare(
              "SELECT summary FROM main.memory_summaries WHERE user_id = ? AND id = ?",
            )
            .get(ownerId, ids.summary) as { summary: unknown }
        ).summary instanceof Uint8Array,
      );
      assert.equal(
        (
          db
            .prepare(
              `SELECT phase
                 FROM main.core_content_vault_migrations
                WHERE user_id = ? AND contract_version = ?`,
            )
            .get(ownerId, CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
            phase: string;
          }
        ).phase,
        "complete",
      );
    } finally {
      legacyMasterKey.fill(0);
      userKey.fill(0);
      db?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("upgrades the legacy global-mood CHECK before views and tolerates late ensure functions", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    try {
      db.exec(`
        DROP TABLE bot_global_moods;
        CREATE TABLE bot_global_moods (
          user_id TEXT NOT NULL,
          bot_id TEXT NOT NULL,
          mood_key TEXT NOT NULL DEFAULT 'neutral'
            CHECK (mood_key IN ('joyful', 'warm', 'neutral', 'guarded', 'strained')),
          source TEXT NOT NULL DEFAULT 'signal_feedback'
            CHECK (source IN ('signal_feedback', 'backup_restore')),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, bot_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
        );
      `);
      assert.equal(ensureCoreContentVaultStorageSchemaV2(db), true);
      const sql = (
        db
          .prepare(
            "SELECT sql FROM main.sqlite_master WHERE type = 'table' AND name = 'bot_global_moods'",
          )
          .get() as { sql: string }
      ).sql;
      assert.match(sql, /typeof\(mood_key\) = 'blob'/u);

      activateCoreContentVaultV2({ db, masterSecret: MASTER_SECRET });
      assert.doesNotThrow(() => ensureUserNotesSchema(db));
      assert.doesNotThrow(() => ensureMemoryEcologyMemorySchema(db));
    } finally {
      db.close();
    }
  });
});
