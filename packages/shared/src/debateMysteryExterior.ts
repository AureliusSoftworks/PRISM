import {
  debateMysteryAcousticThemePaletteV1,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryMansionBundleSummaryV1,
  type DebateMysteryMansionExteriorScaleClassV1,
  type DebateMysteryMansionSnapshotV2,
} from "./debateMysteryV2.js";
import type { MysteryVenueProfileV1 } from "./mansionLayoutV2.js";

export const DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1 = {
  "abstract-venue-v1": {
    compact: "/debate/mystery/exteriors/abstract-venue-compact-v1.svg",
    standard: "/debate/mystery/exteriors/abstract-venue-standard-v1.svg",
    grand: "/debate/mystery/exteriors/abstract-venue-grand-v1.svg",
  },
  "gothic-old-house-v1": {
    compact: "/debate/mystery/exteriors/gothic-old-house-compact-v1.webp",
    standard: "/debate/mystery/exteriors/gothic-old-house-standard-v1.webp",
    grand: "/debate/mystery/exteriors/gothic-old-house-grand-v1.webp",
  },
  "spacecraft-industrial-v1": {
    compact: "/debate/mystery/exteriors/spacecraft-industrial-compact-v1.webp",
    standard: "/debate/mystery/exteriors/spacecraft-industrial-standard-v1.webp",
    grand: "/debate/mystery/exteriors/spacecraft-industrial-grand-v1.webp",
  },
  "jungle-wilderness-v1": {
    compact: "/debate/mystery/exteriors/jungle-wilderness-compact-v1.webp",
    standard: "/debate/mystery/exteriors/jungle-wilderness-standard-v1.webp",
    grand: "/debate/mystery/exteriors/jungle-wilderness-grand-v1.webp",
  },
  "maritime-passenger-v1": {
    compact: "/debate/mystery/exteriors/maritime-passenger-compact-v1.webp",
    standard: "/debate/mystery/exteriors/maritime-passenger-standard-v1.webp",
    grand: "/debate/mystery/exteriors/maritime-passenger-grand-v1.webp",
  },
  "neutral-mansion-v1": {
    compact: "/debate/mystery/exteriors/prism-house-compact-v1.webp",
    standard: "/debate/mystery/exteriors/prism-house-standard-v1.webp",
    grand: "/debate/mystery/exteriors/prism-house-grand-v1.webp",
  },
} as const;

export type DebateMysteryMansionExteriorFamilyV1 =
  keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1;

export interface DebateMysteryMansionDoorTargetV1 {
  xPercent: number;
  yPercent: number;
}

export interface DebateMysteryExteriorPlaneRectV1 {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DebateMysteryExteriorClientPointV1 {
  clientX: number;
  clientY: number;
}

const clampExteriorEntryCoordinateV1 = (value: number): number =>
  Math.max(0, Math.min(1, value));

/** Accepts only finite normalized-point input and clamps numeric overshoot. */
export function normalizeDebateMysteryExteriorEntryTargetV1(
  value: unknown,
): { x: number; y: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { x?: unknown; y?: unknown };
  if (
    typeof candidate.x !== "number" ||
    !Number.isFinite(candidate.x) ||
    typeof candidate.y !== "number" ||
    !Number.isFinite(candidate.y)
  ) {
    return null;
  }
  return {
    x: clampExteriorEntryCoordinateV1(candidate.x),
    y: clampExteriorEntryCoordinateV1(candidate.y),
  };
}

/** Converts a viewport click against the rendered cover plane into image-space. */
export function debateMysteryExteriorEntryTargetFromClientPointV1(
  rect: DebateMysteryExteriorPlaneRectV1,
  point: DebateMysteryExteriorClientPointV1,
): { x: number; y: number } | null {
  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    !Number.isFinite(point.clientX) ||
    !Number.isFinite(point.clientY)
  ) {
    return null;
  }
  return normalizeDebateMysteryExteriorEntryTargetV1({
    x: (point.clientX - rect.left) / rect.width,
    y: (point.clientY - rect.top) / rect.height,
  });
}

const MANSION_LIBRARY_THUMBNAIL_OVERRIDE_LOGICAL_ID =
  "library-thumbnail-override-v1";

const DEBATE_MYSTERY_MANSION_DOOR_TARGETS_V1 = {
  "abstract-venue-v1": {
    compact: { xPercent: 50, yPercent: 60 },
    standard: { xPercent: 50, yPercent: 58 },
    grand: { xPercent: 50, yPercent: 56 },
  },
  "gothic-old-house-v1": {
    compact: { xPercent: 50, yPercent: 59 },
    standard: { xPercent: 50, yPercent: 55 },
    grand: { xPercent: 45, yPercent: 54 },
  },
  "spacecraft-industrial-v1": {
    compact: { xPercent: 54, yPercent: 58 },
    standard: { xPercent: 66, yPercent: 58 },
    grand: { xPercent: 54, yPercent: 50 },
  },
  "jungle-wilderness-v1": {
    compact: { xPercent: 47, yPercent: 55 },
    standard: { xPercent: 49, yPercent: 56 },
    grand: { xPercent: 45, yPercent: 57 },
  },
  "maritime-passenger-v1": {
    compact: { xPercent: 36, yPercent: 64 },
    // Reviewed against the standard passenger-vessel cover: the usable
    // gangway is beside the pier stairs, not the decorative bow plating.
    standard: { xPercent: 60, yPercent: 70 },
    grand: { xPercent: 22, yPercent: 60 },
  },
  "neutral-mansion-v1": {
    compact: { xPercent: 59, yPercent: 49 },
    standard: { xPercent: 60, yPercent: 44 },
    grand: { xPercent: 54, yPercent: 48 },
  },
} as const satisfies Record<
  DebateMysteryMansionExteriorFamilyV1,
  Record<DebateMysteryMansionExteriorScaleClassV1, DebateMysteryMansionDoorTargetV1>
>;

/**
 * Resolves the dedicated exterior frozen into a case snapshot. Legacy snapshots
 * sometimes pointed at room art, which must never become the venue entrance.
 */
export function frozenMansionExteriorThumbnailAssetIdV1(
  snapshot: DebateMysteryMansionSnapshotV2 | null | undefined,
): string | null {
  const assetId = snapshot?.presentation.thumbnailAssetId ?? null;
  return assetId && snapshot?.presentation.assets.some(
    (asset) => asset.id === assetId && asset.role === "presentation",
  )
    ? assetId
    : null;
}

/**
 * Selects the current dedicated Library cover with the same validation used by
 * every browser thumbnail consumer. Invalid or room-backed IDs are ignored.
 */
export function debateMysteryMansionThumbnailAssetIdV1(
  mansion: DebateMysteryMansionBundleSummaryV1,
): string | null {
  const presentationAssets = (mansion.assets ?? []).filter(
    (asset) => asset.role === "presentation",
  );
  const presentationAssetIds = new Set(
    presentationAssets.map((asset) => asset.id),
  );
  const overrideAssetId =
    mansion.library?.overrides.thumbnailAssetId ?? null;
  if (overrideAssetId && presentationAssetIds.has(overrideAssetId)) {
    return overrideAssetId;
  }
  const defaultAssetId = mansion.library?.defaults.thumbnailAssetId ?? null;
  if (defaultAssetId && presentationAssetIds.has(defaultAssetId)) {
    return defaultAssetId;
  }
  return presentationAssets.find(
    (asset) =>
      asset.logicalId !== MANSION_LIBRARY_THUMBNAIL_OVERRIDE_LOGICAL_ID,
  )?.id ?? null;
}

/**
 * Resolves the one exterior family shared by the browser and API. Keeping this
 * decision in the shared package prevents repairs from observing a different
 * cover than the one presented to the player.
 */
export function debateMysteryMansionExteriorFamilyV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  venueProfile?: Pick<MysteryVenueProfileV1, "kind" | "presentation"> | null,
): DebateMysteryMansionExteriorFamilyV1 {
  const declaredFamilies = venueProfile?.presentation
    ? [
        venueProfile.presentation.familyId,
        ...venueProfile.presentation.compatibleExteriorFamilies,
      ]
    : [];
  const declared = declaredFamilies.find(
    (family): family is DebateMysteryMansionExteriorFamilyV1 =>
      family in DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1,
  );
  if (declared) return declared;

  // A non-estate venue must not inherit a mansion photograph from acoustic
  // wording. Until a compatible family is installed, use its abstract cover.
  if (venueProfile && venueProfile.kind !== "estate") {
    return venueProfile.kind === "vessel" &&
        venueProfile.presentation?.familyId === "maritime-passenger-v1"
      ? "maritime-passenger-v1"
      : "abstract-venue-v1";
  }
  const inferredPalette = debateMysteryAcousticThemePaletteV1(
    `${houseStyle.label} ${houseStyle.promptContract ?? ""}`,
  );
  const palette = houseStyle.acousticThemePaletteId?.trim() || inferredPalette;
  return palette in DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1
    ? palette as DebateMysteryMansionExteriorFamilyV1
    : "neutral-mansion-v1";
}

export function debateMysteryMansionDoorTargetV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
  venueProfile?: Pick<MysteryVenueProfileV1, "kind" | "presentation"> | null,
): DebateMysteryMansionDoorTargetV1 {
  return DEBATE_MYSTERY_MANSION_DOOR_TARGETS_V1[
    debateMysteryMansionExteriorFamilyV1(houseStyle, venueProfile)
  ][scaleClass];
}

export function debateMysteryMansionExteriorFallbackV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
  venueProfile?: Pick<MysteryVenueProfileV1, "kind" | "presentation"> | null,
): string {
  const family = DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1[
    debateMysteryMansionExteriorFamilyV1(houseStyle, venueProfile)
  ];
  return family[scaleClass];
}
