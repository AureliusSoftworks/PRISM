import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../db.ts";
import {
  FACTORY_RESET_USER_DATA_TABLES,
  restoreFactoryDefaultsInDatabase,
} from "../account-reset.ts";
import {
  DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
  DEFAULT_ZEN_MESSAGE_FONT_MIN_PX,
  DEFAULT_ZEN_MOOD_SENSITIVITY,
  DEFAULT_ZEN_WALLPAPER_BLURRED_EDGES_ENABLED,
  DEFAULT_ZEN_WALLPAPER_GRAYSCALE_ENABLED,
  DEFAULT_ZEN_WALLPAPER_OPACITY,
  DEFAULT_ZEN_WALLPAPER_STYLE_NOTES,
  DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED,
} from "../settings.ts";
import type { DatabaseSync } from "node:sqlite";

describe("restoreFactoryDefaultsInDatabase", () => {
  it("clears account data and settings while preserving identity and access", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-factory-reset-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "reset.db");
    delete process.env.LOCALAI_DATA_DIR;

    try {
      const db = createDatabase();
      seedResetFixture(db);

      restoreFactoryDefaultsInDatabase(
        db,
        "user-1",
        "2026-06-19T12:00:00.000Z"
      );

      for (const tableName of FACTORY_RESET_USER_DATA_TABLES) {
        assert.equal(countRows(db, tableName), 0, `${tableName} should be empty`);
      }

      assert.equal(countRows(db, "sessions"), 1);
      assert.equal(countRows(db, "client_access_tokens"), 1);

      const user = db
        .prepare(
          `
          SELECT
            email, display_name, theme, preferred_provider, provider_locked,
            auto_memory, auto_switch_model, hidden_bot_model_ids,
            hidden_comfyui_workflow_ids, model_visibility_defaults_version,
            preferred_local_model, preferred_online_model,
            lenient_local_fallback_model, lenient_local_image_fallback_model,
            secondary_ollama_host, experimental_dual_ollama_enabled,
            experimental_all_model_effort_enabled, psychic_mode_enabled,
            comfyui_host, comfyui_workflows, preferred_local_image_model,
            preferred_openai_image_model, preferred_zen_wallpaper_local_image_model,
            preferred_zen_wallpaper_openai_image_model, zen_wallpaper_opacity,
            zen_wallpaper_text_mask_enabled, zen_wallpaper_grayscale_enabled,
            zen_wallpaper_blurred_edges_enabled,
            zen_wallpaper_style_notes,
            zen_mood_sensitivity,
            zen_message_font_min_px, zen_message_font_max_px,
            composer_writing_assist, fallback_model_message_stripe,
            prism_default_llm_model, prism_image_tool_llm_model,
            dev_memories_enabled, dev_memories_text, openai_key_ciphertext,
            anthropic_key_ciphertext, elevenlabs_key_ciphertext, last_active_at
          FROM users
          WHERE id = ?
        `
        )
        .get("user-1") as Record<string, unknown> | undefined;

      assert.ok(user);
      assert.equal(user.email, "user-1@example.com");
      assert.equal(user.display_name, "User One");
      assert.equal(user.theme, "system");
      assert.equal(user.preferred_provider, "local");
      assert.equal(user.provider_locked, 0);
      assert.equal(user.auto_memory, 1);
      assert.equal(user.auto_switch_model, 0);
      assert.equal(user.hidden_bot_model_ids, "[]");
      assert.equal(user.hidden_comfyui_workflow_ids, "[]");
      assert.equal(user.model_visibility_defaults_version, 0);
      assert.equal(user.preferred_local_model, null);
      assert.equal(user.preferred_online_model, null);
      assert.equal(user.lenient_local_fallback_model, null);
      assert.equal(user.lenient_local_image_fallback_model, null);
      assert.equal(user.secondary_ollama_host, null);
      assert.equal(user.experimental_dual_ollama_enabled, 0);
      assert.equal(user.experimental_all_model_effort_enabled, 0);
      assert.equal(user.psychic_mode_enabled, 0);
      assert.equal(user.comfyui_host, null);
      assert.equal(user.comfyui_workflows, "[]");
      assert.equal(user.preferred_local_image_model, null);
      assert.equal(user.preferred_openai_image_model, null);
      assert.equal(user.preferred_zen_wallpaper_local_image_model, null);
      assert.equal(user.preferred_zen_wallpaper_openai_image_model, null);
      assert.equal(user.zen_wallpaper_opacity, DEFAULT_ZEN_WALLPAPER_OPACITY);
      assert.equal(
        user.zen_wallpaper_text_mask_enabled,
        DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED ? 1 : 0
      );
      assert.equal(
        user.zen_wallpaper_grayscale_enabled,
        DEFAULT_ZEN_WALLPAPER_GRAYSCALE_ENABLED ? 1 : 0
      );
      assert.equal(
        user.zen_wallpaper_blurred_edges_enabled,
        DEFAULT_ZEN_WALLPAPER_BLURRED_EDGES_ENABLED ? 1 : 0
      );
      assert.equal(
        user.zen_wallpaper_style_notes,
        DEFAULT_ZEN_WALLPAPER_STYLE_NOTES
      );
      assert.equal(user.zen_mood_sensitivity, DEFAULT_ZEN_MOOD_SENSITIVITY);
      assert.equal(user.zen_message_font_min_px, DEFAULT_ZEN_MESSAGE_FONT_MIN_PX);
      assert.equal(user.zen_message_font_max_px, DEFAULT_ZEN_MESSAGE_FONT_MAX_PX);
      assert.equal(user.composer_writing_assist, 1);
      assert.equal(user.fallback_model_message_stripe, 1);
      assert.equal(user.prism_default_llm_model, null);
      assert.equal(user.prism_image_tool_llm_model, null);
      assert.equal(user.dev_memories_enabled, 0);
      assert.equal(user.dev_memories_text, "");
      assert.equal(user.openai_key_ciphertext, null);
      assert.equal(user.anthropic_key_ciphertext, null);
      assert.equal(user.elevenlabs_key_ciphertext, null);
      assert.equal(user.last_active_at, "2026-06-19T12:00:00.000Z");

      db.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function seedResetFixture(db: DatabaseSync): void {
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

  db.prepare(
    `
    UPDATE users
    SET
      theme = 'dark',
      preferred_provider = 'openai',
      provider_locked = 1,
      auto_memory = 0,
      auto_switch_model = 1,
      hidden_bot_model_ids = '["model-a"]',
      hidden_comfyui_workflow_ids = '["workflow-a"]',
      model_visibility_defaults_version = 99,
      preferred_local_model = 'local-a',
      preferred_online_model = 'online-a',
      lenient_local_fallback_model = 'fallback-a',
      lenient_local_image_fallback_model = 'image-fallback-a',
      secondary_ollama_host = 'http://192.168.1.7:11434',
      experimental_dual_ollama_enabled = 1,
      experimental_all_model_effort_enabled = 1,
      psychic_mode_enabled = 1,
      comfyui_host = 'http://192.168.1.8:8188',
      comfyui_workflows = '[{"id":"workflow-a"}]',
      preferred_local_image_model = 'local-image-a',
      preferred_openai_image_model = 'openai-image-a',
      preferred_zen_wallpaper_local_image_model = 'wall-local-a',
      preferred_zen_wallpaper_openai_image_model = 'wall-openai-a',
      zen_wallpaper_opacity = 0.33,
      zen_wallpaper_text_mask_enabled = 0,
      zen_wallpaper_grayscale_enabled = 1,
      zen_wallpaper_blurred_edges_enabled = 0,
      zen_wallpaper_style_notes = 'paper grain',
      zen_mood_sensitivity = 0.88,
      zen_message_font_min_px = 18.4,
      zen_message_font_max_px = 38.2,
      composer_writing_assist = 0,
      fallback_model_message_stripe = 0,
      prism_default_llm_model = 'aux-a',
      prism_image_tool_llm_model = 'tool-a',
      dev_memories_enabled = 1,
      dev_memories_text = 'dev notes',
      openai_key_ciphertext = 'openai-cipher',
      openai_key_iv = 'openai-iv',
      openai_key_tag = 'openai-tag',
      anthropic_key_ciphertext = 'anthropic-cipher',
      anthropic_key_iv = 'anthropic-iv',
      anthropic_key_tag = 'anthropic-tag',
      elevenlabs_key_ciphertext = 'eleven-cipher',
      elevenlabs_key_iv = 'eleven-iv',
      elevenlabs_key_tag = 'eleven-tag'
    WHERE id = ?
  `
  ).run("user-1");

  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    "session-1",
    "user-1",
    "2030-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO client_access_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(
    "client-1",
    "user-1",
    "2030-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO pairing_codes (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    "pair-1",
    "user-1",
    "pair-hash-1",
    "2030-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    "bot-1",
    "user-1",
    "Bot One",
    "Prompt",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_groups (id, user_id, name, coffee_settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    "coffee-group-1",
    "user-1",
    "Table",
    "{}",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, coffee_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "conversation-1",
    "user-1",
    "Hello",
    "coffee",
    "bot-1",
    "coffee-group-1",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "message-1",
    "conversation-1",
    "user-1",
    "user",
    "Hi",
    "bot-1",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "memory-1",
    "user-1",
    "conversation-1",
    "bot-1",
    "ciphertext",
    "iv",
    "tag",
    0.9,
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, url, provider, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "image-1",
    "user-1",
    "conversation-1",
    "bot-1",
    "cat",
    "http://example.com/cat.png",
    "openai",
    "gpt-image-1",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO story_sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    "story-1",
    "user-1",
    "Quest",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO conversation_exports (id, user_id, conversation_id, markdown, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    "export-1",
    "user-1",
    "conversation-1",
    "# Export",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO conversation_sweep_batches (id, user_id, archived_conversation_ids, summary_conversation_ids, created_at, undo_expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    "sweep-1",
    "user-1",
    '["conversation-1"]',
    "[]",
    "2026-01-01T00:00:00.000Z",
    "2030-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    "summary-1",
    "user-1",
    "conversation-1",
    "Summary",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO session_opinions (user_id, conversation_id, bot_scope_key, updated_at) VALUES (?, ?, ?, ?)"
  ).run(
    "user-1",
    "conversation-1",
    "bot:bot-1",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO bot_opinions (user_id, bot_scope_key, bot_id, updated_at) VALUES (?, ?, ?, ?)"
  ).run(
    "user-1",
    "bot:bot-1",
    "bot-1",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_bot_social_state (user_id, conversation_id, bot_id, updated_at) VALUES (?, ?, ?, ?)"
  ).run(
    "user-1",
    "conversation-1",
    "bot-1",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_group_seats (user_id, group_id, seat_index, bot_id, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    "user-1",
    "coffee-group-1",
    0,
    "bot-1",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_presets (id, user_id, name, coffee_settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    "coffee-preset-1",
    "user-1",
    "Preset",
    "{}",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_group_events (id, user_id, group_id, event_type, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    "coffee-event-1",
    "user-1",
    "coffee-group-1",
    "created",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_polls (id, user_id, conversation_id, question, options_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "coffee-poll-1",
    "user-1",
    "conversation-1",
    "Question?",
    '["A","B"]',
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO coffee_poll_votes (user_id, poll_id, conversation_id, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    "user-1",
    "coffee-poll-1",
    "conversation-1",
    "bot-1",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
}

function countRows(db: DatabaseSync, tableName: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE user_id = ?`)
    .get("user-1") as { count: number } | undefined;
  return row?.count ?? 0;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
