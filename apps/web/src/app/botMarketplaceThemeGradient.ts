import { normalizeAccentForTheme } from "@localai/shared";

import type { BotMarketplaceEntry } from "./botMarketplace";

type ThemeMode = "light" | "dark";

export interface BotMarketplaceThemeVisualStyle {
  "--marketplace-category-edge": string;
  "--marketplace-category-edge-2": string;
  "--marketplace-category-gradient": string;
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function hexChannels(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function colorWithAlpha(rawColor: string, alpha: number): string {
  const channels = hexChannels(rawColor);
  if (!channels) return rawColor;
  const [r, g, b] = channels;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function botMarketplaceThemeGradientColors(
  themeEntries: readonly Pick<BotMarketplaceEntry, "color">[],
  theme: ThemeMode
): string[] {
  return themeEntries
    .map((entry) => entry.color?.trim())
    .filter((color): color is string => Boolean(color && hexChannels(color)))
    .map((color) => normalizeAccentForTheme(color, theme));
}

export function buildBotMarketplaceThemeVisualStyle(
  themeId: string,
  themeEntries: readonly Pick<BotMarketplaceEntry, "color">[],
  theme: ThemeMode
): BotMarketplaceThemeVisualStyle {
  const colors = botMarketplaceThemeGradientColors(themeEntries, theme);
  const gradientColors =
    colors.length > 0
      ? colors
      : theme === "dark"
        ? ["#626875", "#24262d", "#a6a095"]
        : ["#cfdbe5", "#f4f9fd", "#9fb2c2"];
  const nodeCount = Math.min(9, Math.max(4, gradientColors.length * 2));
  const nodeLayers: string[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const color = gradientColors[index % gradientColors.length]!;
    const seed = `marketplace-theme:${themeId}:${theme}:gradient-node:${index}`;
    const x = 8 + stableUnitValue(`${seed}:x`) * 84;
    const y = 10 + stableUnitValue(`${seed}:y`) * 80;
    const inner = 3 + stableUnitValue(`${seed}:inner`) * 12;
    const fade = 34 + stableUnitValue(`${seed}:fade`) * 24;
    const strength =
      colors.length > 0
        ? 0.52 + stableUnitValue(`${seed}:strength`) * 0.32
        : 0.24 + stableUnitValue(`${seed}:strength`) * 0.18;
    nodeLayers.push(
      `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${colorWithAlpha(
        color,
        strength
      )} ${inner.toFixed(1)}%, rgba(0, 0, 0, 0) ${fade.toFixed(1)}%)`
    );
  }
  const ambientA = gradientColors[0]!;
  const ambientB = gradientColors[gradientColors.length - 1]!;
  const ambientLayer = `radial-gradient(circle at 50% 50%, ${colorWithAlpha(
    ambientA,
    colors.length > 0 ? 0.24 : 0.16
  )} 0%, ${colorWithAlpha(ambientB, colors.length > 0 ? 0.18 : 0.12)} 58%, rgba(0, 0, 0, 0) 100%)`;
  return {
    "--marketplace-category-edge": gradientColors[0]!,
    "--marketplace-category-edge-2": ambientB,
    "--marketplace-category-gradient": `${nodeLayers.join(", ")}, ${ambientLayer}`,
  };
}
