/**
 * Color helpers for picking legible text on top of arbitrary accent colors.
 *
 * The app lets users assign any color to a bot and then drops that color into
 * CSS variables (`--accent`, `--user-bubble`, `--bot-color`, etc.). Bright
 * lime greens and yellows make hard-coded white text illegible, so every
 * place that sits on top of `--accent` — CTA fills, the user message bubble,
 * the "New chat" button, in-bubble action buttons — reads its text color
 * from `--accent-text`. The value of `--accent-text` is computed here at
 * runtime from the accent's color so the swap happens automatically.
 *
 * The math uses the WCAG 2 relative-luminance formula, which is perceptually
 * correct for yellow-green territory where a naive HSL lightness check
 * under-estimates brightness and leaves white text on top of a bright lime.
 */

/**
 * WCAG 2 relative luminance for an sRGB `#rrggbb` color. Returns a value in
 * the 0..1 range (black = 0, white = 1). Invalid input returns 0 so callers
 * fall through to a safe light-text default.
 */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return 0;

  const toLinear = (channel: number): number => {
    const n = channel / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };

  const r = toLinear(parseInt(clean.substring(0, 2), 16));
  const g = toLinear(parseInt(clean.substring(2, 4), 16));
  const b = toLinear(parseInt(clean.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Pick a text color — either `dark` or `light` — that maximizes WCAG
 * contrast on a background of `hex`.
 *
 * The threshold of 0.179 comes from solving the WCAG contrast formula for
 * "which side of the luminance range produces a higher contrast ratio against
 * this background". Anything brighter than ~0.179 gets the dark color;
 * darker backgrounds get the light color. This is perceptually correct for
 * bright yellows, limes, and cyans where simpler HSL-lightness heuristics
 * wrongly leave white text on a visually-bright surface.
 */
export function pickReadableText(
  hex: string,
  opts?: { dark?: string; light?: string }
): string {
  const dark = opts?.dark ?? "#0b0b0d";
  const light = opts?.light ?? "#ffffff";
  return relativeLuminance(hex) > 0.179 ? dark : light;
}

/** WCAG 2 contrast ratio between two sRGB colors, in the 1..21 range. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function channel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** Linearly mix two hex colors in sRGB space. `amount` is 0..1. */
function mixHex(a: string, b: string, amount: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const t = Math.max(0, Math.min(1, amount));
  const r = pa[0] + (pb[0] - pa[0]) * t;
  const g = pa[1] + (pb[1] - pa[1]) * t;
  const bl = pa[2] + (pb[2] - pa[2]) * t;
  return `#${channel(r)}${channel(g)}${channel(bl)}`;
}

/**
 * Return a color close to `foreground` that meets the target WCAG contrast
 * ratio against `background`. If it already meets the target, returns the
 * input unchanged. Otherwise blends toward black (on light backgrounds) or
 * white (on dark ones) using a bounded binary search so the hue stays
 * recognisable as long as possible.
 *
 * Use this for the accent-as-text / accent-as-border cases where a bright
 * user-chosen color needs to remain legible on the app background.
 */
export function ensureContrast(
  foreground: string,
  background: string,
  targetRatio = 4.5
): string {
  if (contrastRatio(foreground, background) >= targetRatio) return foreground;
  const bgLum = relativeLuminance(background);
  const anchor = bgLum > 0.5 ? "#000000" : "#ffffff";

  let lo = 0;
  let hi = 1;
  let best = anchor;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const blended = mixHex(foreground, anchor, mid);
    if (contrastRatio(blended, background) >= targetRatio) {
      best = blended;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

/**
 * Clamp a color's relative luminance into `[min, max]`, preserving hue as much
 * as possible by only blending toward black (to reduce luminance) or white
 * (to raise it). Inputs already inside the range are returned unchanged.
 *
 * This is what the app uses to express "light mode colors never go neon" and
 * "dark mode colors never go invisible": in light mode we pass `{ max }`,
 * in dark mode we pass `{ min }`, and the user's chosen bot color stays
 * recognisable while losing the extremes at each end.
 */
export function clampLuminance(
  hex: string,
  opts: { min?: number; max?: number }
): string {
  const lum = relativeLuminance(hex);

  if (opts.max !== undefined && lum > opts.max) {
    return blendToTargetLuminance(hex, "#000000", opts.max);
  }
  if (opts.min !== undefined && lum < opts.min) {
    return blendToTargetLuminance(hex, "#ffffff", opts.min);
  }
  return hex;
}

function blendToTargetLuminance(
  hex: string,
  anchor: "#000000" | "#ffffff",
  targetLuminance: number
): string {
  // Binary-search the smallest blend amount toward `anchor` that satisfies
  // the invariant. Because blending is monotonic in luminance (toward black
  // strictly lowers it, toward white strictly raises it), the search is
  // well-defined and converges quickly.
  let lo = 0;
  let hi = 1;
  // `best` starts at the anchor but is widened to string so the loop body
  // can overwrite it with mixed values as the binary search narrows.
  let best: string = anchor;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const blended = mixHex(hex, anchor, mid);
    const l = relativeLuminance(blended);
    const satisfies = anchor === "#000000" ? l <= targetLuminance : l >= targetLuminance;
    if (satisfies) {
      best = blended;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}
