import type {
  DebateMysteryRegionV1,
  DebateMysteryRoomTemplateV1,
} from "@localai/shared";

/** User-generated room art wins; bundled art is always a same-origin fallback. */
export function mysteryRoomArtworkSrc(
  imageId: string | null,
  template: DebateMysteryRoomTemplateV1,
): string | null {
  if (imageId) return `/api/images/${encodeURIComponent(imageId)}/file`;
  return template.bundledAssetPath ?? null;
}

export interface MysteryInvestigationTarget {
  regionId: string | null;
  distance: number;
  inspected: boolean;
}

/**
 * Resolve against every physical hotspot, including completed ones. Filtering
 * completed regions before hit-testing lets one screen coordinate "fall
 * through" to a different clue as results arrive.
 */
export function mysteryInvestigationTargetAt(
  regions: readonly DebateMysteryRegionV1[],
  inspectedRegionIds: readonly string[],
  x: number,
  y: number,
): MysteryInvestigationTarget {
  const nearest = regions.reduce<{ regionId: string | null; distance: number }>(
    (result, region) => {
      const center = region.polygon.reduce(
        (total, point) => ({
          x: total.x + point.x / region.polygon.length,
          y: total.y + point.y / region.polygon.length,
        }),
        { x: 0, y: 0 },
      );
      const distance = Math.hypot(center.x - x, center.y - y);
      return distance < result.distance
        ? { regionId: region.id, distance }
        : result;
    },
    { regionId: null, distance: Number.POSITIVE_INFINITY },
  );
  return {
    ...nearest,
    inspected:
      nearest.regionId !== null && inspectedRegionIds.includes(nearest.regionId),
  };
}
