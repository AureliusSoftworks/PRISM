import { normalizeAccentForTheme } from "@localai/shared";
import type { CSSProperties } from "react";

type ThemeMode = "light" | "dark";

export interface DebateArchiveChipVisualStyle {
  "--debate-archive-gradient": string;
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

/**
 * Coffee-group style cast gradient for Debate archive chips. Colors come from
 * frozen moderator / advocate snapshots on the session list item.
 */
export function buildDebateArchiveChipVisualStyle(
  sessionId: string,
  castColors: readonly string[],
  theme: ThemeMode,
): CSSProperties & DebateArchiveChipVisualStyle {
  const colors = castColors
    .map((color) => color?.trim())
    .filter((color): color is string => Boolean(color && hexChannels(color)))
    .map((color) => normalizeAccentForTheme(color, theme));
  const gradientColors =
    colors.length > 0
      ? colors
      : theme === "dark"
        ? ["#7b5cff", "#2fd3e3", "#ff4d6d"]
        : ["#9b87ff", "#6ed7e3", "#ff7a96"];
  const nodeCount = Math.min(9, Math.max(4, gradientColors.length * 2));
  const nodeLayers: string[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const color = gradientColors[index % gradientColors.length]!;
    const seed = `debate-archive:${sessionId}:${theme}:gradient-node:${index}`;
    const x = 8 + stableUnitValue(`${seed}:x`) * 84;
    const y = 10 + stableUnitValue(`${seed}:y`) * 80;
    const inner = 3 + stableUnitValue(`${seed}:inner`) * 12;
    const fade = 32 + stableUnitValue(`${seed}:fade`) * 24;
    const strength =
      colors.length > 0
        ? 0.56 + stableUnitValue(`${seed}:strength`) * 0.32
        : 0.28 + stableUnitValue(`${seed}:strength`) * 0.2;
    nodeLayers.push(
      `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${colorWithAlpha(
        color,
        strength,
      )} ${inner.toFixed(1)}%, rgba(0, 0, 0, 0) ${fade.toFixed(1)}%)`,
    );
  }
  const ambientA = gradientColors[0]!;
  const ambientB = gradientColors[gradientColors.length - 1]!;
  const ambientLayer = `radial-gradient(circle at 50% 50%, ${colorWithAlpha(
    ambientA,
    colors.length > 0 ? 0.26 : 0.18,
  )} 0%, ${colorWithAlpha(ambientB, colors.length > 0 ? 0.18 : 0.12)} 58%, rgba(0, 0, 0, 0) 100%)`;
  return {
    "--debate-archive-gradient": `${nodeLayers.join(", ")}, ${ambientLayer}`,
  };
}
