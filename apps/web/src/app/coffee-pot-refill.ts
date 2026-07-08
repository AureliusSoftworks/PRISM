import { coffeeCupTopOffProgressForFrameIndex } from "@localai/shared";

export const COFFEE_POT_FINAL_POUR_FRAME_INDEX = 4;
export const COFFEE_POT_HOVER_HOLD_BEFORE_POUR_MS = 180;
export const COFFEE_POT_POUR_FRAME_MS = 40;
export const COFFEE_POT_FILL_FRAME_MS = 180;
export const COFFEE_POT_FILL_CLEAR_MS = 360;
export const COFFEE_POT_RETURN_MS = 280;
export const COFFEE_POT_TARGET_HIT_SLOP_PX = 18;
export const COFFEE_POT_POUR_FRAME_INDICES = [0, 1, 2, 3, 4] as const;
export const COFFEE_POT_ASSET_VERSION = "dark-refill-2026-07-02";
export type CoffeePotAssetTheme = "light" | "dark";
export type CoffeePotTargetRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

function coffeePotAssetPrefix(theme: CoffeePotAssetTheme): "coffee_light" | "coffee" {
  return theme === "light" ? "coffee_light" : "coffee";
}

function coffeePotAssetUrl(path: string): string {
  return `${path}?v=${COFFEE_POT_ASSET_VERSION}`;
}

export function coffeePotRestImageUrl(theme: CoffeePotAssetTheme): string {
  return coffeePotAssetUrl(`/coffee-pot/${coffeePotAssetPrefix(theme)}_pot.png`);
}

export function coffeePotPourImageUrl(theme: CoffeePotAssetTheme): string {
  const path = theme === "light"
    ? "/coffee-pot/coffee_light_pot_light_pour.png"
    : "/coffee-pot/coffee_pot_pour.png";
  return coffeePotAssetUrl(path);
}

export function coffeePotPourFrameImageUrl(
  theme: CoffeePotAssetTheme,
  frameIndex: number
): string {
  const frame = Math.max(
    0,
    Math.min(COFFEE_POT_FINAL_POUR_FRAME_INDEX, Math.round(frameIndex))
  );
  return coffeePotAssetUrl(`/coffee-pot/${coffeePotAssetPrefix(theme)}_${frame}.png`);
}

export function coffeePotPointerIsInsideTarget(
  clientX: number,
  clientY: number,
  rect: CoffeePotTargetRect,
  hitSlopPx = COFFEE_POT_TARGET_HIT_SLOP_PX
): boolean {
  const hitSlop = Math.max(0, hitSlopPx);
  return (
    clientX >= rect.left - hitSlop &&
    clientX <= rect.right + hitSlop &&
    clientY >= rect.top - hitSlop &&
    clientY <= rect.bottom + hitSlop
  );
}

export type CoffeePotRefillTarget = {
  botId: string;
  progress: number;
} | null;

export function coffeePotPourFrameDelayMs(frameIndex: number): number {
  const frame = Math.max(
    0,
    Math.min(COFFEE_POT_FINAL_POUR_FRAME_INDEX, Math.round(frameIndex))
  );
  return frame * COFFEE_POT_POUR_FRAME_MS;
}

export function coffeePotFillFrameDelayMs(frameIndex: number): number {
  const frame = Math.max(
    0,
    Math.min(COFFEE_POT_FINAL_POUR_FRAME_INDEX, Math.round(frameIndex))
  );
  return frame * COFFEE_POT_FILL_FRAME_MS;
}

export function coffeeCupTopOffFrameIndexForPour(
  fromFrameIndex: number,
  pourFrameIndex: number
): number | null {
  const startFrame = Math.max(0, Math.min(5, Math.round(fromFrameIndex)));
  if (startFrame <= 0) return null;
  const pourFrame = Math.max(
    0,
    Math.min(COFFEE_POT_FINAL_POUR_FRAME_INDEX, Math.round(pourFrameIndex))
  );
  const fillStep = Math.min(
    startFrame,
    Math.floor((pourFrame / COFFEE_POT_FINAL_POUR_FRAME_INDEX) * (startFrame + 1))
  );
  return startFrame - fillStep;
}

export function coffeeCupTopOffFillFrameIndices(fromFrameIndex: number): number[] {
  const startFrame = Math.max(0, Math.min(5, Math.round(fromFrameIndex)));
  if (startFrame <= 0) return [];
  return Array.from({ length: startFrame + 1 }, (_, index) => startFrame - index);
}

export function coffeeCupTopOffProgressAfterForPour(
  fromFrameIndex: number,
  pourFrameIndex: number
): number | null {
  const frameIndex = coffeeCupTopOffFrameIndexForPour(fromFrameIndex, pourFrameIndex);
  return frameIndex == null ? null : coffeeCupTopOffProgressForFrameIndex(frameIndex);
}

export function coffeePotRefillTargetState(args: {
  currentBotId: string | null;
  currentPourReady: boolean;
  target: CoffeePotRefillTarget;
}): {
  pouringBotId: string | null;
  pourProgress: number | null;
  pourReady: boolean;
} {
  const nextBotId = args.target?.botId ?? null;
  return {
    pouringBotId: nextBotId,
    pourProgress: args.target?.progress ?? null,
    pourReady: args.currentBotId === nextBotId ? args.currentPourReady : false,
  };
}

export function coffeePotRefillCanComplete(args: {
  pouringBotId: string | null;
  pourProgress: number | null;
  pourReady: boolean;
  pourFrameIndex: number;
  busyBotId?: string | null;
}): args is {
  pouringBotId: string;
  pourProgress: number;
  pourReady: true;
  pourFrameIndex: number;
  busyBotId?: string | null;
} {
  return (
    args.pourReady &&
    typeof args.pouringBotId === "string" &&
    args.pouringBotId.length > 0 &&
    typeof args.pourProgress === "number" &&
    Number.isFinite(args.pourProgress) &&
    args.busyBotId == null &&
    Math.round(args.pourFrameIndex) >= COFFEE_POT_FINAL_POUR_FRAME_INDEX
  );
}
