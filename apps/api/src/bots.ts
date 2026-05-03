import type { DatabaseSync } from "node:sqlite";
import { stripBotProfileMetaSuffix } from "@localai/shared";

/**
 * Build the system-prompt string sent to the model for a selected bot.
 *
 * Why this exists: the bot's *name* is meaningful context the user picked
 * deliberately ("Tim", "Frank", a custom persona) — but without this
 * helper, only the user-authored `system_prompt` is ever forwarded to the
 * model. That meant a bot named "Tim" with an empty prompt would introduce
 * itself as a generic "assistant" and deny being Tim, which reads as a bug.
 *
 * Behaviour:
 *   - With a non-empty name, we always prepend a short identity preamble
 *     ("You are <name>...") so the model adopts the persona even when the
 *     user didn't write a prompt.
 *   - If a system prompt is present, it follows the preamble. Because the
 *     user's prompt comes last, it still wins when it contradicts the
 *     preamble (e.g. "Respond as a pirate" overrides the identity tone).
 *   - Structured bot-editor metadata (`<<<PRISM_BOT_META>>>` …), when present,
 *     is stripped before this helper runs so providers never see JSON tails.
 *   - Returns undefined when neither a usable name nor prompt is present,
 *     so the chat pipeline sends no system message at all (the Default
 *     "Always on" bot case).
 */
export function composeBotSystemPrompt(
  name: string | null | undefined,
  systemPrompt: string | null | undefined
): string | undefined {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPrompt =
    typeof systemPrompt === "string"
      ? stripBotProfileMetaSuffix(systemPrompt).trim()
      : "";

  if (!trimmedName && !trimmedPrompt) return undefined;
  if (!trimmedName) return trimmedPrompt || undefined;

  const preamble =
    `You are ${trimmedName}. When the user addresses you as ${trimmedName}, ` +
    `respond as ${trimmedName}.`;
  if (!trimmedPrompt) return preamble;
  return `${preamble}\n\n${trimmedPrompt}`;
}

/**
 * Permanently remove a single bot owned by `userId`.
 *
 * Behaviour:
 *   - Throws if the bot does not exist, belongs to another user, or has
 *     delete protection enabled.
 *   - Runs inside an IMMEDIATE transaction so partial failures roll back.
 *   - Nulls out `bot_id` on past messages and conversations that pointed at
 *     this bot. Historical replies stay in the thread and fall back to the
 *     generic "Assistant" label via the LEFT JOIN in the chat read path.
 *   - Deletes memories scoped to this bot. Bot memories are only meaningful
 *     while their owner bot exists; otherwise the Memories panel would show
 *     orphaned/default Prism memory clusters.
 *   - Public bots can still only be deleted by their owner; other users that
 *     have interacted with the public bot keep their message history intact
 *     (their `bot_id` is left pointing at the now-deleted row, which the
 *     LEFT JOIN resolves to NULL the same way).
 */
export function deleteBot(
  db: DatabaseSync,
  userId: string,
  botId: string
): void {
  const existing = db
    .prepare("SELECT id, delete_protected FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId) as { id?: string; delete_protected?: number } | undefined;
  if (!existing?.id) {
    throw new Error("Bot not found.");
  }
  if (existing.delete_protected === 1) {
    throw new Error("This bot is protected. Toggle delete protection off first.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      "UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id = ?"
    ).run(userId, botId);
    db.prepare(
      "UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id = ?"
    ).run(userId, botId);
    db.prepare(
      "DELETE FROM memories WHERE user_id = ? AND bot_id = ?"
    ).run(userId, botId);
    db.prepare("DELETE FROM bots WHERE id = ? AND user_id = ?").run(
      botId,
      userId
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove up to `limit` of the caller's most recently updated bots.
 *
 * This powers the Developer Tools density controls. It skips protected bots,
 * preserves historical chats by nulling bot references before deleting the bot
 * rows, and removes bot-scoped memories for those deleted bots.
 */
export function deleteBots(
  db: DatabaseSync,
  userId: string,
  limit: number
): number {
  const normalizedLimit = Math.floor(limit);
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) return 0;

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const botIds = db
      .prepare(
        "SELECT id FROM bots WHERE user_id = ? AND delete_protected = 0 ORDER BY updated_at DESC, id DESC LIMIT ?"
      )
      .all(userId, normalizedLimit) as Array<{ id: string }>;

    if (botIds.length === 0) {
      db.exec("COMMIT");
      return 0;
    }

    const ids = botIds.map(({ id }) => id);
    const placeholders = ids.map(() => "?").join(", ");

    db.prepare(
      `UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM memories WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM bots WHERE user_id = ? AND id IN (${placeholders})`
    ).run(userId, ...ids);
    db.exec("COMMIT");
    return ids.length;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove every bot owned by `userId` in a single transaction.
 *
 * Behaviour mirrors {@link deleteBot} applied in bulk:
 *   - Runs inside an IMMEDIATE transaction so either every bot is gone
 *     or the database is untouched.
 *   - Skips protected bots entirely.
 *   - Nulls out `bot_id` on the user's past messages and conversations
 *     for deleted bots first, so historical threads keep their content and
 *     fall back to the generic "Assistant" label via the chat read path's
 *     LEFT JOIN.
 *   - Deletes bot-scoped memories for the deleted bots. Global/default
 *     memories with `bot_id IS NULL` and protected-bot memories are preserved.
 *   - Strictly scoped to `userId` via `WHERE user_id = ?` on every
 *     statement so other users' bots (including public bots they don't
 *     own) are never touched.
 *   - Returns the count of bots removed (0 if the user had none).
 *
 * Intended for the user-facing Bots panel press-and-hold "delete all" flow.
 */
export function deleteAllBots(db: DatabaseSync, userId: string): number {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const botIds = db
      .prepare("SELECT id FROM bots WHERE user_id = ? AND delete_protected = 0")
      .all(userId) as Array<{ id: string }>;

    if (botIds.length === 0) {
      db.exec("COMMIT");
      return 0;
    }

    const ids = botIds.map(({ id }) => id);
    const placeholders = ids.map(() => "?").join(", ");

    db.prepare(
      `UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM memories WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM bots WHERE user_id = ? AND id IN (${placeholders})`
    ).run(userId, ...ids);
    db.exec("COMMIT");
    return ids.length;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
