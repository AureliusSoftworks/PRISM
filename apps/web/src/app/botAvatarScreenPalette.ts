export type BotAvatarScreenTheme = "light" | "dark";

export interface BotAvatarScreenPalette {
  edge: string;
  mid: string;
  center: string;
  glyph: string;
  glow: string;
}

const LIGHT_GLYPH = "#fbfdff";
// These are large emissive marks rather than body text. A 3:1 floor lets the
// glass reach the mockup's illuminated lightness while preserving clear form.
const MIN_WHITE_GLYPH_CONTRAST = 3;

function parseHex(raw: string): [number, number, number] | null {
  const clean = raw.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [Number.parseInt(clean.slice(0, 2), 16), Number.parseInt(clean.slice(2, 4), 16), Number.parseInt(clean.slice(4, 6), 16)];
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function relativeLuminance(hex: string): number {
  const parsed = parseHex(hex);
  if (!parsed) return 0;
  const [red, green, blue] = parsed.map(srgbToLinear) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function botAvatarScreenContrastRatio(a: string, b: string): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function identityOklch(raw: string): { chroma: number; hue: number } | null {
  const parsed = parseHex(raw);
  if (!parsed) return null;
  const [red, green, blue] = parsed.map(srgbToLinear) as [number, number, number];
  const lRoot = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const mRoot = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const sRoot = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.sqrt(a * a + b * b);
  const hue = chroma < 0.0001 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { chroma, hue };
}

function oklchLinearRgb(lightness: number, chroma: number, hue: number): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function byteHex(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
}

/** Convert OKLCH to sRGB, reducing only chroma until the result is in gamut. */
function gamutSafeOklchHex(lightness: number, requestedChroma: number, hue: number): string {
  let low = 0;
  let high = requestedChroma;
  let channels = oklchLinearRgb(lightness, 0, hue);
  for (let index = 0; index < 18; index += 1) {
    const chroma = (low + high) / 2;
    const candidate = oklchLinearRgb(lightness, chroma, hue);
    if (candidate.every((channel) => channel >= 0 && channel <= 1)) {
      low = chroma;
      channels = candidate;
    } else {
      high = chroma;
    }
  }
  return `#${channels.map((channel) => byteHex(linearToSrgb(channel))).join("")}`;
}

function contrastSafeTone(initialLightness: number, chroma: number, hue: number): string {
  let lightness = initialLightness;
  let result = gamutSafeOklchHex(lightness, chroma, hue);
  while (lightness > 0.22 && botAvatarScreenContrastRatio(LIGHT_GLYPH, result) < MIN_WHITE_GLYPH_CONTRAST) {
    lightness -= 0.01;
    result = gamutSafeOklchHex(lightness, chroma, hue);
  }
  return result;
}

/**
 * Light mode turns arbitrary identity hues into a bounded illuminated-glass
 * ramp. Dark mode deliberately returns null so its authored CRT stays intact.
 */
export function deriveBotAvatarScreenPalette(identityColor: string, theme: BotAvatarScreenTheme): BotAvatarScreenPalette | null {
  if (theme === "dark") return null;
  const identity = identityOklch(identityColor);
  if (!identity) return null;
  const chroma =
    identity.chroma < 0.025
      ? identity.chroma
      : Math.max(0.11, Math.min(0.21, identity.chroma * 1.08));
  return {
    edge: contrastSafeTone(0.43, chroma, identity.hue),
    mid: contrastSafeTone(0.55, chroma * 0.96, identity.hue),
    center: contrastSafeTone(0.64, chroma * 0.88, identity.hue),
    glyph: LIGHT_GLYPH,
    glow: gamutSafeOklchHex(
      0.86,
      Math.min(0.07, chroma * 0.4),
      identity.hue,
    ),
  };
}

export function botAvatarScreenPaletteVariables(palette: BotAvatarScreenPalette | null): Record<string, string> {
  if (!palette) return {};
  return {
    "--bot-avatar-screen-edge": palette.edge,
    "--bot-avatar-screen-mid": palette.mid,
    "--bot-avatar-screen-center": palette.center,
    "--bot-avatar-screen-glyph": palette.glyph,
    "--bot-avatar-screen-glow": palette.glow,
  };
}
