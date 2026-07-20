import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  cleanupUnreferencedImageAssets,
  ImageAssetCleanupError,
  listImageAssetCleanupRecoveries,
  permanentlyDeleteImageAssetCleanupRecovery,
  previewUnreferencedImageAssets,
  reconcileAssetCleanupRecoveryForUser,
  restoreImageAssetCleanupRecovery,
  type ImageAssetCleanupFileOperations,
} from "../image-asset-cleanup.ts";
import {
  resolveAbsoluteUnderDataRoot,
  thumbWebpRelativePathFromPngRelativePath,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      related_bot_ids TEXT NOT NULL DEFAULT '[]',
      origin TEXT NOT NULL,
      prompt TEXT NOT NULL,
      revised_prompt TEXT,
      url TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '1024x1024',
      quality TEXT NOT NULL DEFAULT 'standard',
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
    CREATE TABLE messages (
      user_id TEXT NOT NULL,
      content TEXT,
      tool_payload TEXT
    );
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
    localRelPath?: string;
  } = {},
): void {
  db.prepare(
    `INSERT INTO images
       (id, user_id, conversation_id, bot_id, related_bot_ids, origin, prompt, revised_prompt,
        url, size, quality, provider, model,
        local_rel_path, purpose, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, '1024x1024', 'standard', ?,
             'image-model', ?, ?, ?)`,
  ).run(
    id,
    options.userId ?? "user-1",
    options.botId ?? null,
    JSON.stringify(options.botIds ?? []),
    options.origin ?? "images_panel",
    `Prompt for ${id}`,
    `https://example.invalid/${id}.png`,
    options.provider ?? "openai",
    options.local === false
      ? null
      : options.localRelPath ??
        `generated-images/${options.userId ?? "user-1"}/${id}.png`,
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
        "message-content-image",
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
      db.prepare("INSERT INTO messages (user_id, tool_payload) VALUES (?, ?)").run(
        "user-1",
        JSON.stringify({ sentGeneratedImage: { imageId: "message-image" } }),
      );
      db.prepare("INSERT INTO messages (user_id, content) VALUES (?, ?)").run(
        "user-1",
        "![kept](/api/images/message-content-image/file)",
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
      assert.equal(preview.cleanupAvailable, true);
      assert.equal(before, after);
      assert.equal(preview.scanned, 13);
      assert.equal(preview.candidateCount, 1);
      assert.deepEqual(preview.candidates.map((candidate) => candidate.id), [
        "unused-signal",
      ]);
      assert.deepEqual(preview.candidates[0]?.botIds, ["bot-a", "bot-b"]);
      assert.equal(preview.candidates[0]?.modeLabel, "Signal");
      assert.match(preview.candidates[0]?.reason ?? "", /saved only in the Image Library/iu);
      assert.equal(preview.protectedByReferenceCount, 9);
      assert.equal(preview.protectedPlayerAssetCount, 1);
      assert.equal(preview.protectedUnverifiableCount, 1);
      assert.equal(preview.protectedSharedFileCount, 0);
      assert.equal(preview.remoteOnlyCount, 1);
      assert.doesNotMatch(JSON.stringify(preview), /other-user-unused/u);
    } finally {
      db.close();
    }
  });

  it("protects a generated file path shared with another account", () => {
    const db = fixture();
    try {
      const sharedPath = "generated-images/user-1/shared-source.png";
      seedImage(db, "shared-source", { localRelPath: sharedPath });
      seedImage(db, "other-account-row", {
        userId: "user-2",
        localRelPath: sharedPath,
      });

      const preview = previewUnreferencedImageAssets(db, "user-1");
      assert.equal(preview.candidateCount, 0);
      assert.equal(preview.protectedSharedFileCount, 1);
    } finally {
      db.close();
    }
  });

  it("protects newly generated rows until attachment jobs have safely settled", () => {
    const db = fixture();
    try {
      seedImage(db, "recent-image", { createdAt: new Date().toISOString() });
      const preview = previewUnreferencedImageAssets(db, "user-1");
      assert.equal(preview.candidateCount, 0);
      assert.equal(preview.protectedRecentCount, 1);
    } finally {
      db.close();
    }
  });

  it("revalidates, quarantines, and deletes only the exact selected rows", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      seedImage(db, "candidate-b");
      const preview = previewUnreferencedImageAssets(db, "user-1");
      const quarantined: string[][] = [];
      const fileOperations: ImageAssetCleanupFileOperations = {
        recoveryId: () => "cleanup-test",
        quarantine: (userId, paths, recoveryId) => {
          assert.equal(userId, "user-1");
          quarantined.push([...paths]);
          return {
            recoveryId,
            recoveryRelativePath: `asset-cleanup-trash/${userId}/${recoveryId}`,
            movedFiles: paths.map((path) => ({
              sourceRelativePath: path,
              quarantineRelativePath: `asset-cleanup-trash/${userId}/${recoveryId}/${path}`,
            })),
            missingPrimaryRelativePaths: [],
          };
        },
      };

      const result = cleanupUnreferencedImageAssets(
        db,
        "user-1",
        { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
        fileOperations,
      );

      assert.equal(result.deletedCount, 1);
      assert.equal(result.quarantinedAssetCount, 1);
      assert.equal(result.recoveryId, "cleanup-test");
      assert.deepEqual(quarantined, [["generated-images/user-1/candidate-a.png"]]);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM images WHERE id = 'candidate-a'").get() as { count: number }).count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM images WHERE id = 'candidate-b'").get() as { count: number }).count,
        1,
      );
      assert.deepEqual(result.preview.candidates.map((candidate) => candidate.id), [
        "candidate-b",
      ]);
    } finally {
      db.close();
    }
  });

  it("rejects stale previews before any file move", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const preview = previewUnreferencedImageAssets(db, "user-1");
      seedImage(db, "candidate-b");
      let quarantineCalled = false;

      assert.throws(
        () => cleanupUnreferencedImageAssets(
          db,
          "user-1",
          { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
          { quarantine: () => {
            quarantineCalled = true;
            throw new Error("should not move");
          } },
        ),
        (error) =>
          error instanceof ImageAssetCleanupError &&
          error.code === "stale_preview",
      );
      assert.equal(quarantineCalled, false);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM images").get() as { count: number }).count,
        2,
      );
    } finally {
      db.close();
    }
  });

  it("treats candidate metadata changes as a stale preview", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const preview = previewUnreferencedImageAssets(db, "user-1");
      db.prepare("UPDATE images SET prompt = ? WHERE id = ?").run(
        "A materially different private prompt",
        "candidate-a",
      );
      let quarantineCalled = false;
      assert.throws(
        () =>
          cleanupUnreferencedImageAssets(
            db,
            "user-1",
            { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
            {
              quarantine: () => {
                quarantineCalled = true;
                throw new Error("should not move");
              },
            },
          ),
        (error) =>
          error instanceof ImageAssetCleanupError &&
          error.code === "stale_preview",
      );
      assert.equal(quarantineCalled, false);
    } finally {
      db.close();
    }
  });

  it("fails closed when a required reference surface cannot be audited", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const preview = previewUnreferencedImageAssets(db, "user-1");
      db.exec("DROP TABLE messages");
      let quarantineCalled = false;
      assert.throws(
        () =>
          cleanupUnreferencedImageAssets(
            db,
            "user-1",
            { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
            {
              quarantine: () => {
                quarantineCalled = true;
                throw new Error("should not move");
              },
            },
          ),
        /no such table: messages/iu,
      );
      assert.equal(quarantineCalled, false);
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM images").get() as {
            count: number;
          }
        ).count,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("rejects an exact id that the current graph marks as protected", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      seedImage(db, "profile-image");
      db.prepare("INSERT INTO bots VALUES (?, ?)").run(
        "user-1",
        "profile-image",
      );
      const preview = previewUnreferencedImageAssets(db, "user-1");
      let quarantineCalled = false;

      assert.throws(
        () => cleanupUnreferencedImageAssets(
          db,
          "user-1",
          { snapshot: preview.snapshot, imageIds: ["profile-image"] },
          {
            quarantine: () => {
              quarantineCalled = true;
              throw new Error("should not move");
            },
          },
        ),
        (error) =>
          error instanceof ImageAssetCleanupError &&
          error.code === "unsafe_selection",
      );
      assert.equal(quarantineCalled, false);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM images").get() as {
          count: number;
        }).count,
        2,
      );
    } finally {
      db.close();
    }
  });

  it("rolls back database changes and restores quarantine on delete failure", () => {
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const preview = previewUnreferencedImageAssets(db, "user-1");
      db.exec(`
        CREATE TRIGGER reject_candidate_cleanup
        BEFORE DELETE ON images
        WHEN OLD.id = 'candidate-a'
        BEGIN
          SELECT RAISE(ABORT, 'blocked cleanup');
        END;
      `);
      let restored = false;
      assert.throws(() => cleanupUnreferencedImageAssets(
        db,
        "user-1",
        { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
        {
          recoveryId: () => "rollback-test",
          quarantine: (userId, paths, recoveryId) => ({
            recoveryId,
            recoveryRelativePath: `asset-cleanup-trash/${userId}/${recoveryId}`,
            movedFiles: paths.map((path) => ({
              sourceRelativePath: path,
              quarantineRelativePath: `asset-cleanup-trash/${userId}/${recoveryId}/${path}`,
            })),
            missingPrimaryRelativePaths: [],
          }),
          restore: () => { restored = true; },
        },
      ));
      assert.equal(restored, true);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM images WHERE id = 'candidate-a'").get() as { count: number }).count,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("restores real quarantined files when the database delete fails", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-cleanup-real-rollback-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const primary = "generated-images/user-1/candidate-a.png";
      const thumbnail = thumbWebpRelativePathFromPngRelativePath(primary);
      writeGeneratedImageBytes(primary, Buffer.from("png"));
      writeGeneratedImageBytes(thumbnail, Buffer.from("webp"));
      const preview = previewUnreferencedImageAssets(db, "user-1");
      db.exec(`
        CREATE TRIGGER reject_real_candidate_cleanup
        BEFORE DELETE ON images
        WHEN OLD.id = 'candidate-a'
        BEGIN
          SELECT RAISE(ABORT, 'blocked cleanup');
        END;
      `);

      assert.throws(() =>
        cleanupUnreferencedImageAssets(
          db,
          "user-1",
          { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
          { recoveryId: () => "real-rollback" },
        ),
      );
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(primary)), true);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(thumbnail)), true);
      assert.equal(
        existsSync(
          resolveAbsoluteUnderDataRoot(
            "asset-cleanup-trash/user-1/real-rollback/manifest.json",
          ),
        ),
        false,
      );
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM images").get() as {
            count: number;
          }
        ).count,
        1,
      );
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
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

  it("rejects candidates hidden beyond the visible preview limit", () => {
    const db = fixture();
    try {
      const allIds = Array.from(
        { length: 201 },
        (_, index) => `candidate-${index.toString().padStart(3, "0")}`,
      );
      for (const id of allIds) seedImage(db, id);
      const preview = previewUnreferencedImageAssets(db, "user-1");
      assert.equal(preview.candidateCount, 201);
      assert.equal(preview.truncated, true);
      const visibleIds = new Set(preview.candidates.map((candidate) => candidate.id));
      const hiddenId = allIds.find((id) => !visibleIds.has(id));
      assert.ok(hiddenId);
      let quarantineCalled = false;

      assert.throws(
        () =>
          cleanupUnreferencedImageAssets(
            db,
            "user-1",
            { snapshot: preview.snapshot, imageIds: [hiddenId] },
            {
              quarantine: () => {
                quarantineCalled = true;
                throw new Error("should not move");
              },
            },
          ),
        (error) =>
          error instanceof ImageAssetCleanupError &&
          error.code === "unsafe_selection",
      );
      assert.equal(quarantineCalled, false);
    } finally {
      db.close();
    }
  });

  it("round-trips rows and files through owner-only recovery and permanent purge", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-cleanup-recovery-roundtrip-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const primary = "generated-images/user-1/candidate-a.png";
      const thumbnail = thumbWebpRelativePathFromPngRelativePath(primary);
      writeGeneratedImageBytes(primary, Buffer.from("png"));
      writeGeneratedImageBytes(thumbnail, Buffer.from("webp"));
      const preview = previewUnreferencedImageAssets(db, "user-1");
      const cleaned = cleanupUnreferencedImageAssets(
        db,
        "user-1",
        { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
        { recoveryId: () => "roundtrip" },
      );
      assert.equal(cleaned.deletedCount, 1);
      assert.equal(listImageAssetCleanupRecoveries(db, "user-2").length, 0);
      assert.equal(
        restoreImageAssetCleanupRecovery(db, "user-2", "roundtrip"),
        null,
      );
      assert.equal(listImageAssetCleanupRecoveries(db, "user-1").length, 1);

      const restored = restoreImageAssetCleanupRecovery(
        db,
        "user-1",
        "roundtrip",
      );
      assert.equal(restored?.restoredCount, 1);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(primary)), true);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(thumbnail)), true);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM images").get() as { count: number }).count,
        1,
      );

      const secondPreview = previewUnreferencedImageAssets(db, "user-1");
      cleanupUnreferencedImageAssets(
        db,
        "user-1",
        { snapshot: secondPreview.snapshot, imageIds: ["candidate-a"] },
        { recoveryId: () => "permanent" },
      );
      assert.equal(
        permanentlyDeleteImageAssetCleanupRecovery(
          db,
          "user-1",
          "permanent",
        ),
        true,
      );
      assert.equal(
        existsSync(
          resolveAbsoluteUnderDataRoot(
            "asset-cleanup-trash/user-1/permanent",
          ),
        ),
        false,
      );
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reconciles an interrupted prepared journal when its database row remains", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-cleanup-reconcile-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    const db = fixture();
    try {
      seedImage(db, "candidate-a");
      const primary = "generated-images/user-1/candidate-a.png";
      writeGeneratedImageBytes(primary, Buffer.from("png"));
      const preview = previewUnreferencedImageAssets(db, "user-1");
      db.exec(`
        CREATE TRIGGER interrupt_cleanup
        BEFORE DELETE ON images BEGIN SELECT RAISE(ABORT, 'interrupt'); END;
      `);
      assert.throws(() =>
        cleanupUnreferencedImageAssets(
          db,
          "user-1",
          { snapshot: preview.snapshot, imageIds: ["candidate-a"] },
          {
            recoveryId: () => "interrupted",
            restore: () => undefined,
          },
        ),
      );
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(primary)), false);
      const reconciled = reconcileAssetCleanupRecoveryForUser(db, "user-1");
      assert.equal(reconciled.restored, 1);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(primary)), true);
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
