import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { replaceProtectedDebateMysteryMansionAssetsV1 } from "../debate-mystery-mansion-bundles.ts";

function testDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE debate_mystery_asset_vault (
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      ciphertext BLOB,
      cipher_iv BLOB,
      cipher_tag BLOB,
      sha256 TEXT,
      byte_size INTEGER,
      provider TEXT,
      model TEXT
    );
    CREATE TABLE debate_mystery_mansion_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ciphertext BLOB NOT NULL,
      cipher_iv BLOB NOT NULL,
      cipher_tag BLOB NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, sha256)
    );
    CREATE TABLE debate_mystery_mansion_asset_refs (
      bundle_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      role TEXT NOT NULL,
      logical_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(bundle_id, role, logical_id)
    );
  `);
  return db;
}

function addVaultAsset(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  kind: "room" | "evidence",
  subjectId: string,
  content: string,
): void {
  const bytes = Buffer.from(content);
  db.prepare(
    `INSERT INTO debate_mystery_asset_vault
       (user_id, session_id, subject_id, kind, status, mime_type,
        ciphertext, cipher_iv, cipher_tag, sha256, byte_size, provider, model)
     VALUES (?, ?, ?, ?, 'ready', 'image/webp', ?, ?, ?, ?, ?, 'test', 'test')`,
  ).run(
    userId,
    sessionId,
    subjectId,
    kind,
    Buffer.from(`cipher:${content}`),
    Buffer.from("iv"),
    Buffer.from("tag"),
    createHash("sha256").update(bytes).digest("hex"),
    bytes.length,
  );
}

describe("saved mansion protected asset ownership", () => {
  it("deduplicates by tenant, anonymizes props, and replaces refs without orphaning bytes", () => {
    const db = testDb();
    addVaultAsset(db, "user-1", "session-1", "room", "library", "room bytes");
    addVaultAsset(db, "user-1", "session-1", "evidence", "culprit-letter", "prop bytes");

    db.exec("BEGIN IMMEDIATE");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "bundle-1", "session-1");
    db.exec("COMMIT");

    assert.deepEqual(
      (db.prepare(
        `SELECT role, logical_id FROM debate_mystery_mansion_asset_refs
          WHERE user_id = ? ORDER BY role, logical_id`,
      ).all("user-1") as unknown as Array<{ role: string; logical_id: string }>)
        .map((row) => ({ ...row })),
      [
        { role: "prop", logical_id: "prop-001" },
        { role: "room", logical_id: "library" },
      ],
    );
    assert.equal(
      JSON.stringify(db.prepare(
        "SELECT logical_id FROM debate_mystery_mansion_asset_refs WHERE user_id = ?",
      ).all("user-1")).includes("culprit-letter"),
      false,
    );

    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "bundle-1", "session-1");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = ?")
        .get("user-1") as { count: number }).count,
      2,
    );

    addVaultAsset(db, "user-2", "session-2", "room", "library", "room bytes");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-2", "bundle-2", "session-2");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets")
        .get() as { count: number }).count,
      3,
    );

    db.prepare(
      "DELETE FROM debate_mystery_asset_vault WHERE user_id = ? AND session_id = ? AND kind = 'evidence'",
    ).run("user-1", "session-1");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "bundle-1", "session-1");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = ?")
        .get("user-1") as { count: number }).count,
      1,
    );
  });
});
