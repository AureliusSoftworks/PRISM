import type { DatabaseSync } from "node:sqlite";

export type DiscardLatestZenAssistantMessageResult = {
  conversationId: string;
  conversationMode: string | null;
};

export function discardLatestZenAssistantMessage(
  db: DatabaseSync,
  userId: string,
  messageId: string,
  nowIso = new Date().toISOString()
): DiscardLatestZenAssistantMessageResult {
  const message = db.prepare(`
    SELECT m.id, m.conversation_id, m.role, m.created_at,
           c.conversation_mode
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id AND c.user_id = m.user_id
    WHERE m.id = ? AND m.user_id = ?
  `).get(messageId, userId) as
    | {
      id: string;
      conversation_id: string;
      role: string;
      created_at: string;
      conversation_mode: string | null;
    }
    | undefined;

  if (!message) {
    throw new Error("Message not found.");
  }
  if (message.role !== "assistant") {
    throw new Error("Only assistant messages can be discarded.");
  }
  if (message.conversation_mode !== "zen" && message.conversation_mode !== "chat") {
    throw new Error("Only Zen assistant messages can be discarded.");
  }

  const laterAssistantMessage = db.prepare(
    "SELECT id FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant' AND created_at > ? ORDER BY created_at ASC LIMIT 1"
  ).get(message.conversation_id, userId, message.created_at) as { id: string } | undefined;
  if (laterAssistantMessage) {
    throw new Error("Only the latest Zen assistant message can be discarded.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare("DELETE FROM messages WHERE id = ? AND user_id = ?")
      .run(messageId, userId);
    db.prepare(
      "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, message.conversation_id);
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(nowIso, message.conversation_id, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    conversationId: message.conversation_id,
    conversationMode: message.conversation_mode,
  };
}
