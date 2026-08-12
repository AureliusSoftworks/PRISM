export interface BotAvatarFoundryPhysicsBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  rollRadius: number;
}

export interface BotAvatarFoundryPhysicsBody {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  angle: number;
  angularVelocity: number;
  sleeping: boolean;
}

export type BotAvatarFoundryCollision = "floor" | "wall" | "ceiling";

export interface BotAvatarFoundryPhysicsStep {
  body: BotAvatarFoundryPhysicsBody;
  collision: BotAvatarFoundryCollision | null;
  impactSpeed: number;
}

export const BOT_AVATAR_FOUNDRY_PHYSICS = {
  gravity: 1_760,
  floorRestitution: 0.38,
  wallRestitution: 0.52,
  floorFrictionPerFrame: 0.94,
  airDragPerFrame: 0.997,
  angularDragPerFrame: 0.985,
  maximumLinearSpeed: 2_200,
  maximumAngularSpeed: 8.5,
  minimumClankSpeed: 175,
  settleImpactSpeed: 118,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeBotAvatarFoundryPhysicsBounds(
  bounds: Partial<BotAvatarFoundryPhysicsBounds>,
): BotAvatarFoundryPhysicsBounds {
  const left = finite(bounds.left ?? 0);
  const right = Math.max(left, finite(bounds.right ?? left));
  const top = finite(bounds.top ?? 0);
  const bottom = Math.max(top, finite(bounds.bottom ?? top));
  return {
    left,
    right,
    top,
    bottom,
    rollRadius: Math.max(24, finite(bounds.rollRadius ?? 120, 120)),
  };
}

export function botAvatarFoundryInitialPhysicsBody(
  bounds: BotAvatarFoundryPhysicsBounds,
  reducedMotion: boolean,
): BotAvatarFoundryPhysicsBody {
  const safeBounds = normalizeBotAvatarFoundryPhysicsBounds(bounds);
  if (reducedMotion) {
    return {
      x: clamp(0, safeBounds.left, safeBounds.right),
      y: safeBounds.bottom,
      velocityX: 0,
      velocityY: 0,
      angle: 0,
      angularVelocity: 0,
      sleeping: true,
    };
  }
  return {
    x: clamp(0, safeBounds.left, safeBounds.right),
    // The chute is intentionally open: the shell begins just above the
    // chamber ceiling and may fall through it, but cannot be thrown back out.
    y: safeBounds.top - Math.min(110, safeBounds.rollRadius * 0.72),
    velocityX: 46,
    velocityY: 145,
    angle: -0.055,
    angularVelocity: 0.34,
    sleeping: false,
  };
}

export function clampBotAvatarFoundryPhysicsBody(
  body: BotAvatarFoundryPhysicsBody,
  bounds: BotAvatarFoundryPhysicsBounds,
): BotAvatarFoundryPhysicsBody {
  const safeBounds = normalizeBotAvatarFoundryPhysicsBounds(bounds);
  return {
    ...body,
    x: clamp(finite(body.x), safeBounds.left, safeBounds.right),
    y: clamp(finite(body.y), safeBounds.top, safeBounds.bottom),
  };
}

export function botAvatarFoundryDraggedBody(
  body: BotAvatarFoundryPhysicsBody,
  delta: Readonly<{ x: number; y: number }>,
  bounds: BotAvatarFoundryPhysicsBounds,
): BotAvatarFoundryPhysicsBody {
  return clampBotAvatarFoundryPhysicsBody(
    {
      ...body,
      x: body.x + finite(delta.x),
      y: body.y + finite(delta.y),
      velocityX: 0,
      velocityY: 0,
      angularVelocity: 0,
      sleeping: false,
    },
    bounds,
  );
}

export function botAvatarFoundryThrowVelocity(
  delta: Readonly<{ x: number; y: number }>,
  elapsedMs: number,
): Readonly<{ x: number; y: number }> {
  const seconds = clamp(finite(elapsedMs, 16), 8, 160) / 1_000;
  return {
    x: clamp(
      finite(delta.x) / seconds,
      -BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
      BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
    ),
    y: clamp(
      finite(delta.y) / seconds,
      -BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
      BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
    ),
  };
}

export function stepBotAvatarFoundryPhysics(
  body: BotAvatarFoundryPhysicsBody,
  bounds: BotAvatarFoundryPhysicsBounds,
  elapsedSeconds: number,
): BotAvatarFoundryPhysicsStep {
  const safeBounds = normalizeBotAvatarFoundryPhysicsBounds(bounds);
  const seconds = clamp(finite(elapsedSeconds), 0, 1 / 24);
  if (seconds <= 0 || body.sleeping) {
    return { body, collision: null, impactSpeed: 0 };
  }

  const frameScale = seconds * 60;
  let velocityX = clamp(
    finite(body.velocityX) * BOT_AVATAR_FOUNDRY_PHYSICS.airDragPerFrame ** frameScale,
    -BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
    BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
  );
  let velocityY = clamp(
    finite(body.velocityY) + BOT_AVATAR_FOUNDRY_PHYSICS.gravity * seconds,
    -BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
    BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed,
  );
  let angularVelocity = clamp(
    finite(body.angularVelocity) *
      BOT_AVATAR_FOUNDRY_PHYSICS.angularDragPerFrame ** frameScale,
    -BOT_AVATAR_FOUNDRY_PHYSICS.maximumAngularSpeed,
    BOT_AVATAR_FOUNDRY_PHYSICS.maximumAngularSpeed,
  );
  let x = finite(body.x) + velocityX * seconds;
  let y = finite(body.y) + velocityY * seconds;
  let collision: BotAvatarFoundryCollision | null = null;
  let impactSpeed = 0;

  if (x < safeBounds.left || x > safeBounds.right) {
    impactSpeed = Math.abs(velocityX);
    x = clamp(x, safeBounds.left, safeBounds.right);
    velocityX =
      (x === safeBounds.left ? Math.abs(velocityX) : -Math.abs(velocityX)) *
      BOT_AVATAR_FOUNDRY_PHYSICS.wallRestitution;
    angularVelocity +=
      (x === safeBounds.left ? 1 : -1) *
      Math.min(2.2, impactSpeed / Math.max(120, safeBounds.rollRadius));
    collision = "wall";
  }

  // Falling through the open chute is legal. A shell already inside the
  // chamber collides with the ceiling if the player flings it upward.
  if (y < safeBounds.top && velocityY < 0) {
    impactSpeed = Math.max(impactSpeed, Math.abs(velocityY));
    y = safeBounds.top;
    velocityY = Math.abs(velocityY) * BOT_AVATAR_FOUNDRY_PHYSICS.wallRestitution;
    angularVelocity *= 0.84;
    collision = "ceiling";
  }

  let onFloor = false;
  if (y >= safeBounds.bottom) {
    const floorImpact = Math.abs(velocityY);
    impactSpeed = Math.max(impactSpeed, floorImpact);
    y = safeBounds.bottom;
    velocityY = -floorImpact * BOT_AVATAR_FOUNDRY_PHYSICS.floorRestitution;
    velocityX *= BOT_AVATAR_FOUNDRY_PHYSICS.floorFrictionPerFrame ** frameScale;
    const rollingAngularVelocity = velocityX / safeBounds.rollRadius;
    angularVelocity = angularVelocity * 0.62 + rollingAngularVelocity * 0.38;
    collision = "floor";
    onFloor = true;
    // Absorb the last small rebound instead of repainting the same resting
    // pose across several sub-pixel hops. Meaningful impacts still bounce.
    if (floorImpact < BOT_AVATAR_FOUNDRY_PHYSICS.settleImpactSpeed) {
      velocityY = 0;
      velocityX *= 0.72;
      angularVelocity *= 0.72;
    }
  }

  const sleeping =
    onFloor &&
    Math.abs(velocityX) < 9 &&
    Math.abs(velocityY) < 1 &&
    Math.abs(angularVelocity) < 0.055;
  if (sleeping) {
    velocityX = 0;
    velocityY = 0;
    angularVelocity = 0;
  }

  return {
    body: {
      x,
      y,
      velocityX,
      velocityY,
      angle: finite(body.angle) + angularVelocity * seconds,
      angularVelocity,
      sleeping,
    },
    collision,
    impactSpeed,
  };
}
