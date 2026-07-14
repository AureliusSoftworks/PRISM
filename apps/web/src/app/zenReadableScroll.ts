export interface ZenReadableAnchorMessageIds {
  lastMessageId: string | null;
  latestAssistantMessageId: string | null;
  latestUserMessageId: string | null;
}

interface ZenViewportMessage {
  id: string;
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

/**
 * Finds the newest persisted row shared by the optimistic and resolved turns.
 * That row can anchor the viewport while wildcard cleanup replaces the pending
 * user row and appends the assistant reply.
 */
export function zenStableViewportAnchorMessageId(
  previousMessages: readonly ZenViewportMessage[],
  resolvedMessages: readonly ZenViewportMessage[]
): string | null {
  const resolvedMessageIds = new Set(
    resolvedMessages.map((message) => message.id)
  );
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const messageId = previousMessages[index]?.id ?? "";
    if (!messageId || messageId.startsWith("pending-")) continue;
    if (resolvedMessageIds.has(messageId)) return messageId;
  }
  return null;
}

/**
 * Keeps an anchored row at the same viewport Y after rows above it are
 * windowed or replaced, while respecting the scrollport's current range.
 */
export function zenRestoredViewportScrollTop(
  scrollTop: number,
  anchorViewportTopBefore: number,
  anchorViewportTopAfter: number,
  maxScrollTop: number
): number {
  const restoredTop =
    scrollTop + anchorViewportTopAfter - anchorViewportTopBefore;
  return Math.max(0, Math.min(Math.max(0, maxScrollTop), restoredTop));
}

/**
 * Returns whether a user's scroll gesture can move through Zen's native
 * scroll range and should therefore take ownership from live auto-follow.
 *
 * Positive deltas move toward newer content; negative deltas move toward
 * older content. Edge-only gestures stay available for Zen's elastic pull.
 */
export function zenReadableGestureShouldDisarmFollow(
  scrollTop: number,
  maxScrollTop: number,
  scrollDeltaY: number,
  activationThresholdPx = 1
): boolean {
  const normalizedMax = Math.max(0, maxScrollTop);
  const normalizedTop = Math.max(0, Math.min(normalizedMax, scrollTop));
  const threshold = Math.max(0, activationThresholdPx);
  if (normalizedMax <= 0 || Math.abs(scrollDeltaY) <= threshold) return false;
  if (scrollDeltaY > 0) return normalizedTop < normalizedMax - 0.5;
  return normalizedTop > 0.5;
}

/**
 * Native overflow owns every non-empty Zen wheel gesture. The only custom
 * response is a visual elastic cue for an upward pull at the true top edge;
 * the event itself remains uncancelled. In particular, never cancel downward
 * input: the transcript may have grown since the preceding trackpad event.
 */
export function zenReadableWheelShouldApplyElasticPull(
  scrollTop: number,
  scrollDeltaY: number,
  activationThresholdPx = 1
): boolean {
  const threshold = Math.max(0, activationThresholdPx);
  return scrollTop <= 0.5 && scrollDeltaY < -threshold;
}
