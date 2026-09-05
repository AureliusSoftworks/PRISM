import {
  mansionSfxActiveAssetIdsV1,
  type DebateMysteryMansionSnapshotV2,
  type WhodunnitSfxCueIdV1,
} from "@localai/shared";

/**
 * Resolves the venue effects pack a case plays with. The pack is frozen in
 * the case's venue snapshot like every other venue asset, so a case keeps the
 * clips it was forged with even after the library venue changes, and a venue
 * without a pack yields null so the bundled palette plays.
 */
export function mysteryVenueSfxUrlsV1(
  snapshot: DebateMysteryMansionSnapshotV2 | null | undefined,
): Partial<Record<WhodunnitSfxCueIdV1, string>> | null {
  const assets = snapshot?.presentation?.assets;
  if (!snapshot || !Array.isArray(assets) || assets.length === 0) return null;
  const entries = Object.entries(mansionSfxActiveAssetIdsV1(assets)) as Array<[WhodunnitSfxCueIdV1, string]>;
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([cueId, assetId]) => [
    cueId,
    `/api/debates/mystery-mansions/${encodeURIComponent(snapshot.sourceBundleId)}/assets/${encodeURIComponent(assetId)}/file`,
  ]));
}
