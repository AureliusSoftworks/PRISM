import type { DatabaseSync } from "node:sqlite";

interface TableColumnInfo {
  name: string;
  pk: number;
}

function cachePrimaryKey(db: DatabaseSync): string[] {
  return (
    db
      .prepare("PRAGMA main.table_info(debate_mystery_audio_cache)")
      .all() as unknown as TableColumnInfo[]
  )
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
}

/**
 * Removes the legacy installation-global cache-key constraint. Every audio row
 * and reference is relationally owned by `(user_id, cache_key)`, so identical
 * synthesis contracts may coexist and be deleted independently in A-D.
 */
export function ensureDebateMysteryAudioOwnerSchemaV2(
  db: DatabaseSync,
): boolean {
  const primaryKey = cachePrimaryKey(db);
  if (
    primaryKey.length === 2 &&
    primaryKey[0] === "user_id" &&
    primaryKey[1] === "cache_key"
  ) {
    return false;
  }
  if (primaryKey.length !== 1 || primaryKey[0] !== "cache_key") {
    throw new Error("Whodunnit audio ownership schema is invalid.");
  }
  if (db.isTransaction) {
    throw new Error("Whodunnit audio ownership migration requires an idle database.");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      ALTER TABLE debate_mystery_audio_refs
        RENAME TO __debate_mystery_audio_refs_owner_v1;
      ALTER TABLE debate_mystery_audio_cache
        RENAME TO __debate_mystery_audio_cache_owner_v1;

      CREATE TABLE debate_mystery_audio_cache (
        user_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        clip_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK(byte_size > 0),
        duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
        ref_count INTEGER NOT NULL DEFAULT 0 CHECK(ref_count >= 0),
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        PRIMARY KEY(user_id, cache_key),
        UNIQUE(user_id, clip_path),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      ) WITHOUT ROWID;

      CREATE TABLE debate_mystery_audio_refs (
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        line_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(session_id, line_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES debate_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id, cache_key)
          REFERENCES debate_mystery_audio_cache(user_id, cache_key)
          ON UPDATE CASCADE ON DELETE RESTRICT
      ) WITHOUT ROWID;

      INSERT INTO debate_mystery_audio_cache (
        user_id, cache_key, clip_path, mime_type, sha256, byte_size,
        duration_ms, ref_count, created_at, last_used_at
      )
      SELECT user_id, cache_key, clip_path, mime_type, sha256, byte_size,
             duration_ms, ref_count, created_at, last_used_at
        FROM __debate_mystery_audio_cache_owner_v1;

      INSERT INTO debate_mystery_audio_refs (
        session_id, user_id, line_id, cache_key, created_at
      )
      SELECT session_id, user_id, line_id, cache_key, created_at
        FROM __debate_mystery_audio_refs_owner_v1;

      DROP TABLE __debate_mystery_audio_refs_owner_v1;
      DROP TABLE __debate_mystery_audio_cache_owner_v1;

      CREATE INDEX idx_debate_mystery_audio_cache_cleanup
        ON debate_mystery_audio_cache(user_id, ref_count, last_used_at);
      CREATE INDEX idx_debate_mystery_audio_refs_cache
        ON debate_mystery_audio_refs(user_id, cache_key);
      CREATE TRIGGER debate_mystery_audio_ref_deleted
        AFTER DELETE ON debate_mystery_audio_refs
        BEGIN
          UPDATE debate_mystery_audio_cache
             SET ref_count = MAX(0, ref_count - 1),
                 last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE user_id = OLD.user_id AND cache_key = OLD.cache_key;
        END;
    `);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
