/** Pure depth and direction contracts for Zen's roaming live avatar. */

export type ZenLiveAvatarDepthMode = "mini" | "full";
export type ZenLiveAvatarFacing = "left" | "right";

export const ZEN_LIVE_AVATAR_MINI_SIZE_PX = 184;
export const ZEN_LIVE_AVATAR_FULL_MIN_SIZE_PX = 240;
export const ZEN_LIVE_AVATAR_FULL_MAX_SIZE_PX = 480;

// A small hysteresis band prevents a resting avatar from repeatedly swapping
// renderer tiers at the depth seam.
const FULL_DEPTH_ENTER = 0.56;
const FULL_DEPTH_EXIT = 0.46;
const FULL_SIZE_QUANTUM_PX = 2;
const VIEWPORT_EDGE_MARGIN_PX = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveZenLiveAvatarDepth(input: {
  y: number;
  viewportHeight: number;
  previousMode: ZenLiveAvatarDepthMode;
}): { mode: ZenLiveAvatarDepthMode; sizePx: number; progress: number } {
  // Normalize against the top-left travel available to the largest chassis.
  // Matching the viewport clamp's edge margin makes the floor a stable 480px
  // endpoint instead of letting the bot's own changing height move the goal.
  const usableDepthTravel = Math.max(
    1,
    input.viewportHeight -
      ZEN_LIVE_AVATAR_FULL_MAX_SIZE_PX -
      VIEWPORT_EDGE_MARGIN_PX,
  );
  const progress = clamp(input.y / usableDepthTravel, 0, 1);
  const mode =
    input.previousMode === "full"
      ? progress >= FULL_DEPTH_EXIT
        ? "full"
        : "mini"
      : progress >= FULL_DEPTH_ENTER
        ? "full"
        : "mini";
  if (mode === "mini") {
    return { mode, sizePx: ZEN_LIVE_AVATAR_MINI_SIZE_PX, progress };
  }
  const fullProgress = clamp(
    (progress - FULL_DEPTH_ENTER) / (1 - FULL_DEPTH_ENTER),
    0,
    1,
  );
  const rawSizePx =
    ZEN_LIVE_AVATAR_FULL_MIN_SIZE_PX +
    fullProgress *
      (ZEN_LIVE_AVATAR_FULL_MAX_SIZE_PX - ZEN_LIVE_AVATAR_FULL_MIN_SIZE_PX);
  return {
    mode,
    // Scale the complete authored raster in small, stable steps. This keeps
    // face, Ink, chassis and glass on the same sampling grid while roaming.
    sizePx:
      Math.round(rawSizePx / FULL_SIZE_QUANTUM_PX) * FULL_SIZE_QUANTUM_PX,
    progress,
  };
}

/** A visible horizontal step always updates facing before the step is shown. */
export function resolveZenLiveAvatarFacingForTravel(
  previousFacing: ZenLiveAvatarFacing,
  horizontalDeltaPx: number,
): ZenLiveAvatarFacing {
  if (horizontalDeltaPx > 0.01) return "right";
  if (horizontalDeltaPx < -0.01) return "left";
  return previousFacing;
}

/** Pixel snapping keeps the face and authored Ink on one stable raster grid. */
export function snapZenLiveAvatarPositionForPresentation<T extends {
  x: number;
  y: number;
}>(position: T): T {
  return { ...position, x: Math.round(position.x), y: Math.round(position.y) };
}
