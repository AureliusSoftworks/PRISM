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
    src: "/zen-fallback-wallpapers/prismatic-mist.png",
  },
  "founders-nation-builders": {
    label: "Archive paper wash",
    src: "/zen-fallback-wallpapers/paper-grain-wash.png",
  },
  "classical-wisdom": {
    label: "Soft glass colonnade",
    src: "/zen-fallback-wallpapers/soft-glass-light.png",
  },
  "visionary-artists": {
    label: "Mineral aurora",
    src: "/zen-fallback-wallpapers/mineral-aurora.png",
  },
  "power-strategy": {
    label: "Ocean haze",
    src: "/zen-fallback-wallpapers/ocean-haze.png",
  },
  "modern-minds": {
    label: "Prismatic mist",
    src: "/zen-fallback-wallpapers/prismatic-mist.png",
  },
  "science-invention": {
    label: "Mineral aurora",
    src: "/zen-fallback-wallpapers/mineral-aurora.png",
  },
  "justice-reform": {
    label: "Paper grain wash",
    src: "/zen-fallback-wallpapers/paper-grain-wash.png",
  },
  "story-literature": {
    label: "Ocean haze",
    src: "/zen-fallback-wallpapers/ocean-haze.png",
  },
};

export function resolveBotMarketplaceGroupAtmosphere(
  marketplaceThemeId: string | null | undefined,
): BotMarketplaceGroupAtmospherePreset | null {
  const themeId = marketplaceThemeId?.trim().toLowerCase() ?? "";
  const preset = BOT_MARKETPLACE_GROUP_ATMOSPHERES[themeId];
  return preset ? { themeId, ...preset } : null;
}
