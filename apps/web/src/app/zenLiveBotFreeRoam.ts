/** Deterministic, DOM-free motion planning for Zen's live avatar. */

import {
  boundedPrismCompanionReleaseVelocity,
  createPrismCompanionDragVelocitySample,
  samplePrismCompanionDragVelocity,
  stepPrismCompanionInertia,
  type PrismCompanionDragVelocitySample,
  type PrismCompanionLiveBounds,
  type PrismCompanionPosition,
} from "./prismCompanionPhysics.ts";

export type ZenLiveBotPoint = { x: number; y: number };
export type ZenLiveBotRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Inclusive legal top-left coordinates for the avatar. */
export type ZenLiveBotMotionBounds = ZenLiveBotRect;
export type ZenLiveBotDragVelocitySample = PrismCompanionDragVelocitySample;

export type ZenLiveBotPhysicsState = ZenLiveBotPoint & {
  /** Shared Prism companion velocity contract: CSS pixels per second. */
  velocityX: number;
  velocityY: number;
};

export type ZenLiveBotPhysicsStep = ZenLiveBotPhysicsState & {
  moving: boolean;
  bounced: boolean;
};

export const ZEN_LIVE_BOT_IDLE_BOB_AMPLITUDE_PX = 1.5;
export const ZEN_LIVE_BOT_IDLE_BOB_PERIOD_MS = 9_000;

const ZEN_LIVE_BOT_AUTONOMOUS_SPEED_PX_PER_SECOND = 52;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function overlaps(first: ZenLiveBotRect, second: ZenLiveBotRect): boolean {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

function rectAt(
  position: ZenLiveBotPoint,
  width: number,
  height: number,
): ZenLiveBotRect {
  return {
    left: position.x,
    top: position.y,
    right: position.x + width,
    bottom: position.y + height,
  };
}

export function zenLiveBotFreeRoamShouldRun(input: {
  reducedMotion: boolean;
  dragging: boolean;
  transitioning: boolean;
}): boolean {
  return !input.reducedMotion && !input.dragging && !input.transitioning;
}

/** A low-key sinusoidal idle sample, intentionally separate from travel. */
export function sampleZenLiveBotIdleBob(
  nowMs: number,
  seedUnit = 0,
): number {
  return (
    -Math.sin(
      (nowMs / ZEN_LIVE_BOT_IDLE_BOB_PERIOD_MS + seedUnit) * Math.PI * 2,
    ) * ZEN_LIVE_BOT_IDLE_BOB_AMPLITUDE_PX
  );
}

/** Presentation values stay bounded so a fast throw never feels cartoonish. */
export function sampleZenLiveBotMotionPresentation(
  velocityX: number,
  velocityY: number,
): {
  speed: number;
  tiltDeg: number;
  glow: number;
} {
  const speed = Math.hypot(velocityX, velocityY);
  return {
    speed,
    tiltDeg: clamp(velocityX / 180, -10, 10),
    glow: clamp(speed / 1_150, 0, 1),
  };
}

/** Zen drag sampling is the Prism orb sampler, without a second feel contract. */
export function createZenLiveBotDragVelocitySample(
  clientX: number,
  clientY: number,
  timeMs: number,
): ZenLiveBotDragVelocitySample {
  return createPrismCompanionDragVelocitySample(clientX, clientY, timeMs);
}

export function sampleZenLiveBotDragVelocity(
  sample: ZenLiveBotDragVelocitySample,
  clientX: number,
  clientY: number,
  timeMs: number,
): void {
  samplePrismCompanionDragVelocity(sample, clientX, clientY, timeMs);
}

/** Clicks, cancelled drags, and reduced-motion releases always settle in place. */
export function resolveZenLiveBotReleaseVelocity(input: {
  sample: ZenLiveBotDragVelocitySample;
  moved: boolean;
  reducedMotion: boolean;
}): ZenLiveBotPoint {
  if (!input.moved || input.reducedMotion) return { x: 0, y: 0 };
  return boundedPrismCompanionReleaseVelocity({
    x: input.sample.velocityX,
    y: input.sample.velocityY,
  });
}

export function settleZenLiveBotPhysicsForReducedMotion(
  state: ZenLiveBotPhysicsState,
): ZenLiveBotPhysicsState {
  return { ...state, velocityX: 0, velocityY: 0 };
}

export function zenLiveBotPointToPrismCompanionPosition(
  point: ZenLiveBotPoint,
  viewportWidth: number,
  viewportHeight: number,
): PrismCompanionPosition {
  return {
    x: point.x / Math.max(1, viewportWidth),
    y: point.y / Math.max(1, viewportHeight),
  };
}

export function prismCompanionPositionToZenLiveBotPoint(
  position: PrismCompanionPosition,
  viewportWidth: number,
  viewportHeight: number,
): ZenLiveBotPoint {
  return {
    x: position.x * Math.max(1, viewportWidth),
    y: position.y * Math.max(1, viewportHeight),
  };
}

export function zenLiveBotBoundsToPrismCompanionLiveBounds(
  bounds: ZenLiveBotMotionBounds,
  viewportWidth: number,
  viewportHeight: number,
): PrismCompanionLiveBounds {
  const topLeft = zenLiveBotPointToPrismCompanionPosition(
    { x: bounds.left, y: bounds.top },
    viewportWidth,
    viewportHeight,
  );
  const bottomRight = zenLiveBotPointToPrismCompanionPosition(
    { x: bounds.right, y: bounds.bottom },
    viewportWidth,
    viewportHeight,
  );
  return {
    minX: topLeft.x,
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: topLeft.y,
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

/**
 * Advance Zen's top-left pixel anchor through the exact Prism orb inertia
 * step. Only coordinate representation differs; cap, friction, stop speed,
 * restitution, and collision semantics remain owned by the shared helper.
 */
export function advanceZenLiveBotPhysics(
  state: ZenLiveBotPhysicsState,
  elapsedMs: number,
  bounds: ZenLiveBotMotionBounds,
  viewportWidth: number,
  viewportHeight: number,
): ZenLiveBotPhysicsStep {
  const next = stepPrismCompanionInertia({
    position: zenLiveBotPointToPrismCompanionPosition(
      state,
      viewportWidth,
      viewportHeight,
    ),
    velocity: { x: state.velocityX, y: state.velocityY },
    elapsedSeconds: elapsedMs / 1_000,
    viewportWidth,
    viewportHeight,
    bounds: zenLiveBotBoundsToPrismCompanionLiveBounds(
      bounds,
      viewportWidth,
      viewportHeight,
    ),
  });
  const position = prismCompanionPositionToZenLiveBotPoint(
    next.position,
    viewportWidth,
    viewportHeight,
  );
  return {
    ...position,
    velocityX: next.velocity.x,
    velocityY: next.velocity.y,
    moving: next.moving,
    bounced: next.bounced,
  };
}

export function stepZenLiveBotAutonomousTravel(input: {
  current: ZenLiveBotPhysicsState;
  target: ZenLiveBotPoint;
  elapsedMs: number;
}): ZenLiveBotPhysicsState {
  const dx = input.target.x - input.current.x;
  const dy = input.target.y - input.current.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 3) {
    return {
      x: input.target.x,
      y: input.target.y,
      velocityX: 0,
      velocityY: 0,
    };
  }
  const velocityX = (dx / distance) * ZEN_LIVE_BOT_AUTONOMOUS_SPEED_PX_PER_SECOND;
  const velocityY = (dy / distance) * ZEN_LIVE_BOT_AUTONOMOUS_SPEED_PX_PER_SECOND;
  const elapsedSeconds = Math.min(48, Math.max(0, input.elapsedMs)) / 1_000;
  return {
    x: input.current.x + velocityX * elapsedSeconds,
    y: input.current.y + velocityY * elapsedSeconds,
    velocityX,
    velocityY,
  };
}

/**
 * Plans calm destinations across the whole safe field. `bounds` already
 * contains legal top-left limits, so avatar dimensions are used only for
 * overlap testing. Side lanes are chosen about 72% of the time.
 */
export function planZenLiveBotFreeRoamDestination(input: {
  current: ZenLiveBotPoint;
  bounds: ZenLiveBotMotionBounds;
  avatarWidth: number;
  avatarHeight: number;
  avoidRects: ZenLiveBotRect[];
  random?: () => number;
}): ZenLiveBotPoint {
  const random = input.random ?? Math.random;
  const minX = input.bounds.left;
  const maxX = Math.max(minX, input.bounds.right);
  const minY = input.bounds.top;
  const maxY = Math.max(minY, input.bounds.bottom);
  const currentOverlaps = input.avoidRects.some((rect) =>
    overlaps(rectAt(input.current, input.avatarWidth, input.avatarHeight), rect),
  );
  const candidates: ZenLiveBotPoint[] = [];
  for (let index = 0; index < 16; index += 1) {
    const useSideLane = currentOverlaps || random() < 0.72;
    const chooseLeft = random() < 0.5;
    const laneFraction = 0.06 + random() * 0.22;
    const x = useSideLane
      ? chooseLeft
        ? minX + (maxX - minX) * laneFraction
        : maxX - (maxX - minX) * laneFraction
      : minX + (maxX - minX) * (0.3 + random() * 0.4);
    candidates.push({
      x: clamp(x, minX, maxX),
      y: minY + (maxY - minY) * (0.08 + random() * 0.84),
    });
  }
  return (
    candidates.find((candidate) =>
      input.avoidRects.every(
        (rect) =>
          !overlaps(
            rectAt(candidate, input.avatarWidth, input.avatarHeight),
            rect,
          ),
      ),
    ) ??
    candidates[0] ??
    input.current
  );
}
