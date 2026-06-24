export interface CleanupRevealMessageLike {
  id: string;
  role: "user" | "assistant";
}

export const CLEANUP_MESSAGE_REVEAL_DURATION_MS = 960;
export const CLEANUP_MESSAGE_REVEAL_SETTLE_MS =
  CLEANUP_MESSAGE_REVEAL_DURATION_MS + 160;

export function cleanupMessageRevealKey(
  conversationId: string,
  messageId: string
): string {
  return `${conversationId}:${messageId}`;
}

export function mapPendingCleanupMessagesToFinalRevealKeys({
  conversationId,
  pendingMessageIds,
  previousMessages,
  finalMessages,
}: {
  conversationId: string;
  pendingMessageIds: readonly string[];
  previousMessages: readonly CleanupRevealMessageLike[];
  finalMessages: readonly CleanupRevealMessageLike[];
}): string[] {
  const uniquePendingIds = pendingMessageIds.filter(
    (id, index) => id && pendingMessageIds.indexOf(id) === index
  );
  if (uniquePendingIds.length === 0) return [];

  const previousUserMessages = previousMessages.filter((message) => message.role === "user");
  const finalUserMessages = finalMessages.filter((message) => message.role === "user");
  if (finalUserMessages.length === 0) return [];

  const fallbackStartIndex = Math.max(0, finalUserMessages.length - uniquePendingIds.length);
  const usedFinalMessageIds = new Set<string>();
  const keys: string[] = [];

  uniquePendingIds.forEach((pendingId, pendingIndex) => {
    const previousUserOrdinal = previousUserMessages.findIndex(
      (message) => message.id === pendingId
    );
    const finalMessage =
      previousUserOrdinal >= 0
        ? finalUserMessages[previousUserOrdinal]
        : finalUserMessages[fallbackStartIndex + pendingIndex];
    if (!finalMessage || finalMessage.id === pendingId) return;
    if (usedFinalMessageIds.has(finalMessage.id)) return;
    usedFinalMessageIds.add(finalMessage.id);
    keys.push(cleanupMessageRevealKey(conversationId, finalMessage.id));
  });

  return keys;
}
