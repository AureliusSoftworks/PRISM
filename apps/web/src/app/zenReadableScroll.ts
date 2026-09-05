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
 * Matches Zen's restored bottom veil height
 * (`messagesFrame::before`: clamp(168px, 24dvh, 280px)) so follow + tail
 * padding keep the latest prose clear of the composer band.
 */
export const ZEN_READABLE_COMPOSER_CLEARANCE_MIN_PX = 168;
export const ZEN_READABLE_COMPOSER_CLEARANCE_MAX_PX = 280;
export const ZEN_READABLE_COMPOSER_CLEARANCE_RATIO = 0.24;
export const ZEN_READABLE_LATEST_ANCHOR_TARGET_RATIO = 0.58;
export const ZEN_READABLE_LATEST_ANCHOR_MIN_PX = 280;

/**
 * Composer / bottom-fade clearance for Zen readable follow.
 * Kept in sync with the CSS veil so opening turns retain downward scroll room.
 */
export function zenReadableComposerClearancePx(clientHeight: number): number {
  const height = Math.max(0, clientHeight);
  return Math.max(
    ZEN_READABLE_COMPOSER_CLEARANCE_MIN_PX,
    Math.min(
      ZEN_READABLE_COMPOSER_CLEARANCE_MAX_PX,
      height * ZEN_READABLE_COMPOSER_CLEARANCE_RATIO,
    ),
  );
}

/**
 * Viewport Y where the latest turn's follow point should settle.
 * Always leaves at least the composer-clearance band below the anchor.
 */
export function zenReadableAnchorViewportY(
  clientHeight: number,
  options?: {
    targetRatio?: number;
    minPx?: number;
  },
): number {
  const height = Math.max(0, clientHeight);
  const composerSafeViewportY = height - zenReadableComposerClearancePx(height);
  const targetRatio =
    options?.targetRatio ?? ZEN_READABLE_LATEST_ANCHOR_TARGET_RATIO;
  const minPx = options?.minPx ?? ZEN_READABLE_LATEST_ANCHOR_MIN_PX;
  return Math.min(
    composerSafeViewportY,
    Math.max(minPx, height * targetRatio),
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
