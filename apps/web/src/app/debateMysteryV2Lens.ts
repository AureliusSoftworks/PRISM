interface MysteryLensPoint {
  x: number;
  y: number;
}

export interface MysteryLensHotspot {
  id: string;
  polygon: MysteryLensPoint[];
  unlocked: boolean;
  examined: boolean;
}

export interface MysteryLensState {
  x: number;
  y: number;
  proximity: number;
  hotspotId: string | null;
}

const LENS_PROXIMITY_RADIUS = 26;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function debateMysteryV2HotspotCenter(
  polygon: readonly MysteryLensPoint[],
): MysteryLensPoint {
  if (polygon.length === 0) return { x: 50, y: 50 };
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return {
    x: clampPercent((Math.min(...xs) + Math.max(...xs)) / 2),
    y: clampPercent((Math.min(...ys) + Math.max(...ys)) / 2),
  };
}

export function resolveDebateMysteryV2Lens(
  x: number,
  y: number,
  hotspots: readonly MysteryLensHotspot[],
): MysteryLensState {
  const lensX = clampPercent(x);
  const lensY = clampPercent(y);
  let nearest: { id: string; distance: number } | null = null;
  for (const hotspot of hotspots) {
    if (!hotspot.unlocked || hotspot.examined) continue;
    const center = debateMysteryV2HotspotCenter(hotspot.polygon);
    const distance = Math.hypot(lensX - center.x, lensY - center.y);
    if (!nearest || distance < nearest.distance) nearest = { id: hotspot.id, distance };
  }
  return {
    x: lensX,
    y: lensY,
    proximity: nearest ? Math.max(0, 1 - nearest.distance / LENS_PROXIMITY_RADIUS) : 0,
    hotspotId: nearest?.id ?? null,
  };
}

/**
 * The glow and click must share this exact contract: a lens only resolves an
 * available hotspot while it is close enough to produce a visible glow.
 */
export function debateMysteryV2LensClickTarget(
  lens: Pick<MysteryLensState, "hotspotId" | "proximity">,
): string | null {
  return lens.proximity > 0 ? lens.hotspotId : null;
}

export function debateMysteryV2RoomComplete(
  hotspots: readonly Pick<MysteryLensHotspot, "examined">[],
): boolean {
  return hotspots.length > 0 && hotspots.every((hotspot) => hotspot.examined);
}

export function debateMysteryV2ExaminationCompletesRoom(
  hotspots: readonly Pick<MysteryLensHotspot, "id" | "examined">[],
  hotspotId: string,
): boolean {
  return hotspots.length > 0 && hotspots.every(
    (hotspot) => hotspot.examined || hotspot.id === hotspotId,
  );
}
