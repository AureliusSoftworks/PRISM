import type { DebateSessionV1 } from "@localai/shared";

/**
 * Reuse prior event object identity for the common prefix so React adopt does
 * not thrash every historical row when only the tail grew.
 */
export function reuseDebateSessionEventPrefix(
  previous: DebateSessionV1 | null,
  next: DebateSessionV1,
): DebateSessionV1 {
  if (!previous || previous.id !== next.id) return next;
  const sharedCount = Math.min(previous.events.length, next.events.length);
  let prefixLength = 0;
  while (
    prefixLength < sharedCount &&
    previous.events[prefixLength]?.id === next.events[prefixLength]?.id &&
    previous.events[prefixLength]?.sequence ===
      next.events[prefixLength]?.sequence
  ) {
    prefixLength += 1;
  }
  if (
    prefixLength === next.events.length &&
    prefixLength === previous.events.length &&
    previous.revision === next.revision
  ) {
    return previous;
  }
  if (prefixLength === 0) return next;
  return {
    ...next,
    events: previous.events
      .slice(0, prefixLength)
      .concat(next.events.slice(prefixLength)),
  };
}
