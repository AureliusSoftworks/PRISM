export const COFFEE_POT_FINAL_POUR_FRAME_INDEX = 4;
export const COFFEE_POT_HOVER_HOLD_BEFORE_POUR_MS = 420;
export const COFFEE_POT_FILL_FRAME_MS = 240;
export const COFFEE_POT_FILL_CLEAR_MS = 360;

export type CoffeePotRefillTarget = {
  botId: string;
  progress: number;
} | null;

export function coffeePotPourFrameDelayMs(frameIndex: number): number {
  const frame = Math.max(
    0,
    Math.min(COFFEE_POT_FINAL_POUR_FRAME_INDEX, Math.round(frameIndex))
  );
  return frame * COFFEE_POT_FILL_FRAME_MS;
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
