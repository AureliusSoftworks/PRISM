export interface BotAccessoryPlacement {
  xPct: number;
  yPct: number;
  sizePct: number;
  layer: BotAccessoryLayer;
}

export interface BotAccessoryArchivePlacement extends BotAccessoryPlacement {
  anchor: "avatar";
}

export type BotAccessoryLayer = "front" | "back";

export const BOT_ACCESSORY_PLACEMENT_X_PCT_MIN = -90;
export const BOT_ACCESSORY_PLACEMENT_X_PCT_MAX = 90;
export const BOT_ACCESSORY_PLACEMENT_Y_PCT_MIN = -120;
export const BOT_ACCESSORY_PLACEMENT_Y_PCT_MAX = 120;
export const BOT_ACCESSORY_PLACEMENT_SIZE_PCT_MIN = 40;
export const BOT_ACCESSORY_PLACEMENT_SIZE_PCT_MAX = 170;

export const DEFAULT_BOT_ACCESSORY_PLACEMENT: BotAccessoryPlacement = {
  xPct: 0,
  yPct: 0,
  sizePct: 100,
  layer: "front",
};

export const DEFAULT_BOT_ACCESSORY_ARCHIVE_PLACEMENT: BotAccessoryArchivePlacement = {
  anchor: "avatar",
  ...DEFAULT_BOT_ACCESSORY_PLACEMENT,
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function readPlacementRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

export function normalizeBotAccessoryLayer(input: unknown): BotAccessoryLayer {
  return input === "back" ? "back" : "front";
}

export function normalizeBotAccessoryPlacement(input: unknown): BotAccessoryPlacement {
  const record = readPlacementRecord(input);
  const xPct = finiteNumber(record.xPct) ?? DEFAULT_BOT_ACCESSORY_PLACEMENT.xPct;
  const yPct = finiteNumber(record.yPct) ?? DEFAULT_BOT_ACCESSORY_PLACEMENT.yPct;
  const sizePct = finiteNumber(record.sizePct) ?? DEFAULT_BOT_ACCESSORY_PLACEMENT.sizePct;
  const layer = normalizeBotAccessoryLayer(record.layer);
  return {
    xPct: cleanPercent(
      clamp(xPct, BOT_ACCESSORY_PLACEMENT_X_PCT_MIN, BOT_ACCESSORY_PLACEMENT_X_PCT_MAX)
    ),
    yPct: cleanPercent(
      clamp(yPct, BOT_ACCESSORY_PLACEMENT_Y_PCT_MIN, BOT_ACCESSORY_PLACEMENT_Y_PCT_MAX)
    ),
    sizePct: cleanPercent(
      clamp(sizePct, BOT_ACCESSORY_PLACEMENT_SIZE_PCT_MIN, BOT_ACCESSORY_PLACEMENT_SIZE_PCT_MAX)
    ),
    layer,
  };
}

export function normalizeBotAccessoryArchivePlacement(
  input: unknown
): BotAccessoryArchivePlacement | null {
  const record = readPlacementRecord(input);
  if (record.anchor !== "avatar") return null;
  return {
    anchor: "avatar",
    ...normalizeBotAccessoryPlacement(record),
  };
}

export function botAccessoryPlacementsEqual(
  a: BotAccessoryPlacement,
  b: BotAccessoryPlacement
): boolean {
  return (
    a.xPct === b.xPct &&
    a.yPct === b.yPct &&
    a.sizePct === b.sizePct &&
    a.layer === b.layer
  );
}
