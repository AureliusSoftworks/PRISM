import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChatMessage,
  CoffeeBotSocialSnapshot,
  CoffeeCupTopOffSnapshot,
  Conversation,
  MemoryCategory,
  MemoryTier,
  OpinionTrend,
  PrismMoodKey,
  PrismMoodMode,
  PrismMoodSnapshot,
  UserMemory,
  UserProfile,
} from "@localai/shared";
import {
  COFFEE_SESSION_DURATION_MINUTES_MAX,
  COFFEE_SESSION_DURATION_MINUTES_MIN,
  sanitizePrismMoodState,
  type CoffeeSessionDurationMinutes,
} from "@localai/shared";

export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

export interface DbUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  wrappedUserKey: string;
  wrappedUserKeyIv: string;
  wrappedUserKeyTag: string;
  theme: "light" | "dark" | "system";
  preferredProvider: "local" | "openai" | "anthropic";
  preferredImageProvider: "local" | "openai";
  providerLocked: number;
  autoMemory: number;
  autoSwitchModel: number;
  preferredLocalModel: string | null;
  preferredOnlineModel: string | null;
  lenientLocalFallbackModel: string | null;
  secondaryOllamaHost: string | null;
  comfyUiHost: string | null;
  composerWritingAssist: number;
  experimentalDualOllamaEnabled: number;
  experimentalAllModelEffortEnabled: number;
  coffeeExperimentalTableAngleEnabled: number;
  psychicModeEnabled: number;
  openAiKeyCiphertext: string | null;
  openAiKeyIv: string | null;
  openAiKeyTag: string | null;
  anthropicKeyCiphertext: string | null;
  anthropicKeyIv: string | null;
  anthropicKeyTag: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface DbMemoryRecord {
  id: string;
  userId: string;
  ciphertext: string;
  iv: string;
  tag: string;
  confidence: number;
  category: MemoryCategory;
  tier: MemoryTier;
  durability: number;
  source: "direct" | "inferred" | "compiled" | "about_you";
  certainty: number | null;
  sourceMessageIds: string;
  createdAt: string;
}

interface DbCoffeeBotSocialRow {
  bot_id: string;
  disposition: number;
  values_friction: number;
  restraint: number;
  engagement: number;
  leave_pressure: number;
}

interface DbCoffeeCupTopOffRow {
  bot_id: string;
  progress_before: number;
  progress_after: number;
  topped_off_at: string;
}

type DbBotRelationshipRow = {
  source_bot_id: string;
  target_bot_id: string;
  score: number;
  band: string;
  mood_key: string;
  trend: string;
  last_reason: string;
  recent_reasons: string;
  updated_at: string;
};

export type BotRelationshipBand = "tense" | "neutral" | "warm";

export interface BotRelationshipSnapshot {
  sourceBotId: string;
  targetBotId: string;
  score: number;
  band: BotRelationshipBand;
  moodKey: PrismMoodKey;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  updatedAt: string;
}

interface DbPrismMoodRow {
  mode: string;
  mood_key: string;
  confidence: number;
  annoyance: number;
  warmth: number;
  engagement: number;
  restraint: number;
  recent_deltas: string;
  ignore_until: string | null;
  ignore_cooldown_ms: number | null;
  ignore_forgiveness_chance: number | null;
  ignore_penalty_level: number | null;
  frozen: number;
  updated_at: string;
}

export function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  if (process.env.LOCALAI_DATA_DIR) {
    return join(process.env.LOCALAI_DATA_DIR, "localai.db");
  }
  const srcDir = fileURLToPath(new URL(".", import.meta.url));
  return join(srcDir, "..", "data", "localai.db");
}

/**
 * Apply the current production schema and migrations to an existing database.
 *
 * Keeping this separate from the file-opening wrapper lets tests use an
 * in-memory SQLite database with the exact same schema and migration path as
 * production. This prevents handwritten fixtures from drifting as columns are
 * added to the application database.
 */
export function initializeDatabase(db: DatabaseSync): DatabaseSync {
  db.exec(`
    PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      wrapped_user_key TEXT NOT NULL,
      wrapped_user_key_iv TEXT NOT NULL,
      wrapped_user_key_tag TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'system',
      graphics_quality TEXT NOT NULL DEFAULT 'high',
      preferred_provider TEXT NOT NULL DEFAULT 'local',
      ephemeral_chat_provider_preferences TEXT NOT NULL DEFAULT '{}',
      preferred_image_provider TEXT NOT NULL DEFAULT 'local',
      provider_locked INTEGER NOT NULL DEFAULT 0,
      auto_memory INTEGER NOT NULL DEFAULT 1,
      auto_switch_model INTEGER NOT NULL DEFAULT 0,
      auto_fallback_chain TEXT,
      hidden_bot_model_ids TEXT NOT NULL DEFAULT '[]',
      hidden_comfyui_workflow_ids TEXT NOT NULL DEFAULT '[]',
      model_visibility_defaults_version INTEGER NOT NULL DEFAULT 0,
      preferred_local_model TEXT,
      preferred_online_model TEXT,
      lenient_local_fallback_model TEXT,
      secondary_ollama_host TEXT,
      experimental_dual_ollama_enabled INTEGER NOT NULL DEFAULT 0,
      experimental_all_model_effort_enabled INTEGER NOT NULL DEFAULT 0,
      coffee_experimental_table_angle_enabled INTEGER NOT NULL DEFAULT 0,
      psychic_mode_enabled INTEGER NOT NULL DEFAULT 0,
      comfyui_host TEXT,
      comfyui_workflows TEXT NOT NULL DEFAULT '[]',
      preferred_local_image_model TEXT,
      preferred_openai_image_model TEXT,
      preferred_zen_wallpaper_local_image_model TEXT,
      preferred_zen_wallpaper_openai_image_model TEXT,
      zen_wallpaper_opacity REAL NOT NULL DEFAULT 0.28,
      zen_wallpaper_text_mask_enabled INTEGER NOT NULL DEFAULT 1,
      zen_wallpaper_grayscale_enabled INTEGER NOT NULL DEFAULT 1,
      zen_wallpaper_blurred_edges_enabled INTEGER NOT NULL DEFAULT 1,
      zen_wallpaper_style_notes TEXT NOT NULL DEFAULT '',
      zen_session_idle_gap_ms INTEGER NOT NULL DEFAULT 43200000,
      zen_fresh_start_gap_ms INTEGER NOT NULL DEFAULT 604800000,
      zen_recent_context_messages INTEGER NOT NULL DEFAULT 30,
      zen_wallpaper_regen_message_interval INTEGER NOT NULL DEFAULT 30,
      zen_mood_sensitivity REAL NOT NULL DEFAULT 0.5,
      zen_canvas_typing_speed REAL NOT NULL DEFAULT 1,
      zen_message_font_min_px REAL NOT NULL DEFAULT 15.8,
      zen_message_font_max_px REAL NOT NULL DEFAULT 32.8,
      zen_ask_question_patience_enabled INTEGER NOT NULL DEFAULT 0,
      zen_ask_question_patience_ms INTEGER NOT NULL DEFAULT 60000,
      zen_autonomy_enabled INTEGER NOT NULL DEFAULT 0,
      zen_persona_transition_choice TEXT NOT NULL DEFAULT 'random',
      prism_default_bot_name TEXT,
      prism_default_bot_system_prompt TEXT,
      prism_default_bot_color TEXT,
      prism_default_bot_glyph TEXT,
      prism_default_bot_face_eyes_font TEXT,
      prism_default_bot_face_eye_character TEXT,
      prism_default_bot_face_eye_animation TEXT,
      prism_default_bot_face_mouth_font TEXT,
      prism_default_bot_face_mouth_character TEXT,
      prism_default_bot_face_mouth_animation TEXT,
      prism_default_bot_face_mouth_coffee_pucker INTEGER NOT NULL DEFAULT 1,
      prism_default_bot_face_font_weight INTEGER,
      prism_default_bot_face_eye_scale REAL,
      prism_default_bot_face_eye_offset_x REAL,
      prism_default_bot_face_eye_offset_y REAL,
      prism_default_bot_face_eye_rotation_deg REAL,
      prism_default_bot_face_eye_count INTEGER NOT NULL DEFAULT 1,
      prism_default_bot_face_mouth_scale REAL,
      prism_default_bot_face_mouth_offset_x REAL,
      prism_default_bot_face_mouth_offset_y REAL,
      prism_default_bot_face_mouth_rotation_deg REAL,
      prism_default_bot_face_blink_bar TEXT,
      prism_default_bot_face_blink_scale REAL,
      prism_default_bot_face_blink_offset_x REAL,
      prism_default_bot_face_blink_offset_y REAL,
      prism_default_bot_face_thinking_frames TEXT,
      prism_default_bot_temperature REAL,
      prism_default_bot_max_tokens INTEGER,
      prism_default_bot_top_p REAL,
      prism_default_bot_top_k INTEGER,
      prism_default_bot_repetition_penalty REAL,
      composer_writing_assist INTEGER NOT NULL DEFAULT 1,
      dev_memories_enabled INTEGER NOT NULL DEFAULT 0,
      dev_memories_text TEXT NOT NULL DEFAULT '',
      openai_key_ciphertext TEXT,
      openai_key_iv TEXT,
      openai_key_tag TEXT,
      anthropic_key_ciphertext TEXT,
      anthropic_key_iv TEXT,
      anthropic_key_tag TEXT,
      elevenlabs_key_ciphertext TEXT,
      elevenlabs_key_iv TEXT,
      elevenlabs_key_tag TEXT,
      brave_search_key_ciphertext TEXT,
      brave_search_key_iv TEXT,
      brave_search_key_tag TEXT,
      voice_mode TEXT NOT NULL DEFAULT 'mute',
      voice_effects_enabled INTEGER NOT NULL DEFAULT 1,
      voice_volume REAL NOT NULL DEFAULT 1,
      operating_system_voices_enabled INTEGER NOT NULL DEFAULT 0,
      english_voice_engine TEXT NOT NULL DEFAULT 'builtin',
      default_system_voice_name TEXT,
      default_elevenlabs_voice_id TEXT,
      elevenlabs_voice_bank TEXT NOT NULL DEFAULT '{}',
      elevenlabs_voice_model TEXT,
      elevenlabs_voice_collection_id TEXT,
      player_audio_voice_profile TEXT,
      player_name_pronunciation TEXT NOT NULL DEFAULT '',
      prism_default_bot_audio_voice_profile TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      document_version TEXT NOT NULL,
      document_hash TEXT NOT NULL,
      document_snapshot TEXT NOT NULL,
      acceptance_method TEXT NOT NULL,
      minimum_age_confirmed INTEGER NOT NULL CHECK(minimum_age_confirmed = 1),
      accepted_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, document_id, document_version)
    );
    CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_accepted
      ON legal_acceptances(user_id, accepted_at DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS client_access_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS pairing_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      bot_group_ids TEXT,
      parent_id TEXT,
      fork_message_id TEXT,
      archived_at TEXT,
      archive_batch_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      coffee_settings TEXT,
      coffee_group_id TEXT,
      coffee_duration_minutes INTEGER,
      coffee_preset_id TEXT,
      coffee_topic TEXT,
      coffee_absent_bot_ids TEXT NOT NULL DEFAULT '[]',
      coffee_team_mode_json TEXT,
      coffee_meeting_summary TEXT,
      coffee_meeting_summary_message_count INTEGER,
      coffee_meeting_summary_updated_at TEXT,
      coffee_power_plan_json TEXT,
      zen_wallpaper_enabled INTEGER NOT NULL DEFAULT 0,
      zen_wallpaper_image_id TEXT,
      zen_wallpaper_prompt_seed TEXT,
      zen_wallpaper_message_count INTEGER,
      zen_wallpaper_status TEXT NOT NULL DEFAULT 'idle',
      zen_wallpaper_history TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS conversation_hubs (
      user_id TEXT NOT NULL,
      bot_key TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, bot_key),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_hubs_conversation
      ON conversation_hubs(conversation_id);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      bot_id TEXT,
      tool_payload TEXT,
      coffee_audience_bot_ids TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      message_id TEXT,
      bot_id TEXT,
      request_id TEXT NOT NULL,
      privacy_scope TEXT NOT NULL DEFAULT 'normal',
      mode TEXT,
      surface TEXT NOT NULL,
      purpose TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'text',
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cached_input_tokens INTEGER,
      image_count INTEGER,
      image_size TEXT,
      image_quality TEXT,
      duration_ms INTEGER,
      load_duration_ms INTEGER,
      prompt_duration_ms INTEGER,
      completion_duration_ms INTEGER,
      token_count_source TEXT NOT NULL DEFAULT 'unavailable',
      cost_micro_usd INTEGER,
      pricing_snapshot_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS developer_transcript_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      message_id TEXT,
      bot_id TEXT,
      request_id TEXT NOT NULL,
      request_sequence INTEGER NOT NULL,
      event_kind TEXT NOT NULL,
      purpose TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      related_bot_ids TEXT NOT NULL DEFAULT '[]',
      origin TEXT NOT NULL DEFAULT 'images_panel',
      prompt TEXT NOT NULL,
      revised_prompt TEXT,
      url TEXT NOT NULL,
      size TEXT NOT NULL DEFAULT '1024x1024',
      quality TEXT NOT NULL DEFAULT 'standard',
      provider TEXT NOT NULL DEFAULT 'openai',
      local_rel_path TEXT,
      model TEXT NOT NULL DEFAULT 'gpt-image-2',
      purpose TEXT NOT NULL DEFAULT 'gallery',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS story_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      theme_id TEXT NOT NULL DEFAULT 'prism_default',
      status TEXT NOT NULL DEFAULT 'generating',
      provider TEXT NOT NULL DEFAULT 'local',
      model TEXT,
      bot_ids TEXT NOT NULL DEFAULT '[]',
      premise TEXT,
      episode_json TEXT,
      progress_json TEXT,
      transcript_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_series (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT,
      book_ordinal INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      title_origin TEXT NOT NULL DEFAULT 'writer',
      spark TEXT NOT NULL,
      spark_wildcards_json TEXT NOT NULL DEFAULT '',
      cover_json TEXT NOT NULL DEFAULT '{}',
      premise TEXT NOT NULL DEFAULT '',
      voice TEXT NOT NULL DEFAULT '',
      non_negotiables_json TEXT NOT NULL DEFAULT '[]',
      phase TEXT NOT NULL DEFAULT 'shape',
      structure_json TEXT NOT NULL DEFAULT '[]',
      characters_json TEXT NOT NULL DEFAULT '[]',
      unresolved_threads_json TEXT NOT NULL DEFAULT '[]',
      manuscript TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT '',
      locked_ranges_json TEXT NOT NULL DEFAULT '[]',
      last_provider TEXT,
      last_model TEXT,
      prose_mode TEXT NOT NULL DEFAULT 'auto',
      prose_model TEXT,
      prose_provider TEXT,
      deliberation_config_json TEXT NOT NULL DEFAULT '{}',
      continuity_active_version TEXT NOT NULL DEFAULT '0.0',
      continuity_target_version TEXT NOT NULL DEFAULT '0.0',
      continuity_active_generation INTEGER NOT NULL DEFAULT 0,
      continuity_previous_generation INTEGER,
      continuity_upgrade_status TEXT NOT NULL DEFAULT 'current',
      continuity_last_success_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_revisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      scope TEXT NOT NULL,
      structure_item_id TEXT,
      selection_start INTEGER,
      selection_end INTEGER,
      direction TEXT NOT NULL DEFAULT '',
      original_text TEXT NOT NULL,
      proposed_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      structure_json TEXT NOT NULL,
      manuscript TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_sections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      parent_section_id TEXT,
      structure_item_id TEXT,
      kind TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT '',
      prose TEXT NOT NULL DEFAULT '',
      locked_ranges_json TEXT NOT NULL DEFAULT '[]',
      locked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned',
      revision INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      last_mutation_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, project_id, ordinal),
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_section_id) REFERENCES slate_sections(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS slate_section_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      reason TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      direction TEXT NOT NULL,
      prose TEXT NOT NULL,
      locked INTEGER NOT NULL,
      status TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, section_id, revision),
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_manuscript_state (
      project_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      storage_version INTEGER NOT NULL DEFAULT 1,
      structure_revision INTEGER NOT NULL DEFAULT 0,
      original_manuscript_hash TEXT,
      migrated_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_manuscript_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      format TEXT NOT NULL,
      filename TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_return_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      synopsis_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_generation_receipts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      section_id TEXT,
      revision_id TEXT,
      operation TEXT NOT NULL,
      artifact_hash TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE SET NULL,
      FOREIGN KEY(revision_id) REFERENCES slate_revisions(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS slate_project_chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_living_summaries (
      project_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      summary TEXT NOT NULL,
      summary_tail TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_title_suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      suggested_title TEXT NOT NULL,
      reason TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT,
      section_id TEXT,
      scope_kind TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_revision INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      authority TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      producer_versions_json TEXT NOT NULL,
      supersedes_source_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, section_id, source_revision, kind),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE,
      FOREIGN KEY(supersedes_source_id) REFERENCES slate_continuity_sources(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_entities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      locked INTEGER NOT NULL DEFAULT 0,
      anchors_json TEXT NOT NULL DEFAULT '[]',
      source_id TEXT,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_aliases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      source_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, series_id, entity_id, normalized_alias),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(entity_id) REFERENCES slate_continuity_entities(id) ON DELETE CASCADE,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT,
      section_id TEXT,
      scope_kind TEXT NOT NULL,
      subject_entity_id TEXT,
      predicate TEXT NOT NULL,
      object_entity_id TEXT,
      value TEXT NOT NULL DEFAULT '',
      epistemic_status TEXT NOT NULL,
      perspective_entity_id TEXT,
      confidence REAL NOT NULL,
      anchors_json TEXT NOT NULL DEFAULT '[]',
      source_id TEXT NOT NULL,
      supersedes_claim_id TEXT,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE SET NULL,
      FOREIGN KEY(object_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE SET NULL,
      FOREIGN KEY(perspective_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE SET NULL,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE,
      FOREIGN KEY(supersedes_claim_id) REFERENCES slate_continuity_claims(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT,
      section_id TEXT,
      scope_kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      chronology_key TEXT,
      participant_entity_ids_json TEXT NOT NULL DEFAULT '[]',
      location_entity_id TEXT,
      anchors_json TEXT NOT NULL DEFAULT '[]',
      source_id TEXT NOT NULL,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE,
      FOREIGN KEY(location_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE SET NULL,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_relationships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '',
      epistemic_status TEXT NOT NULL,
      anchors_json TEXT NOT NULL DEFAULT '[]',
      source_id TEXT NOT NULL,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(from_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE CASCADE,
      FOREIGN KEY(to_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE CASCADE,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_knowledge (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      character_entity_id TEXT NOT NULL,
      claim_id TEXT NOT NULL,
      learned_event_id TEXT,
      status TEXT NOT NULL,
      anchors_json TEXT NOT NULL DEFAULT '[]',
      source_id TEXT NOT NULL,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(character_entity_id) REFERENCES slate_continuity_entities(id) ON DELETE CASCADE,
      FOREIGN KEY(claim_id) REFERENCES slate_continuity_claims(id) ON DELETE CASCADE,
      FOREIGN KEY(learned_event_id) REFERENCES slate_continuity_events(id) ON DELETE SET NULL,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT,
      section_id TEXT,
      scope_kind TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      due_section_id TEXT,
      anchors_json TEXT NOT NULL DEFAULT '[]',
      source_id TEXT NOT NULL,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE,
      FOREIGN KEY(due_section_id) REFERENCES slate_sections(id) ON DELETE SET NULL,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_concerns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT,
      section_id TEXT,
      scope_kind TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      summary TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      claim_ids_json TEXT NOT NULL DEFAULT '[]',
      anchors_json TEXT NOT NULL DEFAULT '[]',
      recommended_resolution TEXT,
      resolution_json TEXT,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      status TEXT NOT NULL,
      target_version TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      comparison_summary TEXT,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(user_id, project_id, generation),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      section_id TEXT,
      source_id TEXT,
      source_revision INTEGER,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      input_fingerprint TEXT NOT NULL,
      error TEXT,
      available_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, project_id, kind, input_fingerprint),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_source_indexes (
      source_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      section_id TEXT,
      source_revision INTEGER NOT NULL,
      action TEXT NOT NULL,
      processing_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      checkpoint_json TEXT NOT NULL,
      candidate_counts_json TEXT NOT NULL DEFAULT '{}',
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES slate_continuity_sources(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES slate_series(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS slate_continuity_context_briefs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_revision INTEGER NOT NULL,
      source_fingerprint TEXT NOT NULL,
      rendered_brief TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      token_budget INTEGER NOT NULL,
      producer_versions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, project_id, source_fingerprint),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES slate_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(section_id) REFERENCES slate_sections(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_pronunciation TEXT NOT NULL DEFAULT '',
      self_referral TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      clone_family_id TEXT,
      voice_preview_line TEXT,
      export_hash TEXT,
      semantic_facets TEXT,
      semantic_facets_source_hash TEXT,
      semantic_facets_updated_at TEXT,
      powers_json TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      local_image_model TEXT,
      openai_image_model TEXT,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      top_p REAL DEFAULT 1,
      top_k INTEGER DEFAULT 40,
      repetition_penalty REAL DEFAULT 1.1,
      color TEXT,
      glyph TEXT,
      avatar_details_json TEXT,
      face_eyes_font TEXT,
      face_eye_character TEXT,
      face_eye_animation TEXT,
      face_mouth_font TEXT,
      face_mouth_character TEXT,
      face_mouth_animation TEXT,
      face_mouth_coffee_pucker INTEGER NOT NULL DEFAULT 1,
      face_font_weight INTEGER,
      face_eye_scale REAL,
      face_eye_offset_x REAL,
      face_eye_offset_y REAL,
      face_eye_rotation_deg REAL,
      face_eye_count INTEGER NOT NULL DEFAULT 1,
      face_mouth_scale REAL,
      face_mouth_offset_x REAL,
      face_mouth_offset_y REAL,
      face_mouth_rotation_deg REAL,
      face_blink_bar TEXT,
      face_blink_scale REAL,
      face_blink_offset_x REAL,
      face_blink_offset_y REAL,
      face_thinking_frames TEXT,
      authored_audio_voice_profile TEXT,
      audio_voice_profile_override TEXT,
      profile_picture_image_id TEXT,
      chat_enabled INTEGER NOT NULL DEFAULT 1,
      online_enabled INTEGER NOT NULL DEFAULT 1,
      delete_protected INTEGER NOT NULL DEFAULT 0,
      flirt_enabled INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS conversation_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      markdown TEXT NOT NULL,
      bot_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS conversation_sweep_batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      archived_conversation_ids TEXT NOT NULL,
      summary_conversation_ids TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undo_expires_at TEXT NOT NULL,
      undone_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS zen_session_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_zen_session_memories_user_expires
      ON zen_session_memories(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_zen_session_memories_user_created
      ON zen_session_memories(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS session_opinions (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      bot_id TEXT,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'warming',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_scope_key),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bot_opinions (
      user_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      bot_id TEXT,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'open',
      boundary_level TEXT NOT NULL DEFAULT 'none',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      repair_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, bot_scope_key),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bot_relationships (
      user_id TEXT NOT NULL,
      source_bot_id TEXT NOT NULL,
      target_bot_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'neutral',
      mood_key TEXT NOT NULL DEFAULT 'neutral',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source_bot_id, target_bot_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_bot_social_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      disposition REAL NOT NULL DEFAULT 0.5,
      values_friction REAL NOT NULL DEFAULT 0.35,
      restraint REAL NOT NULL DEFAULT 0.65,
      engagement REAL NOT NULL DEFAULT 0.65,
      leave_pressure REAL NOT NULL DEFAULT 0.1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_cup_top_offs (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      progress_before REAL NOT NULL DEFAULT 0,
      progress_after REAL NOT NULL DEFAULT 0,
      topped_off_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS prism_mood_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      mood_key TEXT NOT NULL DEFAULT 'neutral',
      confidence REAL NOT NULL DEFAULT 0.5,
      annoyance REAL NOT NULL DEFAULT 0.12,
      warmth REAL NOT NULL DEFAULT 0.62,
      engagement REAL NOT NULL DEFAULT 0.62,
      restraint REAL NOT NULL DEFAULT 0.68,
      recent_deltas TEXT NOT NULL DEFAULT '[]',
      ignore_until TEXT,
      ignore_cooldown_ms INTEGER,
      ignore_forgiveness_chance REAL,
      ignore_penalty_level INTEGER,
      frozen INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, mode),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS prism_mood_events (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (user_id, conversation_id, message_id, event_type),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      preset_mode TEXT NOT NULL DEFAULT 'manual',
      coffee_topic_mode TEXT NOT NULL DEFAULT 'manual',
      model_choice TEXT NOT NULL DEFAULT '{}',
      starter_topics TEXT NOT NULL DEFAULT '{}',
      mood_summary TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_group_seats (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      seat_index INTEGER NOT NULL,
      bot_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, group_id, seat_index),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES coffee_groups(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_group_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES coffee_groups(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_shows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      host_bot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      premise TEXT NOT NULL,
      hosting_style TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      fallback_studio_accent_variant INTEGER NOT NULL DEFAULT 0
        CHECK (fallback_studio_accent_variant IN (0, 1, 2)),
      host_chat_ignoring_until_guest_show INTEGER NOT NULL DEFAULT 0
        CHECK (host_chat_ignoring_until_guest_show IN (0, 1)),
      atmosphere_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, host_bot_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_show_intro_audio (
      show_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('elevenlabs')),
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      content_type TEXT NOT NULL,
      audio_bytes BLOB NOT NULL,
      duration_ms INTEGER NOT NULL,
      outdent_prompt TEXT,
      outdent_content_type TEXT,
      outdent_audio_bytes BLOB,
      outdent_duration_ms INTEGER,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(show_id) REFERENCES botcast_shows(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_show_atmosphere_audio (
      show_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('elevenlabs')),
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      content_type TEXT NOT NULL,
      audio_bytes BLOB NOT NULL,
      duration_ms INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(show_id) REFERENCES botcast_shows(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_episodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      show_id TEXT NOT NULL,
      host_bot_id TEXT NOT NULL,
      guest_bot_id TEXT NOT NULL,
      guest_kind TEXT NOT NULL DEFAULT 'bot'
        CHECK (guest_kind IN ('bot', 'producer')),
      guest_name TEXT NOT NULL DEFAULT '',
      guest_context TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      producer_brief TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'local',
      model TEXT,
      response_mode TEXT NOT NULL DEFAULT 'local'
        CHECK (response_mode IN ('local', 'auto', 'online')),
      duration_minutes INTEGER
        CHECK (duration_minutes IS NULL OR (duration_minutes >= 3 AND duration_minutes <= 30)),
      status TEXT NOT NULL DEFAULT 'live',
      segment TEXT NOT NULL DEFAULT 'opening',
      outcome TEXT,
      tension_level INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      runtime_ms INTEGER,
      model_warmup_hold_duration_ms INTEGER NOT NULL DEFAULT 0,
      model_warmup_hold_started_at TEXT,
      persona_reviewer_bot_id TEXT,
      persona_reviewer_name TEXT,
      persona_rating REAL CHECK (persona_rating IS NULL OR (persona_rating >= 1 AND persona_rating <= 5)),
      persona_comment TEXT,
      persona_reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(show_id) REFERENCES botcast_shows(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_episode_segments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      segment TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      UNIQUE(user_id, episode_id, ordinal),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(episode_id) REFERENCES botcast_episodes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      speaker_role TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      content TEXT NOT NULL,
      stage_action_text TEXT,
      voice_performance_text TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(episode_id) REFERENCES botcast_episodes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS botcast_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      UNIQUE(user_id, episode_id, sequence),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(episode_id) REFERENCES botcast_episodes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS replay_recordings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      surface TEXT NOT NULL CHECK (surface IN ('signal', 'coffee')),
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'collecting'
        CHECK (status IN (
          'collecting', 'queued', 'preparing_audio', 'rendering',
          'ready', 'ready_with_warnings', 'failed'
        )),
      progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
      manifest_version INTEGER NOT NULL DEFAULT 1,
      manifest_json TEXT,
      manifest_hash TEXT,
      timeline_json TEXT,
      transcript_vtt TEXT,
      transcript_markdown TEXT,
      render_token TEXT,
      upload_rel_path TEXT,
      video_rel_path TEXT,
      codec TEXT,
      content_type TEXT,
      width INTEGER NOT NULL DEFAULT 1920,
      height INTEGER NOT NULL DEFAULT 1080,
      fps INTEGER NOT NULL DEFAULT 30,
      duration_ms INTEGER,
      size_bytes INTEGER,
      warning TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, surface, source_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS replay_voice_takes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      source_message_id TEXT,
      source_event_id TEXT,
      snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'captured', 'missing', 'failed')),
      audio_rel_path TEXT,
      content_type TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(recording_id, source_key),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(recording_id) REFERENCES replay_recordings(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS replay_premium_productions (
      recording_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'idle'
        CHECK (phase IN (
          'idle', 'mastering_voices', 'mixing_episode', 'rendering_studio',
          'finalizing', 'ready', 'failed'
        )),
      progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
      input_hash TEXT,
      master_ready INTEGER NOT NULL DEFAULT 0,
      audio_rel_path TEXT,
      timeline_json TEXT,
      warning TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(recording_id) REFERENCES replay_recordings(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS replay_premium_segments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      strategy TEXT NOT NULL CHECK (strategy IN ('dialogue', 'isolated_tts')),
      input_hash TEXT NOT NULL,
      source_message_ids_json TEXT NOT NULL,
      audio_rel_path TEXT NOT NULL,
      content_type TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      timings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(recording_id, segment_index),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(recording_id) REFERENCES replay_recordings(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS replay_recordings_queue_idx
      ON replay_recordings(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS replay_voice_takes_message_idx
      ON replay_voice_takes(user_id, recording_id, source_message_id);
    CREATE INDEX IF NOT EXISTS replay_premium_segments_recording_idx
      ON replay_premium_segments(user_id, recording_id, segment_index);
    CREATE TRIGGER IF NOT EXISTS replay_recordings_delete_signal_source
      AFTER DELETE ON botcast_episodes
      BEGIN
        DELETE FROM replay_recordings
         WHERE user_id = OLD.user_id
           AND surface = 'signal'
           AND source_id = OLD.id;
      END;
    CREATE TRIGGER IF NOT EXISTS replay_recordings_delete_coffee_source
      AFTER DELETE ON conversations
      BEGIN
        DELETE FROM replay_recordings
         WHERE user_id = OLD.user_id
           AND surface = 'coffee'
           AND source_id = OLD.id;
      END;
    CREATE TABLE IF NOT EXISTS coffee_polls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL DEFAULT 'user',
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS coffee_poll_votes (
      user_id TEXT NOT NULL,
      poll_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      vote_kind TEXT NOT NULL DEFAULT 'pending',
      option_index INTEGER,
      explanation TEXT,
      suggested_option TEXT,
      confidence REAL,
      deliberation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, poll_id, bot_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(poll_id) REFERENCES coffee_polls(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);
  const replayPremiumProductionColumns = new Set(
    (db.prepare("PRAGMA table_info(replay_premium_productions)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  if (!replayPremiumProductionColumns.has("timeline_json")) {
    db.exec(
      "ALTER TABLE replay_premium_productions ADD COLUMN timeline_json TEXT;",
    );
  }
  const botcastIntroAudioColumns = new Set(
    (db.prepare("PRAGMA table_info(botcast_show_intro_audio)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  const addBotcastIntroAudioColumn = (
    name: string,
    definition: string,
  ): void => {
    if (botcastIntroAudioColumns.has(name)) return;
    db.exec(
      `ALTER TABLE botcast_show_intro_audio ADD COLUMN ${name} ${definition};`,
    );
    botcastIntroAudioColumns.add(name);
  };
  addBotcastIntroAudioColumn("outdent_prompt", "TEXT");
  addBotcastIntroAudioColumn("outdent_content_type", "TEXT");
  addBotcastIntroAudioColumn("outdent_audio_bytes", "BLOB");
  addBotcastIntroAudioColumn("outdent_duration_ms", "INTEGER");

  const legalAcceptanceColumns = db
    .prepare("PRAGMA table_info(legal_acceptances)")
    .all() as Array<{ name: string }>;
  if (
    !legalAcceptanceColumns.some(
      (column) => column.name === "document_snapshot",
    )
  ) {
    db.exec(
      "ALTER TABLE legal_acceptances ADD COLUMN document_snapshot TEXT NOT NULL DEFAULT '';",
    );
  }
  const slateProjectColumns = db
    .prepare("PRAGMA table_info(slate_projects)")
    .all() as Array<{ name: string }>;
  const hasSlateSparkWildcards = slateProjectColumns.some(
    (column) => column.name === "spark_wildcards_json",
  );
  if (!hasSlateSparkWildcards) {
    db.exec(
      "ALTER TABLE slate_projects ADD COLUMN spark_wildcards_json TEXT NOT NULL DEFAULT '';",
    );
  }
  const slateProjectColumnNames = new Set(
    slateProjectColumns.map((column) => column.name),
  );
  const addSlateProjectColumn = (name: string, definition: string): void => {
    if (!slateProjectColumnNames.has(name)) {
      db.exec(`ALTER TABLE slate_projects ADD COLUMN ${name} ${definition};`);
      slateProjectColumnNames.add(name);
    }
  };
  addSlateProjectColumn("series_id", "TEXT");
  addSlateProjectColumn("book_ordinal", "INTEGER NOT NULL DEFAULT 0");
  addSlateProjectColumn("title_origin", "TEXT NOT NULL DEFAULT 'writer'");
  addSlateProjectColumn("cover_json", "TEXT NOT NULL DEFAULT '{}'");
  addSlateProjectColumn("prose_mode", "TEXT NOT NULL DEFAULT 'auto'");
  addSlateProjectColumn("prose_model", "TEXT");
  addSlateProjectColumn("prose_provider", "TEXT");
  addSlateProjectColumn(
    "deliberation_config_json",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  addSlateProjectColumn(
    "continuity_active_version",
    "TEXT NOT NULL DEFAULT '0.0'",
  );
  addSlateProjectColumn(
    "continuity_target_version",
    "TEXT NOT NULL DEFAULT '0.0'",
  );
  addSlateProjectColumn(
    "continuity_active_generation",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addSlateProjectColumn("continuity_previous_generation", "INTEGER");
  addSlateProjectColumn(
    "continuity_upgrade_status",
    "TEXT NOT NULL DEFAULT 'current'",
  );
  addSlateProjectColumn("continuity_last_success_at", "TEXT");
  db.exec(`
    INSERT OR IGNORE INTO slate_series
      (id, user_id, title, description, created_at, updated_at)
    SELECT 'legacy-series-' || id, user_id, title, '', created_at, updated_at
      FROM slate_projects
     WHERE series_id IS NULL OR series_id = '';
    UPDATE slate_projects
       SET series_id = 'legacy-series-' || id
     WHERE series_id IS NULL OR series_id = '';
  `);
  const slateEntityColumns = db
    .prepare("PRAGMA table_info(slate_continuity_entities)")
    .all() as Array<{ name: string }>;
  if (!slateEntityColumns.some((column) => column.name === "anchors_json")) {
    db.exec(
      "ALTER TABLE slate_continuity_entities ADD COLUMN anchors_json TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{
    name: string;
  }>;
  const zenSessionMemoryColumns = db
    .prepare("PRAGMA table_info(zen_session_memories)")
    .all() as Array<{ name: string }>;
  const hasZenSessionMemoryBotId = zenSessionMemoryColumns.some(
    (column) => column.name === "bot_id",
  );
  if (!hasZenSessionMemoryBotId) {
    db.exec("ALTER TABLE zen_session_memories ADD COLUMN bot_id TEXT;");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_zen_session_memories_user_bot_created ON zen_session_memories(user_id, bot_id, created_at DESC);",
  );
  const hasLastActiveAt = userColumns.some(
    (column) => column.name === "last_active_at",
  );
  if (!hasLastActiveAt) {
    db.exec("ALTER TABLE users ADD COLUMN last_active_at TEXT;");
  }
  const hasGraphicsQuality = userColumns.some(
    (column) => column.name === "graphics_quality",
  );
  if (!hasGraphicsQuality) {
    db.exec(
      "ALTER TABLE users ADD COLUMN graphics_quality TEXT NOT NULL DEFAULT 'high';",
    );
  }
  const hasVoiceMode = userColumns.some(
    (column) => column.name === "voice_mode",
  );
  if (!hasVoiceMode)
    db.exec(
      "ALTER TABLE users ADD COLUMN voice_mode TEXT NOT NULL DEFAULT 'mute';",
    );
  const hasVoiceEffectsEnabled = userColumns.some(
    (column) => column.name === "voice_effects_enabled",
  );
  if (!hasVoiceEffectsEnabled)
    db.exec(
      "ALTER TABLE users ADD COLUMN voice_effects_enabled INTEGER NOT NULL DEFAULT 1;",
    );
  const hasVoiceVolume = userColumns.some(
    (column) => column.name === "voice_volume",
  );
  if (!hasVoiceVolume)
    db.exec(
      "ALTER TABLE users ADD COLUMN voice_volume REAL NOT NULL DEFAULT 1;",
    );
  const hasOperatingSystemVoicesEnabled = userColumns.some(
    (column) => column.name === "operating_system_voices_enabled",
  );
  if (!hasOperatingSystemVoicesEnabled)
    db.exec(
      "ALTER TABLE users ADD COLUMN operating_system_voices_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  const hasEnglishVoiceEngine = userColumns.some(
    (column) => column.name === "english_voice_engine",
  );
  if (!hasEnglishVoiceEngine)
    db.exec(
      "ALTER TABLE users ADD COLUMN english_voice_engine TEXT NOT NULL DEFAULT 'builtin';",
    );
  const hasDefaultSystemVoiceName = userColumns.some(
    (column) => column.name === "default_system_voice_name",
  );
  if (!hasDefaultSystemVoiceName)
    db.exec("ALTER TABLE users ADD COLUMN default_system_voice_name TEXT;");
  const hasDefaultElevenLabsVoiceId = userColumns.some(
    (column) => column.name === "default_elevenlabs_voice_id",
  );
  if (!hasDefaultElevenLabsVoiceId)
    db.exec("ALTER TABLE users ADD COLUMN default_elevenlabs_voice_id TEXT;");
  const hasElevenLabsVoiceBank = userColumns.some(
    (column) => column.name === "elevenlabs_voice_bank",
  );
  if (!hasElevenLabsVoiceBank)
    db.exec(
      "ALTER TABLE users ADD COLUMN elevenlabs_voice_bank TEXT NOT NULL DEFAULT '{}';",
    );
  const hasElevenLabsVoiceModel = userColumns.some(
    (column) => column.name === "elevenlabs_voice_model",
  );
  if (!hasElevenLabsVoiceModel)
    db.exec("ALTER TABLE users ADD COLUMN elevenlabs_voice_model TEXT;");
  const hasElevenLabsVoiceCollectionId = userColumns.some(
    (column) => column.name === "elevenlabs_voice_collection_id",
  );
  if (!hasElevenLabsVoiceCollectionId) {
    db.exec(
      "ALTER TABLE users ADD COLUMN elevenlabs_voice_collection_id TEXT;",
    );
  }
  const hasPlayerAudioVoiceProfile = userColumns.some(
    (column) => column.name === "player_audio_voice_profile",
  );
  if (!hasPlayerAudioVoiceProfile) {
    db.exec("ALTER TABLE users ADD COLUMN player_audio_voice_profile TEXT;");
  }
  const hasPlayerNamePronunciation = userColumns.some(
    (column) => column.name === "player_name_pronunciation",
  );
  if (!hasPlayerNamePronunciation) {
    db.exec(
      "ALTER TABLE users ADD COLUMN player_name_pronunciation TEXT NOT NULL DEFAULT '';",
    );
  }
  const hasPrismDefaultBotAudioVoiceProfile = userColumns.some(
    (column) => column.name === "prism_default_bot_audio_voice_profile",
  );
  if (!hasPrismDefaultBotAudioVoiceProfile) {
    db.exec(
      "ALTER TABLE users ADD COLUMN prism_default_bot_audio_voice_profile TEXT;",
    );
  }
  const botcastMessageColumns = db
    .prepare("PRAGMA table_info(botcast_messages)")
    .all() as Array<{ name: string }>;
  const hasBotcastVoicePerformanceText = botcastMessageColumns.some(
    (column) => column.name === "voice_performance_text",
  );
  if (!hasBotcastVoicePerformanceText) {
    db.exec(
      "ALTER TABLE botcast_messages ADD COLUMN voice_performance_text TEXT;",
    );
  }
  const hasBotcastStageActionText = botcastMessageColumns.some(
    (column) => column.name === "stage_action_text",
  );
  if (!hasBotcastStageActionText) {
    db.exec(
      "ALTER TABLE botcast_messages ADD COLUMN stage_action_text TEXT;",
    );
  }
  const hasProviderLocked = userColumns.some(
    (column) => column.name === "provider_locked",
  );
  if (!hasProviderLocked) {
    db.exec(
      "ALTER TABLE users ADD COLUMN provider_locked INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasHiddenBotModelIds = userColumns.some(
    (column) => column.name === "hidden_bot_model_ids",
  );
  if (!hasHiddenBotModelIds) {
    db.exec(
      "ALTER TABLE users ADD COLUMN hidden_bot_model_ids TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const hasHiddenComfyUiWorkflowIds = userColumns.some(
    (column) => column.name === "hidden_comfyui_workflow_ids",
  );
  if (!hasHiddenComfyUiWorkflowIds) {
    db.exec(
      "ALTER TABLE users ADD COLUMN hidden_comfyui_workflow_ids TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const hasModelVisibilityDefaultsVersion = userColumns.some(
    (column) => column.name === "model_visibility_defaults_version",
  );
  if (!hasModelVisibilityDefaultsVersion) {
    db.exec(
      "ALTER TABLE users ADD COLUMN model_visibility_defaults_version INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasSecondaryOllamaHost = userColumns.some(
    (column) => column.name === "secondary_ollama_host",
  );
  if (!hasSecondaryOllamaHost) {
    db.exec("ALTER TABLE users ADD COLUMN secondary_ollama_host TEXT;");
  }
  const hasExperimentalDualOllamaEnabled = userColumns.some(
    (column) => column.name === "experimental_dual_ollama_enabled",
  );
  if (!hasExperimentalDualOllamaEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN experimental_dual_ollama_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasExperimentalAllModelEffortEnabled = userColumns.some(
    (column) => column.name === "experimental_all_model_effort_enabled",
  );
  if (!hasExperimentalAllModelEffortEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN experimental_all_model_effort_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasCoffeeExperimentalTableAngleEnabled = userColumns.some(
    (column) => column.name === "coffee_experimental_table_angle_enabled",
  );
  if (!hasCoffeeExperimentalTableAngleEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN coffee_experimental_table_angle_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasPsychicModeEnabled = userColumns.some(
    (column) => column.name === "psychic_mode_enabled",
  );
  if (!hasPsychicModeEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN psychic_mode_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasDevMemoriesEnabled = userColumns.some(
    (column) => column.name === "dev_memories_enabled",
  );
  if (!hasDevMemoriesEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN dev_memories_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasDevMemoriesText = userColumns.some(
    (column) => column.name === "dev_memories_text",
  );
  if (!hasDevMemoriesText) {
    db.exec(
      "ALTER TABLE users ADD COLUMN dev_memories_text TEXT NOT NULL DEFAULT '';",
    );
  }
  const hasPreferredLocalModel = userColumns.some(
    (column) => column.name === "preferred_local_model",
  );
  if (!hasPreferredLocalModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_local_model TEXT;");
  }
  const hasPreferredOnlineModel = userColumns.some(
    (column) => column.name === "preferred_online_model",
  );
  if (!hasPreferredOnlineModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_online_model TEXT;");
  }
  const hasPreferredImageProvider = userColumns.some(
    (column) => column.name === "preferred_image_provider",
  );
  if (!hasPreferredImageProvider) {
    db.exec(
      "ALTER TABLE users ADD COLUMN preferred_image_provider TEXT NOT NULL DEFAULT 'local';",
    );
    // Preserve the previously coupled behavior for existing accounts while
    // letting new accounts start with the privacy-safe local image default.
    db.exec(
      `UPDATE users
          SET preferred_image_provider = CASE
            WHEN preferred_provider = 'local' THEN 'local'
            ELSE 'openai'
          END;`,
    );
  }
  const hasLenientLocalFallbackModel = userColumns.some(
    (column) => column.name === "lenient_local_fallback_model",
  );
  if (!hasLenientLocalFallbackModel) {
    db.exec("ALTER TABLE users ADD COLUMN lenient_local_fallback_model TEXT;");
  }
  const hasAutoFallbackChain = userColumns.some(
    (column) => column.name === "auto_fallback_chain",
  );
  if (!hasAutoFallbackChain) {
    db.exec("ALTER TABLE users ADD COLUMN auto_fallback_chain TEXT;");
  }
  const hasComposerWritingAssist = userColumns.some(
    (column) => column.name === "composer_writing_assist",
  );
  if (!hasComposerWritingAssist) {
    db.exec(
      "ALTER TABLE users ADD COLUMN composer_writing_assist INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasComfyuiHost = userColumns.some(
    (column) => column.name === "comfyui_host",
  );
  if (!hasComfyuiHost) {
    db.exec("ALTER TABLE users ADD COLUMN comfyui_host TEXT;");
  }
  const hasPreferredLocalImageModel = userColumns.some(
    (column) => column.name === "preferred_local_image_model",
  );
  if (!hasPreferredLocalImageModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_local_image_model TEXT;");
  }
  const hasPreferredOpenAiImageModel = userColumns.some(
    (column) => column.name === "preferred_openai_image_model",
  );
  if (!hasPreferredOpenAiImageModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_openai_image_model TEXT;");
  }
  const hasPreferredZenWallpaperLocalImageModel = userColumns.some(
    (column) => column.name === "preferred_zen_wallpaper_local_image_model",
  );
  if (!hasPreferredZenWallpaperLocalImageModel) {
    db.exec(
      "ALTER TABLE users ADD COLUMN preferred_zen_wallpaper_local_image_model TEXT;",
    );
  }
  const hasPreferredZenWallpaperOpenAiImageModel = userColumns.some(
    (column) => column.name === "preferred_zen_wallpaper_openai_image_model",
  );
  if (!hasPreferredZenWallpaperOpenAiImageModel) {
    db.exec(
      "ALTER TABLE users ADD COLUMN preferred_zen_wallpaper_openai_image_model TEXT;",
    );
  }
  const hasZenWallpaperOpacity = userColumns.some(
    (column) => column.name === "zen_wallpaper_opacity",
  );
  if (!hasZenWallpaperOpacity) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_wallpaper_opacity REAL NOT NULL DEFAULT 0.28;",
    );
  }
  const hasZenWallpaperTextMaskEnabled = userColumns.some(
    (column) => column.name === "zen_wallpaper_text_mask_enabled",
  );
  if (!hasZenWallpaperTextMaskEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_wallpaper_text_mask_enabled INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasZenWallpaperGrayscaleEnabled = userColumns.some(
    (column) => column.name === "zen_wallpaper_grayscale_enabled",
  );
  if (!hasZenWallpaperGrayscaleEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_wallpaper_grayscale_enabled INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasZenWallpaperBlurredEdgesEnabled = userColumns.some(
    (column) => column.name === "zen_wallpaper_blurred_edges_enabled",
  );
  if (!hasZenWallpaperBlurredEdgesEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_wallpaper_blurred_edges_enabled INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasZenWallpaperStyleNotes = userColumns.some(
    (column) => column.name === "zen_wallpaper_style_notes",
  );
  if (!hasZenWallpaperStyleNotes) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_wallpaper_style_notes TEXT NOT NULL DEFAULT '';",
    );
  }
  const hasZenSessionIdleGapMs = userColumns.some(
    (column) => column.name === "zen_session_idle_gap_ms",
  );
  if (!hasZenSessionIdleGapMs) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_session_idle_gap_ms INTEGER NOT NULL DEFAULT 43200000;",
    );
  }
  const hasZenFreshStartGapMs = userColumns.some(
    (column) => column.name === "zen_fresh_start_gap_ms",
  );
  if (!hasZenFreshStartGapMs) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_fresh_start_gap_ms INTEGER NOT NULL DEFAULT 604800000;",
    );
  }
  const hasZenRecentContextMessages = userColumns.some(
    (column) => column.name === "zen_recent_context_messages",
  );
  if (!hasZenRecentContextMessages) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_recent_context_messages INTEGER NOT NULL DEFAULT 30;",
    );
  }
  const hasZenWallpaperRegenMessageInterval = userColumns.some(
    (column) => column.name === "zen_wallpaper_regen_message_interval",
  );
  if (!hasZenWallpaperRegenMessageInterval) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_wallpaper_regen_message_interval INTEGER NOT NULL DEFAULT 30;",
    );
  }
  const hasZenMoodSensitivity = userColumns.some(
    (column) => column.name === "zen_mood_sensitivity",
  );
  if (!hasZenMoodSensitivity) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_mood_sensitivity REAL NOT NULL DEFAULT 0.5;",
    );
  }
  const hasZenCanvasTypingSpeed = userColumns.some(
    (column) => column.name === "zen_canvas_typing_speed",
  );
  if (!hasZenCanvasTypingSpeed) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_canvas_typing_speed REAL NOT NULL DEFAULT 1;",
    );
  }
  const hasZenMessageFontMinPx = userColumns.some(
    (column) => column.name === "zen_message_font_min_px",
  );
  if (!hasZenMessageFontMinPx) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_message_font_min_px REAL NOT NULL DEFAULT 15.8;",
    );
  }
  const hasZenMessageFontMaxPx = userColumns.some(
    (column) => column.name === "zen_message_font_max_px",
  );
  if (!hasZenMessageFontMaxPx) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_message_font_max_px REAL NOT NULL DEFAULT 32.8;",
    );
  }
  const hasZenAskQuestionPatienceEnabled = userColumns.some(
    (column) => column.name === "zen_ask_question_patience_enabled",
  );
  if (!hasZenAskQuestionPatienceEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_ask_question_patience_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasZenAskQuestionPatienceMs = userColumns.some(
    (column) => column.name === "zen_ask_question_patience_ms",
  );
  if (!hasZenAskQuestionPatienceMs) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_ask_question_patience_ms INTEGER NOT NULL DEFAULT 60000;",
    );
  }
  const hasZenAutonomyEnabled = userColumns.some(
    (column) => column.name === "zen_autonomy_enabled",
  );
  if (!hasZenAutonomyEnabled) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_autonomy_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasZenPersonaTransitionChoice = userColumns.some(
    (column) => column.name === "zen_persona_transition_choice",
  );
  if (!hasZenPersonaTransitionChoice) {
    db.exec(
      "ALTER TABLE users ADD COLUMN zen_persona_transition_choice TEXT NOT NULL DEFAULT 'random';",
    );
  }
  const hasEphemeralChatProviderPreferences = userColumns.some(
    (column) => column.name === "ephemeral_chat_provider_preferences",
  );
  if (!hasEphemeralChatProviderPreferences) {
    db.exec(
      "ALTER TABLE users ADD COLUMN ephemeral_chat_provider_preferences TEXT NOT NULL DEFAULT '{}';",
    );
  }
  const defaultBotColumns: Array<[string, string]> = [
    ["prism_default_bot_name", "TEXT"],
    ["prism_default_bot_system_prompt", "TEXT"],
    ["prism_default_bot_color", "TEXT"],
    ["prism_default_bot_glyph", "TEXT"],
    ["prism_default_bot_face_eyes_font", "TEXT"],
    ["prism_default_bot_face_eye_character", "TEXT"],
    ["prism_default_bot_face_eye_animation", "TEXT"],
    ["prism_default_bot_face_mouth_font", "TEXT"],
    ["prism_default_bot_face_mouth_character", "TEXT"],
    ["prism_default_bot_face_mouth_animation", "TEXT"],
    [
      "prism_default_bot_face_mouth_coffee_pucker",
      "INTEGER NOT NULL DEFAULT 1",
    ],
    ["prism_default_bot_face_font_weight", "INTEGER"],
    ["prism_default_bot_face_eye_scale", "REAL"],
    ["prism_default_bot_face_eye_offset_x", "REAL"],
    ["prism_default_bot_face_eye_offset_y", "REAL"],
    ["prism_default_bot_face_eye_rotation_deg", "REAL"],
    ["prism_default_bot_face_eye_count", "INTEGER NOT NULL DEFAULT 1"],
    ["prism_default_bot_face_mouth_scale", "REAL"],
    ["prism_default_bot_face_mouth_offset_x", "REAL"],
    ["prism_default_bot_face_mouth_offset_y", "REAL"],
    ["prism_default_bot_face_mouth_rotation_deg", "REAL"],
    ["prism_default_bot_face_blink_bar", "TEXT"],
    ["prism_default_bot_face_blink_scale", "REAL"],
    ["prism_default_bot_face_blink_offset_x", "REAL"],
    ["prism_default_bot_face_blink_offset_y", "REAL"],
    ["prism_default_bot_face_thinking_frames", "TEXT"],
    ["prism_default_bot_temperature", "REAL"],
    ["prism_default_bot_max_tokens", "INTEGER"],
    ["prism_default_bot_top_p", "REAL"],
    ["prism_default_bot_top_k", "INTEGER"],
    ["prism_default_bot_repetition_penalty", "REAL"],
  ];
  for (const [name, type] of defaultBotColumns) {
    const hasColumn = userColumns.some((column) => column.name === name);
    if (!hasColumn) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type};`);
    }
  }
  const hasLenientLocalImageFallbackModel = userColumns.some(
    (column) => column.name === "lenient_local_image_fallback_model",
  );
  if (!hasLenientLocalImageFallbackModel) {
    db.exec(
      "ALTER TABLE users ADD COLUMN lenient_local_image_fallback_model TEXT;",
    );
  }
  const hasComfyuiWorkflows = userColumns.some(
    (column) => column.name === "comfyui_workflows",
  );
  if (!hasComfyuiWorkflows) {
    db.exec("ALTER TABLE users ADD COLUMN comfyui_workflows TEXT;");
    db.exec(
      `UPDATE users SET comfyui_workflows = '[]' WHERE comfyui_workflows IS NULL;`,
    );
  }
  const hasPrismDefaultLlmModel = userColumns.some(
    (column) => column.name === "prism_default_llm_model",
  );
  if (!hasPrismDefaultLlmModel) {
    db.exec("ALTER TABLE users ADD COLUMN prism_default_llm_model TEXT;");
  }
  const hasPrismImageToolLlmModel = userColumns.some(
    (column) => column.name === "prism_image_tool_llm_model",
  );
  if (!hasPrismImageToolLlmModel) {
    db.exec("ALTER TABLE users ADD COLUMN prism_image_tool_llm_model TEXT;");
  }
  const hasFallbackModelMessageStripe = userColumns.some(
    (column) => column.name === "fallback_model_message_stripe",
  );
  if (!hasFallbackModelMessageStripe) {
    db.exec(
      "ALTER TABLE users ADD COLUMN fallback_model_message_stripe INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasAnthropicKeyCiphertext = userColumns.some(
    (column) => column.name === "anthropic_key_ciphertext",
  );
  if (!hasAnthropicKeyCiphertext) {
    db.exec("ALTER TABLE users ADD COLUMN anthropic_key_ciphertext TEXT;");
  }
  const hasAnthropicKeyIv = userColumns.some(
    (column) => column.name === "anthropic_key_iv",
  );
  if (!hasAnthropicKeyIv) {
    db.exec("ALTER TABLE users ADD COLUMN anthropic_key_iv TEXT;");
  }
  const hasAnthropicKeyTag = userColumns.some(
    (column) => column.name === "anthropic_key_tag",
  );
  if (!hasAnthropicKeyTag) {
    db.exec("ALTER TABLE users ADD COLUMN anthropic_key_tag TEXT;");
  }
  const hasElevenLabsKeyCiphertext = userColumns.some(
    (column) => column.name === "elevenlabs_key_ciphertext",
  );
  if (!hasElevenLabsKeyCiphertext) {
    db.exec("ALTER TABLE users ADD COLUMN elevenlabs_key_ciphertext TEXT;");
  }
  const hasElevenLabsKeyIv = userColumns.some(
    (column) => column.name === "elevenlabs_key_iv",
  );
  if (!hasElevenLabsKeyIv) {
    db.exec("ALTER TABLE users ADD COLUMN elevenlabs_key_iv TEXT;");
  }
  const hasElevenLabsKeyTag = userColumns.some(
    (column) => column.name === "elevenlabs_key_tag",
  );
  if (!hasElevenLabsKeyTag) {
    db.exec("ALTER TABLE users ADD COLUMN elevenlabs_key_tag TEXT;");
  }
  const braveSearchKeyColumns = [
    ["brave_search_key_ciphertext", "TEXT"],
    ["brave_search_key_iv", "TEXT"],
    ["brave_search_key_tag", "TEXT"],
  ] as const;
  for (const [name, type] of braveSearchKeyColumns) {
    if (!userColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type};`);
    }
  }
  db.exec(`
    UPDATE users
    SET last_active_at = COALESCE(last_active_at, created_at)
    WHERE last_active_at IS NULL OR last_active_at = '';
  `);

  // Migrate existing DBs that predate the per-message provider / bot columns.
  const messageColumns = db
    .prepare("PRAGMA table_info(messages)")
    .all() as Array<{ name: string }>;
  const hasProviderColumn = messageColumns.some(
    (column) => column.name === "provider",
  );
  if (!hasProviderColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN provider TEXT;");
  }
  const hasMessageModelColumn = messageColumns.some(
    (column) => column.name === "model",
  );
  if (!hasMessageModelColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN model TEXT;");
  }
  const hasBotIdColumn = messageColumns.some(
    (column) => column.name === "bot_id",
  );
  if (!hasBotIdColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN bot_id TEXT;");
  }
  const hasToolPayloadColumn = messageColumns.some(
    (column) => column.name === "tool_payload",
  );
  if (!hasToolPayloadColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN tool_payload TEXT;");
  }
  const hasCoffeeAudienceBotIdsColumn = messageColumns.some(
    (column) => column.name === "coffee_audience_bot_ids",
  );
  if (!hasCoffeeAudienceBotIdsColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN coffee_audience_bot_ids TEXT;");
  }
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_hubs (
      user_id TEXT NOT NULL,
      bot_key TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, bot_key),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_hubs_conversation
      ON conversation_hubs(conversation_id);
  `);
  const hasConversationModeColumn = conversationColumns.some(
    (column) => column.name === "conversation_mode",
  );
  if (!hasConversationModeColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN conversation_mode TEXT NOT NULL DEFAULT 'sandbox';",
    );
  }
  const hasConversationArchivedAtColumn = conversationColumns.some(
    (column) => column.name === "archived_at",
  );
  if (!hasConversationArchivedAtColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN archived_at TEXT;");
  }
  const hasConversationArchiveBatchIdColumn = conversationColumns.some(
    (column) => column.name === "archive_batch_id",
  );
  if (!hasConversationArchiveBatchIdColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN archive_batch_id TEXT;");
  }
  const hasConversationBotGroupIdsColumn = conversationColumns.some(
    (column) => column.name === "bot_group_ids",
  );
  if (!hasConversationBotGroupIdsColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN bot_group_ids TEXT;");
  }
  const hasConversationParentIdColumn = conversationColumns.some(
    (column) => column.name === "parent_id",
  );
  if (!hasConversationParentIdColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN parent_id TEXT;");
  }
  const hasConversationForkMessageIdColumn = conversationColumns.some(
    (column) => column.name === "fork_message_id",
  );
  if (!hasConversationForkMessageIdColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN fork_message_id TEXT;");
  }
  const hasConversationCoffeeSettingsColumn = conversationColumns.some(
    (column) => column.name === "coffee_settings",
  );
  if (!hasConversationCoffeeSettingsColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_settings TEXT;");
  }
  const hasConversationCoffeeGroupIdColumn = conversationColumns.some(
    (column) => column.name === "coffee_group_id",
  );
  if (!hasConversationCoffeeGroupIdColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_group_id TEXT;");
  }
  const hasConversationCoffeeDurationColumn = conversationColumns.some(
    (column) => column.name === "coffee_duration_minutes",
  );
  if (!hasConversationCoffeeDurationColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN coffee_duration_minutes INTEGER;",
    );
  }
  const hasConversationCoffeePresetColumn = conversationColumns.some(
    (column) => column.name === "coffee_preset_id",
  );
  if (!hasConversationCoffeePresetColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_preset_id TEXT;");
  }
  const hasConversationCoffeeTopicColumn = conversationColumns.some(
    (column) => column.name === "coffee_topic",
  );
  if (!hasConversationCoffeeTopicColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_topic TEXT;");
  }
  const hasConversationCoffeeAbsentBotIdsColumn = conversationColumns.some(
    (column) => column.name === "coffee_absent_bot_ids",
  );
  if (!hasConversationCoffeeAbsentBotIdsColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN coffee_absent_bot_ids TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const hasConversationCoffeeTeamModeColumn = conversationColumns.some(
    (column) => column.name === "coffee_team_mode_json",
  );
  if (!hasConversationCoffeeTeamModeColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_team_mode_json TEXT;");
  }
  const hasConversationCoffeeMeetingSummaryColumn = conversationColumns.some(
    (column) => column.name === "coffee_meeting_summary",
  );
  if (!hasConversationCoffeeMeetingSummaryColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN coffee_meeting_summary TEXT;",
    );
  }
  const hasConversationCoffeeMeetingSummaryCountColumn =
    conversationColumns.some(
      (column) => column.name === "coffee_meeting_summary_message_count",
  );
  if (!hasConversationCoffeeMeetingSummaryCountColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN coffee_meeting_summary_message_count INTEGER;",
    );
  }
  const hasConversationCoffeeMeetingSummaryUpdatedAtColumn =
    conversationColumns.some(
      (column) => column.name === "coffee_meeting_summary_updated_at",
  );
  if (!hasConversationCoffeeMeetingSummaryUpdatedAtColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN coffee_meeting_summary_updated_at TEXT;",
    );
  }
  const hasConversationCoffeePowerPlanColumn = conversationColumns.some(
    (column) => column.name === "coffee_power_plan_json",
  );
  if (!hasConversationCoffeePowerPlanColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN coffee_power_plan_json TEXT;",
    );
  }
  const hasZenWallpaperEnabledColumn = conversationColumns.some(
    (column) => column.name === "zen_wallpaper_enabled",
  );
  if (!hasZenWallpaperEnabledColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN zen_wallpaper_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasZenWallpaperImageIdColumn = conversationColumns.some(
    (column) => column.name === "zen_wallpaper_image_id",
  );
  if (!hasZenWallpaperImageIdColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN zen_wallpaper_image_id TEXT;",
    );
  }
  const hasZenWallpaperPromptSeedColumn = conversationColumns.some(
    (column) => column.name === "zen_wallpaper_prompt_seed",
  );
  if (!hasZenWallpaperPromptSeedColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN zen_wallpaper_prompt_seed TEXT;",
    );
  }
  const hasZenWallpaperMessageCountColumn = conversationColumns.some(
    (column) => column.name === "zen_wallpaper_message_count",
  );
  if (!hasZenWallpaperMessageCountColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN zen_wallpaper_message_count INTEGER;",
    );
  }
  const hasZenWallpaperStatusColumn = conversationColumns.some(
    (column) => column.name === "zen_wallpaper_status",
  );
  if (!hasZenWallpaperStatusColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN zen_wallpaper_status TEXT NOT NULL DEFAULT 'idle';",
    );
  }
  const hasZenWallpaperHistoryColumn = conversationColumns.some(
    (column) => column.name === "zen_wallpaper_history",
  );
  if (!hasZenWallpaperHistoryColumn) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN zen_wallpaper_history TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const coffeeGroupColumns = db
    .prepare("PRAGMA table_info(coffee_groups)")
    .all() as Array<{ name: string }>;
  const hasCoffeeGroupTopicModeColumn = coffeeGroupColumns.some(
    (column) => column.name === "coffee_topic_mode",
  );
  if (!hasCoffeeGroupTopicModeColumn) {
    db.exec(
      "ALTER TABLE coffee_groups ADD COLUMN coffee_topic_mode TEXT NOT NULL DEFAULT 'manual';",
    );
  }
  const hasCoffeeGroupModelChoiceColumn = coffeeGroupColumns.some(
    (column) => column.name === "model_choice",
  );
  if (!hasCoffeeGroupModelChoiceColumn) {
    db.exec(
      "ALTER TABLE coffee_groups ADD COLUMN model_choice TEXT NOT NULL DEFAULT '{}';",
    );
  }
  const hasCoffeeGroupStarterTopicsColumn = coffeeGroupColumns.some(
    (column) => column.name === "starter_topics",
  );
  if (!hasCoffeeGroupStarterTopicsColumn) {
    db.exec(
      "ALTER TABLE coffee_groups ADD COLUMN starter_topics TEXT NOT NULL DEFAULT '{}';",
    );
  }
  const sweepBatchColumns = db
    .prepare("PRAGMA table_info(conversation_sweep_batches)")
    .all() as Array<{ name: string }>;
  const hasSweepUndoExpiresAt = sweepBatchColumns.some(
    (column) => column.name === "undo_expires_at",
  );
  if (!hasSweepUndoExpiresAt) {
    db.exec(
      "ALTER TABLE conversation_sweep_batches ADD COLUMN undo_expires_at TEXT;",
    );
  }
  db.exec(`
    UPDATE conversation_sweep_batches
    SET undo_expires_at = COALESCE(undo_expires_at, created_at)
    WHERE undo_expires_at IS NULL OR trim(undo_expires_at) = '';
  `);
  db.exec(`
    UPDATE conversations
    SET conversation_mode = 'sandbox'
    WHERE conversation_mode IS NULL OR trim(conversation_mode) = '';
  `);
  db.exec(`
    UPDATE conversations
    SET conversation_mode = 'zen'
    WHERE conversation_mode = 'chat'
      AND bot_id IS NULL;
  `);

  const memoryColumns = db
    .prepare("PRAGMA table_info(memories)")
    .all() as Array<{ name: string }>;
  const hasMemoryConversationIdColumn = memoryColumns.some(
    (column) => column.name === "conversation_id",
  );
  if (!hasMemoryConversationIdColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN conversation_id TEXT;");
  }
  const hasMemoryBotIdColumn = memoryColumns.some(
    (column) => column.name === "bot_id",
  );
  if (!hasMemoryBotIdColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN bot_id TEXT;");
  }
  const hasMemorySourceColumn = memoryColumns.some(
    (column) => column.name === "source",
  );
  if (!hasMemorySourceColumn) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'direct';",
    );
  }
  const hasMemoryCertaintyColumn = memoryColumns.some(
    (column) => column.name === "certainty",
  );
  if (!hasMemoryCertaintyColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN certainty REAL;");
  }
  const hasMemorySourceMessageIdsColumn = memoryColumns.some(
    (column) => column.name === "source_message_ids",
  );
  if (!hasMemorySourceMessageIdsColumn) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN source_message_ids TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const hasMemoryCategoryColumn = memoryColumns.some(
    (column) => column.name === "category",
  );
  if (!hasMemoryCategoryColumn) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN category TEXT NOT NULL DEFAULT 'general';",
    );
  }
  const hasMemoryTierColumn = memoryColumns.some(
    (column) => column.name === "tier",
  );
  if (!hasMemoryTierColumn) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN tier TEXT NOT NULL DEFAULT 'short_term';",
    );
  }
  const hasMemoryDurabilityColumn = memoryColumns.some(
    (column) => column.name === "durability",
  );
  if (!hasMemoryDurabilityColumn) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN durability REAL NOT NULL DEFAULT 0.5;",
    );
  }
  db.exec(`
    UPDATE memories
    SET source = COALESCE(source, 'direct')
    WHERE source IS NULL OR source = '';
  `);
  db.exec(`
    UPDATE memories
    SET certainty = COALESCE(certainty, confidence)
    WHERE certainty IS NULL;
  `);
  db.exec(`
    UPDATE memories
    SET source_message_ids = '[]'
    WHERE source_message_ids IS NULL OR source_message_ids = '';
  `);
  db.exec(`
    UPDATE memories
    SET category = CASE
      WHEN lower(COALESCE(category, '')) IN ('general', 'user', 'bot_relation')
        THEN lower(category)
      WHEN lower(COALESCE(category, '')) = 'bot-relation'
        THEN 'bot_relation'
      WHEN bot_id IS NULL
        THEN 'user'
      ELSE 'general'
    END
    WHERE category IS NULL
       OR trim(category) = ''
       OR lower(category) NOT IN ('general', 'user', 'bot_relation');
  `);
  db.exec(`
    UPDATE memories
    SET category = 'user'
    WHERE bot_id IS NULL
      AND category = 'general';
  `);
  db.exec(`
    UPDATE memories
    SET tier = CASE
      WHEN lower(COALESCE(tier, '')) IN ('short_term', 'long_term')
        THEN lower(tier)
      WHEN COALESCE(source, 'direct') = 'about_you'
        OR ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.95
        OR (
          COALESCE(source, 'direct') = 'direct'
          AND
          ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.9
          AND COALESCE(durability, 0.5) >= 0.5
        )
        THEN 'long_term'
      ELSE 'short_term'
    END
    WHERE tier IS NULL
       OR trim(tier) = ''
       OR lower(tier) NOT IN ('short_term', 'long_term');
  `);
  if (!hasMemoryTierColumn) {
    db.exec(`
      UPDATE memories
      SET tier = 'long_term'
      WHERE (
          COALESCE(source, 'direct') = 'about_you'
          OR ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.95
          OR (
            COALESCE(source, 'direct') = 'direct'
            AND ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.9
            AND COALESCE(durability, 0.5) >= 0.5
          )
        )
        AND tier = 'short_term';
    `);
  }

  const imageColumns = db.prepare("PRAGMA table_info(images)").all() as Array<{
    name: string;
  }>;
  const hasImageBotIdColumn = imageColumns.some(
    (column) => column.name === "bot_id",
  );
  if (!hasImageBotIdColumn) {
    db.exec("ALTER TABLE images ADD COLUMN bot_id TEXT;");
  }

  const hasImageRelatedBotIdsColumn = imageColumns.some(
    (column) => column.name === "related_bot_ids",
  );
  if (!hasImageRelatedBotIdsColumn) {
    db.exec(
      "ALTER TABLE images ADD COLUMN related_bot_ids TEXT NOT NULL DEFAULT '[]';",
    );
  }

  const hasImageOriginColumn = imageColumns.some(
    (column) => column.name === "origin",
  );
  if (!hasImageOriginColumn) {
    db.exec(
      "ALTER TABLE images ADD COLUMN origin TEXT NOT NULL DEFAULT 'images_panel';",
    );
  }

  // Recover ownership for Signal artwork created before image provenance was
  // stored. Show JSON is authoritative because it retains the exact image ids
  // selected for the host's day/night studios and logo.
  db.exec(`
    UPDATE images
       SET bot_id = (
             SELECT shows.host_bot_id
              FROM botcast_shows AS shows
              WHERE shows.user_id = images.user_id
                AND json_valid(shows.atmosphere_json)
                AND (
                  json_extract(shows.atmosphere_json, '$.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.dayAtmosphere.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.nightAtmosphere.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.studioLighting.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.logo.imageId') = images.id
                )
              LIMIT 1
           ),
           origin = 'botcast'
     WHERE EXISTS (
             SELECT 1
              FROM botcast_shows AS shows
              WHERE shows.user_id = images.user_id
                AND json_valid(shows.atmosphere_json)
                AND (
                  json_extract(shows.atmosphere_json, '$.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.dayAtmosphere.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.nightAtmosphere.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.studioLighting.imageId') = images.id
                  OR json_extract(shows.atmosphere_json, '$.logo.imageId') = images.id
                )
           );

    UPDATE images
       SET origin = CASE
         WHEN purpose = 'group-room-wallpaper' THEN 'bot_group_room'
         WHEN purpose = 'wallpaper' THEN 'zen_wallpaper'
         WHEN purpose = 'bot_profile_picture' THEN 'bot_profile_picture'
         WHEN conversation_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM conversations
            WHERE conversations.id = images.conversation_id
              AND conversations.user_id = images.user_id
              AND conversations.conversation_mode = 'chat'
         ) THEN 'zen_chat'
         WHEN conversation_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM conversations
            WHERE conversations.id = images.conversation_id
              AND conversations.user_id = images.user_id
              AND conversations.conversation_mode = 'sandbox'
         ) THEN 'sandbox_chat'
         ELSE origin
       END
     WHERE origin = 'images_panel';

    UPDATE images
       SET related_bot_ids = json_array(bot_id)
     WHERE bot_id IS NOT NULL
       AND TRIM(COALESCE(related_bot_ids, '')) IN ('', '[]');
  `);

  const hasImageLocalRelPathColumn = imageColumns.some(
    (column) => column.name === "local_rel_path",
  );
  if (!hasImageLocalRelPathColumn) {
    db.exec("ALTER TABLE images ADD COLUMN local_rel_path TEXT;");
  }

  const hasImageModelColumn = imageColumns.some(
    (column) => column.name === "model",
  );
  if (!hasImageModelColumn) {
    db.exec(
      "ALTER TABLE images ADD COLUMN model TEXT NOT NULL DEFAULT 'gpt-image-2';",
    );
  }
  const hasImagePurposeColumn = imageColumns.some(
    (column) => column.name === "purpose",
  );
  if (!hasImagePurposeColumn) {
    db.exec(
      "ALTER TABLE images ADD COLUMN purpose TEXT NOT NULL DEFAULT 'gallery';",
    );
  }

  // Migrate existing DBs to the bots.color and bots.glyph columns used
  // for the visual identifier that appears on the bot card and messages.
  const botColumns = db.prepare("PRAGMA table_info(bots)").all() as Array<{
    name: string;
  }>;
  const hasBotColorColumn = botColumns.some(
    (column) => column.name === "color",
  );
  if (!hasBotColorColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN color TEXT;");
  }
  const hasBotGlyphColumn = botColumns.some(
    (column) => column.name === "glyph",
  );
  if (!hasBotGlyphColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN glyph TEXT;");
  }
  const hasBotAvatarDetailsJsonColumn = botColumns.some(
    (column) => column.name === "avatar_details_json",
  );
  if (!hasBotAvatarDetailsJsonColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN avatar_details_json TEXT;");
  }
  const hasBotFaceEyesFontColumn = botColumns.some(
    (column) => column.name === "face_eyes_font",
  );
  if (!hasBotFaceEyesFontColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eyes_font TEXT;");
  }
  const hasBotFaceEyeCharacterColumn = botColumns.some(
    (column) => column.name === "face_eye_character",
  );
  const hasBotCloneFamilyIdColumn = botColumns.some(
    (column) => column.name === "clone_family_id",
  );
  if (!hasBotCloneFamilyIdColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN clone_family_id TEXT;");
  }
  if (!hasBotFaceEyeCharacterColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_character TEXT;");
  }
  const hasBotFaceEyeAnimationColumn = botColumns.some(
    (column) => column.name === "face_eye_animation",
  );
  if (!hasBotFaceEyeAnimationColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_animation TEXT;");
  }
  const hasBotFaceMouthFontColumn = botColumns.some(
    (column) => column.name === "face_mouth_font",
  );
  if (!hasBotFaceMouthFontColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_font TEXT;");
  }
  const hasBotFaceMouthCharacterColumn = botColumns.some(
    (column) => column.name === "face_mouth_character",
  );
  if (!hasBotFaceMouthCharacterColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_character TEXT;");
  }
  const hasBotFaceMouthAnimationColumn = botColumns.some(
    (column) => column.name === "face_mouth_animation",
  );
  if (!hasBotFaceMouthAnimationColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_animation TEXT;");
  }
  const hasBotFaceMouthCoffeePuckerColumn = botColumns.some(
    (column) => column.name === "face_mouth_coffee_pucker",
  );
  if (!hasBotFaceMouthCoffeePuckerColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN face_mouth_coffee_pucker INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasBotFaceFontWeightColumn = botColumns.some(
    (column) => column.name === "face_font_weight",
  );
  if (!hasBotFaceFontWeightColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_font_weight INTEGER;");
  }
  const hasBotFaceEyeScaleColumn = botColumns.some(
    (column) => column.name === "face_eye_scale",
  );
  if (!hasBotFaceEyeScaleColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_scale REAL;");
  }
  const hasBotFaceEyeOffsetXColumn = botColumns.some(
    (column) => column.name === "face_eye_offset_x",
  );
  if (!hasBotFaceEyeOffsetXColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_offset_x REAL;");
  }
  const hasBotFaceEyeOffsetYColumn = botColumns.some(
    (column) => column.name === "face_eye_offset_y",
  );
  if (!hasBotFaceEyeOffsetYColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_offset_y REAL;");
  }
  const hasBotFaceEyeRotationDegColumn = botColumns.some(
    (column) => column.name === "face_eye_rotation_deg",
  );
  if (!hasBotFaceEyeRotationDegColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_rotation_deg REAL;");
  }
  const hasBotFaceEyeCountColumn = botColumns.some(
    (column) => column.name === "face_eye_count",
  );
  if (!hasBotFaceEyeCountColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN face_eye_count INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasBotFaceMouthScaleColumn = botColumns.some(
    (column) => column.name === "face_mouth_scale",
  );
  if (!hasBotFaceMouthScaleColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_scale REAL;");
  }
  const hasBotFaceMouthOffsetXColumn = botColumns.some(
    (column) => column.name === "face_mouth_offset_x",
  );
  if (!hasBotFaceMouthOffsetXColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_offset_x REAL;");
  }
  const hasBotFaceMouthOffsetYColumn = botColumns.some(
    (column) => column.name === "face_mouth_offset_y",
  );
  if (!hasBotFaceMouthOffsetYColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_offset_y REAL;");
  }
  const hasBotFaceMouthRotationDegColumn = botColumns.some(
    (column) => column.name === "face_mouth_rotation_deg",
  );
  if (!hasBotFaceMouthRotationDegColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_mouth_rotation_deg REAL;");
  }
  const hasBotFaceBlinkBarColumn = botColumns.some(
    (column) => column.name === "face_blink_bar",
  );
  if (!hasBotFaceBlinkBarColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_blink_bar TEXT;");
  }
  const hasBotFaceBlinkScaleColumn = botColumns.some(
    (column) => column.name === "face_blink_scale",
  );
  if (!hasBotFaceBlinkScaleColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_blink_scale REAL;");
  }
  const hasBotFaceBlinkOffsetXColumn = botColumns.some(
    (column) => column.name === "face_blink_offset_x",
  );
  if (!hasBotFaceBlinkOffsetXColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_blink_offset_x REAL;");
  }
  const hasBotFaceBlinkOffsetYColumn = botColumns.some(
    (column) => column.name === "face_blink_offset_y",
  );
  if (!hasBotFaceBlinkOffsetYColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_blink_offset_y REAL;");
  }
  const hasBotFaceThinkingFramesColumn = botColumns.some(
    (column) => column.name === "face_thinking_frames",
  );
  if (!hasBotFaceThinkingFramesColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN face_thinking_frames TEXT;");
  }
  const hasBotProfilePictureImageIdColumn = botColumns.some(
    (column) => column.name === "profile_picture_image_id",
  );
  if (!hasBotProfilePictureImageIdColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN profile_picture_image_id TEXT;");
  }
  const hasBotChatEnabledColumn = botColumns.some(
    (column) => column.name === "chat_enabled",
  );
  if (!hasBotChatEnabledColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 1;",
    );
  }
  db.exec("UPDATE bots SET chat_enabled = 1 WHERE chat_enabled != 1;");
  const hasBotOnlineEnabledColumn = botColumns.some(
    (column) => column.name === "online_enabled",
  );
  if (!hasBotOnlineEnabledColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN online_enabled INTEGER NOT NULL DEFAULT 1;",
    );
  }
  const hasBotDeleteProtectedColumn = botColumns.some(
    (column) => column.name === "delete_protected",
  );
  if (!hasBotDeleteProtectedColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN delete_protected INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasBotFlirtEnabledColumn = botColumns.some(
    (column) => column.name === "flirt_enabled",
  );
  if (!hasBotFlirtEnabledColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN flirt_enabled INTEGER NOT NULL DEFAULT 0;",
    );
  }
  const hasBotVoicePreviewLineColumn = botColumns.some(
    (column) => column.name === "voice_preview_line",
  );
  if (!hasBotVoicePreviewLineColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN voice_preview_line TEXT;");
  }
  const hasBotNamePronunciationColumn = botColumns.some(
    (column) => column.name === "name_pronunciation",
  );
  if (!hasBotNamePronunciationColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN name_pronunciation TEXT NOT NULL DEFAULT '';",
    );
  }
  const hasBotSelfReferralColumn = botColumns.some(
    (column) => column.name === "self_referral",
  );
  if (!hasBotSelfReferralColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN self_referral TEXT NOT NULL DEFAULT '';",
    );
  }
  const hasAuthoredAudioVoiceProfileColumn = botColumns.some(
    (column) => column.name === "authored_audio_voice_profile",
  );
  if (!hasAuthoredAudioVoiceProfileColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN authored_audio_voice_profile TEXT;");
  }
  const hasAudioVoiceProfileOverrideColumn = botColumns.some(
    (column) => column.name === "audio_voice_profile_override",
  );
  if (!hasAudioVoiceProfileOverrideColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN audio_voice_profile_override TEXT;");
  }
  const hasBotLocalModelColumn = botColumns.some(
    (column) => column.name === "local_model",
  );
  if (!hasBotLocalModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN local_model TEXT;");
  }
  const hasBotOnlineModelColumn = botColumns.some(
    (column) => column.name === "online_model",
  );
  if (!hasBotOnlineModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN online_model TEXT;");
  }
  const hasBotLocalImageModelColumn = botColumns.some(
    (column) => column.name === "local_image_model",
  );
  if (!hasBotLocalImageModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN local_image_model TEXT;");
  }
  const hasBotOpenaiImageModelColumn = botColumns.some(
    (column) => column.name === "openai_image_model",
  );
  if (!hasBotOpenaiImageModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN openai_image_model TEXT;");
  }
  const botcastShowColumns = db
    .prepare("PRAGMA table_info(botcast_shows)")
    .all() as Array<{ name: string }>;
  const hasBotcastFallbackStudioAccentVariantColumn = botcastShowColumns.some(
    (column) => column.name === "fallback_studio_accent_variant",
  );
  if (!hasBotcastFallbackStudioAccentVariantColumn) {
    db.exec(
      "ALTER TABLE botcast_shows ADD COLUMN fallback_studio_accent_variant INTEGER NOT NULL DEFAULT 0 CHECK (fallback_studio_accent_variant IN (0, 1, 2));",
    );
    db.exec(
      "UPDATE botcast_shows SET fallback_studio_accent_variant = (rowid - 1) % 3;",
    );
  }
  const hasBotcastHostChatIgnoringUntilGuestShowColumn =
    botcastShowColumns.some(
      (column) => column.name === "host_chat_ignoring_until_guest_show",
    );
  if (!hasBotcastHostChatIgnoringUntilGuestShowColumn) {
    db.exec(
      "ALTER TABLE botcast_shows ADD COLUMN host_chat_ignoring_until_guest_show INTEGER NOT NULL DEFAULT 0 CHECK (host_chat_ignoring_until_guest_show IN (0, 1));",
    );
  }
  const botcastEpisodeColumns = db
    .prepare("PRAGMA table_info(botcast_episodes)")
    .all() as Array<{ name: string }>;
  if (!botcastEpisodeColumns.some((column) => column.name === "provider")) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN provider TEXT NOT NULL DEFAULT 'local';",
    );
  }
  if (!botcastEpisodeColumns.some((column) => column.name === "model")) {
    db.exec("ALTER TABLE botcast_episodes ADD COLUMN model TEXT;");
  }
  if (
    !botcastEpisodeColumns.some((column) => column.name === "response_mode")
  ) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'local' CHECK (response_mode IN ('local', 'auto', 'online'));",
    );
    db.exec(
      `UPDATE botcast_episodes
          SET response_mode = CASE
            WHEN provider = 'local' THEN 'local'
            ELSE 'online'
          END;`,
    );
  }
  if (
    !botcastEpisodeColumns.some((column) => column.name === "duration_minutes")
  ) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN duration_minutes INTEGER CHECK (duration_minutes IS NULL OR (duration_minutes >= 3 AND duration_minutes <= 30));",
    );
  }
  if (!botcastEpisodeColumns.some((column) => column.name === "guest_kind")) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN guest_kind TEXT NOT NULL DEFAULT 'bot' CHECK (guest_kind IN ('bot', 'producer'));",
    );
  }
  if (!hasBotcastHostChatIgnoringUntilGuestShowColumn) {
    db.exec(
      `UPDATE botcast_shows AS show
          SET host_chat_ignoring_until_guest_show = CASE
            WHEN (
              SELECT episode.outcome
                FROM botcast_episodes AS episode
               WHERE episode.user_id = show.user_id
                 AND episode.show_id = show.id
                 AND (
                   episode.outcome = 'host_departed'
                   OR episode.guest_kind = 'bot'
                 )
               ORDER BY episode.created_at DESC, episode.rowid DESC
               LIMIT 1
            ) = 'host_departed' THEN 1
            ELSE 0
          END;`,
    );
  }
  if (!botcastEpisodeColumns.some((column) => column.name === "guest_name")) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN guest_name TEXT NOT NULL DEFAULT '';",
    );
  }
  if (
    !botcastEpisodeColumns.some((column) => column.name === "guest_context")
  ) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN guest_context TEXT NOT NULL DEFAULT '';",
    );
  }
  if (
    !botcastEpisodeColumns.some(
      (column) => column.name === "model_warmup_hold_duration_ms",
    )
  ) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN model_warmup_hold_duration_ms INTEGER NOT NULL DEFAULT 0;",
    );
  }
  if (
    !botcastEpisodeColumns.some(
      (column) => column.name === "model_warmup_hold_started_at",
    )
  ) {
    db.exec(
      "ALTER TABLE botcast_episodes ADD COLUMN model_warmup_hold_started_at TEXT;",
    );
  }
  const personaReviewColumns = [
    ["persona_reviewer_bot_id", "TEXT"],
    ["persona_reviewer_name", "TEXT"],
    ["persona_rating", "REAL"],
    ["persona_comment", "TEXT"],
    ["persona_reviewed_at", "TEXT"],
  ] as const;
  for (const [column, declaration] of personaReviewColumns) {
    if (!botcastEpisodeColumns.some((candidate) => candidate.name === column)) {
      db.exec(
        `ALTER TABLE botcast_episodes ADD COLUMN ${column} ${declaration};`,
  );
    }
  }
  const hasBotTopPColumn = botColumns.some((column) => column.name === "top_p");
  if (!hasBotTopPColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN top_p REAL DEFAULT 1;");
  }
  const hasBotTopKColumn = botColumns.some((column) => column.name === "top_k");
  if (!hasBotTopKColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN top_k INTEGER DEFAULT 40;");
  }
  const hasBotRepetitionPenaltyColumn = botColumns.some(
    (column) => column.name === "repetition_penalty",
  );
  if (!hasBotRepetitionPenaltyColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN repetition_penalty REAL DEFAULT 1.1;");
  }
  const hasBotExportHashColumn = botColumns.some(
    (column) => column.name === "export_hash",
  );
  if (!hasBotExportHashColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN export_hash TEXT;");
  }
  const hasBotSemanticFacetsColumn = botColumns.some(
    (column) => column.name === "semantic_facets",
  );
  if (!hasBotSemanticFacetsColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN semantic_facets TEXT;");
  }
  const hasBotSemanticFacetsSourceHashColumn = botColumns.some(
    (column) => column.name === "semantic_facets_source_hash",
  );
  if (!hasBotSemanticFacetsSourceHashColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN semantic_facets_source_hash TEXT;");
  }
  const hasBotSemanticFacetsUpdatedAtColumn = botColumns.some(
    (column) => column.name === "semantic_facets_updated_at",
  );
  if (!hasBotSemanticFacetsUpdatedAtColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN semantic_facets_updated_at TEXT;");
  }
  const hasBotPowersJsonColumn = botColumns.some(
    (column) => column.name === "powers_json",
  );
  if (!hasBotPowersJsonColumn) {
    db.exec(
      "ALTER TABLE bots ADD COLUMN powers_json TEXT NOT NULL DEFAULT '[]';",
    );
  }
  const prismMoodColumns = db
    .prepare("PRAGMA table_info(prism_mood_state)")
    .all() as Array<{ name: string }>;
  const hasPrismMoodIgnoreUntilColumn = prismMoodColumns.some(
    (column) => column.name === "ignore_until",
  );
  if (!hasPrismMoodIgnoreUntilColumn) {
    db.exec("ALTER TABLE prism_mood_state ADD COLUMN ignore_until TEXT;");
  }
  const hasPrismMoodIgnoreCooldownMsColumn = prismMoodColumns.some(
    (column) => column.name === "ignore_cooldown_ms",
  );
  if (!hasPrismMoodIgnoreCooldownMsColumn) {
    db.exec(
      "ALTER TABLE prism_mood_state ADD COLUMN ignore_cooldown_ms INTEGER;",
    );
  }
  const hasPrismMoodIgnoreForgivenessChanceColumn = prismMoodColumns.some(
    (column) => column.name === "ignore_forgiveness_chance",
  );
  if (!hasPrismMoodIgnoreForgivenessChanceColumn) {
    db.exec(
      "ALTER TABLE prism_mood_state ADD COLUMN ignore_forgiveness_chance REAL;",
    );
  }
  const hasPrismMoodIgnorePenaltyLevelColumn = prismMoodColumns.some(
    (column) => column.name === "ignore_penalty_level",
  );
  if (!hasPrismMoodIgnorePenaltyLevelColumn) {
    db.exec(
      "ALTER TABLE prism_mood_state ADD COLUMN ignore_penalty_level INTEGER;",
    );
  }
  db.exec(`
    UPDATE bots
    SET export_hash = lower(hex(randomblob(16)))
    WHERE export_hash IS NULL OR trim(export_hash) = '';
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_user_export_hash ON bots (user_id, export_hash) WHERE export_hash IS NOT NULL;",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_session_opinions_user_conversation ON session_opinions (user_id, conversation_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_session_opinions_user_bot ON session_opinions (user_id, bot_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_bot_opinions_user_bot ON bot_opinions (user_id, bot_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_bot_relationships_user_source ON bot_relationships (user_id, source_bot_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_bot_relationships_user_target ON bot_relationships (user_id, target_bot_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_social_user_conversation ON coffee_bot_social_state (user_id, conversation_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_cup_top_offs_user_conversation ON coffee_cup_top_offs (user_id, conversation_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_prism_mood_user_conversation ON prism_mood_state (user_id, conversation_id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_prism_mood_events_user_conversation ON prism_mood_events (user_id, conversation_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events (user_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_usage_events_user_conversation_created ON usage_events (user_id, conversation_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_usage_events_user_provider_created ON usage_events (user_id, provider, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_usage_events_user_purpose_created ON usage_events (user_id, purpose, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_developer_transcript_events_conversation_created ON developer_transcript_events (user_id, conversation_id, created_at);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_groups_user_updated ON coffee_groups (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_group_seats_group ON coffee_group_seats (user_id, group_id, seat_index);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_group_events_group ON coffee_group_events (user_id, group_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_shows_user_updated ON botcast_shows (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_shows_user_created ON botcast_shows (user_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_show_intro_audio_user_updated ON botcast_show_intro_audio (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_show_atmosphere_audio_user_updated ON botcast_show_atmosphere_audio (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_episodes_show_updated ON botcast_episodes (user_id, show_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_messages_episode_created ON botcast_messages (user_id, episode_id, created_at);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_botcast_events_episode_sequence ON botcast_events (user_id, episode_id, sequence);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_conversations_coffee_group ON conversations (user_id, coffee_group_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_story_sessions_user_updated ON story_sessions (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_story_sessions_user_status ON story_sessions (user_id, status, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_projects_user_updated ON slate_projects (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_series_user_updated ON slate_series (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_slate_projects_user_id ON slate_projects (user_id, id);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_projects_series_order ON slate_projects (user_id, series_id, book_ordinal, created_at);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_revisions_project_created ON slate_revisions (user_id, project_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_versions_project_created ON slate_versions (user_id, project_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_sections_project_order ON slate_sections (user_id, project_id, ordinal);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_sections_parent_order ON slate_sections (user_id, project_id, parent_section_id, ordinal);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_section_versions_revision ON slate_section_versions (user_id, project_id, section_id, revision DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_exports_project_created ON slate_manuscript_exports (user_id, project_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_return_sessions_project_created ON slate_return_sessions (user_id, project_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_sources_section_revision ON slate_continuity_sources (user_id, project_id, section_id, source_revision DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_entities_series_name ON slate_continuity_entities (user_id, series_id, kind, canonical_name);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_aliases_lookup ON slate_continuity_aliases (user_id, series_id, normalized_alias);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_claims_subject ON slate_continuity_claims (user_id, series_id, subject_entity_id, predicate, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_events_chronology ON slate_continuity_events (user_id, series_id, chronology_key, created_at);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_knowledge_character ON slate_continuity_knowledge (user_id, series_id, character_entity_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_threads_status ON slate_continuity_threads (user_id, series_id, project_id, status, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_concerns_open ON slate_continuity_concerns (user_id, project_id, status, severity, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_jobs_available ON slate_continuity_jobs (user_id, status, available_at, created_at);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_source_indexes_section_revision ON slate_continuity_source_indexes (user_id, project_id, section_id, source_revision DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slate_context_briefs_section_created ON slate_continuity_context_briefs (user_id, project_id, section_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_polls_session_updated ON coffee_polls (user_id, conversation_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_polls_status ON coffee_polls (user_id, conversation_id, status, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_poll_votes_poll ON coffee_poll_votes (user_id, poll_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations (user_id, updated_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages (user_id, created_at DESC);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_memories_user_created ON memories (user_id, created_at DESC);",
  );

  return db;
}

export function createDatabase(): DatabaseSync {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  return initializeDatabase(new DatabaseSync(dbPath));
}

export function mapUserProfile(row: DbUserRecord): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: "user",
    createdAt: row.createdAt,
    theme: row.theme,
    preferredProvider: row.preferredProvider,
  };
}

export function mapConversation(
  row: {
    id: string;
    user_id: string;
    title: string;
    conversation_mode?: string | null;
    bot_id: string | null;
    bot_group_ids?: string | null;
    coffee_group_id?: string | null;
    coffee_absent_bot_ids?: string | null;
    coffee_duration_minutes?: number | null;
    incognito: number;
    last_bot_id?: string | null;
    last_bot_color?: string | null;
    has_assistant_reply?: number;
    created_at: string;
    updated_at: string;
  },
  messages: ChatMessage[],
): Conversation {
  const conversationMode =
    row.conversation_mode === "zen"
      ? "zen"
      : row.conversation_mode === "chat"
        ? "chat"
        : row.conversation_mode === "coffee"
        ? "coffee"
        : "sandbox";
  const botGroupIds = parseBotGroupIds(row.bot_group_ids);
  const coffeeAbsentBotIds = parseBotGroupIds(row.coffee_absent_bot_ids);
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: conversationMode,
    botId: conversationMode === "zen" ? null : (row.bot_id ?? null),
    ...(botGroupIds.length > 0 ? { botGroupIds } : {}),
    ...(conversationMode === "coffee"
      ? { coffeeGroupId: row.coffee_group_id ?? null }
      : {}),
    ...(conversationMode === "coffee" && coffeeAbsentBotIds.length > 0
      ? { coffeeAbsentBotIds }
      : {}),
    ...(conversationMode === "coffee" &&
    isCoffeeSessionDurationMinutes(row.coffee_duration_minutes)
      ? { coffeeSessionDurationMinutes: row.coffee_duration_minutes }
      : {}),
    incognito: conversationMode === "zen" ? false : row.incognito === 1,
    lastBotId: row.last_bot_id ?? null,
    lastBotColor: row.last_bot_color ?? null,
    hasAssistantReply: row.has_assistant_reply === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

function isCoffeeSessionDurationMinutes(
  value: unknown,
): value is CoffeeSessionDurationMinutes {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= COFFEE_SESSION_DURATION_MINUTES_MIN &&
    value <= COFFEE_SESSION_DURATION_MINUTES_MAX
  );
}

function parseBotGroupIds(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  } catch {
    return [];
  }
}

export function mapMemoryRow(row: DbMemoryRecord, text: string): UserMemory {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    confidence: row.confidence,
    category: row.category,
    tier: row.tier,
    durability: row.durability,
    source: row.source,
    certainty: row.certainty ?? row.confidence,
    sourceMessageIds: parseMemorySourceMessageIds(row.sourceMessageIds),
    text,
  };
}

function parseMemorySourceMessageIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

const BOT_RELATIONSHIP_REASON_LIMIT = 4;

function clampBotRelationshipScore(score: number): number {
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50;
}

function botRelationshipBandFromScore(score: number): BotRelationshipBand {
  const clamped = clampBotRelationshipScore(score);
  if (clamped >= 66) return "warm";
  if (clamped <= 34) return "tense";
  return "neutral";
}

function botRelationshipMoodKeyFromScore(score: number): PrismMoodKey {
  const clamped = clampBotRelationshipScore(score);
  if (clamped >= 76) return "joyful";
  if (clamped >= 60) return "warm";
  if (clamped <= 24) return "strained";
  if (clamped <= 40) return "guarded";
  return "neutral";
}

function normalizeBotRelationshipBand(
  value: string,
  score: number,
): BotRelationshipBand {
  if (value === "tense" || value === "neutral" || value === "warm")
    return value;
  return botRelationshipBandFromScore(score);
}

function normalizeBotRelationshipMoodKey(
  value: string,
  score: number,
): PrismMoodKey {
  if (
    value === "joyful" ||
    value === "warm" ||
    value === "neutral" ||
    value === "guarded" ||
    value === "strained"
  ) {
    return value;
  }
  return botRelationshipMoodKeyFromScore(score);
}

function normalizeBotRelationshipTrend(value: string): OpinionTrend {
  if (value === "up" || value === "down" || value === "steady") return value;
  return "steady";
}

function parseBotRelationshipReasons(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0)
      .slice(0, BOT_RELATIONSHIP_REASON_LIMIT);
  } catch {
    return [];
  }
}

function botRelationshipFromRow(
  row: DbBotRelationshipRow,
): BotRelationshipSnapshot {
  const score = Math.round(clampBotRelationshipScore(row.score));
  return {
    sourceBotId: row.source_bot_id,
    targetBotId: row.target_bot_id,
    score,
    band: normalizeBotRelationshipBand(row.band, score),
    moodKey: normalizeBotRelationshipMoodKey(row.mood_key, score),
    trend: normalizeBotRelationshipTrend(row.trend),
    lastReason:
      row.last_reason || "No durable bot-to-bot relationship shift yet.",
    recentReasons: parseBotRelationshipReasons(row.recent_reasons),
    updatedAt: row.updated_at,
  };
}

/**
 * Loads directed pair relationships among a set of bots. Result is keyed
 * source -> target so Alice's read on Boris can differ from Boris's read.
 */
export function loadBotRelationshipsForBots(
  db: DatabaseSync,
  userId: string,
  botIds: readonly string[],
): Record<string, Record<string, BotRelationshipSnapshot>> {
  const uniqueBotIds = [
    ...new Set(botIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (uniqueBotIds.length < 2) return {};
  const placeholders = uniqueBotIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT source_bot_id, target_bot_id, score, band, mood_key, trend,
              last_reason, recent_reasons, updated_at
         FROM bot_relationships
        WHERE user_id = ?
          AND source_bot_id IN (${placeholders})
          AND target_bot_id IN (${placeholders})`,
    )
    .all(
      userId,
      ...uniqueBotIds,
      ...uniqueBotIds,
    ) as unknown as DbBotRelationshipRow[];
  const bySource: Record<string, Record<string, BotRelationshipSnapshot>> = {};
  for (const row of rows) {
    if (row.source_bot_id === row.target_bot_id) continue;
    bySource[row.source_bot_id] ??= {};
    bySource[row.source_bot_id]![row.target_bot_id] =
      botRelationshipFromRow(row);
  }
  return bySource;
}

export function readBotRelationship(
  db: DatabaseSync,
  userId: string,
  sourceBotId: string,
  targetBotId: string,
): BotRelationshipSnapshot | null {
  if (
    !sourceBotId.trim() ||
    !targetBotId.trim() ||
    sourceBotId === targetBotId
  ) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT source_bot_id, target_bot_id, score, band, mood_key, trend,
              last_reason, recent_reasons, updated_at
         FROM bot_relationships
        WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
    )
    .get(userId, sourceBotId, targetBotId) as DbBotRelationshipRow | undefined;
  return row ? botRelationshipFromRow(row) : null;
}

export function upsertBotRelationship(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  targetBotId: string;
  score: number;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  updatedAt: string;
}): BotRelationshipSnapshot | null {
  const sourceBotId = args.sourceBotId.trim();
  const targetBotId = args.targetBotId.trim();
  if (!sourceBotId || !targetBotId || sourceBotId === targetBotId) return null;
  const score = Math.round(clampBotRelationshipScore(args.score));
  const relationship: BotRelationshipSnapshot = {
    sourceBotId,
    targetBotId,
    score,
    band: botRelationshipBandFromScore(score),
    moodKey: botRelationshipMoodKeyFromScore(score),
    trend: args.trend,
    lastReason:
      args.lastReason.replace(/\s+/g, " ").trim() ||
      "No durable bot-to-bot relationship shift yet.",
    recentReasons: args.recentReasons
      .map((reason) => reason.replace(/\s+/g, " ").trim())
      .filter((reason) => reason.length > 0)
      .slice(0, BOT_RELATIONSHIP_REASON_LIMIT),
    updatedAt: args.updatedAt,
  };
  args.db
    .prepare(
      `INSERT INTO bot_relationships (
        user_id, source_bot_id, target_bot_id, score, band, mood_key,
        trend, last_reason, recent_reasons, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, source_bot_id, target_bot_id) DO UPDATE SET
        score = excluded.score,
        band = excluded.band,
        mood_key = excluded.mood_key,
        trend = excluded.trend,
        last_reason = excluded.last_reason,
        recent_reasons = excluded.recent_reasons,
        updated_at = excluded.updated_at`,
    )
    .run(
      args.userId,
      relationship.sourceBotId,
      relationship.targetBotId,
      relationship.score,
      relationship.band,
      relationship.moodKey,
      relationship.trend,
      relationship.lastReason,
      JSON.stringify(relationship.recentReasons),
      relationship.updatedAt,
    );
  return relationship;
}

/**
 * Loads persisted Coffee social state for a conversation and subset of bots.
 */
export function loadCoffeeBotSocialState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botIds: readonly string[],
): Record<string, CoffeeBotSocialSnapshot> {
  if (botIds.length === 0) return {};
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT bot_id, disposition, values_friction, restraint, engagement, leave_pressure
         FROM coffee_bot_social_state
        WHERE user_id = ? AND conversation_id = ? AND bot_id IN (${placeholders})`,
    )
    .all(
      userId,
      conversationId,
      ...botIds,
    ) as unknown as DbCoffeeBotSocialRow[];
  const byId: Record<string, CoffeeBotSocialSnapshot> = {};
  for (const row of rows) {
    byId[row.bot_id] = {
      disposition: row.disposition,
      valuesFriction: row.values_friction,
      restraint: row.restraint,
      engagement: row.engagement,
      leavePressure: row.leave_pressure,
    };
  }
  return byId;
}

/**
 * Upserts Coffee social state snapshots for one conversation.
 */
export function upsertCoffeeBotSocialState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  stateByBotId: Record<string, CoffeeBotSocialSnapshot>,
  updatedAt: string,
): void {
  const entries = Object.entries(stateByBotId);
  if (entries.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO coffee_bot_social_state (
      user_id, conversation_id, bot_id, disposition, values_friction, restraint, engagement, leave_pressure, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, conversation_id, bot_id) DO UPDATE SET
      disposition = excluded.disposition,
      values_friction = excluded.values_friction,
      restraint = excluded.restraint,
      engagement = excluded.engagement,
      leave_pressure = excluded.leave_pressure,
      updated_at = excluded.updated_at`,
  );
  for (const [botId, snapshot] of entries) {
    statement.run(
      userId,
      conversationId,
      botId,
      snapshot.disposition,
      snapshot.valuesFriction,
      snapshot.restraint,
      snapshot.engagement,
      snapshot.leavePressure,
      updatedAt,
    );
  }
}

/**
 * Loads persisted Coffee cup top-off state for a conversation and subset of bots.
 */
export function loadCoffeeCupTopOffState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botIds: readonly string[],
): Record<string, CoffeeCupTopOffSnapshot> {
  if (botIds.length === 0) return {};
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT bot_id, progress_before, progress_after, topped_off_at
         FROM coffee_cup_top_offs
        WHERE user_id = ? AND conversation_id = ? AND bot_id IN (${placeholders})`,
    )
    .all(
      userId,
      conversationId,
      ...botIds,
    ) as unknown as DbCoffeeCupTopOffRow[];
  const byId: Record<string, CoffeeCupTopOffSnapshot> = {};
  for (const row of rows) {
    byId[row.bot_id] = {
      progressBefore: row.progress_before,
      progressAfter: row.progress_after,
      toppedOffAt: row.topped_off_at,
    };
  }
  return byId;
}

/**
 * Upserts Coffee cup top-off snapshots for one conversation.
 */
export function upsertCoffeeCupTopOffState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  stateByBotId: Record<string, CoffeeCupTopOffSnapshot>,
  updatedAt: string,
): void {
  const entries = Object.entries(stateByBotId);
  if (entries.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO coffee_cup_top_offs (
      user_id, conversation_id, bot_id, progress_before, progress_after, topped_off_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, conversation_id, bot_id) DO UPDATE SET
      progress_before = excluded.progress_before,
      progress_after = excluded.progress_after,
      topped_off_at = excluded.topped_off_at,
      updated_at = excluded.updated_at`,
  );
  for (const [botId, snapshot] of entries) {
    statement.run(
      userId,
      conversationId,
      botId,
      snapshot.progressBefore,
      snapshot.progressAfter,
      snapshot.toppedOffAt,
      updatedAt,
    );
  }
}

function parsePrismMoodDeltas(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadPrismMoodState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  mode: PrismMoodMode,
): PrismMoodSnapshot | null {
  const row = db
    .prepare(
      `SELECT mode, mood_key, confidence, annoyance, warmth, engagement, restraint,
              recent_deltas, ignore_until, ignore_cooldown_ms,
              ignore_forgiveness_chance, ignore_penalty_level, frozen, updated_at
         FROM prism_mood_state
        WHERE user_id = ? AND conversation_id = ? AND mode = ?
        LIMIT 1`,
    )
    .get(userId, conversationId, mode) as DbPrismMoodRow | undefined;
  if (!row) return null;
  return sanitizePrismMoodState(
    {
      mode: row.mode,
      moodKey: row.mood_key,
      confidence: row.confidence,
      annoyance: row.annoyance,
      warmth: row.warmth,
      engagement: row.engagement,
      restraint: row.restraint,
      lastUpdatedAt: row.updated_at,
      recentDeltas: parsePrismMoodDeltas(row.recent_deltas),
      ...(row.ignore_until ? { ignoreUntil: row.ignore_until } : {}),
      ...(typeof row.ignore_cooldown_ms === "number"
        ? { ignoreCooldownMs: row.ignore_cooldown_ms }
        : {}),
      ...(typeof row.ignore_forgiveness_chance === "number"
        ? { ignoreForgivenessChance: row.ignore_forgiveness_chance }
        : {}),
      ...(typeof row.ignore_penalty_level === "number"
        ? { ignorePenaltyLevel: row.ignore_penalty_level }
        : {}),
      frozen: row.frozen === 1,
    },
    mode,
    row.updated_at,
  );
}

export function upsertPrismMoodState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  state: PrismMoodSnapshot,
): PrismMoodSnapshot {
  const mood = sanitizePrismMoodState(state, state.mode, state.lastUpdatedAt);
  db.prepare(
    `INSERT INTO prism_mood_state (
      user_id, conversation_id, mode, mood_key, confidence, annoyance, warmth,
      engagement, restraint, recent_deltas, ignore_until, ignore_cooldown_ms,
      ignore_forgiveness_chance, ignore_penalty_level, frozen, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, conversation_id, mode) DO UPDATE SET
      mood_key = excluded.mood_key,
      confidence = excluded.confidence,
      annoyance = excluded.annoyance,
      warmth = excluded.warmth,
      engagement = excluded.engagement,
      restraint = excluded.restraint,
      recent_deltas = excluded.recent_deltas,
      ignore_until = excluded.ignore_until,
      ignore_cooldown_ms = excluded.ignore_cooldown_ms,
      ignore_forgiveness_chance = excluded.ignore_forgiveness_chance,
      ignore_penalty_level = excluded.ignore_penalty_level,
      frozen = excluded.frozen,
      updated_at = excluded.updated_at`,
  ).run(
    userId,
    conversationId,
    mood.mode,
    mood.moodKey,
    mood.confidence,
    mood.annoyance,
    mood.warmth,
    mood.engagement,
    mood.restraint,
    JSON.stringify(mood.recentDeltas),
    mood.ignoreUntil ?? null,
    mood.ignoreCooldownMs ?? null,
    mood.ignoreForgivenessChance ?? null,
    mood.ignorePenaltyLevel ?? null,
    mood.frozen === true ? 1 : 0,
    mood.lastUpdatedAt,
  );
  return mood;
}

export function recordPrismMoodEventOnce(
  db: DatabaseSync,
  args: {
    userId: string;
    conversationId: string;
    messageId: string;
    eventType: string;
    createdAt: string;
    payload?: Record<string, unknown>;
  },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO prism_mood_events (
        user_id, conversation_id, message_id, event_type, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.userId,
      args.conversationId,
      args.messageId,
      args.eventType,
      args.createdAt,
      JSON.stringify(args.payload ?? {}),
  ) as { changes?: number | bigint };
  return Number(result.changes ?? 0) > 0;
}

export function loadPrismMoodEventMessageIds(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  eventType: string,
): Set<string> {
  const rows = db
    .prepare(
      `SELECT message_id
         FROM prism_mood_events
        WHERE user_id = ?
          AND conversation_id = ?
          AND event_type = ?`,
    )
    .all(userId, conversationId, eventType) as Array<{ message_id: string }>;
  return new Set(rows.map((row) => row.message_id));
}
