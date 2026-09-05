export const WHODUNNIT_CUSTOM_MANSION_ROOM_MAX = 18;

export function whodunnitCustomMansionRoomMinimum(
  suspectCount: number,
): number {
  const normalizedSuspects = Number.isFinite(suspectCount)
    ? Math.max(4, Math.min(8, Math.floor(suspectCount)))
    : 4;
  return Math.max(5, normalizedSuspects + 1);
}

export function normalizeWhodunnitCustomMansionRoomCount(
  value: number | string,
  suspectCount: number,
): number {
  const minimum = whodunnitCustomMansionRoomMinimum(suspectCount);
  const numeric = typeof value === "number" ? value : Number(value);
  const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : minimum;
  return Math.max(
    minimum,
    Math.min(WHODUNNIT_CUSTOM_MANSION_ROOM_MAX, normalized),
  );
}
