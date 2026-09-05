import type { DatabaseSync } from "node:sqlite";
import { parseStoredAssistantToolPayload } from "@localai/shared";
import { deleteMemoriesLinkedToMessages } from "./memory.ts";

export type DiscardLatestZenAssistantMessageResult = {
  conversationId: string;
  conversationMode: string | null;
  deletedSummaryIds: string[];
};

export function discardLatestZenAssistantMessage(
  db: DatabaseSync,
  userId: string,
  messageId: string,
  nowIso = new Date().toISOString()
): DiscardLatestZenAssistantMessageResult {
  const message = db.prepare(`
    SELECT m.id, m.conversation_id, m.role, m.tool_payload, m.created_at,
           c.conversation_mode
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id AND c.user_id = m.user_id
    WHERE m.id = ? AND m.user_id = ?
  `).get(messageId, userId) as
    | {
      id: string;
      conversation_id: string;
      role: string;
      tool_payload: string | null;
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
  if (
    message.conversation_mode !== "zen" &&
    message.conversation_mode !== "chat"
  ) {
    throw new Error("Only Chat or Zen assistant messages can be discarded.");
  }
  if (
    parseStoredAssistantToolPayload(message.tool_payload)
      .botPowerTrollPresentation?.ordinaryInterruptionImmune === true
  ) {
    throw new Error(
      "This in-fiction Troll ambush ignores ordinary Shh; use Stop, Escape, mute, disable the Power, or leave the mode.",
    );
  }

  const latestMessage = db.prepare(
    "SELECT id FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1"
  ).get(message.conversation_id, userId) as { id: string } | undefined;
  if (latestMessage?.id !== message.id) {
    throw new Error("Only the latest Chat or Zen assistant message can be discarded.");
  }

  let deletedSummaryIds: string[] = [];
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    deletedSummaryIds = (
      db.prepare(
        "SELECT id FROM memory_summaries WHERE user_id = ? AND conversation_id = ?",
      ).all(userId, message.conversation_id) as Array<{ id: string }>
    ).map((row) => row.id);
    deleteMemoriesLinkedToMessages(db, userId, [messageId]);
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
    deletedSummaryIds,
  };
}
