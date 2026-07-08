import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  BOT_ACCESSORY_IMAGE_PURPOSE,
  botAccessoryImageBelongsToBot,
  clearBotAccessoryReference,
  deleteBotAccessoryImageIfOwned,
  normalizeBotAccessoryPngBytes,
  parseBotAccessoryDataUrl,
} from "../bot-accessories.ts";

function createAccessoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      accessory_image_id TEXT,
      accessory_x_pct REAL NOT NULL DEFAULT 0,
      accessory_y_pct REAL NOT NULL DEFAULT 0,
      accessory_size_pct REAL NOT NULL DEFAULT 100,
      accessory_layer TEXT NOT NULL DEFAULT 'front',
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
    "INSERT INTO bots (id, user_id, accessory_image_id, accessory_x_pct, accessory_y_pct, accessory_size_pct, accessory_layer, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, imageId, 12, -7, 128, "back", "2026-01-01T00:00:00.000Z");
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

describe("bot accessory upload helpers", () => {
  it("parses alpha-capable data URLs and normalizes uploads to transparent 512 PNGs", async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const parsed = parseBotAccessoryDataUrl(
      `data:image/png;base64,${source.toString("base64")}`
    );
    assert.deepEqual(parsed, source);

    const normalized = await normalizeBotAccessoryPngBytes(parsed);
    const metadata = await sharp(normalized).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.channels, 4);
  });

  it("rejects non-alpha-oriented accessory data URLs", () => {
    assert.throws(
      () => parseBotAccessoryDataUrl("data:image/jpeg;base64,aGVsbG8="),
      /transparent PNG or WebP/
    );
    assert.throws(
      () => parseBotAccessoryDataUrl("data:text/plain;base64,aGVsbG8="),
      /transparent PNG or WebP/
    );
  });
});

describe("bot accessory ownership", () => {
  it("accepts only bot-owned accessory images", () => {
    const db = createAccessoryDb();
    seedBot(db, "bot-1", "user-1");
    seedBot(db, "bot-2", "user-1");
    seedImage(db, "accessory-1", "user-1", "bot-1", BOT_ACCESSORY_IMAGE_PURPOSE);
    seedImage(db, "gallery-1", "user-1", "bot-1", "gallery");
    seedImage(db, "accessory-2", "user-1", "bot-2", BOT_ACCESSORY_IMAGE_PURPOSE);
    seedImage(db, "accessory-other", "user-2", "bot-1", BOT_ACCESSORY_IMAGE_PURPOSE);

    assert.equal(botAccessoryImageBelongsToBot(db, "user-1", "bot-1", "accessory-1"), true);
    assert.equal(botAccessoryImageBelongsToBot(db, "user-1", "bot-1", "gallery-1"), false);
    assert.equal(botAccessoryImageBelongsToBot(db, "user-1", "bot-1", "accessory-2"), false);
    assert.equal(botAccessoryImageBelongsToBot(db, "user-1", "bot-1", "accessory-other"), false);
  });

  it("clears accessory references only for the acting user", () => {
    const db = createAccessoryDb();
    seedBot(db, "mine", "user-1", "accessory-1");
    seedBot(db, "mine-other-image", "user-1", "accessory-2");
    seedBot(db, "theirs", "user-2", "accessory-1");

    clearBotAccessoryReference(db, "user-1", "accessory-1", "2026-02-01T00:00:00.000Z");

    const rows = db
      .prepare("SELECT id, accessory_image_id, accessory_x_pct, accessory_y_pct, accessory_size_pct, accessory_layer, updated_at FROM bots ORDER BY id")
      .all() as Array<{
      id: string;
      accessory_image_id: string | null;
      accessory_x_pct: number;
      accessory_y_pct: number;
      accessory_size_pct: number;
      accessory_layer: string;
      updated_at: string;
    }>;
    assert.deepEqual(
      rows.map((row) => [
        row.id,
        row.accessory_image_id,
        row.accessory_x_pct,
        row.accessory_y_pct,
        row.accessory_size_pct,
        row.accessory_layer,
        row.updated_at,
      ]),
      [
        ["mine", null, 0, 0, 100, "front", "2026-02-01T00:00:00.000Z"],
        ["mine-other-image", "accessory-2", 12, -7, 128, "back", "2026-01-01T00:00:00.000Z"],
        ["theirs", "accessory-1", 12, -7, 128, "back", "2026-01-01T00:00:00.000Z"],
      ]
    );
  });

  it("deletes only owned accessory image rows and files", () => {
    const db = createAccessoryDb();
    seedImage(db, "accessory-1", "user-1", "bot-1", BOT_ACCESSORY_IMAGE_PURPOSE, "accessory-1.png");
    seedImage(db, "gallery-1", "user-1", "bot-1", "gallery", "gallery-1.png");
    seedImage(db, "accessory-2", "user-1", "bot-2", BOT_ACCESSORY_IMAGE_PURPOSE, "accessory-2.png");
    const unlinked: string[] = [];

    deleteBotAccessoryImageIfOwned(db, "user-1", "bot-1", "accessory-1", (rel) => {
      if (rel) unlinked.push(rel);
    });
    deleteBotAccessoryImageIfOwned(db, "user-1", "bot-1", "gallery-1", (rel) => {
      if (rel) unlinked.push(rel);
    });
    deleteBotAccessoryImageIfOwned(db, "user-1", "bot-1", "accessory-2", (rel) => {
      if (rel) unlinked.push(rel);
    });

    const remaining = db
      .prepare("SELECT id FROM images ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["accessory-2", "gallery-1"]
    );
    assert.deepEqual(unlinked, ["accessory-1.png"]);
  });
});
