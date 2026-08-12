import type { BotFaceEyeMovement } from "@localai/shared";

export interface BotCursorAttentionProfile {
  radiusScale: number;
  catchChance: number;
  maxX: number;
  maxY: number;
  transitionMs: number;
  followMinMs: number;
  followSpanMs: number;
  idleMinMs: number;
  idleSpanMs: number;
  cooldownMinMs: number;
  cooldownSpanMs: number;
}

const BOT_CURSOR_ATTENTION_PROFILES: Record<
  Exclude<BotFaceEyeMovement, "still">,
  BotCursorAttentionProfile
> = {
  natural: {
    radiusScale: 1.12,
    catchChance: 0.24,
    maxX: 4,
    maxY: 2,
    transitionMs: 210,
    followMinMs: 720,
    followSpanMs: 620,
    idleMinMs: 520,
    idleSpanMs: 420,
    cooldownMinMs: 2_600,
    cooldownSpanMs: 2_100,
  },
  nervous: {
    radiusScale: 1.42,
    catchChance: 0.4,
    maxX: 5,
    maxY: 2.5,
    transitionMs: 140,
    followMinMs: 880,
    followSpanMs: 720,
    idleMinMs: 460,
    idleSpanMs: 340,
    cooldownMinMs: 2_000,
    cooldownSpanMs: 1_500,
  },
  frantic: {
    radiusScale: 1.82,
    catchChance: 0.58,
    maxX: 6.2,
    maxY: 3.1,
    transitionMs: 86,
    followMinMs: 1_000,
    followSpanMs: 840,
    idleMinMs: 400,
    idleSpanMs: 280,
    cooldownMinMs: 1_400,
    cooldownSpanMs: 1_000,
  },
  paranoid: {
    radiusScale: 2.28,
    catchChance: 0.78,
    maxX: 7.2,
    maxY: 3.6,
    transitionMs: 58,
    followMinMs: 1_180,
    followSpanMs: 1_020,
    idleMinMs: 340,
    idleSpanMs: 240,
    cooldownMinMs: 900,
    cooldownSpanMs: 720,
  },
};

export function botCursorAttentionProfile(
  movement: BotFaceEyeMovement | null | undefined,
): BotCursorAttentionProfile | null {
  if (!movement || movement === "still") return null;
  return BOT_CURSOR_ATTENTION_PROFILES[movement];
}

export function botCursorAttentionDistanceRatio(args: {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
}): number {
  const centerX = args.rect.left + args.rect.width / 2;
  const centerY = args.rect.top + args.rect.height / 2;
  const radius = Math.max(1, Math.max(args.rect.width, args.rect.height) / 2);
  return Math.hypot(args.clientX - centerX, args.clientY - centerY) / radius;
}

export function botCursorAttentionShouldCatch(args: {
  movement: BotFaceEyeMovement | null | undefined;
  distanceRatio: number;
  randomSample: number;
}): boolean {
  const profile = botCursorAttentionProfile(args.movement);
  if (!profile || args.distanceRatio > profile.radiusScale) return false;
  const proximity = Math.max(
    0,
    Math.min(1, 1 - args.distanceRatio / profile.radiusScale),
  );
  const chance = profile.catchChance * (0.45 + proximity * 0.55);
  return Math.max(0, Math.min(1, args.randomSample)) < chance;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function botCursorAttentionGaze(args: {
  movement: Exclude<BotFaceEyeMovement, "still">;
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
  /** Counter-mirrors local eye motion when the complete face looks left. */
  facingScaleX?: -1 | 1;
}): { xPx: number; yPx: number; transitionMs: number } {
  const profile = BOT_CURSOR_ATTENTION_PROFILES[args.movement];
  const centerX = args.rect.left + args.rect.width / 2;
  const centerY = args.rect.top + args.rect.height / 2;
  const xRadius = Math.max(1, args.rect.width * 0.55);
  const yRadius = Math.max(1, args.rect.height * 0.55);
  const xUnit = Math.max(-1, Math.min(1, (args.clientX - centerX) / xRadius));
  const yUnit = Math.max(-1, Math.min(1, (args.clientY - centerY) / yRadius));
  return {
    xPx: rounded(xUnit * profile.maxX * (args.facingScaleX ?? 1)),
    yPx: rounded(yUnit * profile.maxY),
    transitionMs: profile.transitionMs,
  };
}
