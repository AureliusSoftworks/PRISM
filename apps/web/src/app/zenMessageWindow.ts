export const ZEN_RENDERED_MESSAGE_LIMIT = 16;

export interface ZenRenderedMessageWindow<T> {
  messages: T[];
  startIndex: number;
  omittedCount: number;
}

/**
 * Keeps Zen's visual transcript intentionally recent without deleting any
 * conversation data. Prompt assembly, memory, exports, and persistence still
 * receive the full message list; only mounted chat rows are windowed.
 */
export function zenRenderedMessageWindow<T>(
  source: readonly T[],
  enabled: boolean,
  limit = ZEN_RENDERED_MESSAGE_LIMIT,
): ZenRenderedMessageWindow<T> {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const startIndex = enabled
    ? Math.max(0, source.length - normalizedLimit)
    : 0;
  return {
    messages: source.slice(startIndex),
    startIndex,
    omittedCount: startIndex,
  };
}
