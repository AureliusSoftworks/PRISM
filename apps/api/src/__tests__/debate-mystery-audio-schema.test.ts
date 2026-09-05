import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ensureDebateMysteryAudioOwnerSchemaV2 } from "../debate-mystery-audio-schema.ts";
import { debateMysteryOwnerAudioCacheKeyV2 } from "../debate-mystery-v2.ts";

describe("Whodunnit audio owner schema", () => {
  it("migrates the global key and lets four owners hold identical contracts independently", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE debate_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE debate_mystery_audio_cache (
        cache_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        clip_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK(byte_size > 0),
        duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
        ref_count INTEGER NOT NULL DEFAULT 0 CHECK(ref_count >= 0),
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        UNIQUE(user_id, clip_path),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE debate_mystery_audio_refs (
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        line_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(session_id, line_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES debate_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(cache_key) REFERENCES debate_mystery_audio_cache(cache_key) ON DELETE RESTRICT
      );
      CREATE INDEX idx_debate_mystery_audio_cache_cleanup
        ON debate_mystery_audio_cache(user_id, ref_count, last_used_at);
      CREATE INDEX idx_debate_mystery_audio_refs_cache
        ON debate_mystery_audio_refs(cache_key);
      CREATE TRIGGER debate_mystery_audio_ref_deleted
        AFTER DELETE ON debate_mystery_audio_refs
        BEGIN
          UPDATE debate_mystery_audio_cache
             SET ref_count = MAX(0, ref_count - 1)
           WHERE cache_key = OLD.cache_key AND user_id = OLD.user_id;
        END;
    `);
    for (const owner of ["owner-a", "owner-b", "owner-c", "owner-d"]) {
      db.prepare("INSERT INTO users (id) VALUES (?)").run(owner);
      db.prepare("INSERT INTO debate_sessions (id, user_id) VALUES (?, ?)").run(
        `session-${owner}`,
        owner,
      );
    }
    db.prepare(
      `INSERT INTO debate_mystery_audio_cache
         (cache_key, user_id, clip_path, mime_type, sha256, byte_size,
          duration_ms, ref_count, created_at, last_used_at)
       VALUES ('legacy-global-key', 'owner-a', 'a.wav', 'audio/wav', 'hash',
               8, 100, 1, 'now', 'now')`,
    ).run();
    db.prepare(
      `INSERT INTO debate_mystery_audio_refs
         (session_id, user_id, line_id, cache_key, created_at)
       VALUES ('session-owner-a', 'owner-a', 'line', 'legacy-global-key', 'now')`,
    ).run();

    assert.equal(ensureDebateMysteryAudioOwnerSchemaV2(db), true);
    assert.equal(ensureDebateMysteryAudioOwnerSchemaV2(db), false);

    const contract = { textHash: "same", voiceHash: "same", model: "same" };
    const keys = ["owner-a", "owner-b", "owner-c", "owner-d"].map((owner) =>
      debateMysteryOwnerAudioCacheKeyV2(owner, contract),
    );
    assert.equal(new Set(keys).size, 4);
    for (let index = 1; index < 4; index += 1) {
      const owner = `owner-${String.fromCharCode(97 + index)}`;
      db.prepare(
        `INSERT INTO debate_mystery_audio_cache
           (user_id, cache_key, clip_path, mime_type, sha256, byte_size,
            duration_ms, ref_count, created_at, last_used_at)
         VALUES (?, 'legacy-global-key', ?, 'audio/wav', 'hash', 8, 100, 1,
                 'now', 'now')`,
      ).run(owner, `${owner}.wav`);
      db.prepare(
        `INSERT INTO debate_mystery_audio_refs
           (session_id, user_id, line_id, cache_key, created_at)
         VALUES (?, ?, 'line', 'legacy-global-key', 'now')`,
      ).run(`session-${owner}`, owner);
    }

    db.prepare(
      "DELETE FROM debate_mystery_audio_refs WHERE user_id = 'owner-a'",
    ).run();
    assert.equal(
      (
        db
          .prepare(
            "SELECT ref_count FROM debate_mystery_audio_cache WHERE user_id = 'owner-a' AND cache_key = 'legacy-global-key'",
          )
          .get() as { ref_count: number }
      ).ref_count,
      0,
    );
    assert.deepEqual(
      (
        db
          .prepare(
            "SELECT user_id, ref_count FROM debate_mystery_audio_cache WHERE user_id <> 'owner-a' ORDER BY user_id",
          )
          .all() as unknown as Array<{ user_id: string; ref_count: number }>
      ).map((row) => ({ ...row })),
      [
        { user_id: "owner-b", ref_count: 1 },
        { user_id: "owner-c", ref_count: 1 },
        { user_id: "owner-d", ref_count: 1 },
      ],
    );
    db.prepare("DELETE FROM users WHERE id = 'owner-a'").run();
    assert.equal(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM debate_mystery_audio_cache")
          .get() as { count: number }
      ).count,
      3,
    );
    db.close();
  });
});
