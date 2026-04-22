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
