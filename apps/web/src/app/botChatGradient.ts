import {
  hexToHsl,
  hslToHex,
  normalizeAccentForTheme,
} from "@localai/shared";

export type BotChatGradientTheme = "light" | "dark";

export interface BotChatGradientVariables {
  "--bot-chat-gradient": string;
}

export interface BotChatGradientPalette {
  accent: string;
  bloom: string;
  body: string;
  secondary: string;
  deep: string;
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return "rgba(0, 0, 0, 0)";
  const red = parseInt(clean.slice(0, 2), 16);
  const green = parseInt(clean.slice(2, 4), 16);
  const blue = parseInt(clean.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

/**
 * Build a small same-hue palette from the bot's saved color. The hue shifts
 * stay deliberately narrow so the result reads as one bot identity rather
 * than a miniature rainbow.
 */
export function botChatGradientPalette(
  rawColor: string,
  theme: BotChatGradientTheme,
  seed: string,
): BotChatGradientPalette {
  const accent = normalizeAccentForTheme(rawColor, theme);
  const { h, s, l } = hexToHsl(accent);
  const direction = stableUnitValue(`${seed}:hue-direction`) >= 0.5 ? 1 : -1;
  const hueSpread = 5 + stableUnitValue(`${seed}:hue-spread`) * 7;
  const richSaturation = clamp(
    s * (theme === "dark" ? 1.02 : 0.84),
    0,
    theme === "dark" ? 96 : 86,
  );
  const softSaturation = clamp(
    s * (theme === "dark" ? 0.78 : 0.62),
    0,
    theme === "dark" ? 84 : 72,
  );
  const variation = (stableUnitValue(`${seed}:lightness`) - 0.5) * 5;

  const deepLightness =
    theme === "dark"
      ? clamp(l - 23 + variation, 14, 34)
      : clamp(l + 8 + variation, 58, 72);
  const bodyLightness =
    theme === "dark"
      ? clamp(l - 2 + variation, 31, 54)
      : clamp(l + 20 + variation, 69, 85);
  const bloomLightness =
    theme === "dark"
      ? clamp(l + 13 + variation, 45, 66)
      : clamp(l + 33 + variation, 83, 94);
  const secondaryLightness = clamp(
    bodyLightness + (theme === "dark" ? 5 : -4),
    theme === "dark" ? 36 : 62,
    theme === "dark" ? 60 : 82,
  );

  return {
    accent,
    bloom: hslToHex(
      wrapHue(h + direction * hueSpread),
      softSaturation,
      bloomLightness,
    ),
    body: hslToHex(h, richSaturation, bodyLightness),
    secondary: hslToHex(
      wrapHue(h - direction * hueSpread * 0.62),
      clamp((richSaturation + softSaturation) / 2, 0, 92),
      secondaryLightness,
    ),
    deep: hslToHex(
      wrapHue(h - direction * hueSpread),
      richSaturation,
      deepLightness,
    ),
  };
}

/** Deterministic, local-only canvas atmosphere for one selected bot. */
export function buildBotChatGradient(
  botId: string,
  rawColor: string,
  theme: BotChatGradientTheme,
): string {
  const seed = `bot-chat-gradient:${botId.trim() || rawColor.trim()}:${rawColor}:${theme}`;
  const palette = botChatGradientPalette(rawColor, theme, seed);
  // Keep the procedural variation inside a composed layout: one broad light
  // entering from above, two quieter edge pools, and a small focal lift behind
  // the hero. Letting every pool roam the full canvas made the result read as
  // random blotches rather than atmosphere.
  const primaryX = 30 + stableUnitValue(`${seed}:primary-x`) * 24;
  const primaryY = -8 + stableUnitValue(`${seed}:primary-y`) * 18;
  const counterX = 88 + stableUnitValue(`${seed}:counter-x`) * 16;
  const counterY = 48 + stableUnitValue(`${seed}:counter-y`) * 30;
  const lowX = -8 + stableUnitValue(`${seed}:low-x`) * 16;
  const lowY = 74 + stableUnitValue(`${seed}:low-y`) * 24;
  const focalX = 44 + stableUnitValue(`${seed}:focal-x`) * 12;
  const focalY = 10 + stableUnitValue(`${seed}:focal-y`) * 16;
  const primaryAlpha = theme === "dark" ? 0.2 : 0.12;
  const counterAlpha = theme === "dark" ? 0.12 : 0.075;
  const lowAlpha = theme === "dark" ? 0.08 : 0.05;
  const focalAlpha = theme === "dark" ? 0.07 : 0.045;
  const neutralBase =
    theme === "dark"
      ? "linear-gradient(148deg, var(--bg-deep) 0%, var(--bg) 48%, color-mix(in srgb, var(--bg-surface) 74%, #000000 26%) 100%)"
      : "linear-gradient(148deg, var(--bg-surface) 0%, color-mix(in srgb, var(--bg) 78%, #ffffff 22%) 52%, var(--bg-deep) 100%)";

  return [
    `radial-gradient(ellipse 132% 90% at ${primaryX.toFixed(1)}% ${primaryY.toFixed(1)}%, ${hexWithAlpha(palette.bloom, primaryAlpha)} 0%, ${hexWithAlpha(palette.body, primaryAlpha * 0.34)} 38%, ${hexWithAlpha(palette.bloom, 0)} 76%)`,
    `radial-gradient(ellipse 92% 84% at ${counterX.toFixed(1)}% ${counterY.toFixed(1)}%, ${hexWithAlpha(palette.secondary, counterAlpha)} 0%, ${hexWithAlpha(palette.secondary, counterAlpha * 0.28)} 42%, ${hexWithAlpha(palette.secondary, 0)} 80%)`,
    `radial-gradient(ellipse 98% 76% at ${lowX.toFixed(1)}% ${lowY.toFixed(1)}%, ${hexWithAlpha(palette.deep, lowAlpha)} 0%, ${hexWithAlpha(palette.body, lowAlpha * 0.24)} 46%, ${hexWithAlpha(palette.deep, 0)} 82%)`,
    `radial-gradient(ellipse 64% 42% at ${focalX.toFixed(1)}% ${focalY.toFixed(1)}%, ${hexWithAlpha(palette.bloom, focalAlpha)} 0%, ${hexWithAlpha(palette.bloom, focalAlpha * 0.22)} 44%, ${hexWithAlpha(palette.bloom, 0)} 78%)`,
    neutralBase,
  ].join(", ");
}

export function buildBotChatGradientVariables(
  botId: string,
  rawColor: string,
  theme: BotChatGradientTheme,
): BotChatGradientVariables {
  return {
    "--bot-chat-gradient": buildBotChatGradient(botId, rawColor, theme),
  };
}
