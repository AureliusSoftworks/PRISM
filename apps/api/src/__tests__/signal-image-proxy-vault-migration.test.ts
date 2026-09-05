import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeDatabase } from "../db.ts";
import { activateCoreContentVaultV2 } from "../core-content-vault.ts";
import { deriveMasterKey, encryptText } from "../security.ts";

test("Signal proxy migration suspends and restores encrypted-content views during table rename", () => {
  const directory = mkdtempSync(join(tmpdir(), "signal-vault-migration-"));
  const path = join(directory, "test.db");
  const masterSecret = "signal-proxy-migration-test";
  let db = initializeDatabase(new DatabaseSync(path));
  try {
    const key = deriveMasterKey(masterSecret);
    const wrapped = encryptText(Buffer.alloc(32, 7).toString("base64"), key);
    key.fill(0);
    db.prepare(`INSERT INTO users (id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
      VALUES ('owner', 'owner@example.test', 'Owner', 'hash', 'salt', ?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`)
      .run(wrapped.ciphertext, wrapped.iv, wrapped.tag);
    db.exec(`DROP TABLE botcast_episode_image_proxies;
      CREATE TABLE botcast_episode_image_proxies (
        episode_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, image_id TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'image/webp', width INTEGER NOT NULL, height INTEGER NOT NULL,
        image_bytes BLOB NOT NULL, presentation_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(episode_id) REFERENCES botcast_episodes(id) ON DELETE CASCADE);`);
    activateCoreContentVaultV2({ db, masterSecret });
    const views = () => db.prepare("SELECT name FROM sqlite_temp_master WHERE type = 'view' ORDER BY name").all();
    const before = views();
    assert.ok(before.some((row) => row.name === "conversations"));
    db.close();
    db = new DatabaseSync(path);
    assert.doesNotThrow(() => initializeDatabase(db, masterSecret));
    const after = views();
    for (const view of before) assert.ok(after.some((row) => row.name === view.name));
    assert.deepEqual(
      db.prepare("PRAGMA table_info(botcast_episode_image_proxies)").all().filter((row) => row.pk).map((row) => row.name),
      ["episode_id", "image_id"],
    );
    assert.equal(db.isTransaction, false);
    assert.doesNotThrow(() => db.prepare("SELECT id FROM conversations").all());
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
