export const LIVE_CAPTION_SIZES = [
  { value: "small", label: "Small", percent: 85 },
  { value: "medium", label: "Medium", percent: 100 },
  { value: "large", label: "Large", percent: 120 },
  { value: "extra-large", label: "Extra large", percent: 140 },
] as const;

export type LiveCaptionSize = (typeof LIVE_CAPTION_SIZES)[number]["value"];

export const DEFAULT_LIVE_CAPTION_SIZE: LiveCaptionSize = "medium";

type CaptionSizeStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeLiveCaptionSize(value: unknown): LiveCaptionSize {
  return LIVE_CAPTION_SIZES.some((option) => option.value === value)
    ? (value as LiveCaptionSize)
    : DEFAULT_LIVE_CAPTION_SIZE;
}

export function liveCaptionSizeDetails(size: LiveCaptionSize): {
  label: string;
  percent: number;
} {
  const option =
    LIVE_CAPTION_SIZES.find((option) => option.value === size) ??
    LIVE_CAPTION_SIZES[1];
  return { label: option.label, percent: option.percent };
}

export function stepLiveCaptionSize(
  size: LiveCaptionSize,
  direction: -1 | 1,
): LiveCaptionSize {
  const currentIndex = LIVE_CAPTION_SIZES.findIndex(
    (option) => option.value === size,
  );
  const nextIndex = Math.max(
    0,
    Math.min(LIVE_CAPTION_SIZES.length - 1, currentIndex + direction),
  );
  return LIVE_CAPTION_SIZES[nextIndex]?.value ?? DEFAULT_LIVE_CAPTION_SIZE;
}

export function readLiveCaptionSize(
  storage: Pick<CaptionSizeStorage, "getItem"> | null | undefined,
  key: string,
): LiveCaptionSize {
  if (!storage) return DEFAULT_LIVE_CAPTION_SIZE;
  try {
    return normalizeLiveCaptionSize(storage.getItem(key));
  } catch {
    return DEFAULT_LIVE_CAPTION_SIZE;
  }
}

export function writeLiveCaptionSize(
  storage: Pick<CaptionSizeStorage, "setItem"> | null | undefined,
  key: string,
  size: LiveCaptionSize,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, size);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}
