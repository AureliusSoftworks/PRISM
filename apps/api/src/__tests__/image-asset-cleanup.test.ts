import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { previewUnreferencedImageAssets } from "../image-asset-cleanup.ts";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bot_id TEXT,
      related_bot_ids TEXT NOT NULL DEFAULT '[]',
      origin TEXT NOT NULL,
      prompt TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      local_rel_path TEXT,
      purpose TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (user_id TEXT NOT NULL, profile_picture_image_id TEXT);
    CREATE TABLE conversations (
      user_id TEXT NOT NULL,
      zen_wallpaper_image_id TEXT,
      zen_wallpaper_history TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE messages (user_id TEXT NOT NULL, tool_payload TEXT);
    CREATE TABLE botcast_shows (user_id TEXT NOT NULL, atmosphere_json TEXT NOT NULL);
    CREATE TABLE slate_projects (user_id TEXT NOT NULL, cover_json TEXT NOT NULL);
    CREATE TABLE conversation_exports (user_id TEXT NOT NULL, markdown TEXT NOT NULL);
    CREATE TABLE story_sessions (
      user_id TEXT NOT NULL,
      episode_json TEXT,
      progress_json TEXT,
      transcript_json TEXT
    );
  `);
  return db;
}

function seedImage(
  db: DatabaseSync,
  id: string,
  options: {
    userId?: string;
    origin?: string;
    purpose?: string;
    provider?: string;
    local?: boolean;
    botId?: string | null;
    botIds?: string[];
    createdAt?: string;
  } = {},
): void {
  db.prepare(
    `INSERT INTO images
       (id, user_id, bot_id, related_bot_ids, origin, prompt, provider, model,
        local_rel_path, purpose, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'image-model', ?, ?, ?)`,
  ).run(
    id,
    options.userId ?? "user-1",
    options.botId ?? null,
    JSON.stringify(options.botIds ?? []),
    options.origin ?? "images_panel",
    `Prompt for ${id}`,
    options.provider ?? "openai",
    options.local === false ? null : `generated-images/user-1/${id}.png`,
    options.purpose ?? "gallery",
    options.createdAt ?? "2026-07-19T00:00:00.000Z",
  );
}

describe("image asset cleanup preview", () => {
  it("lists only local generated assets with no current or historical reference", () => {
    const db = fixture();
    try {
      for (const id of [
        "unused-signal",
        "signal-active",
        "zen-current",
        "zen-history",
        "message-image",
        "profile-image",
        "slate-cover",
        "export-image",
        "story-image",
      ]) {
        seedImage(db, id, {
          origin: id.startsWith("signal") || id === "unused-signal"
            ? "botcast"
            : "images_panel",
          botId: id === "unused-signal" ? "bot-a" : null,
          botIds: id === "unused-signal" ? ["bot-a", "bot-b"] : [],
        });
      }
      seedImage(db, "uploaded-image", { provider: "upload" });
      seedImage(db, "group-room-image", {
        origin: "bot_group_room",
        purpose: "group-room-wallpaper",
      });
      seedImage(db, "remote-only", { local: false });
      seedImage(db, "other-user-unused", { userId: "user-2" });

      db.prepare("INSERT INTO bots VALUES (?, ?)").run("user-1", "profile-image");
      db.prepare("INSERT INTO conversations VALUES (?, ?, ?)").run(
        "user-1",
        "zen-current",
        JSON.stringify([{ imageId: "zen-history" }]),
      );
      db.prepare("INSERT INTO messages VALUES (?, ?)").run(
        "user-1",
        JSON.stringify({ sentGeneratedImage: { imageId: "message-image" } }),
      );
      db.prepare("INSERT INTO botcast_shows VALUES (?, ?)").run(
        "user-1",
        JSON.stringify({ logo: { imageId: "signal-active" } }),
      );
      db.prepare("INSERT INTO slate_projects VALUES (?, ?)").run(
        "user-1",
        JSON.stringify({ imageUrl: "/api/images/slate-cover/file" }),
      );
      db.prepare("INSERT INTO conversation_exports VALUES (?, ?)").run(
        "user-1",
        "![saved](/api/images/export-image/file)",
      );
      db.prepare("INSERT INTO story_sessions VALUES (?, ?, ?, ?)").run(
        "user-1",
        JSON.stringify({ imageId: "story-image" }),
        null,
        "[]",
      );

      const before = (
        db.prepare("SELECT COUNT(*) AS count FROM images").get() as {
          count: number;
        }
      ).count;
      const preview = previewUnreferencedImageAssets(db, "user-1");
      const after = (
        db.prepare("SELECT COUNT(*) AS count FROM images").get() as {
          count: number;
        }
      ).count;

      assert.equal(preview.readOnly, true);
      assert.equal(before, after);
      assert.equal(preview.scanned, 12);
      assert.equal(preview.candidateCount, 1);
      assert.deepEqual(preview.candidates.map((candidate) => candidate.id), [
        "unused-signal",
      ]);
      assert.deepEqual(preview.candidates[0]?.botIds, ["bot-a", "bot-b"]);
      assert.equal(preview.candidates[0]?.modeLabel, "Signal");
      assert.match(preview.candidates[0]?.reason ?? "", /saved only in the Image Library/iu);
      assert.equal(preview.protectedByReferenceCount, 8);
      assert.equal(preview.protectedPlayerAssetCount, 1);
      assert.equal(preview.protectedUnverifiableCount, 1);
      assert.equal(preview.remoteOnlyCount, 1);
      assert.doesNotMatch(JSON.stringify(preview), /other-user-unused/u);
    } finally {
      db.close();
    }
  });

  it("returns a stable snapshot that changes when the candidate graph changes", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a", { createdAt: "2026-07-19T01:00:00.000Z" });
      const first = previewUnreferencedImageAssets(db, "user-1");
      const repeated = previewUnreferencedImageAssets(db, "user-1");
      assert.equal(first.snapshot, repeated.snapshot);

      seedImage(db, "candidate-b", { createdAt: "2026-07-19T02:00:00.000Z" });
      const changed = previewUnreferencedImageAssets(db, "user-1");
      assert.notEqual(first.snapshot, changed.snapshot);
      assert.deepEqual(changed.candidates.map((candidate) => candidate.id), [
        "candidate-b",
        "candidate-a",
      ]);
    } finally {
      db.close();
    }
  });
});
