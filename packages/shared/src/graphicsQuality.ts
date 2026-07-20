export const GRAPHICS_QUALITY_VALUES = ["low", "medium", "high"] as const;

export type GraphicsQuality = (typeof GRAPHICS_QUALITY_VALUES)[number];

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = "high";

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return (
    typeof value === "string" &&
    (GRAPHICS_QUALITY_VALUES as readonly string[]).includes(value)
  );
}

export function normalizeGraphicsQuality(
  value: unknown,
  fallback: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY,
): GraphicsQuality {
  return isGraphicsQuality(value) ? value : fallback;
}
