export interface ChatRevealPaceState {
  tokenSignature: string;
  visibleTokenCount: number;
  nextAdvanceAtMs: number;
  lastAdvanceAtMs: number;
  lastResolvedAtMs: number;
}

export function resolvePacedChatRevealVisibleTokenCount({
  revealKey,
  tokenCount,
  tokenSignature,
  nowMs,
  stateByRevealKey,
  resolveStepDelayMs,
}: {
  revealKey: string;
  tokenCount: number;
  tokenSignature: string;
  nowMs: number;
  stateByRevealKey: Map<string, ChatRevealPaceState>;
  resolveStepDelayMs: (previousTokenIndex: number) => number;
}): number {
  const normalizedTokenCount = Math.max(0, Math.floor(tokenCount));
  if (normalizedTokenCount <= 0) {
    stateByRevealKey.delete(revealKey);
    return 0;
  }

  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const firstStepDelayMs = Math.max(0, resolveStepDelayMs(0));
  let state = stateByRevealKey.get(revealKey);
  if (!state || state.tokenSignature !== tokenSignature) {
    state = {
      tokenSignature,
      visibleTokenCount: 1,
      nextAdvanceAtMs: now + firstStepDelayMs,
      lastAdvanceAtMs: now,
      lastResolvedAtMs: now,
    };
    stateByRevealKey.set(revealKey, state);
    return state.visibleTokenCount;
  }

  state.visibleTokenCount = Math.max(
    1,
    Math.min(state.visibleTokenCount, normalizedTokenCount)
  );
  if (state.visibleTokenCount >= normalizedTokenCount) {
    return normalizedTokenCount;
  }

  if (state.lastResolvedAtMs === now) {
    return state.visibleTokenCount;
  }
  state.lastResolvedAtMs = now;

  state.nextAdvanceAtMs =
    state.lastAdvanceAtMs +
    Math.max(0, resolveStepDelayMs(state.visibleTokenCount - 1));

  if (now >= state.nextAdvanceAtMs) {
    state.visibleTokenCount = Math.min(
      state.visibleTokenCount + 1,
      normalizedTokenCount
    );
    state.lastAdvanceAtMs = now;
    if (state.visibleTokenCount < normalizedTokenCount) {
      state.nextAdvanceAtMs =
        now + Math.max(0, resolveStepDelayMs(state.visibleTokenCount - 1));
    } else {
      state.nextAdvanceAtMs = Number.POSITIVE_INFINITY;
    }
  }

  return state.visibleTokenCount;
}
