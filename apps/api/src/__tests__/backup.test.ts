import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../db.ts";
import {
  exportUserSnapshot,
  importUserSnapshot,
  type BackupSnapshot,
} from "../backup.ts";
import { MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH } from "../settings.ts";

describe("backup Zen Atmosphere style notes", () => {
  it("exports and restores normalized style notes", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET zen_wallpaper_style_notes = ?, zen_wallpaper_blurred_edges_enabled = 0, experimental_all_model_effort_enabled = 1, psychic_mode_enabled = 1 WHERE id = ?"
      ).run("  misty\n glass,   paper grain  ", "user-1");

      const snapshot = exportUserSnapshot(db, "user-1", userKey);

      assert.equal(
        snapshot.settings?.zenWallpaperStyleNotes,
        "misty glass, paper grain"
      );
      assert.equal(snapshot.settings?.zenWallpaperBlurredEdgesEnabled, false);
      assert.equal(snapshot.settings?.experimentalAllModelEffortEnabled, true);
      assert.equal(snapshot.settings?.psychicModeEnabled, true);

      const longNotes = "x".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH + 10);
      importUserSnapshot(
        db,
        "user-1",
        {
          ...snapshot,
          settings: {
            ...snapshot.settings!,
            zenWallpaperStyleNotes: longNotes,
            zenWallpaperBlurredEdgesEnabled: true,
            experimentalAllModelEffortEnabled: false,
            psychicModeEnabled: false,
          },
        },
        userKey
      );

      const restored = db
        .prepare(
          "SELECT zen_wallpaper_style_notes, zen_wallpaper_blurred_edges_enabled, experimental_all_model_effort_enabled, psychic_mode_enabled FROM users WHERE id = ?"
        )
        .get("user-1") as {
        zen_wallpaper_style_notes: string;
        zen_wallpaper_blurred_edges_enabled: number;
        experimental_all_model_effort_enabled: number;
        psychic_mode_enabled: number;
      };

      assert.equal(
        restored.zen_wallpaper_style_notes,
        "x".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH)
      );
      assert.equal(restored.zen_wallpaper_blurred_edges_enabled, 1);
      assert.equal(restored.experimental_all_model_effort_enabled, 0);
      assert.equal(restored.psychic_mode_enabled, 0);
    });
  });

  it("treats old snapshots without style notes as blank", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET zen_wallpaper_style_notes = ?, zen_wallpaper_blurred_edges_enabled = 0 WHERE id = ?"
      ).run("woven texture", "user-1");

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      const settings = { ...snapshot.settings } as Partial<
        NonNullable<BackupSnapshot["settings"]>
      >;
      delete settings.zenWallpaperStyleNotes;
      delete settings.zenWallpaperBlurredEdgesEnabled;

      importUserSnapshot(
        db,
        "user-1",
        {
          ...snapshot,
          settings: settings as BackupSnapshot["settings"],
        },
        userKey
      );

      const restored = db
        .prepare(
          "SELECT zen_wallpaper_style_notes, zen_wallpaper_blurred_edges_enabled FROM users WHERE id = ?"
        )
        .get("user-1") as {
        zen_wallpaper_style_notes: string;
        zen_wallpaper_blurred_edges_enabled: number;
      };

      assert.equal(restored.zen_wallpaper_style_notes, "");
      assert.equal(restored.zen_wallpaper_blurred_edges_enabled, 1);
    });
  });
});

function withBackupDatabase(
  run: (db: ReturnType<typeof createDatabase>, userKey: Buffer) => void
): void {
  const tempDir = mkdtempSync(join(tmpdir(), "prism-backup-"));
  const previousDbPath = process.env.DB_PATH;
  const previousDataDir = process.env.LOCALAI_DATA_DIR;
  process.env.DB_PATH = join(tempDir, "backup.db");
  delete process.env.LOCALAI_DATA_DIR;

  try {
    const db = createDatabase();
    const userKey = Buffer.alloc(32, 1);
    db.prepare(
      `
      INSERT INTO users (
        id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      "user-1",
      "user-1@example.com",
      "User One",
      "hash",
      "salt",
      "cipher",
      "iv",
      "tag",
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z"
    );

    run(db, userKey);
    db.close();
  } finally {
    restoreEnv("DB_PATH", previousDbPath);
    restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
