import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  createDatabase,
  initializeDatabase,
  resolveDbPath,
} from "../db.ts";

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

describe("createDatabase runtime pragmas", () => {
  it("waits through short-lived SQLite writer contention", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "localai-db-pragmas-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "runtime.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      const row = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
      assert.equal(row.timeout, SQLITE_BUSY_TIMEOUT_MS);
      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("createDatabase English voice engine compatibility", () => {
  it("defaults new accounts to builtin without rewriting saved Premium accounts", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-voice-engine-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "voice-engine.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      db.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "voice-user",
        "voice-user@example.com",
        "Voice User",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-07-20T00:00:00.000Z",
        "2026-07-20T00:00:00.000Z",
      );

      const readEngine = (): string =>
        (
          db
            .prepare("SELECT english_voice_engine FROM users WHERE id = ?")
            .get("voice-user") as { english_voice_engine: string }
        ).english_voice_engine;
      assert.equal(readEngine(), "builtin");

      db.prepare(
        "UPDATE users SET english_voice_engine = 'elevenlabs' WHERE id = ?",
      ).run("voice-user");
      initializeDatabase(db);
      assert.equal(readEngine(), "elevenlabs");
      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("createDatabase living shell startup preference", () => {
  it("adds a privacy-neutral Home default without rewriting saved choices", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-startup-preference-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "startup-preference.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      db.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "startup-user",
        "startup-user@example.com",
        "Startup User",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-07-22T00:00:00.000Z",
        "2026-07-22T00:00:00.000Z",
      );

      const readPreference = (): string =>
        (
          db
            .prepare("SELECT startup_preference FROM users WHERE id = ?")
            .get("startup-user") as { startup_preference: string }
        ).startup_preference;
      assert.equal(readPreference(), "home");

      db.prepare(
        "UPDATE users SET startup_preference = 'slate' WHERE id = ?",
      ).run("startup-user");
      initializeDatabase(db);
      assert.equal(readPreference(), "slate");
      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("createDatabase legal acceptance schema", () => {
  it("creates versioned, account-scoped clickwrap records", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-legal-schema-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "legal.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      const columns = db
        .prepare("PRAGMA table_info(legal_acceptances)")
        .all() as Array<{ name: string }>;
      assert.deepEqual(
        columns.map((column) => column.name),
        [
          "id",
          "user_id",
          "document_id",
          "document_version",
          "document_hash",
          "document_snapshot",
          "acceptance_method",
          "minimum_age_confirmed",
          "accepted_at",
        ],
      );
      const foreignKeys = db
        .prepare("PRAGMA foreign_key_list(legal_acceptances)")
        .all() as Array<{ table: string; from: string; on_delete: string }>;
      assert.ok(
        foreignKeys.some(
          (key) =>
            key.table === "users" &&
            key.from === "user_id" &&
            key.on_delete === "CASCADE",
        ),
      );
      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
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
      for (const name of [
        "brave_search_key_ciphertext",
        "brave_search_key_iv",
        "brave_search_key_tag",
      ]) {
        db.exec(`ALTER TABLE users DROP COLUMN ${name};`);
      }
      db.prepare("UPDATE users SET preferred_provider = 'openai' WHERE id = ?").run(
        "user-1"
      );
      db.exec("ALTER TABLE users DROP COLUMN preferred_image_provider;");
      db.exec("ALTER TABLE users DROP COLUMN graphics_quality;");
      db.exec(
        "ALTER TABLE botcast_shows DROP COLUMN fallback_studio_accent_variant;"
      );
      db.exec(
        "ALTER TABLE botcast_shows DROP COLUMN host_chat_ignoring_until_guest_show;"
      );
      db.close();

      const reopened = createDatabase();
      const columns = reopened
        .prepare("PRAGMA table_info(bots)")
        .all() as Array<{ name: string }>;
      const userColumns = reopened
        .prepare("PRAGMA table_info(users)")
        .all() as Array<{ name: string; dflt_value: string | null }>;
      const botcastShowColumns = reopened
        .prepare("PRAGMA table_info(botcast_shows)")
        .all() as Array<{ name: string }>;
      assert.equal(
        (
          columns.find((column) => column.name === "self_referral") as
            | { dflt_value?: string | null }
            | undefined
        )?.dflt_value,
        "''",
      );
      assert.ok(
        botcastShowColumns.some(
          (column) => column.name === "fallback_studio_accent_variant"
        )
      );
      assert.ok(
        botcastShowColumns.some(
          (column) => column.name === "host_chat_ignoring_until_guest_show"
        )
      );
      assert.ok(
        userColumns.some(
          (column) => column.name === "model_visibility_defaults_version"
        )
      );
      assert.ok(
        userColumns.some(
          (column) =>
            column.name === "graphics_quality" &&
            column.dflt_value === "'high'",
        ),
      );
      assert.equal(
        (reopened
          .prepare("SELECT graphics_quality FROM users WHERE id = ?")
          .get("user-1") as { graphics_quality: string }).graphics_quality,
        "high",
      );
      assert.ok(
        userColumns.some(
          (column) => column.name === "prism_default_bot_face_thinking_frames"
        )
      );
      assert.ok(userColumns.some((column) => column.name === "prism_default_bot_audio_voice_profile"));
      assert.ok(userColumns.some((column) => column.name === "default_system_voice_name"));
      assert.ok(userColumns.some((column) => column.name === "default_elevenlabs_voice_id"));
      assert.deepEqual(
        [
          "brave_search_key_ciphertext",
          "brave_search_key_iv",
          "brave_search_key_tag",
        ].filter(
          (name) => !userColumns.some((column) => column.name === name)
        ),
        []
      );
      assert.equal(
        userColumns.find((column) => column.name === "voice_effects_enabled")?.dflt_value,
        "1"
      );
      assert.equal(
        userColumns.find((column) => column.name === "voice_volume")?.dflt_value,
        "1"
      );
      assert.equal(
        userColumns.find(
          (column) => column.name === "operating_system_voices_enabled"
        )?.dflt_value,
        "0"
      );
      assert.ok(userColumns.some((column) => column.name === "hidden_comfyui_workflow_ids"));
      assert.ok(userColumns.some((column) => column.name === "preferred_image_provider"));
      assert.equal(
        (
          reopened
            .prepare("SELECT preferred_image_provider AS provider FROM users WHERE id = ?")
            .get("user-1") as { provider?: string } | undefined
        )?.provider,
        "openai"
      );
      assert.ok(userColumns.some((column) => column.name === "zen_wallpaper_text_mask_enabled"));
      assert.ok(
        userColumns.some((column) => column.name === "prism_default_bot_face_eye_animation")
      );
      assert.ok(
        userColumns.some((column) => column.name === "prism_default_bot_face_mouth_animation")
      );
      assert.equal(
        userColumns.find(
          (column) => column.name === "prism_default_bot_face_mouth_coffee_pucker"
        )?.dflt_value,
        "1"
      );
      assert.ok(
        userColumns.some((column) => column.name === "prism_default_bot_face_eye_rotation_deg")
      );
      assert.equal(
        userColumns.find(
          (column) => column.name === "prism_default_bot_face_eye_count",
        )?.dflt_value,
        "1",
      );
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
      const zenPersonaTransitionChoiceColumn = userColumns.find(
        (column) => column.name === "zen_persona_transition_choice"
      );
      assert.equal(zenPersonaTransitionChoiceColumn?.dflt_value, "'random'");
      const conversationColumns = reopened
        .prepare("PRAGMA table_info(conversations)")
        .all() as Array<{ name: string }>;
      assert.ok(conversationColumns.some((column) => column.name === "zen_wallpaper_history"));
      assert.ok(conversationColumns.some((column) => column.name === "coffee_power_plan_json"));
      const messageColumns = reopened
        .prepare("PRAGMA table_info(messages)")
        .all() as Array<{ name: string }>;
      assert.ok(messageColumns.some((column) => column.name === "coffee_audience_bot_ids"));
      const developerTranscriptColumns = reopened
        .prepare("PRAGMA table_info(developer_transcript_events)")
        .all() as Array<{ name: string }>;
      assert.deepEqual(
        [
          "conversation_id",
          "message_id",
          "request_id",
          "request_sequence",
          "event_kind",
          "purpose",
          "payload_json",
        ].filter(
          (name) => !developerTranscriptColumns.some((column) => column.name === name)
        ),
        []
      );
      assert.ok(columns.some((column) => column.name === "export_hash"));
      assert.ok(columns.some((column) => column.name === "flirt_enabled"));
      assert.ok(columns.some((column) => column.name === "semantic_facets"));
      assert.ok(columns.some((column) => column.name === "semantic_facets_source_hash"));
      assert.ok(columns.some((column) => column.name === "semantic_facets_updated_at"));
      assert.ok(columns.some((column) => column.name === "avatar_details_json"));
      assert.ok(columns.some((column) => column.name === "powers_json"));
      assert.equal(
        userColumns.some((column) => column.name.includes("avatar_details")),
        false,
        "Avatar Details belongs to custom bots, not Default Prism settings"
      );
      assert.ok(columns.some((column) => column.name === "face_eyes_font"));
      assert.ok(columns.some((column) => column.name === "face_eye_character"));
      assert.ok(columns.some((column) => column.name === "face_eye_animation"));
      assert.ok(columns.some((column) => column.name === "face_mouth_font"));
      assert.ok(columns.some((column) => column.name === "face_mouth_character"));
      assert.ok(columns.some((column) => column.name === "face_mouth_animation"));
      assert.equal(
        columns.find((column) => column.name === "face_mouth_coffee_pucker")
          ?.dflt_value,
        "1"
      );
      assert.ok(columns.some((column) => column.name === "face_font_weight"));
      assert.ok(columns.some((column) => column.name === "face_eye_scale"));
      assert.ok(columns.some((column) => column.name === "face_eye_offset_x"));
      assert.ok(columns.some((column) => column.name === "face_eye_offset_y"));
      assert.ok(columns.some((column) => column.name === "face_eye_rotation_deg"));
      assert.equal(
        columns.find((column) => column.name === "face_eye_count")?.dflt_value,
        "1",
      );
      assert.ok(columns.some((column) => column.name === "face_mouth_scale"));
      assert.ok(columns.some((column) => column.name === "face_mouth_offset_x"));
      assert.ok(columns.some((column) => column.name === "face_mouth_offset_y"));
      assert.ok(columns.some((column) => column.name === "face_mouth_rotation_deg"));
      assert.ok(columns.some((column) => column.name === "face_blink_bar"));
      assert.ok(columns.some((column) => column.name === "face_blink_scale"));
      assert.ok(columns.some((column) => column.name === "face_blink_offset_x"));
      assert.ok(columns.some((column) => column.name === "face_blink_offset_y"));
      assert.ok(columns.some((column) => column.name === "face_thinking_frames"));
      assert.ok(columns.some((column) => column.name === "profile_picture_image_id"));
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
          "UPDATE bots SET face_eyes_font = ?, face_eye_character = ?, face_mouth_font = ?, face_mouth_character = ?, face_font_weight = ?, face_eye_scale = ?, face_eye_offset_x = ?, face_eye_offset_y = ?, face_mouth_scale = ?, face_mouth_offset_x = ?, face_mouth_offset_y = ?, face_mouth_rotation_deg = ?, face_blink_bar = ?, face_thinking_frames = ?, profile_picture_image_id = ? WHERE id = ?"
        )
        .run(
          "warm",
          "8",
          "formal",
          "△",
          725,
          1.15,
          0.06,
          -0.08,
          1.25,
          -0.04,
          0.06,
          35,
          "¦",
          '[".","o","O","o"]',
          "img-profile",
          "bot-1"
        );
      const avatarRow = reopened
        .prepare(
          "SELECT face_eyes_font, face_eye_character, face_mouth_font, face_mouth_character, face_font_weight, face_eye_scale, face_eye_offset_x, face_eye_offset_y, face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg, face_blink_bar, face_thinking_frames, profile_picture_image_id FROM bots WHERE id = ?"
        )
        .get("bot-1") as
        | {
            face_eyes_font: string | null;
            face_eye_character: string | null;
            face_mouth_font: string | null;
            face_mouth_character: string | null;
            face_font_weight: number | null;
            face_eye_scale: number | null;
            face_eye_offset_x: number | null;
            face_eye_offset_y: number | null;
            face_mouth_scale: number | null;
            face_mouth_offset_x: number | null;
            face_mouth_offset_y: number | null;
            face_mouth_rotation_deg: number | null;
            face_blink_bar: string | null;
            face_thinking_frames: string | null;
            profile_picture_image_id: string | null;
          }
        | undefined;
      assert.equal(avatarRow?.face_eyes_font, "warm");
      assert.equal(avatarRow?.face_eye_character, "8");
      assert.equal(avatarRow?.face_mouth_font, "formal");
      assert.equal(avatarRow?.face_mouth_character, "△");
      assert.equal(avatarRow?.face_font_weight, 725);
      assert.equal(avatarRow?.face_eye_scale, 1.15);
      assert.equal(avatarRow?.face_eye_offset_x, 0.06);
      assert.equal(avatarRow?.face_eye_offset_y, -0.08);
      assert.equal(avatarRow?.face_mouth_scale, 1.25);
      assert.equal(avatarRow?.face_mouth_offset_x, -0.04);
      assert.equal(avatarRow?.face_mouth_offset_y, 0.06);
      assert.equal(avatarRow?.face_mouth_rotation_deg, 35);
      assert.equal(avatarRow?.face_blink_bar, "¦");
      assert.equal(avatarRow?.face_thinking_frames, '[".","o","O","o"]');
      assert.equal(avatarRow?.profile_picture_image_id, "img-profile");
      const settingsRow = reopened
        .prepare(
          "SELECT experimental_all_model_effort_enabled, coffee_experimental_table_angle_enabled, psychic_mode_enabled, zen_message_font_min_px, zen_message_font_max_px, zen_persona_transition_choice FROM users WHERE id = ?"
        )
        .get("user-1") as
        | {
            experimental_all_model_effort_enabled: number;
            coffee_experimental_table_angle_enabled: number;
            psychic_mode_enabled: number;
            zen_message_font_min_px: number;
            zen_message_font_max_px: number;
            zen_persona_transition_choice: string;
          }
        | undefined;
      assert.equal(settingsRow?.experimental_all_model_effort_enabled, 0);
      assert.equal(settingsRow?.coffee_experimental_table_angle_enabled, 0);
      assert.equal(settingsRow?.psychic_mode_enabled, 0);
      assert.equal(settingsRow?.zen_message_font_min_px, 15.8);
      assert.equal(settingsRow?.zen_message_font_max_px, 32.8);
      assert.equal(settingsRow?.zen_persona_transition_choice, "random");
      reopened.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("createDatabase image provenance migration", () => {
  it("adds ownership and origin columns with safe defaults", () => {
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
      assert.ok(columns.some((column) => column.name === "related_bot_ids"));
      assert.ok(columns.some((column) => column.name === "origin"));
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
        .prepare("SELECT bot_id, related_bot_ids, origin FROM images WHERE id = ?")
        .get("img-1") as
        | { bot_id: string | null; related_bot_ids: string; origin: string }
        | undefined;
      assert.equal(row?.bot_id, "bot-9");
      assert.equal(row?.related_bot_ids, "[]");
      assert.equal(row?.origin, "images_panel");
      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("recovers legacy Signal studio and logo ownership from show metadata", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "localai-db-image-backfill-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "images.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      const now = "2026-07-15T00:00:00.000Z";
      db.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "user-signal",
        "signal@example.com",
        "Signal",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        now,
        now,
      );
      for (const imageId of ["studio-image", "logo-image"]) {
        db.prepare(
          "INSERT INTO images (id, user_id, prompt, url, created_at) VALUES (?, ?, ?, ?, ?)",
        ).run(imageId, "user-signal", imageId, `/images/${imageId}`, now);
      }
      db.prepare(
        `INSERT INTO botcast_shows
          (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
           atmosphere_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "show-1",
        "user-signal",
        "bob-ross",
        "Happy Little Signals",
        "Paint the airwaves.",
        "Gentle",
        "#5f8f6b",
        JSON.stringify({
          dayAtmosphere: { imageId: "studio-image" },
          logo: { imageId: "logo-image" },
        }),
        now,
        now,
      );

      initializeDatabase(db);

      const rows = db
        .prepare(
          "SELECT id, bot_id, related_bot_ids, origin FROM images ORDER BY id",
        )
        .all() as Array<{
        id: string;
        bot_id: string | null;
        related_bot_ids: string;
        origin: string;
      }>;
      assert.deepEqual(
        rows.map((row) => ({
          ...row,
          related_bot_ids: JSON.parse(row.related_bot_ids),
        })),
        [
          {
            id: "logo-image",
            bot_id: "bob-ross",
            related_bot_ids: ["bob-ross"],
            origin: "botcast",
          },
          {
            id: "studio-image",
            bot_id: "bob-ross",
            related_bot_ids: ["bob-ross"],
            origin: "botcast",
          },
        ],
      );
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
