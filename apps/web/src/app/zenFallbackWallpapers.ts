export type ZenFallbackWallpaperVariant = {
  src: string;
  flipX: boolean;
  flipY: boolean;
};

export const ZEN_FALLBACK_WALLPAPER_ASSETS = [
  "/zen-fallback-wallpapers/soft-glass-light.webp",
  "/zen-fallback-wallpapers/paper-grain-wash.webp",
  "/zen-fallback-wallpapers/ocean-haze.webp",
  "/zen-fallback-wallpapers/prismatic-mist.webp",
  "/zen-fallback-wallpapers/mineral-aurora.webp",
] as const;

export interface ZenFallbackWallpaperEligibilityArgs {
  chatSurface: boolean;
  atmosphereEnabled: boolean;
  hasConversationBot?: boolean;
  hasRememberedWallpaper: boolean;
  atmosphereTimelineLength: number;
  hasVisibleAtmosphere?: boolean;
  hasConversationMessages: boolean;
}

function normalizeSeed(seed: string | null | undefined): string {
  return seed?.trim() || "zen-fallback-wallpaper";
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createZenFallbackWallpaperSeed(): string {
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function resolveZenFallbackWallpaperVariant(
  seed: string | null | undefined,
  assets: readonly string[] = ZEN_FALLBACK_WALLPAPER_ASSETS
): ZenFallbackWallpaperVariant | null {
  if (assets.length === 0) return null;
  const normalizedSeed = normalizeSeed(seed);
  const index = hashString(`${normalizedSeed}:asset`) % assets.length;
  return {
    src: assets[index]!,
    flipX: hashString(`${normalizedSeed}:flip-x`) % 2 === 1,
    flipY: hashString(`${normalizedSeed}:flip-y`) % 2 === 1,
  };
}

export function shouldShowZenFallbackWallpaper({
  chatSurface,
  atmosphereEnabled,
  hasConversationBot = false,
  hasRememberedWallpaper,
  hasConversationMessages,
}: ZenFallbackWallpaperEligibilityArgs): boolean {
  // Bot rooms use blank persona gradients as the Atmosphere fallback. Stock
  // preset images only fill Prism-default Zen (no bot) while Atmosphere is on.
  return (
    chatSurface &&
    atmosphereEnabled &&
    !hasConversationBot &&
    hasConversationMessages &&
    !hasRememberedWallpaper
  );
}
