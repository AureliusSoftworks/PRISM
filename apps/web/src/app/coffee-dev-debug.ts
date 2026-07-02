import type { CoffeeBotSocialSnapshot, BotMoodKey } from "@localai/shared";

export type CoffeeTableCoordinateMode = "legacy" | "experimental";

export const COFFEE_DEV_MOOD_PRESETS: Record<BotMoodKey, CoffeeBotSocialSnapshot> = {
  joyful: {
    disposition: 0.86,
    valuesFriction: 0.14,
    restraint: 0.42,
    engagement: 0.9,
    leavePressure: 0.04,
  },
  warm: {
    disposition: 0.72,
    valuesFriction: 0.24,
    restraint: 0.58,
    engagement: 0.78,
    leavePressure: 0.06,
  },
  neutral: {
    disposition: 0.5,
    valuesFriction: 0.35,
    restraint: 0.65,
    engagement: 0.65,
    leavePressure: 0.1,
  },
  guarded: {
    disposition: 0.38,
    valuesFriction: 0.54,
    restraint: 0.8,
    engagement: 0.5,
    leavePressure: 0.22,
  },
  strained: {
    disposition: 0.22,
    valuesFriction: 0.78,
    restraint: 0.88,
    engagement: 0.34,
    leavePressure: 0.44,
  },
};

export const COFFEE_DEV_SOCIAL_FIELDS: Array<{
  key: keyof CoffeeBotSocialSnapshot;
  label: string;
}> = [
  { key: "disposition", label: "Disposition" },
  { key: "valuesFriction", label: "Friction" },
  { key: "restraint", label: "Restraint" },
  { key: "engagement", label: "Engagement" },
  { key: "leavePressure", label: "Leave pressure" },
];

export function coffeeDevMoodPresetPayload(
  preset: BotMoodKey
): CoffeeBotSocialSnapshot {
  return { ...COFFEE_DEV_MOOD_PRESETS[preset] };
}

export function formatCoffeeSeatDebugCoordinates(args: {
  mode: CoffeeTableCoordinateMode;
  seatCount: number;
  layoutIndex: number;
  seatIndex: number;
  botId: string;
  botName: string;
  leftPct: number;
  topPct: number;
}): string {
  const leftPct = Number(args.leftPct.toFixed(1));
  const topPct = Number(args.topPct.toFixed(1));
  const css = `.coffeeSeat[data-seat-count="${args.seatCount}"][data-layout-seat="${args.layoutIndex}"] { left: ${leftPct}%; top: ${topPct}%; }`;
  const json = JSON.stringify({
    mode: args.mode,
    seatCount: args.seatCount,
    layoutSeat: args.layoutIndex,
    seatIndex: args.seatIndex,
    botId: args.botId,
    botName: args.botName,
    leftPct,
    topPct,
  });
  return `${css}\n\n${json}`;
}
