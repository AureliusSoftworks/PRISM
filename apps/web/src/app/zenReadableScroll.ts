export interface ZenReadableAnchorMessageIds {
  lastMessageId: string | null;
  latestAssistantMessageId: string | null;
  latestUserMessageId: string | null;
}

/**
 * Orders Zen's readable-bottom anchor candidates from newest to fallback.
 *
 * The conversation's final message must win over role-specific IDs so a new
 * user prompt cannot be hidden behind the previous assistant reply.
 */
export function zenReadableAnchorMessageIds(
  input: ZenReadableAnchorMessageIds
): string[] {
  return [
    input.lastMessageId,
    input.latestAssistantMessageId,
    input.latestUserMessageId,
  ].filter(
    (messageId, index, messageIds): messageId is string =>
      Boolean(messageId) && messageIds.indexOf(messageId) === index
  );
}

/**
 * Zen may add tail space so the latest turn can settle above the composer, but
 * it must never shrink the browser's native scroll range. A synthetic bottom
 * can become stale during opening-session layout and cause wheel input to be
 * canceled while visible content still sits below the viewport.
 */
export function zenReadableMaxScrollTop(
  scrollHeight: number,
  clientHeight: number
): number {
  return Math.max(0, scrollHeight - clientHeight);
}
