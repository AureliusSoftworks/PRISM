import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";

export interface ConversationSummary {
  id: string;
  title: string;
  mode: "chat" | "sandbox" | "coffee";
  botId: string | null;
  /** Coffee-only — the 2-5 bot ids participating in this group thread. */
  botGroupIds?: string[];
  /** Coffee-only — durable parent group for recurring table sessions. */
  coffeeGroupId?: string | null;
  /** Coffee-only — timed session duration once group-owned sessions are used. */
  coffeeSessionDurationMinutes?: 1 | 5 | 10;
  incognito: boolean;
  lastBotId: string | null;
  lastBotColor: string | null;
  hasAssistantReply: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSweepResult {
  batchId: string | null;
  sweptGroups: number;
  archivedConversationCount: number;
  summaryConversationCount: number;
  undoExpiresAt: string | null;
}

export interface ConversationSweepState {
  canUndo: boolean;
  latestBatchId: string | null;
  latestSweepAt: string | null;
}

const DEV_SEED_CHAT_USER_MESSAGE = "Dev tools seeded this sidebar chat.";
const DEV_SEED_CHAT_ASSISTANT_MESSAGE =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const SWEEP_UNDO_WINDOW_MS = 15000;

function inClausePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function clampSnippet(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function parseIdList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

function deleteConversationsByIds(
  db: DatabaseSync,
  userId: string,
  conversationIds: string[]
): number {
  if (conversationIds.length === 0) return 0;
  const placeholders = inClausePlaceholders(conversationIds.length);
  const scopedInClause = `user_id = ? AND id IN (${placeholders})`;
  const messageScopedInClause = `user_id = ? AND conversation_id IN (${placeholders})`;

  db.prepare(
    `UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `DELETE FROM conversation_exports WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `DELETE FROM messages WHERE ${messageScopedInClause}`
  ).run(userId, ...conversationIds);
  const deleted = db.prepare(
    `DELETE FROM conversations WHERE ${scopedInClause}`
  ).run(userId, ...conversationIds);
  return Number(deleted.changes ?? 0);
}

function composeSweepSummaryText(
  db: DatabaseSync,
  userId: string,
  groupName: string,
  conversationRows: Array<{ id: string; title: string }>
): string {
  const lines: string[] = [];
  lines.push(`Sweep summary for ${groupName}.`);
  lines.push(`Archived ${conversationRows.length} chats into this single recap.`);
  lines.push("");
  lines.push("Conversation highlights:");

  for (const row of conversationRows.slice(0, 8)) {
    const latestMessages = db
      .prepare(
        `SELECT role, content
           FROM messages
          WHERE user_id = ? AND conversation_id = ?
          ORDER BY created_at DESC
          LIMIT 4`
      )
      .all(userId, row.id) as Array<{ role: string; content: string }>;
    const latestUser = latestMessages.find((message) => message.role === "user");
    const latestAssistant = latestMessages.find((message) => message.role === "assistant");
    const parts: string[] = [];
    if (latestUser?.content) {
      parts.push(`you: "${clampSnippet(latestUser.content, 96)}"`);
    }
    if (latestAssistant?.content) {
      parts.push(`assistant: "${clampSnippet(latestAssistant.content, 96)}"`);
    }
    const suffix = parts.length > 0 ? ` (${parts.join(" | ")})` : "";
    lines.push(`- ${row.title}${suffix}`);
  }

  if (conversationRows.length > 8) {
    lines.push(`- +${conversationRows.length - 8} additional archived chats`);
  }

  lines.push("");
  lines.push("Use Undo Sweep to restore the previous chat list.");
  return lines.join("\n");
}

/**
 * Create saved, bot-attributed placeholder chats for Developer Tools.
 *
 * These rows deliberately bypass the normal LLM pipeline: they are only seeded
 * UI fixtures for sidebar density checks, so a static lorem assistant reply is
 * enough and avoids provider/network side effects.
 */
export function createDevSeedConversations(
  db: DatabaseSync,
  userId: string,
  count: number
): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Chat seed count must be a positive integer.");
  }

  const botRows = db
    .prepare(
      "SELECT id FROM bots WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, name ASC"
    )
    .all(userId) as Array<{ id: string }>;

  const insertConversation = db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, 'sandbox', ?, 0, ?, ?)"
  );
  const insertMessage = db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const baseTime = Date.now();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (let index = 0; index < count; index += 1) {
      const conversationId = randomId(12);
      const botId = botRows.length > 0
        ? botRows[index % botRows.length]?.id ?? null
        : null;
      const createdAt = new Date(baseTime + index * 2).toISOString();
      const updatedAt = new Date(baseTime + index * 2 + 1).toISOString();
      const ordinal = index + 1;

      insertConversation.run(
        conversationId,
        userId,
        `Dev chat ${ordinal}`,
        botId,
        createdAt,
        updatedAt
      );
      insertMessage.run(
        randomId(12),
        conversationId,
        userId,
        "user",
        DEV_SEED_CHAT_USER_MESSAGE,
        null,
        createdAt
      );
      insertMessage.run(
        randomId(12),
        conversationId,
        userId,
        "assistant",
        DEV_SEED_CHAT_ASSISTANT_MESSAGE,
        botId,
        updatedAt
      );
    }
    db.exec("COMMIT");
    return count;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Return saved conversations for the sidebar/history list.
 *
 * Private/incognito rows are deliberately excluded here. Current private chats
 * are ephemeral and never persist; this filter hides older rows that may have
 * been saved before that contract existed.
 */
export function listConversationSummaries(
  db: DatabaseSync,
  userId: string
): ConversationSummary[] {
  // last_bot_id / last_bot_color come from the MOST RECENT assistant message on
  // the conversation, regardless of the conversation's locked bot_id.
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.conversation_mode, c.bot_id, c.bot_group_ids,
              c.coffee_group_id, c.coffee_duration_minutes,
              c.incognito, c.created_at, c.updated_at,
              (SELECT m.bot_id FROM messages m
                 WHERE m.conversation_id = c.id
                   AND m.role = 'assistant'
                 ORDER BY m.created_at DESC LIMIT 1) AS last_bot_id,
              (SELECT b.color FROM messages m
                 LEFT JOIN bots b ON b.id = m.bot_id
                 WHERE m.conversation_id = c.id
                   AND m.role = 'assistant'
                 ORDER BY m.created_at DESC LIMIT 1) AS last_bot_color,
              EXISTS (SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id
                          AND m.role = 'assistant') AS has_assistant_reply
         FROM conversations c
        WHERE c.user_id = ?
          AND COALESCE(c.incognito, 0) = 0
          AND c.archived_at IS NULL
     ORDER BY c.updated_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    conversation_mode: string | null;
    bot_id: string | null;
    bot_group_ids: string | null;
    coffee_group_id: string | null;
    coffee_duration_minutes: number | null;
    incognito: number;
    created_at: string;
    updated_at: string;
    last_bot_id: string | null;
    last_bot_color: string | null;
    has_assistant_reply: number;
  }>;

  return rows.map((row) => {
    const mode: "chat" | "sandbox" | "coffee" =
      row.conversation_mode === "chat"
        ? "chat"
        : row.conversation_mode === "coffee"
          ? "coffee"
          : "sandbox";
    const botGroupIds = parseBotGroupIdsForSummary(row.bot_group_ids);
    return {
      id: row.id,
      title: row.title,
      mode,
      botId: row.bot_id ?? null,
      ...(botGroupIds.length > 0 ? { botGroupIds } : {}),
      ...(mode === "coffee" ? { coffeeGroupId: row.coffee_group_id ?? null } : {}),
      ...(mode === "coffee" && isCoffeeSessionDurationMinutes(row.coffee_duration_minutes)
        ? { coffeeSessionDurationMinutes: row.coffee_duration_minutes }
        : {}),
      incognito: row.incognito === 1,
      lastBotId: row.last_bot_id ?? null,
      lastBotColor: row.last_bot_color ?? null,
      hasAssistantReply: row.has_assistant_reply === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

function isCoffeeSessionDurationMinutes(value: unknown): value is 1 | 5 | 10 {
  return value === 1 || value === 5 || value === 10;
}

function parseBotGroupIdsForSummary(raw: string | null): string[] {
  if (!raw) return [];
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

export function getConversationSweepState(
  db: DatabaseSync,
  userId: string
): ConversationSweepState {
  const latest = db
    .prepare(
      `SELECT id, created_at
         FROM conversation_sweep_batches
        WHERE user_id = ?
          AND undone_at IS NULL
          AND undo_expires_at > ?
        ORDER BY created_at DESC
        LIMIT 1`
    )
    .get(userId, new Date().toISOString()) as { id: string; created_at: string } | undefined;
  return {
    canUndo: Boolean(latest?.id),
    latestBatchId: latest?.id ?? null,
    latestSweepAt: latest?.created_at ?? null,
  };
}

export function sweepConversations(
  db: DatabaseSync,
  userId: string,
  mode: "chat" | "sandbox"
): ConversationSweepResult {
  const rows = db
    .prepare(
      `SELECT id, title, bot_id, updated_at
         FROM conversations
        WHERE user_id = ?
          AND COALESCE(incognito, 0) = 0
          AND archived_at IS NULL
          AND conversation_mode = ?
        ORDER BY updated_at DESC`
    )
    .all(userId, mode) as Array<{
    id: string;
    title: string;
    bot_id: string | null;
    updated_at: string;
  }>;
  if (rows.length === 0) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }

  const botRows = db
    .prepare("SELECT id, name FROM bots WHERE user_id = ?")
    .all(userId) as Array<{ id: string; name: string }>;
  const botNameById = new Map(botRows.map((row) => [row.id, row.name]));
  const groups = new Map<string, { botId: string | null; name: string; conversations: typeof rows }>();
  for (const row of rows) {
    const botId = row.bot_id ?? null;
    const key = botId ?? "__default__";
    const existing = groups.get(key);
    if (existing) {
      existing.conversations.push(row);
      continue;
    }
    groups.set(key, {
      botId,
      name: botId ? botNameById.get(botId) ?? "Bot" : "Prism",
      conversations: [row],
    });
  }
  const eligibleGroups = Array.from(groups.values()).filter(
    (group) => group.conversations.length > 1
  );
  if (eligibleGroups.length === 0) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }

  const nowMs = Date.now();
  const batchId = randomId(12);
  const archivedConversationIds = eligibleGroups.flatMap((group) =>
    group.conversations.map((row) => row.id)
  );
  const summaryConversationIds: string[] = [];

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const closePriorBatchesAt = new Date(nowMs - 1).toISOString();
    db.prepare(
      "UPDATE conversation_sweep_batches SET undone_at = ? WHERE user_id = ? AND undone_at IS NULL"
    ).run(closePriorBatchesAt, userId);

    const archivedAt = new Date(nowMs).toISOString();
    const archivePlaceholders = inClausePlaceholders(archivedConversationIds.length);
    db.prepare(
      `UPDATE conversations
          SET archived_at = ?, archive_batch_id = ?
        WHERE user_id = ? AND id IN (${archivePlaceholders})`
    ).run(archivedAt, batchId, userId, ...archivedConversationIds);

    let summaryIndex = 0;
    for (const group of eligibleGroups) {
      const conversationId = randomId(12);
      summaryConversationIds.push(conversationId);
      const createdAt = new Date(nowMs + summaryIndex * 2 + 1).toISOString();
      const messageAt = new Date(nowMs + summaryIndex * 2 + 2).toISOString();
      const title = `Sweep Summary - ${group.name}`;
      const summaryText = composeSweepSummaryText(
        db,
        userId,
        group.name,
        group.conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
        }))
      );

      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        conversationId,
        userId,
        title,
        mode,
        group.botId,
        createdAt,
        messageAt
      );
      db.prepare(
        `INSERT INTO messages (
          id, conversation_id, user_id, role, content, bot_id, created_at
        ) VALUES (?, ?, ?, 'assistant', ?, ?, ?)`
      ).run(randomId(12), conversationId, userId, summaryText, group.botId, messageAt);
      summaryIndex += 1;
    }

    db.prepare(
      `INSERT INTO conversation_sweep_batches (
        id, user_id, archived_conversation_ids, summary_conversation_ids, created_at, undo_expires_at, undone_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      batchId,
      userId,
      JSON.stringify(archivedConversationIds),
      JSON.stringify(summaryConversationIds),
      new Date(nowMs + summaryIndex * 2 + 3).toISOString(),
      new Date(nowMs + SWEEP_UNDO_WINDOW_MS).toISOString()
    );

    db.exec("COMMIT");
    return {
      batchId,
      sweptGroups: eligibleGroups.length,
      archivedConversationCount: archivedConversationIds.length,
      summaryConversationCount: summaryConversationIds.length,
      undoExpiresAt: new Date(nowMs + SWEEP_UNDO_WINDOW_MS).toISOString(),
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function undoLatestConversationSweep(
  db: DatabaseSync,
  userId: string,
  batchId: string | null
): ConversationSweepResult {
  if (!batchId || batchId.trim().length === 0) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }
  const latestBatch = db
    .prepare(
      `SELECT id, archived_conversation_ids, summary_conversation_ids, undo_expires_at
         FROM conversation_sweep_batches
        WHERE user_id = ?
          AND id = ?
          AND undone_at IS NULL
          AND undo_expires_at > ?
        LIMIT 1`
    )
    .get(userId, batchId.trim(), new Date().toISOString()) as
    | {
        id: string;
        archived_conversation_ids: string;
        summary_conversation_ids: string;
        undo_expires_at: string;
      }
    | undefined;
  if (!latestBatch?.id) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }

  const archivedConversationIds = parseIdList(latestBatch.archived_conversation_ids);
  const summaryConversationIds = parseIdList(latestBatch.summary_conversation_ids);
  const archivedCount = archivedConversationIds.length;
  const summaryCount = summaryConversationIds.length;

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (archivedConversationIds.length > 0) {
      const placeholders = inClausePlaceholders(archivedConversationIds.length);
      db.prepare(
        `UPDATE conversations
            SET archived_at = NULL,
                archive_batch_id = NULL
          WHERE user_id = ?
            AND archive_batch_id = ?
            AND id IN (${placeholders})`
      ).run(userId, latestBatch.id, ...archivedConversationIds);
    }
    deleteConversationsByIds(db, userId, summaryConversationIds);
    db.prepare(
      "UPDATE conversation_sweep_batches SET undone_at = ? WHERE id = ? AND user_id = ?"
    ).run(new Date().toISOString(), latestBatch.id, userId);
    db.exec("COMMIT");
    return {
      batchId: latestBatch.id,
      sweptGroups: 0,
      archivedConversationCount: archivedCount,
      summaryConversationCount: summaryCount,
      undoExpiresAt: latestBatch.undo_expires_at,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove a single chat owned by `userId`.
 *
 * Behaviour:
 *   - Throws if the conversation does not exist or belongs to another user.
 *   - Runs inside an IMMEDIATE transaction so partial failures roll back.
 *   - Cascade-deletes the messages and markdown exports tied to the chat.
 *   - Preserves user-owned artifacts (generated images and derived memory
 *     summaries) by untying them (`conversation_id = NULL`) instead of
 *     destroying them. Images and summaries outlive the chat they came from
 *     because the gallery / memories UI still show them meaningfully.
 */
export function deleteConversation(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): void {
  const existing = db
    .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
    .get(conversationId, userId) as { id?: string } | undefined;
  if (!existing?.id) {
    throw new Error("Conversation not found.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      "UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    db.prepare(
      "UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    db.prepare(
      "UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    db.prepare(
      "DELETE FROM conversation_exports WHERE conversation_id = ? AND user_id = ?"
    ).run(conversationId, userId);
    db.prepare(
      "DELETE FROM messages WHERE conversation_id = ? AND user_id = ?"
    ).run(conversationId, userId);
    db.prepare(
      "DELETE FROM conversations WHERE id = ? AND user_id = ?"
    ).run(conversationId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove all saved chats in one bot/default conversation group.
 *
 * `botId === null` targets Default Prism chats (`conversations.bot_id IS NULL`).
 * Private/incognito rows are excluded to match the sidebar's visible saved-chat
 * surface. Linked user artifacts follow the same preservation contract as
 * {@link deleteConversation}: images and memories survive with their
 * conversation pointer nulled, while messages and exports are deleted.
 */
export function deleteConversationsByBot(
  db: DatabaseSync,
  userId: string,
  botId: string | null
): number {
  const botPredicate = botId === null ? "bot_id IS NULL" : "bot_id = ?";
  const groupSubquery = `SELECT id FROM conversations WHERE user_id = ? AND COALESCE(incognito, 0) = 0 AND archived_at IS NULL AND ${botPredicate}`;
  const groupParams: Array<string | null> = botId === null ? [userId] : [userId, botId];

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND COALESCE(incognito, 0) = 0 AND archived_at IS NULL AND ${botPredicate}`
      )
      .get(...groupParams) as { n: number };
    const conversationCount = Number(countRow.n ?? 0);

    db.prepare(
      `UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `DELETE FROM conversation_exports WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `DELETE FROM messages WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `DELETE FROM conversations WHERE user_id = ? AND COALESCE(incognito, 0) = 0 AND archived_at IS NULL AND ${botPredicate}`
    ).run(...groupParams);
    db.exec("COMMIT");
    return conversationCount;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Truncate a conversation back to just before a given user message so the
 * caller can resubmit that message under fresh settings (Cursor-like
 * mid-conversation revert).
 *
 * Behaviour:
 *   - Throws if the conversation doesn't belong to `userId` or the target
 *     message doesn't live in it.
 *   - Throws if the target message is not a `user` message — Resend is
 *     only meaningful as a rewind point for the user's own turn; clicking
 *     it on an assistant reply would be ambiguous ("do I keep my previous
 *     question?"). Assistant bubbles use Fork instead.
 *   - Returns the original message text so the caller can hand it to the
 *     normal /api/chat pipeline — avoiding a round-trip where the client
 *     stashes the text locally before asking us to delete it.
 *   - Runs inside an IMMEDIATE transaction. Deletes use `created_at >=`
 *     so the target user message itself is removed (a fresh row with a
 *     new id + timestamp will be written by the subsequent /api/chat
 *     turn, matching "the checkpoint IS the new turn").
 *   - Purges `memory_summaries` whose `conversation_id` matches and
 *     whose `created_at >= cutoff` so the thread-scoped compaction is
 *     rewound alongside the visible history.
 *   - Leaves the cross-thread `memories` table strictly untouched. Facts
 *     learned in this thread may also apply to unrelated conversations,
 *     so message rewind is not a memory-management gesture.
 */
export function rewindConversation(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  messageId: string
): { content: string; deletedMessages: number; deletedMemories: number } {
  const conversation = db
    .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
    .get(conversationId, userId) as { id?: string } | undefined;
  if (!conversation?.id) {
    throw new Error("Conversation not found.");
  }

  const target = db
    .prepare(
      "SELECT id, role, content, created_at FROM messages WHERE id = ? AND conversation_id = ? AND user_id = ?"
    )
    .get(messageId, conversationId, userId) as
    | { id: string; role: string; content: string; created_at: string }
    | undefined;
  if (!target) {
    throw new Error("Message not found in conversation.");
  }
  if (target.role !== "user") {
    throw new Error("Only user messages can be rewound.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const deletedMessages = db.prepare(
      "DELETE FROM messages WHERE conversation_id = ? AND user_id = ? AND created_at >= ?"
    ).run(conversationId, userId, target.created_at);
    db.prepare(
      "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ? AND created_at >= ?"
    ).run(userId, conversationId, target.created_at);
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(new Date().toISOString(), conversationId, userId);
    db.exec("COMMIT");
    return {
      content: target.content,
      deletedMessages: Number(deletedMessages.changes ?? 0),
      deletedMemories: 0,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove every chat owned by `userId`.
 *
 * Behaviour:
 *   - Returns the number of conversations removed (0 if the user had none).
 *   - Runs inside a single IMMEDIATE transaction so either every chat is
 *     gone or the database is untouched.
 *   - Follows the same preservation contract as {@link deleteConversation}:
 *     images and memory summaries survive with `conversation_id = NULL`;
 *     messages and markdown exports are hard-deleted alongside their chats.
 *   - Strictly scoped to `userId` via `WHERE user_id = ?` on every statement
 *     so other users' data is never touched.
 */
export function deleteAllConversations(
  db: DatabaseSync,
  userId: string
): number {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const { n: conversationCount } = db
      .prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
      .get(userId) as { n: number };

    db.prepare(
      "UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id IS NOT NULL"
    ).run(userId);
    db.prepare(
      "UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id IS NOT NULL"
    ).run(userId);
    db.prepare(
      "UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IS NOT NULL"
    ).run(userId);
    db.prepare("DELETE FROM conversation_exports WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
    db.exec("COMMIT");
    return conversationCount;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
