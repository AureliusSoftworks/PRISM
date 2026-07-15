import { normalizeAccentForTheme } from "@localai/shared";

export type BotLibraryGroupTheme = "light" | "dark";

export interface BotLibraryGroupColorSource {
  color?: string | null;
}

export interface BotLibraryGroupOklchColor {
  lightness: number;
  chroma: number;
  hue: number;
}

export interface BotLibraryGroupVisualVariables {
  "--bot-library-group-gradient": string;
  "--bot-library-group-accent": string;
}

const DEFAULT_GROUP_COLORS: Record<BotLibraryGroupTheme, readonly string[]> = {
  dark: ["#626875", "#24262d", "#a6a095"],
  light: ["#d9d5ca", "#f7f3ea", "#a9b0ba"],
};

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function parseHexChannels(rawColor: string): [number, number, number] | null {
  const clean = rawColor.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

/** Convert and bound a member color in perceptual OKLCH space for canvas atmosphere. */
export function normalizeBotLibraryGroupOklch(
  rawColor: string,
  theme: BotLibraryGroupTheme,
): BotLibraryGroupOklchColor | null {
  if (!parseHexChannels(rawColor)) return null;
  const normalizedAccent = normalizeAccentForTheme(rawColor, theme);
  const channels = parseHexChannels(normalizedAccent);
  if (!channels) return null;

  const [red, green, blue] = channels.map(srgbChannelToLinear) as [
    number,
    number,
    number,
  ];
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const rawLightness =
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const rawChroma = Math.sqrt(a * a + b * b);
  const rawHue = (Math.atan2(b, a) * 180) / Math.PI;
  const lightnessBounds =
    theme === "dark" ? { min: 0.52, max: 0.72 } : { min: 0.46, max: 0.68 };
  const chromaMax = theme === "dark" ? 0.18 : 0.15;

  return {
    lightness: Math.max(
      lightnessBounds.min,
      Math.min(lightnessBounds.max, rawLightness),
    ),
    chroma: Math.max(0, Math.min(chromaMax, rawChroma)),
    hue: rawChroma < 0.0001 ? 0 : (rawHue + 360) % 360,
  };
}

function oklchWithAlpha(color: BotLibraryGroupOklchColor, alpha: number): string {
  return `oklch(${(color.lightness * 100).toFixed(2)}% ${color.chroma.toFixed(4)} ${color.hue.toFixed(2)} / ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export function botLibraryGroupGradientColors(
  groupBots: readonly BotLibraryGroupColorSource[],
  theme: BotLibraryGroupTheme,
): BotLibraryGroupOklchColor[] {
  const memberColors = groupBots
    .map((bot) => (typeof bot.color === "string" ? bot.color.trim() : ""))
    .filter(Boolean)
    .map((color) => normalizeBotLibraryGroupOklch(color, theme))
    .filter((color): color is BotLibraryGroupOklchColor => color !== null);
  if (memberColors.length > 0) return memberColors;
  return DEFAULT_GROUP_COLORS[theme]
    .map((color) => normalizeBotLibraryGroupOklch(color, theme))
    .filter((color): color is BotLibraryGroupOklchColor => color !== null);
}

export function buildBotLibraryGroupGradient(
  groupId: string,
  groupBots: readonly BotLibraryGroupColorSource[],
  theme: BotLibraryGroupTheme,
): string {
  const memberColorCount = groupBots.filter(
    (bot) =>
      typeof bot.color === "string" &&
      normalizeBotLibraryGroupOklch(bot.color, theme) !== null,
  ).length;
  const gradientColors = botLibraryGroupGradientColors(groupBots, theme);
  const nodeCount = Math.min(9, Math.max(4, gradientColors.length * 2));
  const nodeLayers: string[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const color = gradientColors[index % gradientColors.length]!;
    const seed = `bot-library-group:${groupId}:${theme}:gradient-node:${index}`;
    const x = 8 + stableUnitValue(`${seed}:x`) * 84;
    const y = 10 + stableUnitValue(`${seed}:y`) * 80;
    const inner = 3 + stableUnitValue(`${seed}:inner`) * 12;
    const fade = 34 + stableUnitValue(`${seed}:fade`) * 24;
    const strength =
      memberColorCount > 0
        ? 0.52 + stableUnitValue(`${seed}:strength`) * 0.32
        : 0.24 + stableUnitValue(`${seed}:strength`) * 0.18;
    nodeLayers.push(
      `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${oklchWithAlpha(
        color,
        strength,
      )} ${inner.toFixed(1)}%, transparent ${fade.toFixed(1)}%)`,
    );
  }
  const ambientA = gradientColors[0]!;
  const ambientB = gradientColors[gradientColors.length - 1]!;
  const ambientLayer = `radial-gradient(circle at 50% 50%, ${oklchWithAlpha(
    ambientA,
    memberColorCount > 0 ? 0.24 : 0.16,
  )} 0%, ${oklchWithAlpha(ambientB, memberColorCount > 0 ? 0.18 : 0.12)} 58%, transparent 100%)`;
  const baseLayer =
    theme === "dark"
      ? "linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018))"
      : "linear-gradient(145deg, rgba(255,255,255,0.82), rgba(255,255,255,0.34))";
  return `${nodeLayers.join(", ")}, ${ambientLayer}, ${baseLayer}`;
}

export function buildBotLibraryGroupVisualVariables(
  groupId: string,
  groupBots: readonly BotLibraryGroupColorSource[],
  theme: BotLibraryGroupTheme,
): BotLibraryGroupVisualVariables {
  const rawAccent = groupBots
    .map((bot) => (typeof bot.color === "string" ? bot.color.trim() : ""))
    .find((color) => parseHexChannels(color) !== null);
  return {
    "--bot-library-group-gradient": buildBotLibraryGroupGradient(
      groupId,
      groupBots,
      theme,
    ),
    "--bot-library-group-accent": normalizeAccentForTheme(
      rawAccent ?? "#7c3aed",
      theme,
    ),
  };
}
