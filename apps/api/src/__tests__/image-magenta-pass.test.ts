import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { initializeDatabase } from "../db.ts";
import {
  applyAutomaticMagentaCleanupPasses,
  applyImageAssetMagentaPass,
  AUTOMATIC_MAGENTA_CLEANUP_PASSES,
  undoImageAssetMagentaPass,
} from "../image-magenta-pass.ts";
import {
  getImageAssetSet,
  imageAssetStorageSummary,
  synchronizeImageAssetCatalog,
} from "../image-asset-library.ts";
import {
  readGeneratedImageBytes,
  resolveAbsoluteUnderDataRoot,
  thumbWebpRelativePathFromPngRelativePath,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

const NOW = "2026-08-04T12:00:00.000Z";
const USER_KEY = Buffer.alloc(32, 19);

async function keyedPng(width = 8, height = 8): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = pixel === width * height - 1 ? 0 : 12;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = pixel === width * height - 1 ? 0 : 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
        wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'key', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, NOW, NOW);
}

function seedImage(
  db: DatabaseSync,
  args: {
    id: string;
    userId: string;
    origin: string;
    purpose: string;
    bytes: Buffer;
  },
): string {
  const localRelPath = `generated-images/${args.userId}/${args.id}.png`;
  writeGeneratedImageBytes(localRelPath, args.bytes);
  db.prepare(
    `INSERT INTO images
       (id, user_id, origin, prompt, url, provider, model, purpose,
        local_rel_path, created_at)
     VALUES (?, ?, ?, 'Magenta fixture', '', 'openai', 'test-model', ?, ?, ?)`,
  ).run(
    args.id,
    args.userId,
    args.origin,
    args.purpose,
    localRelPath,
    NOW,
  );
  return localRelPath;
}

async function withFixture(
  run: (args: { db: DatabaseSync; root: string }) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "prism-magenta-pass-"));
  const previousDbPath = process.env.DB_PATH;
  const previousDataDir = process.env.LOCALAI_DATA_DIR;
  process.env.DB_PATH = join(root, "localai.db");
  delete process.env.LOCALAI_DATA_DIR;
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  try {
    await run({ db, root });
  } finally {
    db.close();
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
    else process.env.LOCALAI_DATA_DIR = previousDataDir;
    rmSync(root, { recursive: true, force: true });
  }
}

describe("asset magenta pass", () => {
  it("applies up to five automatic local cleanup passes after keyed cutout", async () => {
    const source = await keyedPng(16, 16);
    const result = await applyAutomaticMagentaCleanupPasses(source);
    assert.equal(AUTOMATIC_MAGENTA_CLEANUP_PASSES, 5);
    assert.ok(result.passesApplied >= 1);
    assert.ok(result.passesApplied <= AUTOMATIC_MAGENTA_CLEANUP_PASSES);
    assert.ok(result.totalChangedPixels > 0);
    assert.notEqual(result.pngBytes.equals(source), true);

    const noop = await applyAutomaticMagentaCleanupPasses(source, 0);
    assert.equal(noop.passesApplied, 0);
    assert.equal(noop.totalChangedPixels, 0);
    assert.equal(noop.pngBytes.equals(source), true);
  });

  it("compounds locally and undoes each encrypted revision in order", async () => {
    await withFixture(async ({ db }) => {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      const original = await keyedPng();
      const localRelPath = seedImage(db, {
        id: "image-1",
        userId: "user-1",
        origin: "images_panel",
        purpose: "gallery",
        bytes: original,
      });
      synchronizeImageAssetCatalog(db, "user-1");
      const setId = db
        .prepare(
          "SELECT set_id FROM image_asset_set_items WHERE image_id = 'image-1'",
        )
        .get() as { set_id: string };

      const first = await applyImageAssetMagentaPass({
        db,
        userId: "user-1",
        setId: setId.set_id,
        userKey: USER_KEY,
        now: new Date("2026-08-04T12:00:01.000Z"),
      });
      assert.ok(first.changedPixels > 0);
      assert.equal(first.passCount, 1);
      assert.ok(imageAssetStorageSummary(db, "user-1").revisionBytes > 0);
      const afterFirst = readGeneratedImageBytes(localRelPath);
      const firstPixel = await sharp(afterFirst).ensureAlpha().raw().toBuffer();
      assert.ok(firstPixel[1]! > 12);
      assert.ok(firstPixel[3]! < 255);
      assert.equal(
        existsSync(
          resolveAbsoluteUnderDataRoot(
            thumbWebpRelativePathFromPngRelativePath(localRelPath),
          ),
        ),
        true,
      );

      const encrypted = db
        .prepare(
          `SELECT ciphertext FROM image_asset_magenta_revision_items
            WHERE image_id = 'image-1'`,
        )
        .get() as { ciphertext: Uint8Array };
      assert.notEqual(
        Buffer.from(encrypted.ciphertext).subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a",
      );

      const second = await applyImageAssetMagentaPass({
        db,
        userId: "user-1",
        setId: setId.set_id,
        userKey: USER_KEY,
        now: new Date("2026-08-04T12:00:02.000Z"),
      });
      assert.equal(second.passCount, 2);
      const afterSecond = readGeneratedImageBytes(localRelPath);
      const secondPixel = await sharp(afterSecond).ensureAlpha().raw().toBuffer();
      assert.ok(secondPixel[1]! > firstPixel[1]!);
      assert.ok(secondPixel[3]! < firstPixel[3]!);

      await undoImageAssetMagentaPass({
        db,
        userId: "user-1",
        setId: setId.set_id,
        userKey: USER_KEY,
      });
      assert.deepEqual(readGeneratedImageBytes(localRelPath), afterFirst);
      const finalUndo = await undoImageAssetMagentaPass({
        db,
        userId: "user-1",
        setId: setId.set_id,
        userKey: USER_KEY,
      });
      assert.deepEqual(readGeneratedImageBytes(localRelPath), original);
      assert.equal(finalUndo.undoAvailable, false);
      assert.equal(getImageAssetSet(db, "user-1", setId.set_id)?.magentaPassCount, 0);
      assert.equal(imageAssetStorageSummary(db, "user-1").revisionBytes, 0);
      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM image_asset_magenta_revisions",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        0,
      );

      await assert.rejects(
        applyImageAssetMagentaPass({
          db,
          userId: "user-2",
          setId: setId.set_id,
          userKey: USER_KEY,
        }),
        /unavailable/iu,
      );
    });
  });

  it("updates a Signal pair and its derived lighting map as one undoable pass", async () => {
    await withFixture(async ({ db }) => {
      seedUser(db, "user-1");
      const source = await keyedPng(16, 12);
      const oldLighting = await sharp({
        create: {
          width: 16,
          height: 12,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0.2 },
        },
      })
        .png()
        .toBuffer();
      const paths = {
        light: seedImage(db, {
          id: "light",
          userId: "user-1",
          origin: "botcast",
          purpose: "signal_studio_day",
          bytes: source,
        }),
        dark: seedImage(db, {
          id: "dark",
          userId: "user-1",
          origin: "botcast",
          purpose: "signal_studio_night",
          bytes: source,
        }),
        lighting: seedImage(db, {
          id: "lighting",
          userId: "user-1",
          origin: "botcast",
          purpose: "signal_studio_lighting",
          bytes: oldLighting,
        }),
      };
      db.prepare(
        `INSERT INTO image_asset_sets
           (id, user_id, kind, status, title, source, created_at, updated_at)
         VALUES ('studio-set', 'user-1', 'signal_studio', 'ready', 'Studio',
                 'generated', ?, ?)`,
      ).run(NOW, NOW);
      const insertItem = db.prepare(
        `INSERT INTO image_asset_set_items(set_id, image_id, role, ordinal)
         VALUES ('studio-set', ?, ?, ?)`,
      );
      insertItem.run("light", "light", 0);
      insertItem.run("dark", "dark", 1);
      insertItem.run("lighting", "lighting", 2);

      await applyImageAssetMagentaPass({
        db,
        userId: "user-1",
        setId: "studio-set",
        userKey: USER_KEY,
      });
      assert.notDeepEqual(readGeneratedImageBytes(paths.light), source);
      assert.notDeepEqual(readGeneratedImageBytes(paths.dark), source);
      assert.notDeepEqual(readGeneratedImageBytes(paths.lighting), oldLighting);

      await undoImageAssetMagentaPass({
        db,
        userId: "user-1",
        setId: "studio-set",
        userKey: USER_KEY,
      });
      assert.deepEqual(readGeneratedImageBytes(paths.light), source);
      assert.deepEqual(readGeneratedImageBytes(paths.dark), source);
      assert.deepEqual(readGeneratedImageBytes(paths.lighting), oldLighting);
    });
  });
});
