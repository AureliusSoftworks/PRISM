import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  BOT_PROFILE_PICTURE_IMAGE_PURPOSE,
  GALLERY_EXCLUDED_PURPOSE_SQL,
  botProfilePictureImageBelongsToBot,
  clearBotProfilePictureReference,
  deleteBotProfilePictureImageIfOwned,
  normalizeBotProfilePicturePngBytes,
  parseBotProfilePictureDataUrl,
  readProfilePictureImageIdForBot,
} from "../bot-profile-pictures.ts";

function createAvatarDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      profile_picture_image_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bot_id TEXT,
      purpose TEXT,
      local_rel_path TEXT
    );
  `);
  return db;
}

function seedBot(db: DatabaseSync, id: string, userId: string, imageId: string | null = null): void {
  db.prepare(
    "INSERT INTO bots (id, user_id, profile_picture_image_id, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, userId, imageId, "2026-01-01T00:00:00.000Z");
}

function seedImage(
  db: DatabaseSync,
  id: string,
  userId: string,
  botId: string | null,
  purpose: string | null,
  localRelPath = `${id}.png`
): void {
  db.prepare(
    "INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, botId, purpose, localRelPath);
}

describe("bot profile picture upload helpers", () => {
  it("parses data URLs and normalizes uploads to bounded square PNGs", async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const parsed = parseBotProfilePictureDataUrl(
      `data:image/png;base64,${source.toString("base64")}`
    );
    assert.deepEqual(parsed, source);

    const normalized = await normalizeBotProfilePicturePngBytes(parsed);
    const metadata = await sharp(normalized).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1024);
  });

  it("rejects non-image or empty profile picture data URLs", () => {
    assert.throws(
      () => parseBotProfilePictureDataUrl("data:text/plain;base64,aGVsbG8="),
      /PNG, JPEG, or WebP data URL/
    );
    assert.throws(
      () => parseBotProfilePictureDataUrl("data:image/png;base64,"),
      /PNG, JPEG, or WebP data URL/
    );
  });
});

describe("bot profile picture ownership", () => {
  it("accepts only bot-owned profile picture images for attachment", () => {
    const db = createAvatarDb();
    seedBot(db, "bot-1", "user-1");
    seedBot(db, "bot-2", "user-1");
    seedImage(db, "profile-1", "user-1", "bot-1", BOT_PROFILE_PICTURE_IMAGE_PURPOSE);
    seedImage(db, "gallery-1", "user-1", "bot-1", "gallery");
    seedImage(db, "profile-2", "user-1", "bot-2", BOT_PROFILE_PICTURE_IMAGE_PURPOSE);
    seedImage(db, "profile-other", "user-2", "bot-1", BOT_PROFILE_PICTURE_IMAGE_PURPOSE);

    assert.equal(botProfilePictureImageBelongsToBot(db, "user-1", "bot-1", "profile-1"), true);
    assert.equal(readProfilePictureImageIdForBot(db, " profile-1 ", "user-1", "bot-1"), "profile-1");
    assert.equal(readProfilePictureImageIdForBot(db, null, "user-1", "bot-1"), null);
    assert.equal(readProfilePictureImageIdForBot(db, "   ", "user-1", "bot-1"), null);

    assert.throws(
      () => readProfilePictureImageIdForBot(db, "gallery-1", "user-1", "bot-1"),
      /not found/
    );
    assert.throws(
      () => readProfilePictureImageIdForBot(db, "profile-2", "user-1", "bot-1"),
      /not found/
    );
    assert.throws(
      () => readProfilePictureImageIdForBot(db, "profile-other", "user-1", "bot-1"),
      /not found/
    );
  });

  it("clears profile picture references only for the acting user", () => {
    const db = createAvatarDb();
    seedBot(db, "mine", "user-1", "profile-1");
    seedBot(db, "mine-other-image", "user-1", "profile-2");
    seedBot(db, "theirs", "user-2", "profile-1");

    clearBotProfilePictureReference(db, "user-1", "profile-1", "2026-02-01T00:00:00.000Z");

    const rows = db
      .prepare("SELECT id, profile_picture_image_id, updated_at FROM bots ORDER BY id")
      .all() as Array<{
      id: string;
      profile_picture_image_id: string | null;
      updated_at: string;
    }>;
    assert.deepEqual(
      rows.map((row) => [row.id, row.profile_picture_image_id, row.updated_at]),
      [
        ["mine", null, "2026-02-01T00:00:00.000Z"],
        ["mine-other-image", "profile-2", "2026-01-01T00:00:00.000Z"],
        ["theirs", "profile-1", "2026-01-01T00:00:00.000Z"],
      ]
    );
  });

  it("deletes only owned profile picture image rows and files", () => {
    const db = createAvatarDb();
    seedImage(db, "profile-1", "user-1", "bot-1", BOT_PROFILE_PICTURE_IMAGE_PURPOSE, "profile-1.png");
    seedImage(db, "gallery-1", "user-1", "bot-1", "gallery", "gallery-1.png");
    seedImage(db, "profile-2", "user-1", "bot-2", BOT_PROFILE_PICTURE_IMAGE_PURPOSE, "profile-2.png");
    const unlinked: string[] = [];

    deleteBotProfilePictureImageIfOwned(db, "user-1", "bot-1", "profile-1", (rel) => {
      if (rel) unlinked.push(rel);
    });
    deleteBotProfilePictureImageIfOwned(db, "user-1", "bot-1", "gallery-1", (rel) => {
      if (rel) unlinked.push(rel);
    });
    deleteBotProfilePictureImageIfOwned(db, "user-1", "bot-1", "profile-2", (rel) => {
      if (rel) unlinked.push(rel);
    });

    const remaining = db
      .prepare("SELECT id FROM images ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["gallery-1", "profile-2"]
    );
    assert.deepEqual(unlinked, ["profile-1.png"]);
  });
});

describe("bot profile picture gallery filtering", () => {
  it("excludes profile pictures and wallpapers from normal image gallery queries", () => {
    const db = createAvatarDb();
    seedImage(db, "avatar", "user-1", "bot-1", BOT_PROFILE_PICTURE_IMAGE_PURPOSE);
    seedImage(db, "gallery", "user-1", null, "gallery");
    seedImage(db, "legacy", "user-1", null, null);
    seedImage(db, "wallpaper", "user-1", null, "wallpaper");

    const listed = db
      .prepare(`SELECT id FROM images WHERE user_id = ? AND ${GALLERY_EXCLUDED_PURPOSE_SQL} ORDER BY id`)
      .all("user-1") as Array<{ id: string }>;
    assert.deepEqual(
      listed.map((row) => row.id),
      ["gallery", "legacy"]
    );

    db.prepare(`DELETE FROM images WHERE user_id = ? AND ${GALLERY_EXCLUDED_PURPOSE_SQL}`).run("user-1");
    const remaining = db
      .prepare("SELECT id FROM images ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["avatar", "wallpaper"]
    );
  });
});
