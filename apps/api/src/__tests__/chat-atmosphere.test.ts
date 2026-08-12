import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  evaluateChatAtmosphereEnsure,
  promoteChatAtmosphereImage,
  wipeExpiredChatAtmospheresForBot,
} from "../chat-atmosphere.ts";

function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      color TEXT,
      accent_color TEXT,
      chat_atmosphere_image_id TEXT,
      chat_atmosphere_generated_on TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bot_id TEXT,
      purpose TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare(
    `INSERT INTO bots (id, user_id, name, system_prompt, updated_at)
     VALUES ('bot-1', 'user-1', 'Mira', 'Calm guide', '2026-08-01T00:00:00.000Z')`,
  ).run();
  return db;
}

describe("chat-atmosphere", () => {
  it("marks ensure as needing generation when empty", () => {
    const db = createDb();
    const result = evaluateChatAtmosphereEnsure(db, {
      userId: "user-1",
      botId: "bot-1",
      now: new Date("2026-08-06T12:00:00.000Z"),
    });
    assert.equal(result.needsGeneration, true);
    assert.equal(result.imageId, null);
  });

  it("promotes and skips regenerate on the same UTC day", () => {
    const db = createDb();
    db.prepare(
      `INSERT INTO images (id, user_id, bot_id, purpose, created_at)
       VALUES ('img-1', 'user-1', 'bot-1', 'chat_atmosphere', '2026-08-06T01:00:00.000Z')`,
    ).run();
    promoteChatAtmosphereImage(db, {
      userId: "user-1",
      botId: "bot-1",
      imageId: "img-1",
      generatedOn: "2026-08-06",
    });
    const result = evaluateChatAtmosphereEnsure(db, {
      userId: "user-1",
      botId: "bot-1",
      now: new Date("2026-08-06T18:00:00.000Z"),
    });
    assert.equal(result.needsGeneration, false);
    assert.equal(result.imageId, "img-1");
    assert.equal(result.generatedOn, "2026-08-06");
  });

  it("wipes atmospheres older than three days but protects the active pointer", () => {
    const db = createDb();
    db.prepare(
      `INSERT INTO images (id, user_id, bot_id, purpose, created_at) VALUES
        ('old-1', 'user-1', 'bot-1', 'chat_atmosphere', '2026-07-01T00:00:00.000Z'),
        ('old-2', 'user-1', 'bot-1', 'chat_atmosphere', '2026-08-01T00:00:00.000Z'),
        ('active', 'user-1', 'bot-1', 'chat_atmosphere', '2026-08-05T00:00:00.000Z')`,
    ).run();
    const wipe = wipeExpiredChatAtmospheresForBot(db, {
      userId: "user-1",
      botId: "bot-1",
      now: new Date("2026-08-06T12:00:00.000Z"),
      protectImageId: "active",
    });
    assert.equal(wipe.wipedCount, 2);
    const remaining = db
      .prepare("SELECT id FROM images ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["active"],
    );
  });
});
