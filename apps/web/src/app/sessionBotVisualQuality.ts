import type { PrismSceneQuality } from "./prismSceneRuntime";

/**
 * Session applets trade decorative avatar materials for cast size. The face,
 * authored Ink, identity color, and speech motion are semantic and never enter
 * this budget.
 */
export type SessionBotVisualQuality =
  | "full"
  | "balanced"
  | "reduced"
  | "minimal";

const PRISM_SCENE_QUALITY_RANK: Readonly<Record<PrismSceneQuality, number>> = {
  full: 0,
  balanced: 1,
  minimal: 2,
};

function normalizedVisibleBotCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function sessionBotVisualQualityForVisibleCount(
  visibleBotCount: number,
): SessionBotVisualQuality {
  const count = normalizedVisibleBotCount(visibleBotCount);
  if (count <= 2) return "full";
  if (count === 3) return "balanced";
  if (count === 4) return "reduced";
  return "minimal";
}

export function sessionBotSceneQualityCeilingForVisibleCount(
  visibleBotCount: number,
): PrismSceneQuality {
  const quality = sessionBotVisualQualityForVisibleCount(visibleBotCount);
  if (quality === "full") return "full";
  if (quality === "minimal") return "minimal";
  return "balanced";
}

export function mostRestrictivePrismSceneQuality(
  ...qualities: readonly PrismSceneQuality[]
): PrismSceneQuality {
  return qualities.reduce<PrismSceneQuality>(
    (current, quality) =>
      PRISM_SCENE_QUALITY_RANK[quality] >
      PRISM_SCENE_QUALITY_RANK[current]
        ? quality
        : current,
    "full",
  );
}
