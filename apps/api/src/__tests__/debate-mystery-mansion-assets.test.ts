import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1 } from "@localai/shared";
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
      model TEXT,
      review_json TEXT NOT NULL DEFAULT '{}'
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
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
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
        ciphertext, cipher_iv, cipher_tag, sha256, byte_size, provider, model, review_json)
     VALUES (?, ?, ?, ?, 'ready', 'image/webp', ?, ?, ?, ?, ?, 'test', 'test', '{}')`,
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
  it("keeps unvisited room and audio assets while accepted case repairs take precedence", () => {
    const db = testDb();
    addVaultAsset(db, "user-1", "source", "room", "library", "original library");
    addVaultAsset(db, "user-1", "source", "room", "foyer", "unvisited foyer");
    addVaultAsset(db, "user-1", "source", "room", "music", "original music");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "source-bundle", "source");
    db.prepare(`UPDATE debate_mystery_mansion_asset_refs
      SET role = 'music', logical_id = 'investigation-theme-v1'
      WHERE bundle_id = 'source-bundle' AND logical_id = 'music'`).run();
    const retained = db.prepare(`SELECT asset_id AS id, role, logical_id AS logicalId
      FROM debate_mystery_mansion_asset_refs WHERE bundle_id = 'source-bundle'`)
      .all() as unknown as Array<{ id: string; role: "room" | "music"; logicalId: string }>;
    const ref = (bundleId: string, logicalId: string): string | undefined =>
      (db.prepare(`SELECT asset_id FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND logical_id = ?`).get(bundleId, logicalId) as
          { asset_id: string } | undefined)?.asset_id;

    addVaultAsset(db, "user-1", "unfinished-case", "room", "library", "repaired library");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "saved", "unfinished-case", retained);
    assert.notEqual(ref("saved", "library"), ref("source-bundle", "library"));
    assert.equal(ref("saved", "foyer"), ref("source-bundle", "foyer"));
    assert.equal(ref("saved", "investigation-theme-v1"), ref("source-bundle", "investigation-theme-v1"));

    addVaultAsset(db, "user-1", "new-audio", "room", "music", "repaired music");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "new-audio-bundle", "new-audio");
    const repairedMusicId = ref("new-audio-bundle", "music")!;
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "saved", "unfinished-case",
      retained.map((asset) => asset.role === "music" ? { ...asset, id: repairedMusicId } : asset));
    assert.equal(ref("saved", "investigation-theme-v1"), repairedMusicId);
    assert.equal(ref("saved", "foyer"), ref("source-bundle", "foyer"));

    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-2", "other-tenant", "empty", retained);
    assert.equal(ref("other-tenant", "foyer"), undefined, "retention must remain tenant-scoped");
    db.close();
  });

  it("deduplicates by tenant, anonymizes props, and replaces refs without orphaning bytes", () => {
    const db = testDb();
    addVaultAsset(db, "user-1", "session-1", "room", "library", "room bytes");
    addVaultAsset(
      db,
      "user-1",
      "session-1",
      "room",
      DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1,
      "exterior bytes",
    );
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
        { role: "presentation", logical_id: DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1 },
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
      3,
    );

    addVaultAsset(db, "user-2", "session-2", "room", "library", "room bytes");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-2", "bundle-2", "session-2");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets")
        .get() as { count: number }).count,
      4,
    );

    db.prepare(
      "DELETE FROM debate_mystery_asset_vault WHERE user_id = ? AND session_id = ? AND kind = 'evidence'",
    ).run("user-1", "session-1");
    replaceProtectedDebateMysteryMansionAssetsV1(db, "user-1", "bundle-1", "session-1");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = ?")
        .get("user-1") as { count: number }).count,
      2,
    );
  });
});
