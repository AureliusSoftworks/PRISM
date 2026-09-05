export interface BotMarketplaceGroupAtmospherePreset {
  themeId: string;
  label: string;
  src: string;
}

const BOT_MARKETPLACE_GROUP_ATMOSPHERES: Readonly<
  Record<string, Omit<BotMarketplaceGroupAtmospherePreset, "themeId">>
> = {
  originals: {
    label: "Prismatic mist",
    src: "/zen-fallback-wallpapers/prismatic-mist.webp",
  },
  "founders-nation-builders": {
    label: "Archive paper wash",
    src: "/zen-fallback-wallpapers/paper-grain-wash.webp",
  },
  "classical-wisdom": {
    label: "Soft glass colonnade",
    src: "/zen-fallback-wallpapers/soft-glass-light.webp",
  },
  "visionary-artists": {
    label: "Mineral aurora",
    src: "/zen-fallback-wallpapers/mineral-aurora.webp",
  },
  "power-strategy": {
    label: "Ocean haze",
    src: "/zen-fallback-wallpapers/ocean-haze.webp",
  },
  "modern-minds": {
    label: "Prismatic mist",
    src: "/zen-fallback-wallpapers/prismatic-mist.webp",
  },
  "science-invention": {
    label: "Mineral aurora",
    src: "/zen-fallback-wallpapers/mineral-aurora.webp",
  },
  "justice-reform": {
    label: "Paper grain wash",
    src: "/zen-fallback-wallpapers/paper-grain-wash.webp",
  },
  "story-literature": {
    label: "Ocean haze",
    src: "/zen-fallback-wallpapers/ocean-haze.webp",
  },
  "public-domain-fiction": {
    label: "Archive paper wash",
    src: "/zen-fallback-wallpapers/paper-grain-wash.webp",
  },
  "power-collection": {
    label: "Mineral aurora",
    src: "/zen-fallback-wallpapers/mineral-aurora.webp",
  },
  "library-dev-backup": {
    label: "Archive paper wash",
    src: "/zen-fallback-wallpapers/paper-grain-wash.webp",
  },
};

export function resolveBotMarketplaceGroupAtmosphere(
  marketplaceThemeId: string | null | undefined,
): BotMarketplaceGroupAtmospherePreset | null {
  const themeId = marketplaceThemeId?.trim().toLowerCase() ?? "";
  const preset = BOT_MARKETPLACE_GROUP_ATMOSPHERES[themeId];
  return preset ? { themeId, ...preset } : null;
}
