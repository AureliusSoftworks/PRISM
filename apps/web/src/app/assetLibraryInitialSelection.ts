import type { ImageAssetSet } from "@localai/shared";

export async function resolveAssetLibraryInitialSelection({
  assets,
  initialAssetId,
  loadExact,
}: {
  assets: readonly ImageAssetSet[];
  initialAssetId: string;
  loadExact: (assetId: string) => Promise<ImageAssetSet | null>;
}): Promise<ImageAssetSet | null> {
  const assetId = initialAssetId.trim();
  if (!assetId) return null;
  const visibleAsset = assets.find((asset) => asset.id === assetId);
  if (visibleAsset) return visibleAsset;
  const exactAsset = await loadExact(assetId);
  return exactAsset?.id === assetId ? exactAsset : null;
}
