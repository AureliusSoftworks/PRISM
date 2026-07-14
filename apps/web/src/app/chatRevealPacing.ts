export interface ChatRevealPaceState {
  tokenSignature: string;
  visibleTokenCount: number;
  nextAdvanceAtMs: number;
  lastAdvanceAtMs: number;
  lastResolvedAtMs: number;
}

export interface ChatRevealTypingPacing {
  paused: boolean;
  delayMultiplier: number;
}

/** Continue a canvas reveal from text already shown by synchronized speech. */
export function createChatRevealPaceHandoffState({
  tokenSignature,
  visibleTokenCount,
  nowMs,
}: {
  tokenSignature: string;
  visibleTokenCount: number;
  nowMs: number;
}): ChatRevealPaceState {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  return {
    tokenSignature,
    visibleTokenCount: Math.max(0, Math.floor(visibleTokenCount)),
    nextAdvanceAtMs: now,
    lastAdvanceAtMs: now,
    lastResolvedAtMs: now - 1,
  };
}

function normalizeDelayMultiplier(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

export function resolveChatRevealTypingPacing({
  active,
  hasDraft,
  nowMs,
  lastTypingAtMs,
  maxMultiplier,
  pauseMs,
  recoveryMs,
}: {
  active: boolean;
  hasDraft: boolean;
  nowMs: number;
  lastTypingAtMs: number | null | undefined;
  maxMultiplier: number;
  pauseMs: number;
  recoveryMs: number;
}): ChatRevealTypingPacing {
  if (!active || !hasDraft || typeof lastTypingAtMs !== "number") {
    return { paused: false, delayMultiplier: 1 };
  }
  const multiplier = normalizeDelayMultiplier(maxMultiplier);
  const now = Number.isFinite(nowMs) ? nowMs : lastTypingAtMs;
  const idleMs = Math.max(0, now - lastTypingAtMs);
  const holdMs = Math.max(0, pauseMs);
  if (idleMs <= holdMs) return { paused: true, delayMultiplier: multiplier };
  const rampMs = Math.max(1, recoveryMs);
  const progress = Math.min(1, Math.max(0, (idleMs - holdMs) / rampMs));
  return {
    paused: false,
    delayMultiplier: 1 + (multiplier - 1) * (1 - progress),
  };
}

export function resolveChatRevealDelayMultiplierForTyping({
  active,
  hasDraft,
  nowMs,
  lastTypingAtMs,
  maxMultiplier,
  idleHoldMs,
  recoveryMs,
}: {
  active: boolean;
  hasDraft: boolean;
  nowMs: number;
  lastTypingAtMs: number | null | undefined;
  maxMultiplier: number;
  idleHoldMs: number;
  recoveryMs: number;
}): number {
  return resolveChatRevealTypingPacing({
    active,
    hasDraft,
    nowMs,
    lastTypingAtMs,
    maxMultiplier,
    pauseMs: idleHoldMs,
    recoveryMs,
  }).delayMultiplier;
}

export function resolvePacedChatRevealVisibleTokenCount({
  revealKey,
  tokenCount,
  tokenSignature,
  nowMs,
  stateByRevealKey,
  resolveStepDelayMs,
  delayMultiplier,
  startDelayMs,
  pause,
}: {
  revealKey: string;
  tokenCount: number;
  tokenSignature: string;
  nowMs: number;
  stateByRevealKey: Map<string, ChatRevealPaceState>;
  resolveStepDelayMs: (previousTokenIndex: number) => number;
  delayMultiplier?: number;
  startDelayMs?: number;
  pause?: boolean;
}): number {
  const normalizedTokenCount = Math.max(0, Math.floor(tokenCount));
  if (normalizedTokenCount <= 0) {
    stateByRevealKey.delete(revealKey);
    return 0;
  }

  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const multiplier = normalizeDelayMultiplier(delayMultiplier);
  const resolveMultipliedStepDelayMs = (previousTokenIndex: number): number =>
    Math.max(0, resolveStepDelayMs(previousTokenIndex) * multiplier);
  const firstStepDelayMs = resolveMultipliedStepDelayMs(0);
  const normalizedStartDelayMs =
    typeof startDelayMs === "number" && Number.isFinite(startDelayMs)
      ? Math.max(0, startDelayMs)
      : 0;
  const shouldPause = pause === true;
  const initialVisibleTokenCount = shouldPause || normalizedStartDelayMs > 0 ? 0 : 1;
  let state = stateByRevealKey.get(revealKey);
  if (!state || state.tokenSignature !== tokenSignature) {
    state = {
      tokenSignature,
      visibleTokenCount: initialVisibleTokenCount,
      nextAdvanceAtMs:
        now +
        (shouldPause
          ? firstStepDelayMs
          : initialVisibleTokenCount === 0
            ? normalizedStartDelayMs
            : firstStepDelayMs),
      lastAdvanceAtMs: now,
      lastResolvedAtMs: now,
    };
    stateByRevealKey.set(revealKey, state);
    return state.visibleTokenCount;
  }

  const minimumVisibleTokenCount = state.visibleTokenCount <= 0 ? 0 : initialVisibleTokenCount;
  state.visibleTokenCount = Math.max(
    minimumVisibleTokenCount,
    Math.min(state.visibleTokenCount, normalizedTokenCount)
  );
  if (state.visibleTokenCount >= normalizedTokenCount) {
    return normalizedTokenCount;
  }

  if (state.lastResolvedAtMs === now) {
    return state.visibleTokenCount;
  }
  state.lastResolvedAtMs = now;

  if (shouldPause) {
    state.lastAdvanceAtMs = now;
    state.nextAdvanceAtMs =
      now +
      (state.visibleTokenCount <= 0
        ? firstStepDelayMs
        : resolveMultipliedStepDelayMs(state.visibleTokenCount - 1));
    return state.visibleTokenCount;
  }

  if (state.visibleTokenCount === 0) {
    if (now >= state.nextAdvanceAtMs) {
      state.visibleTokenCount = 1;
      state.lastAdvanceAtMs = now;
      state.nextAdvanceAtMs =
        normalizedTokenCount > 1 ? now + firstStepDelayMs : Number.POSITIVE_INFINITY;
    }
    return state.visibleTokenCount;
  }

  state.nextAdvanceAtMs =
    state.lastAdvanceAtMs +
    resolveMultipliedStepDelayMs(state.visibleTokenCount - 1);

  if (now >= state.nextAdvanceAtMs) {
    state.visibleTokenCount = Math.min(
      state.visibleTokenCount + 1,
      normalizedTokenCount
    );
    state.lastAdvanceAtMs = now;
    if (state.visibleTokenCount < normalizedTokenCount) {
      state.nextAdvanceAtMs =
        now + resolveMultipliedStepDelayMs(state.visibleTokenCount - 1);
    } else {
      state.nextAdvanceAtMs = Number.POSITIVE_INFINITY;
    }
  }

  return state.visibleTokenCount;
}
