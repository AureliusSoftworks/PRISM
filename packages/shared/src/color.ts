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

// ── HSL conversion ────────────────────────────────────────────────────
// The color picker operates in HSL space (hue × lightness is the 2D grid
// the user clicks) and downstream helpers normalize accent colors by
// pinning lightness. These helpers keep the math in one place so every
// consumer (picker, normalization, tests) uses the same conversion.

/**
 * Convert a `#rrggbb` hex string to HSL. Returns `{ h: 0..360, s: 0..100,
 * l: 0..100 }`. Invalid inputs collapse to `{ h: 0, s: 0, l: 50 }` so the
 * round trip through `hslToHex` returns a safe medium gray rather than
 * throwing.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const parsed = parseHex(hex);
  if (!parsed) return { h: 0, s: 0, l: 50 };
  const r = parsed[0] / 255;
  const g = parsed[1] / 255;
  const b = parsed[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL (`h: 0..360`, `s: 0..100`, `l: 0..100`) to a `#rrggbb` hex
 * string. Uses the standard formulation so `hslToHex(hexToHsl(x))` is
 * idempotent for valid inputs (within 1-bit rounding error per channel).
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) =>
    lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * HSL-lightness range the app's accent color picker is allowed to produce.
 * Clamping both ends (not just one) means bot colors never go dark enough
 * to vanish into the dark-mode shell nor pale enough to wash out against
 * the light-mode shell, while preserving shade variation in the middle.
 *
 * Chosen empirically:
 *   - 30 is dark enough for a rich deep red / navy without disappearing
 *     against `#0a0a0b`.
 *   - 70 is bright enough for a warm pastel without dissolving into
 *     `#f1f1f4` or losing saturation punch.
 *   - The band comfortably contains the PRISM logo's letter palette
 *     (L ≈ 54–68), so a user picking any of those letter hues by hand
 *     passes through the clamp cleanly.
 *
 * Exported as constants (not magic numbers) so downstream consumers — the
 * color picker UI, the render-time clamp, unit tests — all agree on the
 * same range.
 */
export const ACCENT_LIGHTNESS_MIN = 30;
export const ACCENT_LIGHTNESS_MAX = 70;

/**
 * Tighter HSL-lightness band applied specifically when painting accents on
 * top of the dark-theme shell. The default band [30, 70] works great in
 * light mode but has two failure modes on `#0a0a0b`:
 *
 *   - Deep hues (pure blue/red/purple) at L=30 sit at WCAG luminance
 *     ~0.02–0.05, well below the contrast threshold that makes a glyph
 *     stroke readable on the chat bg. The triangle-glyph screenshot that
 *     motivated this pair of constants was a pure-blue pick that clamped
 *     to L=30 and became nearly invisible.
 *   - Pale hues at L=70 glare on a near-black surround; the eye reads
 *     them as "washed out" rather than "bright" because the surround
 *     gives nothing to anchor the mid-tones against.
 *
 * Pulling both ends 8 units toward L=50 compresses the range to [38, 62]
 * without squashing shade variation to a single point. Hue and saturation
 * are left untouched — `clampAccentLightness` only moves the L axis — so
 * "dark colors get a little brighter, bright colors get a little darker"
 * in the user's mental model, with saturation preserved.
 *
 * If you retune these, bump the `.colorSquare` overlay alpha in
 * `apps/web/src/app/page.module.css` in lockstep: the visible gradient is
 * what-you-see = what-you-pick, so the overlay alpha must equal
 * `(50 - MIN_DARK) / 50 = (MAX_DARK - 50) / 50`.
 */
export const ACCENT_LIGHTNESS_MIN_DARK = 38;
export const ACCENT_LIGHTNESS_MAX_DARK = 62;

/**
 * Resolve which `[min, max]` HSL-lightness band applies for the given
 * theme. Factored out so the picker UI, the CSS overlay math, and the
 * render-time clamp all agree on the same answer for any theme the app
 * renders in. An unknown / omitted theme falls back to the light-mode
 * band, which is the historical default.
 */
export function accentLightnessBand(
  theme?: "light" | "dark"
): { min: number; max: number } {
  if (theme === "dark") {
    return { min: ACCENT_LIGHTNESS_MIN_DARK, max: ACCENT_LIGHTNESS_MAX_DARK };
  }
  return { min: ACCENT_LIGHTNESS_MIN, max: ACCENT_LIGHTNESS_MAX };
}

/**
 * Clamp a color's HSL lightness into the accent band while leaving its
 * hue and saturation untouched. Pass `theme: "dark"` to apply the tighter
 * dark-mode band (darks lift, brights dim, saturation identical) so the
 * same user-picked color renders readable against both theme shells.
 *
 * This is the one-stop normalizer for any surface that paints a user-
 * chosen bot color as an accent (bot card bar, glyph tile, message
 * bubble, shell --accent triad). Instead of pinning every accent to a
 * single "shadeless" 50% lightness (which erases the subtle shade
 * variation users express through the picker), we keep whatever shade
 * they picked — as long as it's inside the safe band for the active
 * theme.
 *
 * Colors already inside the band pass through unchanged, so the function
 * is idempotent per theme. Note that a round-trip through the dark-mode
 * clamp is NOT a no-op against the light-mode clamp: an input clamped for
 * dark mode may still be outside the light-mode band (or vice versa), so
 * always clamp for the active theme, never reuse a clamped result across
 * themes.
 */
export function clampAccentLightness(
  hex: string,
  theme?: "light" | "dark"
): string {
  const { h, s, l } = hexToHsl(hex);
  const { min, max } = accentLightnessBand(theme);
  const clamped = Math.max(min, Math.min(max, l));
  return hslToHex(h, s, clamped);
}

/**
 * Compute how strongly a swatch whose fill is `fillHex` needs a
 * compensating border to remain visible on a surface of `surfaceHex`.
 *
 * Returns 0..1:
 *   - 0 → "no compensation"  (fill and surface are comfortably separated)
 *   - 1 → "full compensation" (fill is nearly indistinguishable from surface)
 *
 * The ramp is linear in WCAG contrast ratio between the two colors,
 * clamped to `[endRatio, startRatio]` and then eased via `easeInOutQuad`
 * so the visual transition feels natural instead of popping into view at
 * the threshold. Callers stitch the returned amount into their own
 * border-color pipeline — typically by mixing the theme's `--line` token
 * toward `--fg` by `amount * 100%`.
 */
export function swatchBorderCompensation(
  fillHex: string,
  surfaceHex: string,
  opts?: { startRatio?: number; endRatio?: number }
): number {
  const start = opts?.startRatio ?? 2.0;
  const end = opts?.endRatio ?? 1.05;
  const ratio = contrastRatio(fillHex, surfaceHex);
  const raw = Math.max(0, Math.min(1, (start - ratio) / (start - end)));
  // Quadratic ease in/out so the middle of the ramp moves faster than
  // the ends. Matches the curve a CSS `ease-in-out` timing function would
  // apply if the browser were driving the transition.
  return raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
}
