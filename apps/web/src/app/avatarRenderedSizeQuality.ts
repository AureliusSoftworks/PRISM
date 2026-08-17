export type AvatarRenderedSizeTier = "full" | "compact" | "micro";

export const BOT_AVATAR_MICRO_ENTER_MAX_PX = 80;
export const BOT_AVATAR_MICRO_EXIT_MIN_PX = 81;
export const BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX = 28;
export const BOT_AVATAR_MICRO_BLOCK_MAX_PX = 8;
export const BOT_AVATAR_MICRO_PIXEL_MAX_PX = 1;
export const BOT_AVATAR_COMPACT_ENTER_MAX_PX = 300;
export const BOT_AVATAR_COMPACT_EXIT_MIN_PX = 300;

export type BotAvatarMicroPresentation =
  | "face"
  | "glyph"
  | "block"
  | "pixel";

export function botAvatarMicroPresentationForSize(
  renderedSizePx: number | null | undefined,
): BotAvatarMicroPresentation {
  if (!Number.isFinite(renderedSizePx ?? Number.NaN)) return "face";
  if (renderedSizePx! <= BOT_AVATAR_MICRO_PIXEL_MAX_PX) return "pixel";
  if (renderedSizePx! <= BOT_AVATAR_MICRO_BLOCK_MAX_PX) return "block";
  if (renderedSizePx! <= BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX) return "glyph";
  return "face";
}

const AVATAR_RENDERED_SIZE_TIER_RANK: Record<AvatarRenderedSizeTier, number> = {
  micro: 0,
  compact: 1,
  full: 2,
};

export function avatarRenderedSizeTierWithMinimum(
  tier: AvatarRenderedSizeTier,
  minimumTier: AvatarRenderedSizeTier = "micro",
): AvatarRenderedSizeTier {
  return AVATAR_RENDERED_SIZE_TIER_RANK[tier] <
    AVATAR_RENDERED_SIZE_TIER_RANK[minimumTier]
    ? minimumTier
    : tier;
}

/**
 * Selects avatar material detail from final on-screen width. The global
 * boundaries are exact so every surface agrees on the Full/Mini/Micro bands.
 */
export function avatarRenderedSizeTierForMeasurements(
  _authoredWidthPx: number,
  renderedWidthPx: number,
  currentTier: AvatarRenderedSizeTier = "full",
  minimumTier: AvatarRenderedSizeTier = "micro",
): AvatarRenderedSizeTier {
  if (!Number.isFinite(renderedWidthPx) || renderedWidthPx <= 0) {
    return avatarRenderedSizeTierWithMinimum(currentTier, minimumTier);
  }

  let measuredTier: AvatarRenderedSizeTier;
  if (
    renderedWidthPx <
    (currentTier === "micro"
      ? BOT_AVATAR_MICRO_EXIT_MIN_PX
      : BOT_AVATAR_MICRO_ENTER_MAX_PX + 1)
  ) {
    measuredTier = "micro";
  } else if (currentTier === "compact" || currentTier === "micro") {
    measuredTier = renderedWidthPx >= BOT_AVATAR_COMPACT_EXIT_MIN_PX
      ? "full"
      : "compact";
  } else {
    measuredTier = renderedWidthPx < BOT_AVATAR_COMPACT_ENTER_MAX_PX
      ? "compact"
      : "full";
  }

  return avatarRenderedSizeTierWithMinimum(measuredTier, minimumTier);
}
