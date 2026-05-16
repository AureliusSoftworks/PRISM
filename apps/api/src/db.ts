import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChatMessage,
  CoffeeBotSocialSnapshot,
  Conversation,
  MemoryCategory,
  MemoryTier,
  UserMemory,
  UserProfile,
} from "@localai/shared";

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
  preferredProvider: "local" | "openai";
  providerLocked: number;
  autoMemory: number;
  autoSwitchModel: number;
  preferredLocalModel: string | null;
  preferredOnlineModel: string | null;
  lenientLocalFallbackModel: string | null;
  secondaryOllamaHost: string | null;
  comfyUiHost: string | null;
  composerWritingAssist: number;
  openAiKeyCiphertext: string | null;
  openAiKeyIv: string | null;
  openAiKeyTag: string | null;
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

export function createDatabase(): DatabaseSync {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
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
      preferred_provider TEXT NOT NULL DEFAULT 'local',
      provider_locked INTEGER NOT NULL DEFAULT 0,
      auto_memory INTEGER NOT NULL DEFAULT 1,
      auto_switch_model INTEGER NOT NULL DEFAULT 0,
      hidden_bot_model_ids TEXT NOT NULL DEFAULT '[]',
      preferred_local_model TEXT,
      preferred_online_model TEXT,
      lenient_local_fallback_model TEXT,
      secondary_ollama_host TEXT,
      comfyui_host TEXT,
      comfyui_workflows TEXT NOT NULL DEFAULT '[]',
      preferred_local_image_model TEXT,
      preferred_openai_image_model TEXT,
      composer_writing_assist INTEGER NOT NULL DEFAULT 1,
      dev_memories_enabled INTEGER NOT NULL DEFAULT 0,
      dev_memories_text TEXT NOT NULL DEFAULT '',
      openai_key_ciphertext TEXT,
      openai_key_iv TEXT,
      openai_key_tag TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
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
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
      prompt TEXT NOT NULL,
      revised_prompt TEXT,
      url TEXT NOT NULL,
      size TEXT NOT NULL DEFAULT '1024x1024',
      quality TEXT NOT NULL DEFAULT 'standard',
      provider TEXT NOT NULL DEFAULT 'openai',
      local_rel_path TEXT,
      model TEXT NOT NULL DEFAULT 'dall-e-3',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      export_hash TEXT,
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      local_image_model TEXT,
      openai_image_model TEXT,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      color TEXT,
      glyph TEXT,
      chat_enabled INTEGER NOT NULL DEFAULT 1,
      online_enabled INTEGER NOT NULL DEFAULT 1,
      delete_protected INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS coffee_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      preset_mode TEXT NOT NULL DEFAULT 'manual',
      coffee_topic_mode TEXT NOT NULL DEFAULT 'manual',
      model_choice TEXT NOT NULL DEFAULT '{}',
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
  `);
  const userColumns = db
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  const hasLastActiveAt = userColumns.some((column) => column.name === "last_active_at");
  if (!hasLastActiveAt) {
    db.exec("ALTER TABLE users ADD COLUMN last_active_at TEXT;");
  }
  const hasProviderLocked = userColumns.some((column) => column.name === "provider_locked");
  if (!hasProviderLocked) {
    db.exec("ALTER TABLE users ADD COLUMN provider_locked INTEGER NOT NULL DEFAULT 0;");
  }
  const hasHiddenBotModelIds = userColumns.some((column) => column.name === "hidden_bot_model_ids");
  if (!hasHiddenBotModelIds) {
    db.exec("ALTER TABLE users ADD COLUMN hidden_bot_model_ids TEXT NOT NULL DEFAULT '[]';");
  }
  const hasSecondaryOllamaHost = userColumns.some((column) => column.name === "secondary_ollama_host");
  if (!hasSecondaryOllamaHost) {
    db.exec("ALTER TABLE users ADD COLUMN secondary_ollama_host TEXT;");
  }
  const hasDevMemoriesEnabled = userColumns.some(
    (column) => column.name === "dev_memories_enabled"
  );
  if (!hasDevMemoriesEnabled) {
    db.exec("ALTER TABLE users ADD COLUMN dev_memories_enabled INTEGER NOT NULL DEFAULT 0;");
  }
  const hasDevMemoriesText = userColumns.some(
    (column) => column.name === "dev_memories_text"
  );
  if (!hasDevMemoriesText) {
    db.exec("ALTER TABLE users ADD COLUMN dev_memories_text TEXT NOT NULL DEFAULT '';");
  }
  const hasPreferredLocalModel = userColumns.some(
    (column) => column.name === "preferred_local_model"
  );
  if (!hasPreferredLocalModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_local_model TEXT;");
  }
  const hasPreferredOnlineModel = userColumns.some(
    (column) => column.name === "preferred_online_model"
  );
  if (!hasPreferredOnlineModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_online_model TEXT;");
  }
  const hasLenientLocalFallbackModel = userColumns.some(
    (column) => column.name === "lenient_local_fallback_model"
  );
  if (!hasLenientLocalFallbackModel) {
    db.exec("ALTER TABLE users ADD COLUMN lenient_local_fallback_model TEXT;");
  }
  const hasComposerWritingAssist = userColumns.some(
    (column) => column.name === "composer_writing_assist"
  );
  if (!hasComposerWritingAssist) {
    db.exec("ALTER TABLE users ADD COLUMN composer_writing_assist INTEGER NOT NULL DEFAULT 1;");
  }
  const hasComfyuiHost = userColumns.some((column) => column.name === "comfyui_host");
  if (!hasComfyuiHost) {
    db.exec("ALTER TABLE users ADD COLUMN comfyui_host TEXT;");
  }
  const hasPreferredLocalImageModel = userColumns.some(
    (column) => column.name === "preferred_local_image_model"
  );
  if (!hasPreferredLocalImageModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_local_image_model TEXT;");
  }
  const hasPreferredOpenAiImageModel = userColumns.some(
    (column) => column.name === "preferred_openai_image_model"
  );
  if (!hasPreferredOpenAiImageModel) {
    db.exec("ALTER TABLE users ADD COLUMN preferred_openai_image_model TEXT;");
  }
  const hasLenientLocalImageFallbackModel = userColumns.some(
    (column) => column.name === "lenient_local_image_fallback_model"
  );
  if (!hasLenientLocalImageFallbackModel) {
    db.exec("ALTER TABLE users ADD COLUMN lenient_local_image_fallback_model TEXT;");
  }
  const hasComfyuiWorkflows = userColumns.some((column) => column.name === "comfyui_workflows");
  if (!hasComfyuiWorkflows) {
    db.exec("ALTER TABLE users ADD COLUMN comfyui_workflows TEXT;");
    db.exec(`UPDATE users SET comfyui_workflows = '[]' WHERE comfyui_workflows IS NULL;`);
  }
  const hasPrismDefaultLlmModel = userColumns.some(
    (column) => column.name === "prism_default_llm_model"
  );
  if (!hasPrismDefaultLlmModel) {
    db.exec("ALTER TABLE users ADD COLUMN prism_default_llm_model TEXT;");
  }
  const hasPrismImageToolLlmModel = userColumns.some(
    (column) => column.name === "prism_image_tool_llm_model"
  );
  if (!hasPrismImageToolLlmModel) {
    db.exec("ALTER TABLE users ADD COLUMN prism_image_tool_llm_model TEXT;");
  }
  const hasFallbackModelMessageStripe = userColumns.some(
    (column) => column.name === "fallback_model_message_stripe"
  );
  if (!hasFallbackModelMessageStripe) {
    db.exec(
      "ALTER TABLE users ADD COLUMN fallback_model_message_stripe INTEGER NOT NULL DEFAULT 1;"
    );
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
    (column) => column.name === "provider"
  );
  if (!hasProviderColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN provider TEXT;");
  }
  const hasMessageModelColumn = messageColumns.some(
    (column) => column.name === "model"
  );
  if (!hasMessageModelColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN model TEXT;");
  }
  const hasBotIdColumn = messageColumns.some(
    (column) => column.name === "bot_id"
  );
  if (!hasBotIdColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN bot_id TEXT;");
  }
  const hasToolPayloadColumn = messageColumns.some(
    (column) => column.name === "tool_payload"
  );
  if (!hasToolPayloadColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN tool_payload TEXT;");
  }
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;
  const hasConversationModeColumn = conversationColumns.some(
    (column) => column.name === "conversation_mode"
  );
  if (!hasConversationModeColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN conversation_mode TEXT NOT NULL DEFAULT 'sandbox';");
  }
  const hasConversationArchivedAtColumn = conversationColumns.some(
    (column) => column.name === "archived_at"
  );
  if (!hasConversationArchivedAtColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN archived_at TEXT;");
  }
  const hasConversationArchiveBatchIdColumn = conversationColumns.some(
    (column) => column.name === "archive_batch_id"
  );
  if (!hasConversationArchiveBatchIdColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN archive_batch_id TEXT;");
  }
  const hasConversationBotGroupIdsColumn = conversationColumns.some(
    (column) => column.name === "bot_group_ids"
  );
  if (!hasConversationBotGroupIdsColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN bot_group_ids TEXT;");
  }
  const hasConversationCoffeeSettingsColumn = conversationColumns.some(
    (column) => column.name === "coffee_settings"
  );
  if (!hasConversationCoffeeSettingsColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_settings TEXT;");
  }
  const hasConversationCoffeeGroupIdColumn = conversationColumns.some(
    (column) => column.name === "coffee_group_id"
  );
  if (!hasConversationCoffeeGroupIdColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_group_id TEXT;");
  }
  const hasConversationCoffeeDurationColumn = conversationColumns.some(
    (column) => column.name === "coffee_duration_minutes"
  );
  if (!hasConversationCoffeeDurationColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_duration_minutes INTEGER;");
  }
  const hasConversationCoffeePresetColumn = conversationColumns.some(
    (column) => column.name === "coffee_preset_id"
  );
  if (!hasConversationCoffeePresetColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_preset_id TEXT;");
  }
  const hasConversationCoffeeTopicColumn = conversationColumns.some(
    (column) => column.name === "coffee_topic"
  );
  if (!hasConversationCoffeeTopicColumn) {
    db.exec("ALTER TABLE conversations ADD COLUMN coffee_topic TEXT;");
  }
  const coffeeGroupColumns = db
    .prepare("PRAGMA table_info(coffee_groups)")
    .all() as Array<{ name: string }>;
  const hasCoffeeGroupTopicModeColumn = coffeeGroupColumns.some(
    (column) => column.name === "coffee_topic_mode"
  );
  if (!hasCoffeeGroupTopicModeColumn) {
    db.exec(
      "ALTER TABLE coffee_groups ADD COLUMN coffee_topic_mode TEXT NOT NULL DEFAULT 'manual';"
    );
  }
  const hasCoffeeGroupModelChoiceColumn = coffeeGroupColumns.some(
    (column) => column.name === "model_choice"
  );
  if (!hasCoffeeGroupModelChoiceColumn) {
    db.exec(
      "ALTER TABLE coffee_groups ADD COLUMN model_choice TEXT NOT NULL DEFAULT '{}';"
    );
  }
  const sweepBatchColumns = db
    .prepare("PRAGMA table_info(conversation_sweep_batches)")
    .all() as Array<{ name: string }>;
  const hasSweepUndoExpiresAt = sweepBatchColumns.some(
    (column) => column.name === "undo_expires_at"
  );
  if (!hasSweepUndoExpiresAt) {
    db.exec("ALTER TABLE conversation_sweep_batches ADD COLUMN undo_expires_at TEXT;");
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

  const memoryColumns = db
    .prepare("PRAGMA table_info(memories)")
    .all() as Array<{ name: string }>;
  const hasMemoryConversationIdColumn = memoryColumns.some(
    (column) => column.name === "conversation_id"
  );
  if (!hasMemoryConversationIdColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN conversation_id TEXT;");
  }
  const hasMemoryBotIdColumn = memoryColumns.some(
    (column) => column.name === "bot_id"
  );
  if (!hasMemoryBotIdColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN bot_id TEXT;");
  }
  const hasMemorySourceColumn = memoryColumns.some(
    (column) => column.name === "source"
  );
  if (!hasMemorySourceColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'direct';");
  }
  const hasMemoryCertaintyColumn = memoryColumns.some(
    (column) => column.name === "certainty"
  );
  if (!hasMemoryCertaintyColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN certainty REAL;");
  }
  const hasMemorySourceMessageIdsColumn = memoryColumns.some(
    (column) => column.name === "source_message_ids"
  );
  if (!hasMemorySourceMessageIdsColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN source_message_ids TEXT NOT NULL DEFAULT '[]';");
  }
  const hasMemoryCategoryColumn = memoryColumns.some(
    (column) => column.name === "category"
  );
  if (!hasMemoryCategoryColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN category TEXT NOT NULL DEFAULT 'general';");
  }
  const hasMemoryTierColumn = memoryColumns.some(
    (column) => column.name === "tier"
  );
  if (!hasMemoryTierColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN tier TEXT NOT NULL DEFAULT 'short_term';");
  }
  const hasMemoryDurabilityColumn = memoryColumns.some(
    (column) => column.name === "durability"
  );
  if (!hasMemoryDurabilityColumn) {
    db.exec("ALTER TABLE memories ADD COLUMN durability REAL NOT NULL DEFAULT 0.5;");
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
      WHEN (
          ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.95
        )
        OR (
          ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.9
          AND COALESCE(durability, 0.5) >= 0.5
        )
        OR (
          COALESCE(durability, 0.5) >= 0.72
          AND ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.78
        )
        THEN 'long_term'
      ELSE 'short_term'
    END
    WHERE tier IS NULL
       OR trim(tier) = ''
       OR lower(tier) NOT IN ('short_term', 'long_term');
  `);
  db.exec(`
    UPDATE memories
    SET tier = 'long_term'
    WHERE (
      (
        ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.95
      )
       OR (
        ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.9
        AND COALESCE(durability, 0.5) >= 0.5
      )
       OR (
        COALESCE(durability, 0.5) >= 0.72
        AND ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.78
      )
    )
      AND tier = 'short_term';
  `);
  db.exec(`
    UPDATE memories
    SET tier = 'short_term'
    WHERE NOT (
        (
          ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.95
        )
        OR (
          ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.9
          AND COALESCE(durability, 0.5) >= 0.5
        )
        OR (
          COALESCE(durability, 0.5) >= 0.72
          AND ((confidence + COALESCE(certainty, confidence)) / 2.0) >= 0.78
        )
      )
      AND tier = 'long_term';
  `);

  const imageColumns = db
    .prepare("PRAGMA table_info(images)")
    .all() as Array<{ name: string }>;
  const hasImageBotIdColumn = imageColumns.some(
    (column) => column.name === "bot_id"
  );
  if (!hasImageBotIdColumn) {
    db.exec("ALTER TABLE images ADD COLUMN bot_id TEXT;");
  }

  const hasImageLocalRelPathColumn = imageColumns.some(
    (column) => column.name === "local_rel_path"
  );
  if (!hasImageLocalRelPathColumn) {
    db.exec("ALTER TABLE images ADD COLUMN local_rel_path TEXT;");
  }

  const hasImageModelColumn = imageColumns.some(
    (column) => column.name === "model"
  );
  if (!hasImageModelColumn) {
    db.exec(
      "ALTER TABLE images ADD COLUMN model TEXT NOT NULL DEFAULT 'dall-e-3';"
    );
  }

  // Migrate existing DBs to the bots.color and bots.glyph columns used
  // for the visual identifier that appears on the bot card and messages.
  const botColumns = db
    .prepare("PRAGMA table_info(bots)")
    .all() as Array<{ name: string }>;
  const hasBotColorColumn = botColumns.some(
    (column) => column.name === "color"
  );
  if (!hasBotColorColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN color TEXT;");
  }
  const hasBotGlyphColumn = botColumns.some(
    (column) => column.name === "glyph"
  );
  if (!hasBotGlyphColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN glyph TEXT;");
  }
  const hasBotChatEnabledColumn = botColumns.some(
    (column) => column.name === "chat_enabled"
  );
  if (!hasBotChatEnabledColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 1;");
  }
  db.exec("UPDATE bots SET chat_enabled = 1 WHERE chat_enabled != 1;");
  const hasBotOnlineEnabledColumn = botColumns.some(
    (column) => column.name === "online_enabled"
  );
  if (!hasBotOnlineEnabledColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN online_enabled INTEGER NOT NULL DEFAULT 1;");
  }
  const hasBotDeleteProtectedColumn = botColumns.some(
    (column) => column.name === "delete_protected"
  );
  if (!hasBotDeleteProtectedColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN delete_protected INTEGER NOT NULL DEFAULT 0;");
  }
  const hasBotLocalModelColumn = botColumns.some(
    (column) => column.name === "local_model"
  );
  if (!hasBotLocalModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN local_model TEXT;");
  }
  const hasBotOnlineModelColumn = botColumns.some(
    (column) => column.name === "online_model"
  );
  if (!hasBotOnlineModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN online_model TEXT;");
  }
  const hasBotLocalImageModelColumn = botColumns.some(
    (column) => column.name === "local_image_model"
  );
  if (!hasBotLocalImageModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN local_image_model TEXT;");
  }
  const hasBotOpenaiImageModelColumn = botColumns.some(
    (column) => column.name === "openai_image_model"
  );
  if (!hasBotOpenaiImageModelColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN openai_image_model TEXT;");
  }
  const hasBotExportHashColumn = botColumns.some(
    (column) => column.name === "export_hash"
  );
  if (!hasBotExportHashColumn) {
    db.exec("ALTER TABLE bots ADD COLUMN export_hash TEXT;");
  }
  db.exec(`
    UPDATE bots
    SET export_hash = lower(hex(randomblob(16)))
    WHERE export_hash IS NULL OR trim(export_hash) = '';
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_user_export_hash ON bots (user_id, export_hash) WHERE export_hash IS NOT NULL;"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_session_opinions_user_conversation ON session_opinions (user_id, conversation_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_session_opinions_user_bot ON session_opinions (user_id, bot_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_bot_opinions_user_bot ON bot_opinions (user_id, bot_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_social_user_conversation ON coffee_bot_social_state (user_id, conversation_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_groups_user_updated ON coffee_groups (user_id, updated_at DESC);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_group_seats_group ON coffee_group_seats (user_id, group_id, seat_index);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_coffee_group_events_group ON coffee_group_events (user_id, group_id, created_at DESC);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_conversations_coffee_group ON conversations (user_id, coffee_group_id, updated_at DESC);"
  );

  return db;
}

export function mapUserProfile(row: DbUserRecord): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: "user",
    createdAt: row.createdAt,
    theme: row.theme,
    preferredProvider: row.preferredProvider
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
    coffee_duration_minutes?: number | null;
    incognito: number;
    last_bot_id?: string | null;
    last_bot_color?: string | null;
    has_assistant_reply?: number;
    created_at: string;
    updated_at: string;
  },
  messages: ChatMessage[]
): Conversation {
  const conversationMode =
    row.conversation_mode === "chat"
      ? "chat"
      : row.conversation_mode === "coffee"
        ? "coffee"
        : "sandbox";
  const botGroupIds = parseBotGroupIds(row.bot_group_ids);
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: conversationMode,
    botId: row.bot_id ?? null,
    ...(botGroupIds.length > 0 ? { botGroupIds } : {}),
    ...(conversationMode === "coffee" ? { coffeeGroupId: row.coffee_group_id ?? null } : {}),
    ...(conversationMode === "coffee" && isCoffeeSessionDurationMinutes(row.coffee_duration_minutes)
      ? { coffeeSessionDurationMinutes: row.coffee_duration_minutes }
      : {}),
    incognito: row.incognito === 1,
    lastBotId: row.last_bot_id ?? null,
    lastBotColor: row.last_bot_color ?? null,
    hasAssistantReply: row.has_assistant_reply === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages
  };
}

function isCoffeeSessionDurationMinutes(value: unknown): value is 1 | 5 | 10 {
  return value === 1 || value === 5 || value === 10;
}

function parseBotGroupIds(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0
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
    text
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

/**
 * Loads persisted Coffee social state for a conversation and subset of bots.
 */
export function loadCoffeeBotSocialState(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botIds: readonly string[]
): Record<string, CoffeeBotSocialSnapshot> {
  if (botIds.length === 0) return {};
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT bot_id, disposition, values_friction, restraint, engagement, leave_pressure
         FROM coffee_bot_social_state
        WHERE user_id = ? AND conversation_id = ? AND bot_id IN (${placeholders})`
    )
    .all(userId, conversationId, ...botIds) as unknown as DbCoffeeBotSocialRow[];
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
  updatedAt: string
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
      updated_at = excluded.updated_at`
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
      updatedAt
    );
  }
}
