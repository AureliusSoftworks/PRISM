import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, resolveDbPath } from "../db.ts";

describe("resolveDbPath", () => {
  it("prefers DB_PATH for existing explicit deployments", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = "/tmp/prism-explicit.db";
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), "/tmp/prism-explicit.db");
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });

  it("stores mac app data under LOCALAI_DATA_DIR when provided", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    delete process.env.DB_PATH;
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), join("/tmp/prism-data", "localai.db"));
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });
});

describe("createDatabase bot export hash migration", () => {
  it("ensures bots.export_hash exists and backfills missing values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "localai-db-test-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "migration.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      db.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "user-1",
        "user-1@example.com",
        "User 1",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
      db.prepare(
        "INSERT INTO bots (id, user_id, name, system_prompt, export_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "bot-1",
        "user-1",
        "Legacy Bot",
        "",
        null,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
      db.close();

      const reopened = createDatabase();
      const columns = reopened
        .prepare("PRAGMA table_info(bots)")
        .all() as Array<{ name: string }>;
      const userColumns = reopened
        .prepare("PRAGMA table_info(users)")
        .all() as Array<{ name: string; dflt_value: string | null }>;
      assert.ok(
        userColumns.some(
          (column) => column.name === "model_visibility_defaults_version"
        )
      );
      assert.ok(userColumns.some((column) => column.name === "hidden_comfyui_workflow_ids"));
      assert.ok(userColumns.some((column) => column.name === "zen_wallpaper_text_mask_enabled"));
      const allModelEffortColumn = userColumns.find(
        (column) => column.name === "experimental_all_model_effort_enabled"
      );
      assert.equal(allModelEffortColumn?.dflt_value, "0");
      const coffeeExperimentalTableAngleColumn = userColumns.find(
        (column) => column.name === "coffee_experimental_table_angle_enabled"
      );
      assert.equal(coffeeExperimentalTableAngleColumn?.dflt_value, "0");
      const psychicModeColumn = userColumns.find(
        (column) => column.name === "psychic_mode_enabled"
      );
      assert.equal(psychicModeColumn?.dflt_value, "0");
      const grayscaleColumn = userColumns.find(
        (column) => column.name === "zen_wallpaper_grayscale_enabled"
      );
      assert.equal(grayscaleColumn?.dflt_value, "1");
      const blurredEdgesColumn = userColumns.find(
        (column) => column.name === "zen_wallpaper_blurred_edges_enabled"
      );
      assert.equal(blurredEdgesColumn?.dflt_value, "1");
      const styleNotesColumn = userColumns.find(
        (column) => column.name === "zen_wallpaper_style_notes"
      );
      assert.equal(styleNotesColumn?.dflt_value, "''");
      const zenMessageFontMinColumn = userColumns.find(
        (column) => column.name === "zen_message_font_min_px"
      );
      assert.equal(zenMessageFontMinColumn?.dflt_value, "15.8");
      const zenMessageFontMaxColumn = userColumns.find(
        (column) => column.name === "zen_message_font_max_px"
      );
      assert.equal(zenMessageFontMaxColumn?.dflt_value, "32.8");
      const conversationColumns = reopened
        .prepare("PRAGMA table_info(conversations)")
        .all() as Array<{ name: string }>;
      assert.ok(conversationColumns.some((column) => column.name === "zen_wallpaper_history"));
      assert.ok(columns.some((column) => column.name === "export_hash"));
      assert.ok(columns.some((column) => column.name === "flirt_enabled"));
      assert.ok(columns.some((column) => column.name === "semantic_facets"));
      assert.ok(columns.some((column) => column.name === "semantic_facets_source_hash"));
      assert.ok(columns.some((column) => column.name === "semantic_facets_updated_at"));
      assert.ok(columns.some((column) => column.name === "face_eyes_font"));
      assert.ok(columns.some((column) => column.name === "face_mouth_font"));
      assert.ok(columns.some((column) => column.name === "face_font_weight"));
      assert.ok(columns.some((column) => column.name === "profile_picture_image_id"));
      assert.ok(columns.some((column) => column.name === "accessory_image_id"));
      const opinionColumns = reopened
        .prepare("PRAGMA table_info(session_opinions)")
        .all() as Array<{ name: string }>;
      assert.ok(opinionColumns.some((column) => column.name === "user_id"));
      assert.ok(opinionColumns.some((column) => column.name === "conversation_id"));
      assert.ok(opinionColumns.some((column) => column.name === "bot_scope_key"));
      const botOpinionColumns = reopened
        .prepare("PRAGMA table_info(bot_opinions)")
        .all() as Array<{ name: string }>;
      assert.ok(botOpinionColumns.some((column) => column.name === "boundary_level"));
      assert.ok(botOpinionColumns.some((column) => column.name === "repair_count"));
      const botRelationshipColumns = reopened
        .prepare("PRAGMA table_info(bot_relationships)")
        .all() as Array<{ name: string }>;
      assert.ok(botRelationshipColumns.some((column) => column.name === "source_bot_id"));
      assert.ok(botRelationshipColumns.some((column) => column.name === "target_bot_id"));
      assert.ok(botRelationshipColumns.some((column) => column.name === "mood_key"));
      const row = reopened
        .prepare("SELECT export_hash FROM bots WHERE id = ?")
        .get("bot-1") as { export_hash: string | null } | undefined;
      assert.ok(row?.export_hash);
      assert.match(row!.export_hash!, /^[a-f0-9]{32}$/);
      reopened
        .prepare(
          "UPDATE bots SET face_eyes_font = ?, face_mouth_font = ?, face_font_weight = ?, profile_picture_image_id = ?, accessory_image_id = ? WHERE id = ?"
        )
        .run("warm", "formal", 725, "img-profile", "img-accessory", "bot-1");
      const avatarRow = reopened
        .prepare(
          "SELECT face_eyes_font, face_mouth_font, face_font_weight, profile_picture_image_id, accessory_image_id FROM bots WHERE id = ?"
        )
        .get("bot-1") as
        | {
            face_eyes_font: string | null;
            face_mouth_font: string | null;
            face_font_weight: number | null;
            profile_picture_image_id: string | null;
            accessory_image_id: string | null;
          }
        | undefined;
      assert.equal(avatarRow?.face_eyes_font, "warm");
      assert.equal(avatarRow?.face_mouth_font, "formal");
      assert.equal(avatarRow?.face_font_weight, 725);
      assert.equal(avatarRow?.profile_picture_image_id, "img-profile");
      assert.equal(avatarRow?.accessory_image_id, "img-accessory");
      const settingsRow = reopened
        .prepare(
          "SELECT experimental_all_model_effort_enabled, coffee_experimental_table_angle_enabled, psychic_mode_enabled, zen_message_font_min_px, zen_message_font_max_px FROM users WHERE id = ?"
        )
        .get("user-1") as
        | {
            experimental_all_model_effort_enabled: number;
            coffee_experimental_table_angle_enabled: number;
            psychic_mode_enabled: number;
            zen_message_font_min_px: number;
            zen_message_font_max_px: number;
          }
        | undefined;
      assert.equal(settingsRow?.experimental_all_model_effort_enabled, 0);
      assert.equal(settingsRow?.coffee_experimental_table_angle_enabled, 0);
      assert.equal(settingsRow?.psychic_mode_enabled, 0);
      assert.equal(settingsRow?.zen_message_font_min_px, 15.8);
      assert.equal(settingsRow?.zen_message_font_max_px, 32.8);
      reopened.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("createDatabase images.bot_id migration", () => {
  it("adds bot_id and round-trips inserts", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "localai-db-images-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "images.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      db.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "user-1",
        "user-1@example.com",
        "User 1",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
      const columns = db
        .prepare("PRAGMA table_info(images)")
        .all() as Array<{ name: string }>;
      assert.ok(columns.some((column) => column.name === "bot_id"));
      assert.ok(columns.some((column) => column.name === "local_rel_path"));
      assert.ok(columns.some((column) => column.name === "model"));
      db.prepare(
        "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, revised_prompt, url, size, quality, provider, model, local_rel_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'openai', ?, NULL, ?)"
      ).run(
        "img-1",
        "user-1",
        null,
        "bot-9",
        "cat",
        null,
        "http://example.com/x.png",
        "1024x1024",
        "standard",
        "dall-e-3",
        "2026-01-02T00:00:00.000Z"
      );
      const row = db
        .prepare("SELECT bot_id FROM images WHERE id = ?")
        .get("img-1") as { bot_id: string | null } | undefined;
      assert.equal(row?.bot_id, "bot-9");
      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
