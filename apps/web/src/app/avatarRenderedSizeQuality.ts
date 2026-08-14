export type AvatarRenderedSizeTier = "full" | "compact" | "micro";

export const BOT_AVATAR_MICRO_ENTER_MAX_PX = 118;
export const BOT_AVATAR_MICRO_EXIT_MIN_PX = 132;
export const BOT_AVATAR_COMPACT_ENTER_MAX_PX = 224;
export const BOT_AVATAR_COMPACT_EXIT_MIN_PX = 248;

/**
 * Selects avatar material detail from final on-screen width. Separate enter
 * and exit thresholds prevent camera easing and fractional layout from
 * repeatedly remounting a renderer at a boundary.
 */
export function avatarRenderedSizeTierForMeasurements(
  authoredWidthPx: number,
  renderedWidthPx: number,
  currentTier: AvatarRenderedSizeTier = "full",
): AvatarRenderedSizeTier {
  if (
    !Number.isFinite(authoredWidthPx) ||
    authoredWidthPx <= 0 ||
    !Number.isFinite(renderedWidthPx) ||
    renderedWidthPx <= 0
  ) {
    return currentTier;
  }

  if (
    authoredWidthPx <
    (currentTier === "micro"
      ? BOT_AVATAR_MICRO_EXIT_MIN_PX
      : BOT_AVATAR_MICRO_ENTER_MAX_PX)
  ) {
    return "micro";
  }

  if (currentTier === "compact" || currentTier === "micro") {
    return renderedWidthPx >= BOT_AVATAR_COMPACT_EXIT_MIN_PX
      ? "full"
      : "compact";
  }

  return renderedWidthPx < BOT_AVATAR_COMPACT_ENTER_MAX_PX
    ? "compact"
    : "full";
}
