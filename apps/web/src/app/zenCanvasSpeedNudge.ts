export const ZEN_CANVAS_SPEED_NUDGE_CLICK_WINDOW_MS = 450;
export const ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS = 2400;
export const ZEN_CANVAS_SPEED_NUDGE_PULSE_DURATION_MS = 520;
export const ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS = 4;
export const ZEN_CANVAS_SPEED_NUDGE_SPEED_INCREMENT = 0.25;
export const ZEN_CANVAS_SPEED_NUDGE_MAX_SPEED_MULTIPLIER = 2;
export const ZEN_CANVAS_SPEED_NUDGE_HOLD_STACKS = ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS;

export interface ZenCanvasSpeedNudgeState {
  revealKey: string | null;
  lastClickAtMs: number | null;
  stackCount: number;
  boostExpiresAtMs: number;
  pulseUntilMs: number;
  holdActive: boolean;
}

export interface ZenCanvasSpeedNudgeClickResult {
  state: ZenCanvasSpeedNudgeState;
  activated: boolean;
}

export function createZenCanvasSpeedNudgeState(): ZenCanvasSpeedNudgeState {
  return {
    revealKey: null,
    lastClickAtMs: null,
    stackCount: 0,
    boostExpiresAtMs: 0,
    pulseUntilMs: 0,
    holdActive: false,
  };
}

function finiteMs(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function registerZenCanvasSpeedNudgeClick(
  state: ZenCanvasSpeedNudgeState,
  {
    revealKey,
    nowMs,
  }: {
    revealKey: string;
    nowMs: number;
  }
): ZenCanvasSpeedNudgeClickResult {
  const now = finiteMs(nowMs);
  const sameReveal = state.revealKey === revealKey;
  const previousClickAtMs = sameReveal ? state.lastClickAtMs : null;
  const boostActive = sameReveal && state.stackCount > 0 && now < state.boostExpiresAtMs;
  const rapidClick =
    previousClickAtMs !== null &&
    now >= previousClickAtMs &&
    now - previousClickAtMs <= ZEN_CANVAS_SPEED_NUDGE_CLICK_WINDOW_MS;

  if (!rapidClick) {
    return {
      activated: false,
      state: {
        revealKey,
        lastClickAtMs: now,
        stackCount: boostActive ? state.stackCount : 0,
        boostExpiresAtMs: boostActive ? state.boostExpiresAtMs : 0,
        pulseUntilMs: boostActive ? state.pulseUntilMs : 0,
        holdActive: false,
      },
    };
  }

  const stackCount = Math.min(
    ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS,
    (boostActive ? state.stackCount : 0) + 1
  );

  return {
    activated: true,
    state: {
      revealKey,
      lastClickAtMs: now,
      stackCount,
      boostExpiresAtMs: now + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS,
      pulseUntilMs: now + ZEN_CANVAS_SPEED_NUDGE_PULSE_DURATION_MS,
      holdActive: false,
    },
  };
}

export function beginZenCanvasSpeedNudgeHold(
  state: ZenCanvasSpeedNudgeState,
  {
    revealKey,
    nowMs,
  }: {
    revealKey: string;
    nowMs: number;
  }
): ZenCanvasSpeedNudgeClickResult {
  const now = finiteMs(nowMs);
  const sameReveal = state.revealKey === revealKey;
  const holdOrBoostActive =
    sameReveal &&
    (state.holdActive === true || (state.stackCount > 0 && now < state.boostExpiresAtMs));
  const previousClickAtMs = sameReveal ? state.lastClickAtMs : null;
  const rapidClick =
    previousClickAtMs !== null &&
    now >= previousClickAtMs &&
    now - previousClickAtMs <= ZEN_CANVAS_SPEED_NUDGE_CLICK_WINDOW_MS;
  const stackedCount = rapidClick
    ? Math.min(
        ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS,
        Math.max(holdOrBoostActive ? state.stackCount : 0, 0) + 1
      )
    : ZEN_CANVAS_SPEED_NUDGE_HOLD_STACKS;

  return {
    activated: true,
    state: {
      revealKey,
      lastClickAtMs: now,
      stackCount: Math.max(1, stackedCount),
      boostExpiresAtMs: now + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS,
      pulseUntilMs: now + ZEN_CANVAS_SPEED_NUDGE_PULSE_DURATION_MS,
      holdActive: true,
    },
  };
}

export function endZenCanvasSpeedNudgeHold(
  state: ZenCanvasSpeedNudgeState,
  {
    revealKey,
    nowMs,
  }: {
    revealKey: string;
    nowMs: number;
  }
): ZenCanvasSpeedNudgeState {
  const now = finiteMs(nowMs);
  if (state.revealKey !== revealKey || state.holdActive !== true) return state;
  return {
    ...state,
    holdActive: false,
    boostExpiresAtMs: Math.max(
      state.boostExpiresAtMs,
      now + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS
    ),
    pulseUntilMs: Math.max(
      state.pulseUntilMs,
      now + ZEN_CANVAS_SPEED_NUDGE_PULSE_DURATION_MS
    ),
  };
}

export function resolveZenCanvasSpeedNudgeDelayMultiplier(
  state: ZenCanvasSpeedNudgeState,
  {
    revealKey,
    nowMs,
  }: {
    revealKey: string;
    nowMs: number;
  }
): number {
  const now = finiteMs(nowMs);
  if (state.revealKey !== revealKey || state.stackCount <= 0) {
    return 1;
  }
  if (state.holdActive !== true && now >= state.boostExpiresAtMs) {
    return 1;
  }

  const speedMultiplier = Math.min(
    ZEN_CANVAS_SPEED_NUDGE_MAX_SPEED_MULTIPLIER,
    1 + state.stackCount * ZEN_CANVAS_SPEED_NUDGE_SPEED_INCREMENT
  );
  return 1 / speedMultiplier;
}
