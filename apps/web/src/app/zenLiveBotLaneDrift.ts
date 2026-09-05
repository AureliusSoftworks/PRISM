/**
 * Soft side-lane presence motion for Zen/Chat live bot avatars.
 *
 * Stationary: slight vertical bob.
 * Moving: travels either up or down only (no sideways roam).
 * Horizontal bias stays with the avatar's existing left/right placement.
 */

export type ZenLiveBotLaneDriftCanvasSide = "left" | "right";

export type ZenLiveBotLaneDriftPhase = "stationary" | "moving";

export type ZenLiveBotLaneDriftDirection = "up" | "down";

export interface ZenLiveBotLaneDriftSample {
  offsetXPx: number;
  offsetYPx: number;
  phase: ZenLiveBotLaneDriftPhase;
  direction: ZenLiveBotLaneDriftDirection | null;
}

export interface ZenLiveBotLaneDriftState {
  phase: ZenLiveBotLaneDriftPhase;
  direction: ZenLiveBotLaneDriftDirection | null;
  /** Resting vertical offset while stationary (bob happens around this). */
  anchorYPx: number;
  moveFromYPx: number;
  moveToYPx: number;
  phaseStartedAtMs: number;
  phaseDurationMs: number;
  /** Stable 0–1 hash for deterministic variety. */
  seedUnit: number;
  /** Rolling RNG cursor so consecutive hops don't repeat patterns. */
  hopIndex: number;
}

export interface ZenLiveBotLaneDriftAdvanceOptions {
  nowMs: number;
  canvasSide: ZenLiveBotLaneDriftCanvasSide;
  /** When false, hold the current visual offset with no bob/travel. */
  active: boolean;
  /**
   * When false, keep bobbing in place but do not start a new up/down hop
   * (used while the bot is talking).
   */
  allowTravel?: boolean;
  /** Optional vertical clamp for the resting anchor. */
  minAnchorYPx?: number;
  maxAnchorYPx?: number;
  random?: () => number;
}

/** Soft idle bob — matches the existing ambient hover feel. */
export const ZEN_LIVE_BOT_LANE_DRIFT_BOB_AMPLITUDE_PX = 1.5;
export const ZEN_LIVE_BOT_LANE_DRIFT_BOB_PERIOD_MS = 9_000;

/** Short vertical hops along the side lane. */
export const ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX = 36;
export const ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MAX_PX = 88;
export const ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_MS = 2_600;
export const ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MAX_MS = 4_200;

export const ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MIN_MS = 5_200;
export const ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MAX_MS = 11_000;

export const ZEN_LIVE_BOT_LANE_DRIFT_DEFAULT_MIN_ANCHOR_Y_PX = -120;
export const ZEN_LIVE_BOT_LANE_DRIFT_DEFAULT_MAX_ANCHOR_Y_PX = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Hash a short string into a stable 0–1 unit for per-bot phase variety.
 */
export function zenLiveBotLaneDriftSeedUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function mixUnit(seedUnit: number, hopIndex: number, lane: number): number {
  const raw =
    seedUnit * 12.9898 + hopIndex * 78.233 + lane * 37.719 + hopIndex * seedUnit;
  const mixed = Math.sin(raw) * 43758.5453;
  return clampUnit(mixed - Math.floor(mixed));
}

function easeInOutCubic(unit: number): number {
  const t = clampUnit(unit);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function resolveAnchorLimits(
  minAnchorYPx: number | undefined,
  maxAnchorYPx: number | undefined,
): { min: number; max: number } {
  const min =
    typeof minAnchorYPx === "number" && Number.isFinite(minAnchorYPx)
      ? minAnchorYPx
      : ZEN_LIVE_BOT_LANE_DRIFT_DEFAULT_MIN_ANCHOR_Y_PX;
  const max =
    typeof maxAnchorYPx === "number" && Number.isFinite(maxAnchorYPx)
      ? maxAnchorYPx
      : ZEN_LIVE_BOT_LANE_DRIFT_DEFAULT_MAX_ANCHOR_Y_PX;
  if (max < min) return { min: max, max: min };
  return { min, max };
}

/**
 * Create the initial drift state. Starts stationary so the avatar can bob
 * before the first up/down hop.
 */
export function createZenLiveBotLaneDriftState(
  seed: string,
  nowMs = 0,
): ZenLiveBotLaneDriftState {
  const seedUnit = zenLiveBotLaneDriftSeedUnit(seed);
  const stationarySpan =
    ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MAX_MS -
    ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MIN_MS;
  const firstHoldMs = Math.round(
    ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MIN_MS +
      mixUnit(seedUnit, 0, 1) * stationarySpan,
  );
  return {
    phase: "stationary",
    direction: null,
    anchorYPx: 0,
    moveFromYPx: 0,
    moveToYPx: 0,
    phaseStartedAtMs: nowMs,
    phaseDurationMs: firstHoldMs,
    seedUnit,
    hopIndex: 0,
  };
}

function sampleBobOffsetY(nowMs: number, seedUnit: number): number {
  const phase =
    ((nowMs / ZEN_LIVE_BOT_LANE_DRIFT_BOB_PERIOD_MS) * Math.PI * 2) +
    seedUnit * Math.PI * 2;
  // Negative peak first so the "up" lift matches ambient hover drift.
  return -Math.sin(phase) * ZEN_LIVE_BOT_LANE_DRIFT_BOB_AMPLITUDE_PX;
}

/**
 * Pick the next vertical hop. Prefers the direction with more remaining room
 * so the avatar stays inside the lane band.
 */
export function planZenLiveBotLaneDriftHop(
  state: ZenLiveBotLaneDriftState,
  options: {
    canvasSide: ZenLiveBotLaneDriftCanvasSide;
    minAnchorYPx?: number;
    maxAnchorYPx?: number;
    random?: () => number;
  },
): {
  direction: ZenLiveBotLaneDriftDirection;
  toYPx: number;
  durationMs: number;
} {
  const { min, max } = resolveAnchorLimits(
    options.minAnchorYPx,
    options.maxAnchorYPx,
  );
  const roomUp = Math.max(0, state.anchorYPx - min);
  const roomDown = Math.max(0, max - state.anchorYPx);

  let direction: ZenLiveBotLaneDriftDirection;
  if (
    roomUp < ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX &&
    roomDown >= ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX
  ) {
    direction = "down";
  } else if (
    roomDown < ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX &&
    roomUp >= ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX
  ) {
    direction = "up";
  } else if (
    roomUp < ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX &&
    roomDown < ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX
  ) {
    // Nowhere meaningful to go — nudge toward center when possible.
    direction = state.anchorYPx > 0 ? "up" : "down";
  } else {
    const pick = options.random
      ? clampUnit(options.random())
      : mixUnit(
          state.seedUnit,
          state.hopIndex + 1,
          options.canvasSide === "left" ? 2 : 3,
        );
    // Mild bias away from the last direction when both sides have room.
    if (state.direction === "up" && pick < 0.62) direction = "down";
    else if (state.direction === "down" && pick < 0.62) direction = "up";
    else direction = pick < 0.5 ? "up" : "down";
  }

  const available = direction === "up" ? roomUp : roomDown;
  const travelSpan =
    ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MAX_PX - ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX;
  const desired =
    ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX +
    mixUnit(state.seedUnit, state.hopIndex + 2, 4) * travelSpan;
  const distance = Math.min(available, Math.max(0, desired));
  const signed = direction === "up" ? -distance : distance;
  const toYPx = clamp(state.anchorYPx + signed, min, max);

  const durationSpan =
    ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MAX_MS - ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_MS;
  const durationMs = Math.round(
    ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_MS +
      mixUnit(state.seedUnit, state.hopIndex + 3, 5) * durationSpan,
  );

  return { direction, toYPx, durationMs };
}

function beginStationaryPhase(
  state: ZenLiveBotLaneDriftState,
  nowMs: number,
  anchorYPx: number,
): ZenLiveBotLaneDriftState {
  const span =
    ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MAX_MS -
    ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MIN_MS;
  const holdMs = Math.round(
    ZEN_LIVE_BOT_LANE_DRIFT_STATIONARY_MIN_MS +
      mixUnit(state.seedUnit, state.hopIndex + 4, 6) * span,
  );
  return {
    ...state,
    phase: "stationary",
    direction: null,
    anchorYPx,
    moveFromYPx: anchorYPx,
    moveToYPx: anchorYPx,
    phaseStartedAtMs: nowMs,
    phaseDurationMs: holdMs,
  };
}

function beginMovingPhase(
  state: ZenLiveBotLaneDriftState,
  nowMs: number,
  hop: {
    direction: ZenLiveBotLaneDriftDirection;
    toYPx: number;
    durationMs: number;
  },
): ZenLiveBotLaneDriftState {
  return {
    ...state,
    phase: "moving",
    direction: hop.direction,
    moveFromYPx: state.anchorYPx,
    moveToYPx: hop.toYPx,
    phaseStartedAtMs: nowMs,
    phaseDurationMs: Math.max(1, hop.durationMs),
    hopIndex: state.hopIndex + 1,
  };
}

/**
 * Advance the lane-drift timeline and return the visual offset for this frame.
 */
export function advanceZenLiveBotLaneDrift(
  state: ZenLiveBotLaneDriftState,
  options: ZenLiveBotLaneDriftAdvanceOptions,
): { state: ZenLiveBotLaneDriftState; sample: ZenLiveBotLaneDriftSample } {
  if (!options.active) {
    return {
      state,
      sample: {
        offsetXPx: 0,
        offsetYPx: state.phase === "moving"
          ? state.moveFromYPx +
            (state.moveToYPx - state.moveFromYPx) *
              easeInOutCubic(
                (options.nowMs - state.phaseStartedAtMs) /
                  Math.max(1, state.phaseDurationMs),
              )
          : state.anchorYPx,
        phase: state.phase,
        direction: state.direction,
      },
    };
  }

  let next = state;
  const elapsed = options.nowMs - next.phaseStartedAtMs;
  if (elapsed >= next.phaseDurationMs) {
    if (next.phase === "stationary") {
      if (options.allowTravel === false) {
        next = beginStationaryPhase(next, options.nowMs, next.anchorYPx);
      } else {
        const hop = planZenLiveBotLaneDriftHop(next, options);
        // If the hop collapses to the same point, extend the stationary hold.
        if (Math.abs(hop.toYPx - next.anchorYPx) < 0.5) {
          next = beginStationaryPhase(next, options.nowMs, next.anchorYPx);
        } else {
          next = beginMovingPhase(next, options.nowMs, hop);
        }
      }
    } else {
      next = beginStationaryPhase(next, options.nowMs, next.moveToYPx);
    }
  }

  if (next.phase === "moving") {
    const moveElapsed = options.nowMs - next.phaseStartedAtMs;
    const progress = easeInOutCubic(
      moveElapsed / Math.max(1, next.phaseDurationMs),
    );
    const offsetYPx =
      next.moveFromYPx + (next.moveToYPx - next.moveFromYPx) * progress;
    return {
      state: next,
      sample: {
        offsetXPx: 0,
        offsetYPx,
        phase: "moving",
        direction: next.direction,
      },
    };
  }

  return {
    state: next,
    sample: {
      offsetXPx: 0,
      offsetYPx: next.anchorYPx + sampleBobOffsetY(options.nowMs, next.seedUnit),
      phase: "stationary",
      direction: null,
    },
  };
}

/**
 * Whether soft lane drift should run for the current presence state.
 */
export function zenLiveBotLaneDriftShouldRun(input: {
  reducedMotion: boolean;
  dragging: boolean;
  transitioning: boolean;
}): boolean {
  return !input.reducedMotion && !input.dragging && !input.transitioning;
}
