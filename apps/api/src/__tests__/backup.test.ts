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
import {
  DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
  DEFAULT_ZEN_MESSAGE_FONT_MIN_PX,
  MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH,
} from "../settings.ts";

describe("backup Zen Atmosphere style notes", () => {
  it("exports and restores normalized style notes", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET zen_wallpaper_style_notes = ?, zen_wallpaper_blurred_edges_enabled = 0, zen_message_font_min_px = 18.4, zen_message_font_max_px = 36.7, experimental_all_model_effort_enabled = 1, coffee_experimental_table_angle_enabled = 1, psychic_mode_enabled = 1 WHERE id = ?"
      ).run("  misty\n glass,   paper grain  ", "user-1");

      const snapshot = exportUserSnapshot(db, "user-1", userKey);

      assert.equal(
        snapshot.settings?.zenWallpaperStyleNotes,
        "misty glass, paper grain"
      );
      assert.equal(snapshot.settings?.zenWallpaperBlurredEdgesEnabled, false);
      assert.equal(snapshot.settings?.zenMessageFontMinPx, 18.4);
      assert.equal(snapshot.settings?.zenMessageFontMaxPx, 36.7);
      assert.equal(snapshot.settings?.experimentalAllModelEffortEnabled, true);
      assert.equal(snapshot.settings?.coffeeExperimentalTableAngleEnabled, true);
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
            zenMessageFontMinPx: 22.4,
            zenMessageFontMaxPx: 19.2,
            experimentalAllModelEffortEnabled: false,
            coffeeExperimentalTableAngleEnabled: false,
            psychicModeEnabled: false,
          },
        },
        userKey
      );

      const restored = db
        .prepare(
          "SELECT zen_wallpaper_style_notes, zen_wallpaper_blurred_edges_enabled, zen_message_font_min_px, zen_message_font_max_px, experimental_all_model_effort_enabled, coffee_experimental_table_angle_enabled, psychic_mode_enabled FROM users WHERE id = ?"
        )
        .get("user-1") as {
        zen_wallpaper_style_notes: string;
        zen_wallpaper_blurred_edges_enabled: number;
        zen_message_font_min_px: number;
        zen_message_font_max_px: number;
        experimental_all_model_effort_enabled: number;
        coffee_experimental_table_angle_enabled: number;
        psychic_mode_enabled: number;
      };

      assert.equal(
        restored.zen_wallpaper_style_notes,
        "x".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH)
      );
      assert.equal(restored.zen_wallpaper_blurred_edges_enabled, 1);
      assert.equal(restored.zen_message_font_min_px, 22.4);
      assert.equal(restored.zen_message_font_max_px, 22.4);
      assert.equal(restored.experimental_all_model_effort_enabled, 0);
      assert.equal(restored.coffee_experimental_table_angle_enabled, 0);
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
      delete settings.zenMessageFontMinPx;
      delete settings.zenMessageFontMaxPx;

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
          "SELECT zen_wallpaper_style_notes, zen_wallpaper_blurred_edges_enabled, zen_message_font_min_px, zen_message_font_max_px FROM users WHERE id = ?"
        )
        .get("user-1") as {
        zen_wallpaper_style_notes: string;
        zen_wallpaper_blurred_edges_enabled: number;
        zen_message_font_min_px: number;
        zen_message_font_max_px: number;
      };

      assert.equal(restored.zen_wallpaper_style_notes, "");
      assert.equal(restored.zen_wallpaper_blurred_edges_enabled, 1);
      assert.equal(restored.zen_message_font_min_px, DEFAULT_ZEN_MESSAGE_FONT_MIN_PX);
      assert.equal(restored.zen_message_font_max_px, DEFAULT_ZEN_MESSAGE_FONT_MAX_PX);
    });
  });
});

describe("backup bot avatar face style", () => {
  it("exports and restores saved face font settings", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        `INSERT INTO bots (
          id, user_id, name, system_prompt,
          face_eyes_font, face_mouth_font, face_font_weight,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "bot-1",
        "user-1",
        "Avatar Bot",
        "You are Avatar Bot.",
        "warm",
        "formal",
        725,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.deepEqual(snapshot.bots?.[0], {
        id: "bot-1",
        name: "Avatar Bot",
        systemPrompt: "You are Avatar Bot.",
        exportHash: null,
        model: null,
        localModel: null,
        onlineModel: null,
        localImageModel: null,
        openaiImageModel: null,
        onlineEnabled: true,
        deleteProtected: false,
        flirtEnabled: false,
        temperature: 0.7,
        maxTokens: 2048,
        color: null,
        glyph: null,
        faceEyesFont: "warm",
        faceMouthFont: "formal",
        faceFontWeight: 725,
        chatEnabled: true,
        visibility: "private",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      db.prepare(
        "UPDATE bots SET face_eyes_font = NULL, face_mouth_font = NULL, face_font_weight = NULL WHERE id = ?"
      ).run("bot-1");

      importUserSnapshot(db, "user-1", snapshot, userKey);

      const restored = db
        .prepare(
          "SELECT face_eyes_font, face_mouth_font, face_font_weight, profile_picture_image_id FROM bots WHERE id = ?"
        )
        .get("bot-1") as {
        face_eyes_font: string | null;
        face_mouth_font: string | null;
        face_font_weight: number | null;
        profile_picture_image_id: string | null;
      };
      assert.equal(restored.face_eyes_font, "warm");
      assert.equal(restored.face_mouth_font, "formal");
      assert.equal(restored.face_font_weight, 725);
      assert.equal(restored.profile_picture_image_id, null);
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
