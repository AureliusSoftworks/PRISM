import {
  normalizeGraphicsQuality,
  type GraphicsQuality,
} from "@localai/shared";
import type { PrismSceneQuality } from "./prismSceneRuntime";

export const GRAPHICS_QUALITY_LABELS: Readonly<
  Record<GraphicsQuality, { label: string; detail: string }>
> = {
  high: {
    label: "High",
    detail: "Current adaptive visuals, starting at full quality.",
  },
  medium: {
    label: "Medium",
    detail: "Adaptive visuals capped at balanced effects and resolution.",
  },
  low: {
    label: "Low",
    detail: "Minimal scene effects and paused decorative motion.",
  },
};

export function prismSceneQualityCeilingForGraphicsQuality(
  graphicsQuality: GraphicsQuality,
): PrismSceneQuality {
  if (graphicsQuality === "low") return "minimal";
  if (graphicsQuality === "medium") return "balanced";
  return "full";
}

export function applyGraphicsQualityToDocument(
  target: { documentElement: { dataset: Record<string, string | undefined> } },
  value: unknown,
): GraphicsQuality {
  const graphicsQuality = normalizeGraphicsQuality(value);
  target.documentElement.dataset.prismGraphicsQuality = graphicsQuality;
  return graphicsQuality;
}
