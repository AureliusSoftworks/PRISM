export type ChatScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type ChatScrollFollowOptions = {
  followArmed: boolean;
  userOwnsViewport: boolean;
};

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeChatScrollMetrics(
  metrics: ChatScrollMetrics,
): ChatScrollMetrics {
  return {
    scrollTop: finiteNonnegative(metrics.scrollTop),
    scrollHeight: finiteNonnegative(metrics.scrollHeight),
    clientHeight: finiteNonnegative(metrics.clientHeight),
  };
}

export function chatScrollMaxTop(metrics: ChatScrollMetrics): number {
  const normalized = normalizeChatScrollMetrics(metrics);
  return Math.max(0, normalized.scrollHeight - normalized.clientHeight);
}

export function chatScrollNearBottomThresholdPx(
  clientHeight: number,
): number {
  return Math.max(64, Math.min(180, finiteNonnegative(clientHeight) * 0.2));
}

export function chatScrollDistanceFromBottom(
  metrics: ChatScrollMetrics,
): number {
  const normalized = normalizeChatScrollMetrics(metrics);
  const top = Math.min(chatScrollMaxTop(normalized), normalized.scrollTop);
  return Math.max(0, chatScrollMaxTop(normalized) - top);
}

export function chatScrollIsNearBottom(
  metrics: ChatScrollMetrics,
): boolean {
  const normalized = normalizeChatScrollMetrics(metrics);
  return (
    chatScrollDistanceFromBottom(normalized) <=
    chatScrollNearBottomThresholdPx(normalized.clientHeight)
  );
}

/**
 * A new reply may follow only while the viewport is still at the live edge.
 * Explicit user ownership and interruption pins always win.
 */
export function chatScrollShouldStartFollow(
  metrics: ChatScrollMetrics,
  options: ChatScrollFollowOptions,
): boolean {
  if (options.userOwnsViewport || !options.followArmed) return false;
  return chatScrollIsNearBottom(metrics);
}

/**
 * An explicit outgoing turn temporarily centers its user row, so the viewport
 * may no longer be near the native bottom when the assistant reply arrives.
 * Follow that fresh reply unless the reader has taken manual ownership.
 */
export function chatScrollShouldStartFreshReplyFollow(
  options: Pick<ChatScrollFollowOptions, "userOwnsViewport">,
): boolean {
  return !options.userOwnsViewport;
}

/**
 * Preserve the current bottom gap across streamed growth, message insertion,
 * deletion, and font reflow. Returning null leaves a user-owned viewport
 * completely untouched.
 */
export function chatScrollTopAfterLayoutChange(
  previous: ChatScrollMetrics | null,
  next: ChatScrollMetrics,
  options: ChatScrollFollowOptions,
): number | null {
  if (options.userOwnsViewport || !previous) return null;
  if (!options.followArmed && !chatScrollIsNearBottom(previous)) return null;

  const nextMax = chatScrollMaxTop(next);
  const previousBottomGap = chatScrollDistanceFromBottom(previous);
  return Math.max(0, Math.min(nextMax, nextMax - previousBottomGap));
}

/** A user who scrolls back to the live edge hands follow ownership back. */
export function chatScrollUserOwnsViewportAfterNativeScroll(
  metrics: ChatScrollMetrics,
  previouslyOwned: boolean,
  programmaticScrollActive: boolean,
): boolean {
  if (!previouslyOwned || programmaticScrollActive) return previouslyOwned;
  return !chatScrollIsNearBottom(metrics);
}
