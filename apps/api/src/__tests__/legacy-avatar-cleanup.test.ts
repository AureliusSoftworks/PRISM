import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { cleanupLegacyAvatarData } from "../legacy-avatar-cleanup.ts";

const FIXED_NOW = new Date("2026-07-10T19:20:21.123Z");

describe("legacy avatar cleanup", () => {
  it("dry-runs against only the explicit temp database without writing a backup", async () => {
    await withFixture(async ({ root, databasePath, imagePath, thumbPath }) => {
      const result = await cleanupLegacyAvatarData({
        databasePath,
        mode: "dry-run",
        workspaceRoot: root,
        now: FIXED_NOW,
      });

      assert.equal(result.applied, false);
      assert.equal(result.plan.botReferences.length, 1);
      assert.equal(result.plan.imageRows.length, 2);
      assert.equal(result.plan.files.filter((file) => file.exists).length, 2);
      assert.equal(existsSync(imagePath), true);
      assert.equal(existsSync(thumbPath), true);
      assert.equal(existsSync(join(root, ".codex")), false);
      assertLegacyRows(databasePath, 1, 2);
    });
  });

  it("backs up and verifies SQLite, legacy files, and checksums before cleanup", async () => {
    await withFixture(async ({ root, databasePath, imagePath, thumbPath, galleryPath }) => {
      const result = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: FIXED_NOW,
      });

      const expectedBackup = join(
        root,
        ".codex",
        "output",
        "avatar-details",
        "legacy-2026-07-10T19-20-21-123Z"
      );
      assert.equal(result.applied, true);
      assert.equal(result.backupDirectory, expectedBackup);
      assert.equal(result.clearedBotReferences, 1);
      assert.equal(result.deletedImageRows, 2);
      assert.equal(result.deletedFiles, 2);
      assert.equal(existsSync(imagePath), false);
      assert.equal(existsSync(thumbPath), false);
      assert.equal(existsSync(galleryPath), true);
      assertLegacyRows(databasePath, 0, 0);

      const backupDbPath = join(expectedBackup, "legacy.sqlite3");
      const backupDb = new DatabaseSync(backupDbPath, { readOnly: true });
      try {
        assert.equal(
          (backupDb.prepare("PRAGMA integrity_check").get() as { integrity_check: string })
            .integrity_check,
          "ok"
        );
        assert.equal(
          (backupDb.prepare("SELECT COUNT(*) AS count FROM images WHERE purpose = 'bot_accessory'").get() as { count: number }).count,
          2
        );
        assert.equal(
          (backupDb.prepare("SELECT accessory_image_id FROM bots WHERE id = 'bot-1'").get() as { accessory_image_id: string }).accessory_image_id,
          "legacy-1"
        );
      } finally {
        backupDb.close();
      }

      assert.equal(
        readFileSync(
          join(expectedBackup, "legacy-files", "generated-images", "user-1", "legacy-1.png"),
          "utf8"
        ),
        "legacy image"
      );
      assert.equal(
        readFileSync(
          join(
            expectedBackup,
            "legacy-files",
            "generated-images",
            "user-1",
            "legacy-1.thumb.webp"
          ),
          "utf8"
        ),
        "legacy thumb"
      );

      const manifestPath = join(expectedBackup, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        schema: string;
        checksums: { algorithm: string; artifacts: Array<{ backupRelativePath: string; sha256: string }> };
      };
      assert.equal(manifest.schema, "prism-legacy-avatar-backup-v1");
      assert.equal(manifest.checksums.algorithm, "sha256");
      for (const artifact of manifest.checksums.artifacts) {
        assert.equal(
          artifact.sha256,
          sha256(readFileSync(join(expectedBackup, artifact.backupRelativePath)))
        );
      }
      assert.equal(
        readFileSync(join(expectedBackup, "manifest.sha256"), "utf8").split(/\s+/u)[0],
        sha256(readFileSync(manifestPath))
      );

      const second = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: new Date("2026-07-10T19:30:00.000Z"),
      });
      assert.equal(second.applied, false);
      assert.equal(second.backupDirectory, null);
      assert.equal(
        existsSync(
          join(root, ".codex", "output", "avatar-details", "legacy-2026-07-10T19-30-00-000Z")
        ),
        false
      );
      const preserved = new DatabaseSync(databasePath, { readOnly: true });
      try {
        assert.equal(
          (preserved.prepare("SELECT profile_picture_image_id FROM bots WHERE id = 'bot-1'").get() as { profile_picture_image_id: string }).profile_picture_image_id,
          "profile-1"
        );
        assert.equal(
          (preserved.prepare("SELECT COUNT(*) AS count FROM images WHERE id = 'profile-1'").get() as { count: number }).count,
          1
        );
      } finally {
        preserved.close();
      }
    });
  });

  it("restores staged files and rolls back references when apply fails", async () => {
    await withFixture(async ({ root, databasePath, imagePath, thumbPath }) => {
      const db = new DatabaseSync(databasePath);
      db.exec(`
        CREATE TRIGGER inject_legacy_avatar_cleanup_failure
        BEFORE DELETE ON images
        WHEN OLD.purpose = 'bot_accessory'
        BEGIN
          SELECT RAISE(ABORT, 'injected cleanup failure');
        END;
      `);
      db.close();

      await assert.rejects(
        cleanupLegacyAvatarData({
          databasePath,
          mode: "apply",
          workspaceRoot: root,
          now: FIXED_NOW,
        }),
        /injected cleanup failure/
      );

      assertLegacyRows(databasePath, 1, 2);
      assert.equal(readFileSync(imagePath, "utf8"), "legacy image");
      assert.equal(readFileSync(thumbPath, "utf8"), "legacy thumb");
      assert.equal(
        readdirSync(join(root, "generated-images", "user-1")).some((name) =>
          name.endsWith(".stage")
        ),
        false
      );
      const restored = new DatabaseSync(databasePath, { readOnly: true });
      try {
        const bot = restored
          .prepare(
            `SELECT accessory_image_id, accessory_x_pct, accessory_y_pct,
                    accessory_size_pct, accessory_layer
             FROM bots WHERE id = 'bot-1'`
          )
          .get() as {
          accessory_image_id: string;
          accessory_x_pct: number;
          accessory_y_pct: number;
          accessory_size_pct: number;
          accessory_layer: string;
        };
        assert.deepEqual({ ...bot }, {
          accessory_image_id: "legacy-1",
          accessory_x_pct: 4,
          accessory_y_pct: -8,
          accessory_size_pct: 75,
          accessory_layer: "back",
        });
      } finally {
        restored.close();
      }
    });
  });

  it("rolls back when a trigger silently ignores a planned image deletion", async () => {
    await withFixture(async ({ root, databasePath, imagePath, thumbPath }) => {
      const db = new DatabaseSync(databasePath);
      db.exec(`
        CREATE TRIGGER ignore_legacy_avatar_cleanup_delete
        BEFORE DELETE ON images
        WHEN OLD.purpose = 'bot_accessory'
        BEGIN
          SELECT RAISE(IGNORE);
        END;
      `);
      db.close();

      await assert.rejects(
        cleanupLegacyAvatarData({
          databasePath,
          mode: "apply",
          workspaceRoot: root,
          now: FIXED_NOW,
        }),
        /image row count changed/i
      );
      assertLegacyRows(databasePath, 1, 2);
      assert.equal(readFileSync(imagePath, "utf8"), "legacy image");
      assert.equal(readFileSync(thumbPath, "utf8"), "legacy thumb");
    });
  });

  it("refuses apply when a primary legacy PNG is missing", async () => {
    await withFixture(async ({ root, databasePath, imagePath }) => {
      unlinkSync(imagePath);
      await assert.rejects(
        cleanupLegacyAvatarData({
          databasePath,
          mode: "apply",
          workspaceRoot: root,
          now: FIXED_NOW,
        }),
        /primary PNG file.*missing/i
      );
      assertLegacyRows(databasePath, 1, 2);
      assert.equal(existsSync(join(root, ".codex")), false);
    });
  });

  it("resumes staged-file deletion after a committed cleanup", async () => {
    await withFixture(async ({ root, databasePath, imagePath }) => {
      const first = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: FIXED_NOW,
      });
      assert.ok(first.backupDirectory);
      const stagedPath = `${imagePath}.prism-legacy-avatar-cleanup-resume-0.stage`;
      copyFileSync(
        join(
          first.backupDirectory,
          "legacy-files",
          "generated-images",
          "user-1",
          "legacy-1.png"
        ),
        stagedPath
      );
      const statePath = join(first.backupDirectory, "cleanup-state.json");
      writeFileSync(
        statePath,
        `${JSON.stringify(
          {
            schema: "prism-legacy-avatar-cleanup-state-v1",
            databasePath,
            backupDirectory: first.backupDirectory,
            status: "files-pending",
            files: [{ sourcePath: imagePath, stagedPath }],
            updatedAt: FIXED_NOW.toISOString(),
          },
          null,
          2
        )}\n`
      );

      const resumed = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: new Date("2026-07-10T19:30:00.000Z"),
      });
      assert.equal(resumed.applied, false);
      assert.equal(existsSync(stagedPath), false);
      assert.equal(
        (JSON.parse(readFileSync(statePath, "utf8")) as { status: string }).status,
        "complete"
      );
    });
  });

  it("refuses unsafe stored paths before backup or mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-legacy-avatar-unsafe-"));
    const databasePath = join(root, "localai.db");
    const outsidePath = join(root, "outside.png");
    try {
      seedDatabase(databasePath, "../outside.png");
      writeFileSync(outsidePath, "do not delete");
      await assert.rejects(
        cleanupLegacyAvatarData({
          databasePath,
          mode: "apply",
          workspaceRoot: root,
          now: FIXED_NOW,
        }),
        /Unsafe legacy avatar file path/
      );
      assertLegacyRows(databasePath, 1, 2);
      assert.equal(readFileSync(outsidePath, "utf8"), "do not delete");
      assert.equal(existsSync(join(root, ".codex")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("cleans orphan accessory rows when current bots have no accessory columns", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-legacy-avatar-current-schema-"));
    const databasePath = join(root, "localai.db");
    const imagePath = join(root, "generated-images", "user-1", "orphan.png");
    try {
      const db = new DatabaseSync(databasePath);
      db.exec(`
        CREATE TABLE bots (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          profile_picture_image_id TEXT,
          avatar_details_json TEXT
        );
        CREATE TABLE images (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          bot_id TEXT,
          purpose TEXT,
          local_rel_path TEXT
        );
        INSERT INTO bots (id, user_id, profile_picture_image_id)
          VALUES ('bot-1', 'user-1', 'profile-1');
        INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path)
          VALUES ('profile-1', 'user-1', 'bot-1', 'bot_profile_picture', NULL);
        INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path)
          VALUES ('orphan', 'user-1', NULL, 'bot_accessory', 'generated-images/user-1/orphan.png');
      `);
      db.close();
      mkdirSync(join(root, "generated-images", "user-1"), { recursive: true });
      writeFileSync(imagePath, "orphan accessory");

      const result = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: FIXED_NOW,
      });
      assert.equal(result.plan.botReferences.length, 0);
      assert.equal(result.deletedImageRows, 1);
      assert.equal(existsSync(imagePath), false);

      const restored = new DatabaseSync(databasePath, { readOnly: true });
      try {
        assert.equal(restored.prepare("SELECT id FROM images WHERE id = 'orphan'").get(), undefined);
        assert.ok(restored.prepare("SELECT id FROM images WHERE id = 'profile-1'").get());
        assert.equal(
          (restored.prepare("SELECT profile_picture_image_id FROM bots WHERE id = 'bot-1'").get() as { profile_picture_image_id: string }).profile_picture_image_id,
          "profile-1"
        );
      } finally {
        restored.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clears a stale accessory reference without deleting a shared profile image", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-legacy-avatar-shared-profile-"));
    const databasePath = join(root, "localai.db");
    const profilePath = join(root, "generated-images", "user-1", "profile.png");
    const profileThumbPath = join(
      root,
      "generated-images",
      "user-1",
      "profile.thumb.webp"
    );
    try {
      const db = new DatabaseSync(databasePath);
      db.exec(`
        CREATE TABLE bots (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          profile_picture_image_id TEXT,
          accessory_image_id TEXT,
          accessory_x_pct REAL NOT NULL DEFAULT 0,
          accessory_y_pct REAL NOT NULL DEFAULT 0,
          accessory_size_pct REAL NOT NULL DEFAULT 100,
          accessory_layer TEXT NOT NULL DEFAULT 'front'
        );
        CREATE TABLE images (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          bot_id TEXT,
          purpose TEXT,
          local_rel_path TEXT
        );
        INSERT INTO bots (
          id, user_id, profile_picture_image_id, accessory_image_id,
          accessory_x_pct, accessory_y_pct, accessory_size_pct, accessory_layer
        ) VALUES ('bot-1', 'user-1', 'shared-profile', 'shared-profile', 8, -4, 90, 'back');
        INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path)
          VALUES (
            'shared-profile', 'user-1', 'bot-1', 'bot_profile_picture',
            'generated-images/user-1/profile.png'
          );
      `);
      db.close();
      mkdirSync(join(root, "generated-images", "user-1"), { recursive: true });
      writeFileSync(profilePath, "profile image");
      writeFileSync(profileThumbPath, "profile thumb");

      const result = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: FIXED_NOW,
      });
      assert.equal(result.plan.botReferences.length, 1);
      assert.equal(result.plan.imageRows.length, 0);
      assert.equal(result.plan.files.length, 0);
      assert.equal(result.deletedImageRows, 0);
      assert.equal(result.deletedFiles, 0);
      assert.equal(existsSync(profilePath), true);
      assert.equal(existsSync(profileThumbPath), true);

      const restored = new DatabaseSync(databasePath, { readOnly: true });
      try {
        const bot = restored
          .prepare(
            `SELECT profile_picture_image_id, accessory_image_id,
                    accessory_x_pct, accessory_y_pct, accessory_size_pct, accessory_layer
             FROM bots WHERE id = 'bot-1'`
          )
          .get() as {
          profile_picture_image_id: string;
          accessory_image_id: string | null;
          accessory_x_pct: number;
          accessory_y_pct: number;
          accessory_size_pct: number;
          accessory_layer: string;
        };
        assert.deepEqual({ ...bot }, {
          profile_picture_image_id: "shared-profile",
          accessory_image_id: null,
          accessory_x_pct: 0,
          accessory_y_pct: 0,
          accessory_size_pct: 100,
          accessory_layer: "front",
        });
        assert.ok(restored.prepare("SELECT id FROM images WHERE id = 'shared-profile'").get());
      } finally {
        restored.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves files when a retained profile row shares the accessory path", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-legacy-avatar-shared-path-"));
    const databasePath = join(root, "localai.db");
    const sharedPath = join(root, "generated-images", "user-1", "shared.png");
    const sharedThumbPath = join(
      root,
      "generated-images",
      "user-1",
      "shared.thumb.webp"
    );
    try {
      const db = new DatabaseSync(databasePath);
      db.exec(`
        CREATE TABLE bots (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          profile_picture_image_id TEXT,
          accessory_image_id TEXT,
          accessory_x_pct REAL NOT NULL DEFAULT 0,
          accessory_y_pct REAL NOT NULL DEFAULT 0,
          accessory_size_pct REAL NOT NULL DEFAULT 100,
          accessory_layer TEXT NOT NULL DEFAULT 'front'
        );
        CREATE TABLE images (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          bot_id TEXT,
          purpose TEXT,
          local_rel_path TEXT
        );
        INSERT INTO bots (
          id, user_id, profile_picture_image_id, accessory_image_id,
          accessory_x_pct, accessory_y_pct, accessory_size_pct, accessory_layer
        ) VALUES ('bot-1', 'user-1', 'profile-1', 'accessory-1', 3, 2, 95, 'front');
        INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path)
          VALUES (
            'accessory-1', 'user-1', 'bot-1', 'bot_accessory',
            'generated-images/user-1-alias/shared.png'
          );
        INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path)
          VALUES (
            'profile-1', 'user-1', 'bot-1', 'bot_profile_picture',
            './generated-images/user-1/shared.png'
          );
      `);
      db.close();
      mkdirSync(join(root, "generated-images", "user-1"), { recursive: true });
      writeFileSync(sharedPath, "shared image");
      writeFileSync(sharedThumbPath, "shared thumb");
      symlinkSync(
        "user-1",
        join(root, "generated-images", "user-1-alias"),
        "dir"
      );

      const result = await cleanupLegacyAvatarData({
        databasePath,
        mode: "apply",
        workspaceRoot: root,
        now: FIXED_NOW,
      });
      assert.equal(result.plan.imageRows.length, 1);
      assert.equal(result.plan.files.length, 0);
      assert.equal(result.deletedImageRows, 1);
      assert.equal(result.deletedFiles, 0);
      assert.deepEqual(result.stagedFilesRemaining, []);
      assert.equal(readFileSync(sharedPath, "utf8"), "shared image");
      assert.equal(readFileSync(sharedThumbPath, "utf8"), "shared thumb");

      const restored = new DatabaseSync(databasePath, { readOnly: true });
      try {
        assert.equal(restored.prepare("SELECT id FROM images WHERE id = 'accessory-1'").get(), undefined);
        assert.ok(restored.prepare("SELECT id FROM images WHERE id = 'profile-1'").get());
        const bot = restored
          .prepare(
            "SELECT profile_picture_image_id, accessory_image_id FROM bots WHERE id = 'bot-1'"
          )
          .get() as {
          profile_picture_image_id: string;
          accessory_image_id: string | null;
        };
        assert.deepEqual({ ...bot }, {
          profile_picture_image_id: "profile-1",
          accessory_image_id: null,
        });
      } finally {
        restored.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires an explicit existing database path", async () => {
    await assert.rejects(
      cleanupLegacyAvatarData({ databasePath: "", mode: "dry-run" }),
      /explicit SQLite database path/
    );
  });
});

async function withFixture(
  run: (fixture: {
    root: string;
    databasePath: string;
    imagePath: string;
    thumbPath: string;
    galleryPath: string;
  }) => Promise<void>
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "prism-legacy-avatar-cleanup-"));
  const databasePath = join(root, "localai.db");
  const imagesDir = join(root, "generated-images", "user-1");
  const imagePath = join(imagesDir, "legacy-1.png");
  const thumbPath = join(imagesDir, "legacy-1.thumb.webp");
  const galleryPath = join(imagesDir, "gallery.png");
  try {
    seedDatabase(databasePath, "generated-images/user-1/legacy-1.png");
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(imagePath, "legacy image");
    writeFileSync(thumbPath, "legacy thumb");
    writeFileSync(galleryPath, "gallery image");
    await run({ root, databasePath, imagePath, thumbPath, galleryPath });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function seedDatabase(databasePath: string, legacyRelativePath: string): void {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
      CREATE TABLE bots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_picture_image_id TEXT,
        accessory_image_id TEXT,
        accessory_x_pct REAL NOT NULL DEFAULT 0,
        accessory_y_pct REAL NOT NULL DEFAULT 0,
        accessory_size_pct REAL NOT NULL DEFAULT 100,
        accessory_layer TEXT NOT NULL DEFAULT 'front',
        updated_at TEXT
      );
      CREATE TABLE images (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        bot_id TEXT,
        purpose TEXT,
        local_rel_path TEXT
      );
    `);
    db.prepare("INSERT INTO bots (id, user_id, profile_picture_image_id, accessory_image_id, accessory_x_pct, accessory_y_pct, accessory_size_pct, accessory_layer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "bot-1",
      "user-1",
      "profile-1",
      "legacy-1",
      4,
      -8,
      75,
      "back"
    );
    db.prepare(
      "INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path) VALUES (?, ?, ?, ?, ?)"
    ).run("legacy-1", "user-1", "bot-1", "bot_accessory", legacyRelativePath);
    db.prepare(
      "INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path) VALUES (?, ?, ?, ?, ?)"
    ).run("legacy-orphan", "user-1", null, "bot_accessory", null);
    db.prepare(
      "INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path) VALUES (?, ?, ?, ?, ?)"
    ).run("profile-1", "user-1", "bot-1", "bot_profile_picture", null);
    db.prepare(
      "INSERT INTO images (id, user_id, bot_id, purpose, local_rel_path) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "gallery-1",
      "user-1",
      null,
      "gallery",
      "generated-images/user-1/gallery.png"
    );
  } finally {
    db.close();
  }
}

function assertLegacyRows(databasePath: string, expectedRefs: number, expectedRows: number): void {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const refs = db
      .prepare("SELECT COUNT(*) AS count FROM bots WHERE accessory_image_id IS NOT NULL")
      .get() as { count: number };
    const rows = db
      .prepare("SELECT COUNT(*) AS count FROM images WHERE purpose = 'bot_accessory'")
      .get() as { count: number };
    assert.equal(refs.count, expectedRefs);
    assert.equal(rows.count, expectedRows);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM images WHERE purpose = 'bot_profile_picture'").get() as { count: number }).count,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM images WHERE purpose = 'gallery'").get() as { count: number }).count,
      1
    );
  } finally {
    db.close();
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
