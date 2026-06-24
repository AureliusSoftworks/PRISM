export interface ChatRevealPaceState {
  tokenSignature: string;
  visibleTokenCount: number;
  nextAdvanceAtMs: number;
  lastAdvanceAtMs: number;
  lastResolvedAtMs: number;
}

function normalizeDelayMultiplier(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
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
  if (!active || !hasDraft || typeof lastTypingAtMs !== "number") return 1;
  const multiplier = normalizeDelayMultiplier(maxMultiplier);
  const now = Number.isFinite(nowMs) ? nowMs : lastTypingAtMs;
  const idleMs = Math.max(0, now - lastTypingAtMs);
  const holdMs = Math.max(0, idleHoldMs);
  if (idleMs <= holdMs) return multiplier;
  const rampMs = Math.max(1, recoveryMs);
  const progress = Math.min(1, Math.max(0, (idleMs - holdMs) / rampMs));
  return 1 + (multiplier - 1) * (1 - progress);
}

export function resolvePacedChatRevealVisibleTokenCount({
  revealKey,
  tokenCount,
  tokenSignature,
  nowMs,
  stateByRevealKey,
  resolveStepDelayMs,
  delayMultiplier,
}: {
  revealKey: string;
  tokenCount: number;
  tokenSignature: string;
  nowMs: number;
  stateByRevealKey: Map<string, ChatRevealPaceState>;
  resolveStepDelayMs: (previousTokenIndex: number) => number;
  delayMultiplier?: number;
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
