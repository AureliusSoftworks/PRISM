import type { DatabaseSync } from "node:sqlite";

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
 *     rewound alongside the visible history. The cross-thread
 *     `memories` table has no `conversation_id` column and is left
 *     strictly untouched — facts learned in this thread may also apply
 *     to unrelated conversations, so nuking them by timestamp would be
 *     an overreach.
 */
export function rewindConversation(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  messageId: string
): { content: string } {
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
    db.prepare(
      "DELETE FROM messages WHERE conversation_id = ? AND user_id = ? AND created_at >= ?"
    ).run(conversationId, userId, target.created_at);
    db.prepare(
      "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ? AND created_at >= ?"
    ).run(userId, conversationId, target.created_at);
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(new Date().toISOString(), conversationId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { content: target.content };
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
