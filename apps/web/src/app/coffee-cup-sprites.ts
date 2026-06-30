import {
  coffeeCupProgressFromSessionTiming,
  coffeeCupSipCycleMs,
  coffeeCupPacedProgress,
  coffeeCupStatusForProgress,
  hexToHsl,
  type CoffeeCupStatus,
} from "@localai/shared";

export {
  coffeeCupConsumptionRate,
  coffeeCupSessionDurationPaceMultiplier,
  coffeeCupSipMessageGapForDuration,
  coffeeCupSipBias,
  coffeeCupSipCycleMs,
} from "@localai/shared";

export const COFFEE_CUP_SPRITE_COLORS = [
  "red",
  "orange",
  "green",
  "blue",
  "purple",
] as const;

export type CoffeeCupSpriteColor = (typeof COFFEE_CUP_SPRITE_COLORS)[number];
export type CoffeeCupPlacementSide = "left" | "right";
export type CoffeeCupPrismFamily = "p" | "r" | "i" | "s" | "m";
export type CoffeeCupSpriteTheme = "dark" | "light";

interface CoffeeCupSeatPlacementArgs {
  compact: boolean;
  seatIndex: number;
  seatCount: number;
  layoutIndex: number;
  sessionSeed?: string | null;
}

export interface CoffeeCupVisualState extends CoffeeCupStatus {
  color: CoffeeCupSpriteColor;
  restImageUrl: string;
  sipImageUrl: string;
  frameX: "0%" | "50%" | "100%";
  frameY: "0%" | "100%";
  sipping: boolean;
  sipAnimationMs: number;
  sipHoldMs: number;
  label: string;
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function hasSixDigitHexColor(value: string | null | undefined): value is string {
  return /^#[0-9a-f]{6}$/i.test(value?.trim() ?? "");
}

export function coffeeCupPrismFamilyForBotColor(
  botColor: string | null | undefined
): CoffeeCupPrismFamily {
  const raw = botColor?.trim();
  if (!hasSixDigitHexColor(raw)) return "p";
  const { h } = hexToHsl(raw);
  if (h >= 315) return "p";
  if (h < 15) return "p";
  if (h < 75) return "r";
  if (h < 165) return "i";
  if (h < 245) return "s";
  return "m";
}

export function coffeeCupColorForBotColor(
  botColor: string | null | undefined
): CoffeeCupSpriteColor {
  switch (coffeeCupPrismFamilyForBotColor(botColor)) {
    case "p":
      return "red";
    case "r":
      return "orange";
    case "i":
      return "green";
    case "s":
      return "blue";
    case "m":
      return "purple";
  }
}

export function coffeeCupFramePosition(frameIndex: number): Pick<CoffeeCupVisualState, "frameX" | "frameY"> {
  const clamped = Math.max(0, Math.min(5, Math.round(frameIndex)));
  const col = clamped % 3;
  const row = Math.floor(clamped / 3);
  return {
    frameX: col === 0 ? "0%" : col === 1 ? "50%" : "100%",
    frameY: row === 0 ? "0%" : "100%",
  };
}

export function coffeeCupSippingActive(args: {
  seed: string;
  nowMs: number;
  progress: number;
  durationMinutes?: number | null;
  speaking?: boolean;
}): boolean {
  if (args.progress >= 0.96) return false;
  if (args.speaking === true) return false;
  if (!Number.isFinite(args.nowMs)) return false;
  const cycleMs = coffeeCupSipCycleMs(args.seed, args.durationMinutes);
  const sipWindowMs = 1_300;
  const offsetMs = Math.round(stableUnitValue(`${args.seed}:offset`) * cycleMs);
  return (args.nowMs + offsetMs) % cycleMs < sipWindowMs;
}

export function coffeeCupSipAnimationTiming(args: {
  seed: string;
  sipCount?: number | null;
}): { durationMs: number; holdMs: number } {
  const wholeSipCount =
    typeof args.sipCount === "number" && Number.isFinite(args.sipCount)
      ? Math.max(1, Math.floor(args.sipCount))
      : 1;
  const holdBias = stableUnitValue(`${args.seed}:sip-hold:${wholeSipCount}`);
  const holdMs = Math.round(500 + holdBias * 1_700);
  return {
    holdMs,
    durationMs: 900 + holdMs,
  };
}

export function coffeeCupProgressForSipCount(sipCount: number): number {
  if (!Number.isFinite(sipCount)) return 0;
  const wholeSips = Math.max(0, Math.floor(sipCount));
  if (wholeSips <= 0) return 0;
  return Math.min(0.96, wholeSips * 0.2);
}

function coffeeCupSeatLeftPercent(args: CoffeeCupSeatPlacementArgs): number {
  return args.compact
    ? ({ 0: 50, 1: 21, 2: 79, 3: 28, 4: 72 } as Record<number, number>)[
        args.seatIndex
      ] ?? 50
    : args.seatCount === 2
      ? args.layoutIndex === 0
        ? 25
        : 75
      : ({
          "3:0": 50,
          "3:1": 26,
          "3:2": 74,
          "4:0": 24,
          "4:1": 76,
          "4:2": 76,
          "4:3": 24,
          "5:0": 50,
          "5:1": 21,
          "5:2": 79,
          "5:3": 29,
          "5:4": 71,
        } as Record<string, number>)[`${args.seatCount}:${args.layoutIndex}`] ?? 50;
}

function coffeeCupTopSideForSeed(args: CoffeeCupSeatPlacementArgs): CoffeeCupPlacementSide {
  const seed =
    typeof args.sessionSeed === "string" && args.sessionSeed.trim().length > 0
      ? args.sessionSeed.trim()
      : "draft";
  return stableUnitValue(`${seed}:coffee-cup-top-side`) < 0.5 ? "left" : "right";
}

export function coffeeCupSideForSeat(args: CoffeeCupSeatPlacementArgs): CoffeeCupPlacementSide {
  const leftPercent = coffeeCupSeatLeftPercent(args);
  if (leftPercent === 50) return coffeeCupTopSideForSeed(args);
  return leftPercent > 50 ? "left" : "right";
}

export function coffeeCupShouldMirrorForSeat(args: CoffeeCupSeatPlacementArgs): boolean {
  const leftPercent = coffeeCupSeatLeftPercent(args);
  if (leftPercent === 50) return coffeeCupSideForSeat(args) === "right";
  return leftPercent < 50;
}

function coffeeCupSpritePath(args: {
  color: CoffeeCupSpriteColor;
  sip?: boolean;
  theme?: CoffeeCupSpriteTheme | null;
}): string {
  const themePrefix = args.theme === "light" ? "coffee_light" : "coffee";
  const sipSuffix = args.sip === true ? "_sip" : "";
  return `/coffee-cups/${themePrefix}_${args.color}${sipSuffix}.png`;
}

export function buildCoffeeCupVisualState(args: {
  seed: string;
  botColor?: string | null;
  theme?: CoffeeCupSpriteTheme | null;
  nowMs: number;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
  progressOverride?: number | null;
  sipCount?: number | null;
  sippingOverride?: boolean | null;
  speaking?: boolean;
  forceEmpty?: boolean;
}): CoffeeCupVisualState {
  const color = coffeeCupColorForBotColor(args.botColor);
  const sipProgress =
    args.forceEmpty === true
      ? 1
      : typeof args.sipCount === "number" && Number.isFinite(args.sipCount)
        ? coffeeCupProgressForSipCount(args.sipCount)
        : null;
  const timedProgress =
    args.forceEmpty === true
      ? 1
      : sipProgress != null
        ? sipProgress
      : typeof args.progressOverride === "number" &&
          Number.isFinite(args.progressOverride)
        ? args.progressOverride
      : typeof args.sessionStartedAtMs === "number" &&
          Number.isFinite(args.sessionStartedAtMs) &&
          typeof args.sessionEndsAtMs === "number" &&
          Number.isFinite(args.sessionEndsAtMs)
        ? coffeeCupProgressFromSessionTiming({
            sessionRemainingMs: Math.max(0, args.sessionEndsAtMs - args.nowMs),
            durationMinutes: args.durationMinutes,
          })
        : null;
  const pacedProgress =
    args.forceEmpty === true
      ? 1
      : sipProgress != null
        ? sipProgress
        : coffeeCupPacedProgress(timedProgress ?? 0, args.seed, args.durationMinutes);
  const status = coffeeCupStatusForProgress(pacedProgress, args.seed);
  const position = coffeeCupFramePosition(status.frameIndex);
  const sipTiming = coffeeCupSipAnimationTiming({
    seed: args.seed,
    sipCount: args.sipCount,
  });
  const sipping =
    typeof args.sippingOverride === "boolean"
      ? args.sippingOverride && status.progress < 0.96
      : coffeeCupSippingActive({
          seed: args.seed,
          nowMs: args.nowMs,
          progress: status.progress,
          durationMinutes: args.durationMinutes,
          speaking: args.speaking === true,
        });
  return {
    ...status,
    ...position,
    color,
    restImageUrl: coffeeCupSpritePath({ color, theme: args.theme }),
    sipImageUrl: coffeeCupSpritePath({ color, theme: args.theme, sip: true }),
    sipping,
    sipAnimationMs: sipTiming.durationMs,
    sipHoldMs: sipTiming.holdMs,
    label: `${color} coffee cup, ${status.amountLabel}, ${status.temperatureLabel}`,
  };
}
