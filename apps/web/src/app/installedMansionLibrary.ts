import type { DebateMysteryMansionBundleSummaryV1 } from "@localai/shared";

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

function legacyDefaultThumbnailAssetId(
  mansion: DebateMysteryMansionBundleSummaryV1,
): string | null {
  return mansion.assets?.find((asset) => asset.role === "presentation")?.id ??
    mansion.assets?.find((asset) => asset.role === "room")?.id ??
    null;
}

export function resolveInstalledMansionPresentationV1(
  mansion: DebateMysteryMansionBundleSummaryV1,
): InstalledMansionPresentationV1 {
  const defaultTitle = mansion.library?.defaults.title?.trim() || mansion.name;
  const defaultDescription = mansion.library?.defaults.description?.trim() ||
    mansion.portable?.description?.trim() ||
    `${mansion.houseStyle.label} mansion · ${mansion.floors} floor${mansion.floors === 1 ? "" : "s"} · ${mansion.totalRooms} rooms.`;
  const defaultThumbnailAssetId = mansion.library?.defaults.thumbnailAssetId ??
    legacyDefaultThumbnailAssetId(mansion);
  const titleOverride = mansion.library?.overrides.title?.trim() || null;
  const descriptionOverride = mansion.library?.overrides.description?.trim() || null;
  const thumbnailOverrideAssetId = mansion.library?.overrides.thumbnailAssetId ?? null;
  return {
    title: titleOverride ?? defaultTitle,
    description: descriptionOverride ?? defaultDescription,
    thumbnailAssetId: thumbnailOverrideAssetId ?? defaultThumbnailAssetId,
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

function secureRandomUint32(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] ?? 0;
}

/** Avoids immediately returning the current mansion when another installed
 * option exists. The optional value pins focused tests without render-time
 * randomness. */
export function randomInstalledMansionIdV1(
  mansions: readonly Pick<DebateMysteryMansionBundleSummaryV1, "id">[],
  currentId: string,
  randomUint32 = secureRandomUint32(),
): string | null {
  if (mansions.length === 0) return null;
  const candidates = mansions.length > 1
    ? mansions.filter((mansion) => mansion.id !== currentId)
    : [...mansions];
  return candidates[(randomUint32 >>> 0) % candidates.length]?.id ?? null;
}
