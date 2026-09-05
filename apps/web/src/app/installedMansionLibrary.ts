import {
  debateMysteryMansionHeldByArchiveV1,
  debateMysteryMansionThumbnailAssetIdV1,
  type DebateMysteryMansionBundleSummaryV1,
  type DebateMysteryMansionExteriorScaleClassV1,
} from "@localai/shared";
import { debateMysteryMansionExteriorFallbackV1 } from "./debateMysteryMansionExterior.ts";

export { frozenMansionExteriorThumbnailAssetIdV1 } from "@localai/shared";

const MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID = "library-thumbnail-override-v1";

export interface InstalledMansionPresentationV1 {
  title: string;
  description: string;
  thumbnailAssetId: string | null;
  defaultTitle: string;
  defaultDescription: string;
  defaultThumbnailAssetId: string | null;
  titleOverride: string | null;
  descriptionOverride: string | null;
  thumbnailOverrideAssetId: string | null;
}

export interface InstalledMansionLibraryUpdateV1 {
  title?: string | null;
  description?: string | null;
  thumbnailDataUrl?: string | null;
}

export interface InstalledMansionOriginV1 {
  kind: "imported" | "created" | "derived";
  label: "Imported" | "Created here" | "Derived";
  description: string;
}

function legacyDefaultThumbnailAssetId(
  mansion: DebateMysteryMansionBundleSummaryV1,
): string | null {
  return mansion.assets?.find(
    (asset) =>
      asset.role === "presentation" &&
      asset.logicalId !== MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID,
  )?.id ?? null;
}

export function resolveInstalledMansionPresentationV1(
  mansion: DebateMysteryMansionBundleSummaryV1,
): InstalledMansionPresentationV1 {
  const venueProfile = mansion.layoutV2?.venueProfile;
  const venueDefaultDescription = venueProfile
    ? `${venueProfile.placeNoun} · ${venueProfile.tierLabels.length} ${venueProfile.kind === "vessel" ? "deck" : "tier"}${venueProfile.tierLabels.length === 1 ? "" : "s"} · ${mansion.totalRooms} rooms.`
    : `${mansion.houseStyle.label} mansion · ${mansion.floors} floor${mansion.floors === 1 ? "" : "s"} · ${mansion.totalRooms} rooms.`;
  const defaultTitle = mansion.library?.defaults.title?.trim() || mansion.name;
  const defaultDescription = mansion.library?.defaults.description?.trim() ||
    mansion.portable?.description?.trim() ||
    venueDefaultDescription;
  const presentationAssetIds = new Set(
    (mansion.assets ?? []).filter((asset) => asset.role === "presentation").map((asset) => asset.id),
  );
  const fileDefaultThumbnail = mansion.library?.defaults.thumbnailAssetId ?? null;
  const defaultThumbnailAssetId = fileDefaultThumbnail && presentationAssetIds.has(fileDefaultThumbnail)
    ? fileDefaultThumbnail
    : legacyDefaultThumbnailAssetId(mansion);
  const titleOverride = mansion.library?.overrides.title?.trim() || null;
  const descriptionOverride = mansion.library?.overrides.description?.trim() || null;
  const fileThumbnailOverride = mansion.library?.overrides.thumbnailAssetId ?? null;
  const thumbnailOverrideAssetId = fileThumbnailOverride && presentationAssetIds.has(fileThumbnailOverride)
    ? fileThumbnailOverride
    : null;
  return {
    title: titleOverride ?? defaultTitle,
    description: descriptionOverride ?? defaultDescription,
    thumbnailAssetId: debateMysteryMansionThumbnailAssetIdV1(mansion),
    defaultTitle,
    defaultDescription,
    defaultThumbnailAssetId,
    titleOverride,
    descriptionOverride,
    thumbnailOverrideAssetId,
  };
}

export function installedMansionThumbnailUrlV1(
  mansionId: string,
  assetId: string | null,
): string | null {
  return assetId
    ? `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/assets/${encodeURIComponent(assetId)}/file`
    : null;
}

export function installedMansionThumbnailSourceV1(
  mansion: DebateMysteryMansionBundleSummaryV1,
  assetId: string | null,
): string | null {
  return installedMansionExteriorPreviewV1({
    mansion,
    assetId,
    scaleClass: mansion.scaleClass,
  }).url;
}

export interface InstalledMansionExteriorPreviewV1 {
  url: string;
  scaleClass: DebateMysteryMansionExteriorScaleClassV1;
  /** Included PRISM families can switch art immediately without synthesis. */
  switchesWithTopology: boolean;
  /** One-off package/custom covers remain visible until explicitly replaced. */
  stale: boolean;
}

/**
 * Mansion Editor preview contract. A mansion using PRISM's included family has
 * all three covers available, so topology changes switch the preview at once.
 * A custom protected cover is retained and marked stale instead.
 */
export function installedMansionExteriorPreviewV1(args: {
  mansion: DebateMysteryMansionBundleSummaryV1;
  assetId: string | null;
  scaleClass: DebateMysteryMansionExteriorScaleClassV1;
}): InstalledMansionExteriorPreviewV1 {
  const { mansion, assetId, scaleClass } = args;
  const resolvedScaleClass = scaleClass || mansion.scaleClass || "standard";
  const acceptedExteriorScaleClass =
    mansion.derivation?.acceptedExteriorScaleClass ?? mansion.scaleClass ?? "standard";
  const protectedAssetId = assetId && mansion.assets?.some(
    (asset) => asset.id === assetId && asset.role === "presentation",
  )
    ? assetId
    : null;
  const protectedAssetUrl = installedMansionThumbnailUrlV1(mansion.id, protectedAssetId);
  if (protectedAssetUrl) {
    return {
      url: protectedAssetUrl,
      scaleClass: resolvedScaleClass,
      switchesWithTopology: false,
      stale: resolvedScaleClass !== acceptedExteriorScaleClass,
    };
  }
  return {
    url: debateMysteryMansionExteriorFallbackV1(
      mansion.houseStyle,
      resolvedScaleClass,
      mansion.layoutV2?.venueProfile,
    ),
    scaleClass: resolvedScaleClass,
    switchesWithTopology: true,
    stale: false,
  };
}

export function installedMansionOriginV1(
  mansion: DebateMysteryMansionBundleSummaryV1,
): InstalledMansionOriginV1 {
  if (mansion.derivation) {
    return {
      kind: "derived",
      label: "Derived",
      description: `Editable copy of ${mansion.derivation.sourceTitle}`,
    };
  }
  return mansion.portable
    ? {
        kind: "imported",
        label: "Imported",
        description: "Imported from a portable .mansion package",
      }
    : {
        kind: "created",
        label: "Created here",
        description: "Created in PRISM from a saved mansion level",
      };
}

function secureRandomUint32(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] ?? 0;
}

/** Avoids immediately returning the current mansion when another installed
 * option exists. Venues held by an unfinished Archive case are skipped.
 * The optional value pins focused tests without render-time randomness. */
export function randomInstalledMansionIdV1(
  mansions: readonly Pick<DebateMysteryMansionBundleSummaryV1, "id" | "archiveHold">[],
  currentId: string,
  randomUint32 = secureRandomUint32(),
): string | null {
  const available = mansions.filter((mansion) => !debateMysteryMansionHeldByArchiveV1(mansion));
  if (available.length === 0) return null;
  const candidates = available.length > 1
    ? available.filter((mansion) => mansion.id !== currentId)
    : [...available];
  const pool = candidates.length > 0 ? candidates : available;
  return pool[(randomUint32 >>> 0) % pool.length]?.id ?? null;
}
