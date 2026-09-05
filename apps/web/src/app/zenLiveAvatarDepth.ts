/** Pure direction and pixel-registration contracts for Zen's roaming avatar. */

export type ZenLiveAvatarFacing = "left" | "right";

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
