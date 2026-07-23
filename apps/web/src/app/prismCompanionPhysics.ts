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

export const PRISM_COMPANION_POSITION_BOUNDS = {
  minX: 0.05,
  maxX: 0.95,
  minY: 0.12,
  maxY: 0.92,
} as const;

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

export function clampPrismCompanionPosition(
  position: PrismCompanionPosition,
): PrismCompanionPosition {
  const bounds = PRISM_COMPANION_POSITION_BOUNDS;
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y)),
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
}): {
  position: PrismCompanionPosition;
  velocity: PrismCompanionVelocity;
  moving: boolean;
  bounced: boolean;
} {
  const bounds = PRISM_COMPANION_POSITION_BOUNDS;
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
