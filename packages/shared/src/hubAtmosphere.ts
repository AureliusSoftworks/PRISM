export const HUB_ATMOSPHERE_IMAGE_PURPOSE = "hub_atmosphere" as const;

export const HUB_ATMOSPHERE_STYLES = [
  {
    id: "prismatic",
    label: "Prismatic",
    detail: "Luminous glass, spectral color, and quiet architecture.",
  },
  {
    id: "sanctuary",
    label: "Sanctuary",
    detail: "Calm natural spaces, softened light, and a sense of shelter.",
  },
  {
    id: "dreamscape",
    label: "Dreamscape",
    detail: "Surreal horizons, celestial scale, and impossible beauty.",
  },
  {
    id: "minimal",
    label: "Minimal",
    detail: "Restrained abstract fields with generous visual breathing room.",
  },
] as const;

export type HubAtmosphereStyle = (typeof HUB_ATMOSPHERE_STYLES)[number]["id"];

export const DEFAULT_HUB_ATMOSPHERE_STYLE: HubAtmosphereStyle = "prismatic";

const HUB_ATMOSPHERE_STYLE_IDS = new Set<string>(
  HUB_ATMOSPHERE_STYLES.map((style) => style.id),
);

export function normalizeHubAtmosphereStyle(
  value: unknown,
  fallback: HubAtmosphereStyle = DEFAULT_HUB_ATMOSPHERE_STYLE,
): HubAtmosphereStyle {
  return typeof value === "string" && HUB_ATMOSPHERE_STYLE_IDS.has(value)
    ? (value as HubAtmosphereStyle)
    : fallback;
}

const HUB_ATMOSPHERE_STYLE_DIRECTION: Record<HubAtmosphereStyle, string> = {
  prismatic:
    "a luminous prismatic sanctum of dark glass and translucent architecture, restrained spectral refractions, subtle iridescent haze",
  sanctuary:
    "a serene hidden sanctuary where elegant architecture meets misty nature, diffused dawn light, quiet water and soft atmospheric depth",
  dreamscape:
    "a majestic surreal dreamscape with an impossible horizon, celestial light, monumental distant forms and painterly atmospheric depth",
  minimal:
    "a refined minimal abstract environment of soft gradients, sculpted light, translucent planes and abundant negative space",
};

/**
 * Server-owned prompt for PRISM Home. It deliberately contains no account,
 * bot, or conversation text, so proactively generating it never leaks player
 * content to an image provider.
 */
export function composeHubAtmospherePrompt(
  style: HubAtmosphereStyle,
  variationSeed: string,
): string {
  const normalizedStyle = normalizeHubAtmosphereStyle(style);
  const seed = variationSeed.trim().slice(0, 80) || "first-light";
  return [
    "Create a beautiful cinematic background for the home screen of a private creative AI workspace called PRISM.",
    HUB_ATMOSPHERE_STYLE_DIRECTION[normalizedStyle],
    "ultrawide desktop composition, 16:9 landscape, immersive but calm, sophisticated production design, premium concept art, subtle depth and texture",
    "keep the central and lower interface zones visually quiet and readable, place detail toward the outer edges, dark enough for pale UI overlays",
    "no people, no characters, no robots, no text, no letters, no logos, no interface elements, no frames, no mockup devices",
    `Atmosphere style: ${normalizedStyle}. Variation seed: ${seed}.`,
  ].join(" ");
}
