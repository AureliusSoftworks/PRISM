export type AvatarRenderedSizeTier = "full" | "compact" | "micro";

export const BOT_AVATAR_MICRO_ENTER_MAX_PX = 59;
export const BOT_AVATAR_MICRO_EXIT_MIN_PX = 60;
export const BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX = 40;
export const BOT_AVATAR_COMPACT_ENTER_MAX_PX = 224;
export const BOT_AVATAR_COMPACT_EXIT_MIN_PX = 248;

/**
 * Selects avatar material detail from final on-screen width. Separate enter
 * and exit thresholds prevent camera easing and fractional layout from
 * repeatedly remounting a renderer at a boundary.
 */
export function avatarRenderedSizeTierForMeasurements(
  _authoredWidthPx: number,
  renderedWidthPx: number,
  currentTier: AvatarRenderedSizeTier = "full",
): AvatarRenderedSizeTier {
  if (
    !Number.isFinite(renderedWidthPx) ||
    renderedWidthPx <= 0
  ) {
    return currentTier;
  }

  if (
    renderedWidthPx <
    (currentTier === "micro"
      ? BOT_AVATAR_MICRO_EXIT_MIN_PX
      : BOT_AVATAR_MICRO_ENTER_MAX_PX + 1)
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
