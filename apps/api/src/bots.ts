import type { DatabaseSync } from "node:sqlite";

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
    typeof systemPrompt === "string" ? systemPrompt.trim() : "";

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
 *   - Throws if the bot does not exist or belongs to another user.
 *   - Runs inside an IMMEDIATE transaction so partial failures roll back.
 *   - Nulls out `bot_id` on past messages and conversations that pointed at
 *     this bot. Historical replies stay in the thread and fall back to the
 *     generic "Assistant" label via the LEFT JOIN in the chat read path.
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
    .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId) as { id?: string } | undefined;
  if (!existing?.id) {
    throw new Error("Bot not found.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      "UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id = ?"
    ).run(userId, botId);
    db.prepare(
      "UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id = ?"
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
