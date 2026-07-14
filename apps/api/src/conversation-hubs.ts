import type { DatabaseSync } from "node:sqlite";

export const PRISM_HUB_BOT_KEY = "__prism__";

export type ConversationHubRole = "hub" | "side";

export interface ConversationHubMetadata {
  hubRole: ConversationHubRole;
  hubBotId: string | null;
  parentHubId: string | null;
}

export function conversationHubKey(botId: string | null | undefined): string {
  const normalized = typeof botId === "string" ? botId.trim() : "";
  return normalized.length > 0 ? normalized : PRISM_HUB_BOT_KEY;
}

export function conversationHubBotIdFromKey(botKey: string | null | undefined): string | null {
  if (!botKey || botKey === PRISM_HUB_BOT_KEY) return null;
  return botKey;
}

export function ensureConversationHubsTable(db: DatabaseSync): void {
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
}

function conversationTableHasColumn(db: DatabaseSync, columnName: string): boolean {
  const rows = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

export function bindConversationHub(
  db: DatabaseSync,
  userId: string,
  botId: string | null | undefined,
  conversationId: string,
  timestampIso: string
): void {
  ensureConversationHubsTable(db);
  db.prepare(
    `INSERT INTO conversation_hubs (user_id, bot_key, conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, bot_key) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       updated_at = excluded.updated_at`
  ).run(userId, conversationHubKey(botId), conversationId, timestampIso, timestampIso);
}

export function getHubConversationId(
  db: DatabaseSync,
  userId: string,
  botId: string | null | undefined
): string | null {
  ensureConversationHubsTable(db);
  const botKey = conversationHubKey(botId);
  const conversationFilters = [
    "h.user_id = ?",
    "h.bot_key = ?",
  ];
  if (conversationTableHasColumn(db, "incognito")) {
    conversationFilters.push("COALESCE(c.incognito, 0) = 0");
  }
  if (conversationTableHasColumn(db, "archived_at")) {
    conversationFilters.push("c.archived_at IS NULL");
  }
  const row = db
    .prepare(
      `SELECT h.conversation_id
         FROM conversation_hubs h
         JOIN conversations c
           ON c.id = h.conversation_id
          AND c.user_id = h.user_id
        WHERE ${conversationFilters.join("\n          AND ")}
        LIMIT 1`
    )
    .get(userId, botKey) as { conversation_id: string } | undefined;
  if (row?.conversation_id) return row.conversation_id;
  db.prepare("DELETE FROM conversation_hubs WHERE user_id = ? AND bot_key = ?").run(
    userId,
    botKey
  );
  return null;
}

export function getConversationHubMetadata(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): ConversationHubMetadata | null {
  ensureConversationHubsTable(db);
  const hasParentIdColumn = conversationTableHasColumn(db, "parent_id");
  const conversation = db
    .prepare(
      `SELECT conversation_mode, bot_id${hasParentIdColumn ? ", parent_id" : ""}
         FROM conversations
        WHERE user_id = ?
          AND id = ?
        LIMIT 1`
    )
    .get(userId, conversationId) as
    | { conversation_mode: string | null; bot_id: string | null; parent_id?: string | null }
    | undefined;
  if (conversation?.parent_id) {
    return {
      hubRole: "side",
      hubBotId: conversation.bot_id ?? null,
      parentHubId: conversation.parent_id,
    };
  }

  const hubRow = db
    .prepare(
      `SELECT bot_key
         FROM conversation_hubs
        WHERE user_id = ? AND conversation_id = ?
        LIMIT 1`
    )
    .get(userId, conversationId) as { bot_key: string } | undefined;
  if (hubRow) {
    return {
      hubRole: "hub",
      hubBotId: conversationHubBotIdFromKey(hubRow.bot_key),
      parentHubId: null,
    };
  }
  if (
    conversation &&
    (conversation.conversation_mode === "zen" ||
      (conversation.conversation_mode === "chat" && conversation.bot_id === null))
  ) {
    return {
      hubRole: "hub",
      // Zen's persisted bot_id is its immutable relationship owner. Older
      // global Zen rows keep NULL and therefore continue to resolve to Prism;
      // the most recent speaker must never be allowed to redefine ownership.
      hubBotId:
        conversation.conversation_mode === "zen"
          ? conversation.bot_id ?? null
          : null,
      parentHubId: null,
    };
  }
  return null;
}

export function getConversationHubMetadataMap(
  db: DatabaseSync,
  userId: string,
  conversationIds: readonly string[]
): Map<string, ConversationHubMetadata> {
  const map = new Map<string, ConversationHubMetadata>();
  for (const conversationId of conversationIds) {
    const metadata = getConversationHubMetadata(db, userId, conversationId);
    if (metadata) map.set(conversationId, metadata);
  }
  return map;
}
