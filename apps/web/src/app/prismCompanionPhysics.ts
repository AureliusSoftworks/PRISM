export interface PrismCompanionPosition {
  x: number;
  y: number;
}

export interface PrismCompanionVelocity {
  x: number;
  y: number;
}

export interface PrismCompanionSurfaceGlare {
  xPct: number;
  yPct: number;
}

export interface PrismCompanionDragVelocitySample {
  lastX: number;
  lastY: number;
  lastTimeMs: number;
  velocityX: number;
  velocityY: number;
}

export interface PrismCompanionLiveBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const PRISM_COMPANION_POSITION_BOUNDS: PrismCompanionLiveBounds = {
  minX: 0.05,
  maxX: 0.95,
  minY: 0.12,
  maxY: 0.92,
} as const;

/** Half of the 68px companion anchor — position is the orb center. */
export const PRISM_COMPANION_ORB_RADIUS_PX = 34;
/** Breathing room between the orb edge and a right drawer. */
export const PRISM_COMPANION_PANEL_GAP_PX = 14;
const PRISM_COMPANION_PANEL_PUSH_MIN_SPEED_PX_PER_SECOND = 420;
const PRISM_COMPANION_PANEL_PUSH_MAX_SPEED_PX_PER_SECOND = 980;
const PRISM_COMPANION_PANEL_PUSH_OVERLAP_GAIN = 2.4;
const PRISM_COMPANION_MAX_SPEED_PX_PER_SECOND = 1_650;
const PRISM_COMPANION_STOP_SPEED_PX_PER_SECOND = 24;
const PRISM_COMPANION_FRICTION_PER_FRAME = 0.965;
const PRISM_COMPANION_WALL_RESTITUTION = 0.54;
const PRISM_COMPANION_SCREEN_LIGHT_X_RATIO = 0.22;
const PRISM_COMPANION_SCREEN_LIGHT_Y_RATIO = 0.16;
const PRISM_COMPANION_GLARE_X_GAIN = 32;
const PRISM_COMPANION_GLARE_Y_GAIN = 20;
const PRISM_COMPANION_GLARE_X_MIN_PCT = 28;
const PRISM_COMPANION_GLARE_X_MAX_PCT = 72;
const PRISM_COMPANION_GLARE_Y_MIN_PCT = 30;
const PRISM_COMPANION_GLARE_Y_MAX_PCT = 58;

/**
 * Resolve the orb's live playable envelope, shrinking the right edge when a
 * navbar / utility drawer covers that side of the screen.
 */
export function resolvePrismCompanionLiveBounds(input: {
  viewportWidth: number;
  rightInsetPx?: number;
  leftInsetPx?: number;
  orbRadiusPx?: number;
  gapPx?: number;
}): PrismCompanionLiveBounds {
  const viewportWidth = Math.max(1, input.viewportWidth);
  const orbRadius = Math.max(0, input.orbRadiusPx ?? PRISM_COMPANION_ORB_RADIUS_PX);
  const gap = Math.max(0, input.gapPx ?? PRISM_COMPANION_PANEL_GAP_PX);
  const rightInset = Math.max(0, input.rightInsetPx ?? 0);
  const leftInset = Math.max(0, input.leftInsetPx ?? 0);
  const minX = Math.max(
    PRISM_COMPANION_POSITION_BOUNDS.minX,
    (leftInset + orbRadius + gap) / viewportWidth,
  );
  const maxX = Math.min(
    PRISM_COMPANION_POSITION_BOUNDS.maxX,
    1 - (rightInset + orbRadius + gap) / viewportWidth,
  );
  const safeMaxX = Math.max(minX, maxX);
  return {
    minX,
    maxX: safeMaxX,
    minY: PRISM_COMPANION_POSITION_BOUNDS.minY,
    maxY: PRISM_COMPANION_POSITION_BOUNDS.maxY,
  };
}

/**
 * Measure how many pixels of the right edge are covered by an open Prism
 * utility drawer (`[data-prism-panel]`). Closing drawers are ignored.
 */
export function measurePrismCompanionRightPanelInsetPx(
  root: ParentNode = typeof document === "undefined" ? (null as never) : document,
  viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth,
): number {
  if (!root || viewportWidth <= 0) return 0;
  let inset = 0;
  const panels = root.querySelectorAll("[data-prism-panel]");
  for (const node of panels) {
    const element = node as {
      dataset?: { closing?: string };
      getBoundingClientRect?: () => {
        left: number;
        right: number;
        width: number;
        height: number;
      };
    };
    if (typeof element.getBoundingClientRect !== "function") continue;
    if (element.dataset?.closing === "true") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    // Only treat right-anchored drawers as collision walls.
    if (rect.right < viewportWidth * 0.55) continue;
    inset = Math.max(inset, Math.max(0, viewportWidth - rect.left));
  }
  return inset;
}

export function clampPrismCompanionPosition(
  position: PrismCompanionPosition,
  bounds: PrismCompanionLiveBounds = PRISM_COMPANION_POSITION_BOUNDS,
): PrismCompanionPosition {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y)),
  };
}

/**
 * When a right drawer opens (or grows) under the orb, park it on the new wall
 * and impart leftward release velocity so inertia carries the shove.
 */
export function resolvePrismCompanionRightPanelPush(input: {
  position: PrismCompanionPosition;
  velocity: PrismCompanionVelocity;
  previousMaxX: number;
  nextMaxX: number;
  viewportWidth: number;
}): {
  position: PrismCompanionPosition;
  velocity: PrismCompanionVelocity;
  pushed: boolean;
} {
  const previousMaxX = input.previousMaxX;
  const nextMaxX = input.nextMaxX;
  const viewportWidth = Math.max(1, input.viewportWidth);
  if (!(nextMaxX < previousMaxX - 0.0005)) {
    return {
      position: input.position,
      velocity: input.velocity,
      pushed: false,
    };
  }
  if (input.position.x <= nextMaxX + 0.0005) {
    return {
      position: input.position,
      velocity: input.velocity,
      pushed: false,
    };
  }

  const overlapPx = (input.position.x - nextMaxX) * viewportWidth;
  const pushSpeed = Math.min(
    PRISM_COMPANION_PANEL_PUSH_MAX_SPEED_PX_PER_SECOND,
    Math.max(
      PRISM_COMPANION_PANEL_PUSH_MIN_SPEED_PX_PER_SECOND,
      PRISM_COMPANION_PANEL_PUSH_MIN_SPEED_PX_PER_SECOND +
        overlapPx * PRISM_COMPANION_PANEL_PUSH_OVERLAP_GAIN,
    ),
  );
  const retainedLeftward = Math.min(0, input.velocity.x);
  return {
    position: { x: nextMaxX, y: input.position.y },
    velocity: {
      x: retainedLeftward - pushSpeed,
      y: input.velocity.y * 0.85,
    },
    pushed: true,
  };
}

export function resolvePrismCompanionSurfaceGlare(
  position: PrismCompanionPosition,
): PrismCompanionSurfaceGlare {
  const normalizedX = PRISM_COMPANION_SCREEN_LIGHT_X_RATIO - position.x;
  const normalizedY = PRISM_COMPANION_SCREEN_LIGHT_Y_RATIO - position.y;
  return {
    xPct: Math.max(
      PRISM_COMPANION_GLARE_X_MIN_PCT,
      Math.min(
        PRISM_COMPANION_GLARE_X_MAX_PCT,
        50 + normalizedX * PRISM_COMPANION_GLARE_X_GAIN,
      ),
    ),
    yPct: Math.max(
      PRISM_COMPANION_GLARE_Y_MIN_PCT,
      Math.min(
        PRISM_COMPANION_GLARE_Y_MAX_PCT,
        42 + normalizedY * PRISM_COMPANION_GLARE_Y_GAIN,
      ),
    ),
  };
}

export function createPrismCompanionDragVelocitySample(
  clientX: number,
  clientY: number,
  timeMs: number,
): PrismCompanionDragVelocitySample {
  return {
    lastX: clientX,
    lastY: clientY,
    lastTimeMs: timeMs,
    velocityX: 0,
    velocityY: 0,
  };
}

export function samplePrismCompanionDragVelocity(
  sample: PrismCompanionDragVelocitySample,
  clientX: number,
  clientY: number,
  timeMs: number,
): void {
  const dtSeconds = Math.max(
    0.008,
    Math.min(0.05, (timeMs - sample.lastTimeMs) / 1_000 || 0.016),
  );
  const nextVelocityX = (clientX - sample.lastX) / dtSeconds;
  const nextVelocityY = (clientY - sample.lastY) / dtSeconds;
  sample.velocityX = sample.velocityX * 0.52 + nextVelocityX * 0.48;
  sample.velocityY = sample.velocityY * 0.52 + nextVelocityY * 0.48;
  sample.lastX = clientX;
  sample.lastY = clientY;
  sample.lastTimeMs = timeMs;
}

export function boundedPrismCompanionReleaseVelocity(
  velocity: PrismCompanionVelocity,
): PrismCompanionVelocity {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < PRISM_COMPANION_STOP_SPEED_PX_PER_SECOND) {
    return { x: 0, y: 0 };
  }
  const scale = Math.min(1, PRISM_COMPANION_MAX_SPEED_PX_PER_SECOND / speed);
  return { x: velocity.x * scale, y: velocity.y * scale };
}

export function stepPrismCompanionInertia(input: {
  position: PrismCompanionPosition;
  velocity: PrismCompanionVelocity;
  elapsedSeconds: number;
  viewportWidth: number;
  viewportHeight: number;
  bounds?: PrismCompanionLiveBounds;
}): {
  position: PrismCompanionPosition;
  velocity: PrismCompanionVelocity;
  moving: boolean;
  bounced: boolean;
} {
  const bounds = input.bounds ?? PRISM_COMPANION_POSITION_BOUNDS;
  const dt = Math.max(0.001, Math.min(0.034, input.elapsedSeconds));
  const viewportWidth = Math.max(1, input.viewportWidth);
  const viewportHeight = Math.max(1, input.viewportHeight);
  let velocityX = input.velocity.x;
  let velocityY = input.velocity.y;
  let x = input.position.x + (velocityX * dt) / viewportWidth;
  let y = input.position.y + (velocityY * dt) / viewportHeight;
  let bounced = false;

  if (x < bounds.minX) {
    x = bounds.minX;
    velocityX = Math.abs(velocityX) * PRISM_COMPANION_WALL_RESTITUTION;
    bounced = true;
  } else if (x > bounds.maxX) {
    x = bounds.maxX;
    velocityX = -Math.abs(velocityX) * PRISM_COMPANION_WALL_RESTITUTION;
    bounced = true;
  }
  if (y < bounds.minY) {
    y = bounds.minY;
    velocityY = Math.abs(velocityY) * PRISM_COMPANION_WALL_RESTITUTION;
    bounced = true;
  } else if (y > bounds.maxY) {
    y = bounds.maxY;
    velocityY = -Math.abs(velocityY) * PRISM_COMPANION_WALL_RESTITUTION;
    bounced = true;
  }

  const friction = Math.pow(PRISM_COMPANION_FRICTION_PER_FRAME, dt * 60);
  velocityX *= friction;
  velocityY *= friction;
  const moving =
    Math.hypot(velocityX, velocityY) >=
    PRISM_COMPANION_STOP_SPEED_PX_PER_SECOND;

  return {
    position: { x, y },
    velocity: moving ? { x: velocityX, y: velocityY } : { x: 0, y: 0 },
    moving,
    bounced,
  };
}
