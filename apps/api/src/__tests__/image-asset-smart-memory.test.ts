import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";
import { DatabaseSync } from "node:sqlite";
import {
  IMAGE_ASSET_SMART_TAG_MAX,
  IMAGE_ASSET_SMART_TAG_MIN,
} from "@localai/shared";
import { ensureImageAssetLibrarySchema } from "../image-asset-library.ts";
import {
  computeReuseScore,
  encodePromptAttachmentRaster,
  heuristicSmartTags,
  migrateImageAssetSetToCold,
  normalizeSmartTags,
  previewSmartTidyCandidates,
  recordImageAssetAccess,
  warmImageAssetSet,
  IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX,
} from "../image-asset-smart-memory.ts";
import {
  buildGeneratedImageRelativePath,
  isColdGeneratedImageRelativePath,
  readGeneratedImageBytes,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

function createTestDb(tempDir: string): DatabaseSync {
  process.env.DB_PATH = join(tempDir, "localai.db");
  delete process.env.LOCALAI_DATA_DIR;
  const db = new DatabaseSync(join(tempDir, "localai.db"));
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      related_bot_ids TEXT,
      origin TEXT,
      prompt TEXT NOT NULL DEFAULT '',
      revised_prompt TEXT,
      url TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      quality TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'local',
      local_rel_path TEXT,
      model TEXT,
      purpose TEXT,
      created_at TEXT NOT NULL
    );
  `);
  ensureImageAssetLibrarySchema(db);
  return db;
}

describe("image asset smart memory", () => {
  it("clamps smart tags to 3–6 labels", () => {
    const few = normalizeSmartTags(["boot"]);
    assert.equal(few.length, IMAGE_ASSET_SMART_TAG_MIN);
    const many = normalizeSmartTags([
      "boot",
      "leather",
      "old",
      "brown",
      "worn",
      "rustic",
      "extra",
      "noise",
    ]);
    assert.equal(many.length, IMAGE_ASSET_SMART_TAG_MAX);
    const heuristics = heuristicSmartTags({
      kind: "debate_exhibit",
      title: "Old leather boot",
      prompt: "A weathered brown leather boot on a wooden floor",
    });
    assert.ok(heuristics.length >= IMAGE_ASSET_SMART_TAG_MIN);
    assert.ok(heuristics.length <= IMAGE_ASSET_SMART_TAG_MAX);
  });

  it("protects high reuse scores in curated junk preview", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-smart-memory-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    try {
      const db = createTestDb(tempDir);
      const userId = "user-1";
      db.prepare("INSERT INTO users (id, username) VALUES (?, ?)").run(
        userId,
        "tester",
      );
      const old = "2010-01-01T00:00:00.000Z";
      db.prepare(
        `INSERT INTO image_asset_sets
           (id, user_id, kind, status, title, source, automatic_tags_json,
            player_tags_json, storage_tier, access_count, last_accessed_at,
            reuse_score, created_at, updated_at)
         VALUES (?, ?, 'general_image', 'ready', 'Protected boot', 'generated',
                 '["boot","leather","old"]', '[]', 'hot', 8, ?, 8, ?, ?)`,
      ).run("set-protect", userId, old, old, old);
      db.prepare(
        `INSERT INTO image_asset_sets
           (id, user_id, kind, status, title, source, automatic_tags_json,
            player_tags_json, storage_tier, access_count, last_accessed_at,
            reuse_score, created_at, updated_at)
         VALUES (?, ?, 'general_image', 'ready', 'Abandoned boot', 'generated',
                 '["boot","dusty","shelf"]', '[]', 'hot', 0, ?, 0, ?, ?)`,
      ).run("set-junk", userId, old, old, old);

      const preview = previewSmartTidyCandidates(db, userId, {
        now: new Date("2026-08-06T00:00:00.000Z"),
      });
      assert.ok(preview.protectedHighReuseCount >= 1);
      assert.ok(preview.assetSetIds.includes("set-junk"));
      assert.equal(preview.assetSetIds.includes("set-protect"), false);
      assert.ok(computeReuseScore({ accessCount: 5, usageCount: 1, lastAccessedAt: null }) >= 3);
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("migrates hot PNG to cold WebP and warms back", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-smart-cold-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    try {
      const db = createTestDb(tempDir);
      const userId = "user-1";
      const imageId = "image-1";
      db.prepare("INSERT INTO users (id, username) VALUES (?, ?)").run(
        userId,
        "tester",
      );
      const png = await sharp({
        create: {
          width: 64,
          height: 48,
          channels: 3,
          background: { r: 40, g: 90, b: 160 },
        },
      })
        .png()
        .toBuffer();
      const rel = buildGeneratedImageRelativePath(userId, imageId);
      writeGeneratedImageBytes(rel, png);
      const old = "2010-01-01T00:00:00.000Z";
      db.prepare(
        `INSERT INTO images
           (id, user_id, origin, prompt, url, size, quality, provider,
            local_rel_path, purpose, created_at)
         VALUES (?, ?, 'images_panel', 'boot', '/api/images/image-1/file',
                 '1024x1024', 'standard', 'local', ?, 'gallery', ?)`,
      ).run(imageId, userId, rel, old);
      db.prepare(
        `INSERT INTO image_asset_sets
           (id, user_id, kind, status, title, source, automatic_tags_json,
            player_tags_json, storage_tier, access_count, reuse_score,
            created_at, updated_at)
         VALUES ('set-1', ?, 'general_image', 'ready', 'Boot', 'generated',
                 '["boot","leather","old"]', '[]', 'hot', 0, 0, ?, ?)`,
      ).run(userId, old, old);
      db.prepare(
        `INSERT INTO image_asset_set_items (set_id, image_id, role, ordinal)
         VALUES ('set-1', ?, 'primary', 0)`,
      ).run(imageId);

      const migrated = await migrateImageAssetSetToCold(db, userId, "set-1", {
        force: true,
      });
      assert.equal(migrated.migratedMembers, 1);
      const coldRow = db
        .prepare("SELECT local_rel_path FROM images WHERE id = ?")
        .get(imageId) as { local_rel_path: string };
      assert.equal(isColdGeneratedImageRelativePath(coldRow.local_rel_path), true);
      assert.ok(readGeneratedImageBytes(coldRow.local_rel_path).length > 0);

      const warmed = await warmImageAssetSet(db, userId, "set-1");
      assert.equal(warmed.warmedMembers, 1);
      const hotRow = db
        .prepare("SELECT local_rel_path FROM images WHERE id = ?")
        .get(imageId) as { local_rel_path: string };
      assert.equal(hotRow.local_rel_path.endsWith(".png"), true);

      recordImageAssetAccess(db, userId, imageId, { force: true });
      const access = db
        .prepare("SELECT access_count FROM image_asset_sets WHERE id = 'set-1'")
        .get() as { access_count: number | bigint };
      assert.ok(Number(access.access_count) >= 1);
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("downscales prompt attachments without exceeding the max edge", async () => {
    const large = await sharp({
      create: {
        width: 2048,
        height: 1536,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const encoded = await encodePromptAttachmentRaster(large);
    const meta = await sharp(encoded.bytes).metadata();
    assert.ok((meta.width ?? 0) <= IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX);
    assert.ok((meta.height ?? 0) <= IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX);
    assert.equal(encoded.contentType, "image/png");
  });
});
