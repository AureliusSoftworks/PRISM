import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_ZEN_WALLPAPER_OPACITY } from "./settings.ts";

export const FACTORY_RESET_USER_DATA_TABLES = [
  "pairing_codes",
  "coffee_poll_votes",
  "coffee_polls",
  "coffee_group_events",
  "coffee_group_seats",
  "coffee_presets",
  "coffee_bot_social_state",
  "prism_mood_state",
  "session_opinions",
  "bot_opinions",
  "conversation_exports",
  "conversation_sweep_batches",
  "memory_summaries",
  "memories",
  "story_sessions",
  "images",
  "messages",
  "conversations",
  "coffee_groups",
  "bots",
] as const;

export function restoreFactoryDefaultsInDatabase(
  db: DatabaseSync,
  userId: string,
  nowIso = new Date().toISOString()
): void {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (const tableName of FACTORY_RESET_USER_DATA_TABLES) {
      db.prepare(`DELETE FROM ${tableName} WHERE user_id = ?`).run(userId);
    }

    const result = db
      .prepare(
        `
        UPDATE users
        SET
          theme = 'system',
          preferred_provider = 'local',
          provider_locked = 0,
          auto_memory = 1,
          auto_switch_model = 0,
          hidden_bot_model_ids = '[]',
          hidden_comfyui_workflow_ids = '[]',
          model_visibility_defaults_version = 0,
          preferred_local_model = NULL,
          preferred_online_model = NULL,
          lenient_local_fallback_model = NULL,
          lenient_local_image_fallback_model = NULL,
          secondary_ollama_host = NULL,
          experimental_dual_ollama_enabled = 0,
          comfyui_host = NULL,
          comfyui_workflows = '[]',
          preferred_local_image_model = NULL,
          preferred_openai_image_model = NULL,
          preferred_zen_wallpaper_local_image_model = NULL,
          preferred_zen_wallpaper_openai_image_model = NULL,
          zen_wallpaper_opacity = ?,
          composer_writing_assist = 1,
          fallback_model_message_stripe = 1,
          prism_default_llm_model = NULL,
          prism_image_tool_llm_model = NULL,
          dev_memories_enabled = 0,
          dev_memories_text = '',
          openai_key_ciphertext = NULL,
          openai_key_iv = NULL,
          openai_key_tag = NULL,
          anthropic_key_ciphertext = NULL,
          anthropic_key_iv = NULL,
          anthropic_key_tag = NULL,
          elevenlabs_key_ciphertext = NULL,
          elevenlabs_key_iv = NULL,
          elevenlabs_key_tag = NULL,
          last_active_at = ?
        WHERE id = ?
      `
      )
      .run(DEFAULT_ZEN_WALLPAPER_OPACITY, nowIso, userId) as {
      changes?: number | bigint;
    };

    if (Number(result.changes ?? 0) === 0) {
      throw new Error("User not found.");
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
