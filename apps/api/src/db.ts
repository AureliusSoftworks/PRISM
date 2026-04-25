import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserProfile, Conversation, ChatMessage, UserMemory } from "@localai/shared";

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
  createdAt: string;
}

function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
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
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bot_id TEXT,
      parent_id TEXT,
      fork_message_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
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
      bot_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      prompt TEXT NOT NULL,
      revised_prompt TEXT,
      url TEXT NOT NULL,
      size TEXT NOT NULL DEFAULT '1024x1024',
      quality TEXT NOT NULL DEFAULT 'standard',
      provider TEXT NOT NULL DEFAULT 'openai',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      model TEXT,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      color TEXT,
      glyph TEXT,
      chat_enabled INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
  const hasBotIdColumn = messageColumns.some(
    (column) => column.name === "bot_id"
  );
  if (!hasBotIdColumn) {
    db.exec("ALTER TABLE messages ADD COLUMN bot_id TEXT;");
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
    db.exec("ALTER TABLE bots ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 0;");
  }

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
    bot_id: string | null;
    incognito: number;
    last_bot_id?: string | null;
    last_bot_color?: string | null;
    has_assistant_reply?: number;
    created_at: string;
    updated_at: string;
  },
  messages: ChatMessage[]
): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    botId: row.bot_id ?? null,
    incognito: row.incognito === 1,
    lastBotId: row.last_bot_id ?? null,
    lastBotColor: row.last_bot_color ?? null,
    hasAssistantReply: row.has_assistant_reply === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages
  };
}

export function mapMemoryRow(row: DbMemoryRecord, text: string): UserMemory {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    confidence: row.confidence,
    text
  };
}
