export type ZenFallbackWallpaperVariant = {
  src: string;
  flipX: boolean;
  flipY: boolean;
};

export const ZEN_FALLBACK_WALLPAPER_ASSETS = [
  "/zen-fallback-wallpapers/soft-glass-light.png",
  "/zen-fallback-wallpapers/paper-grain-wash.png",
  "/zen-fallback-wallpapers/ocean-haze.png",
  "/zen-fallback-wallpapers/prismatic-mist.png",
  "/zen-fallback-wallpapers/mineral-aurora.png",
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
  atmosphereTimelineLength,
  hasVisibleAtmosphere,
  hasConversationMessages,
}: ZenFallbackWallpaperEligibilityArgs): boolean {
  const generatedAtmosphereVisible =
    hasVisibleAtmosphere ?? atmosphereTimelineLength > 0;
  return (
    chatSurface &&
    (atmosphereEnabled || hasConversationBot) &&
    hasConversationMessages &&
    !hasRememberedWallpaper &&
    !generatedAtmosphereVisible
  );
}
