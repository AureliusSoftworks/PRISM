import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACCENT_LUMINANCE_MAX_LIGHT,
  ACCENT_LUMINANCE_MAX_LIGHT_YELLOW,
  ACCENT_LIGHTNESS_MAX,
  ACCENT_LIGHTNESS_MAX_DARK,
  ACCENT_LIGHTNESS_MIN,
  ACCENT_LIGHTNESS_MIN_DARK,
  accentLightnessBand,
  clampAccentLightness,
  clampLuminance,
  contrastRatio,
  ensureContrast,
  hexToHsl,
  hslToHex,
  normalizeAccentForTheme,
  pickReadableText,
  relativeLuminance,
  swatchBorderCompensation,
} from "@localai/shared";

const LIGHT_BG = "#eee7dc";
const DARK_BG = "#0a0a0b";

/**
 * Locks in the "bright colors get dark text" contract that shipped to fix the
 * illegible-white-text-on-lime-green bug. If anyone later reverts the
 * frontend to an HSL-lightness heuristic, or drops the WCAG luminance math
 * entirely, these tests catch it immediately.
 *
 * The frontend mirrors the same logic inline in `apps/web/src/app/page.tsx`
 * (see `pickReadableText` there). Keep the implementations in sync.
 */

describe("relativeLuminance", () => {
  it("returns 0 for pure black", () => {
    assert.equal(relativeLuminance("#000000"), 0);
  });

  it("returns 1 for pure white", () => {
    // Allow a tiny epsilon for float rounding in the sRGB linearization.
    assert.ok(Math.abs(relativeLuminance("#ffffff") - 1) < 1e-9);
  });

  it("is close to 0.5 for mid-gray #777", () => {
    const l = relativeLuminance("#777777");
    assert.ok(l > 0.15 && l < 0.25, `expected mid-low luminance, got ${l}`);
  });

  it("returns 0 for malformed inputs", () => {
    assert.equal(relativeLuminance(""), 0);
    assert.equal(relativeLuminance("#abc"), 0);
    assert.equal(relativeLuminance("#zzzzzz"), 0);
  });
});

describe("pickReadableText", () => {
  it("picks DARK text on a bright lime green (the screenshot case)", () => {
    // #aaee55 is the kind of bright lime that previously got white text
    // under the old HSL heuristic — this is the specific regression guard.
    assert.equal(pickReadableText("#aaee55"), "#0b0b0d");
  });

  it("picks DARK text on pure yellow", () => {
    assert.equal(pickReadableText("#ffff00"), "#0b0b0d");
  });

  it("picks DARK text on pure cyan", () => {
    assert.equal(pickReadableText("#00ffff"), "#0b0b0d");
  });

  it("picks DARK text on pure green", () => {
    assert.equal(pickReadableText("#00ff00"), "#0b0b0d");
  });

  it("picks DARK text on pure red (surprising but WCAG-correct: red is bright enough)", () => {
    // Pure red has luminance ~0.213, which sits just above the 0.179 cutoff.
    // This case documents the math so a future refactor doesn't flip it by
    // accident.
    assert.equal(pickReadableText("#ff0000"), "#0b0b0d");
  });

  it("picks LIGHT text on a dark red", () => {
    assert.equal(pickReadableText("#660000"), "#ffffff");
  });

  it("picks LIGHT text on pure blue", () => {
    assert.equal(pickReadableText("#0000ff"), "#ffffff");
  });

  it("picks LIGHT text on a deep purple", () => {
    assert.equal(pickReadableText("#4a1f7c"), "#ffffff");
  });

  it("picks DARK text on pure white", () => {
    assert.equal(pickReadableText("#ffffff"), "#0b0b0d");
  });

  it("picks LIGHT text on pure black", () => {
    assert.equal(pickReadableText("#000000"), "#ffffff");
  });

  it("honors caller-supplied dark/light pairs", () => {
    assert.equal(
      pickReadableText("#ffff00", { dark: "#222", light: "#eee" }),
      "#222"
    );
    assert.equal(
      pickReadableText("#0000ff", { dark: "#222", light: "#eee" }),
      "#eee"
    );
  });

  it("falls back to LIGHT text on malformed inputs (safe for dark app default)", () => {
    assert.equal(pickReadableText("not-a-color"), "#ffffff");
    assert.equal(pickReadableText(""), "#ffffff");
  });
});

describe("contrastRatio", () => {
  it("is 21 for black vs white", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    assert.ok(Math.abs(ratio - 21) < 1e-6, `expected 21, got ${ratio}`);
  });

  it("is 1 for identical colors", () => {
    assert.equal(contrastRatio("#abcdef", "#abcdef"), 1);
  });

  it("is order-independent", () => {
    const a = contrastRatio("#aaee55", LIGHT_BG);
    const b = contrastRatio(LIGHT_BG, "#aaee55");
    assert.equal(a, b);
  });

  it("flags the screenshot case: bright lime vs light bg is insufficient", () => {
    // The bug: a bright bot color was used as foreground text on the app
    // background, but the ratio is well below AA (4.5:1).
    const ratio = contrastRatio("#aaee55", LIGHT_BG);
    assert.ok(ratio < 2, `expected poor contrast, got ${ratio}`);
  });
});

describe("ensureContrast", () => {
  it("returns the input unchanged when it already meets the target", () => {
    assert.equal(ensureContrast("#000000", LIGHT_BG), "#000000");
    assert.equal(ensureContrast("#ffffff", DARK_BG), "#ffffff");
  });

  it("darkens a bright lime enough to hit 4.5:1 on light bg (screenshot fix)", () => {
    const ink = ensureContrast("#aaee55", LIGHT_BG, 4.5);
    const ratio = contrastRatio(ink, LIGHT_BG);
    assert.ok(
      ratio >= 4.5,
      `ensureContrast output ${ink} has ratio ${ratio}, expected >= 4.5`
    );
    // And the darkened ink should have lower luminance than the original
    // bright color — i.e., we went toward black, not white.
    assert.ok(
      relativeLuminance(ink) < relativeLuminance("#aaee55"),
      "ink should be darker than input on light bg"
    );
  });

  it("lightens a dark navy enough to hit 4.5:1 on dark bg", () => {
    const ink = ensureContrast("#0b1a2a", DARK_BG, 4.5);
    const ratio = contrastRatio(ink, DARK_BG);
    assert.ok(ratio >= 4.5, `got ratio ${ratio}`);
    assert.ok(
      relativeLuminance(ink) > relativeLuminance("#0b1a2a"),
      "ink should be lighter than input on dark bg"
    );
  });

  it("honors a custom target ratio", () => {
    const loose = ensureContrast("#aaee55", LIGHT_BG, 3);
    const strict = ensureContrast("#aaee55", LIGHT_BG, 7);
    // A stricter target requires more blending, so the stricter ink must
    // be at least as dark as the loose one.
    assert.ok(
      relativeLuminance(strict) <= relativeLuminance(loose),
      "stricter contrast target should not be brighter than looser one"
    );
    assert.ok(contrastRatio(loose, LIGHT_BG) >= 3);
    assert.ok(contrastRatio(strict, LIGHT_BG) >= 7);
  });

  it("is stable: re-running on the already-adjusted ink is a no-op", () => {
    const first = ensureContrast("#aaee55", LIGHT_BG, 4.5);
    const second = ensureContrast(first, LIGHT_BG, 4.5);
    assert.equal(first, second);
  });
});

/**
 * These pin the "theme-aware luminance clamp" contract: in light mode we
 * cap luminance, in dark mode we floor it. The purpose is to keep the
 * user's chosen hue recognisable while preventing eye-searing neon in
 * light theme and invisible ink in dark theme.
 */
describe("clampLuminance", () => {
  // Matches the web app's values in apps/web/src/app/page.tsx shellStyle.
  const LIGHT_CEILING = 0.55;
  const DARK_FLOOR = 0.1;

  it("caps a bright accent below the light-mode ceiling", () => {
    const lime = "#aaee55"; // raw luminance ~0.70, above the 0.55 cap
    const clamped = clampLuminance(lime, { max: LIGHT_CEILING });
    assert.ok(
      relativeLuminance(clamped) <= LIGHT_CEILING + 1e-3,
      `expected luminance <= ${LIGHT_CEILING}, got ${relativeLuminance(clamped)}`
    );
    // And it should have pulled DOWN, not up.
    assert.ok(relativeLuminance(clamped) < relativeLuminance(lime));
  });

  it("lifts a deep accent above the dark-mode floor", () => {
    const navy = "#0a1540"; // raw luminance ~0.015, below the 0.1 floor
    const clamped = clampLuminance(navy, { min: DARK_FLOOR });
    assert.ok(
      relativeLuminance(clamped) >= DARK_FLOOR - 1e-3,
      `expected luminance >= ${DARK_FLOOR}, got ${relativeLuminance(clamped)}`
    );
    assert.ok(relativeLuminance(clamped) > relativeLuminance(navy));
  });

  it("leaves colors inside the range untouched (identity for mid-tones)", () => {
    // A mid-green sits well inside both ends of the range for either theme.
    const midGreen = "#3a8f3a"; // luminance ~0.2
    assert.equal(clampLuminance(midGreen, { max: LIGHT_CEILING }), midGreen);
    assert.equal(clampLuminance(midGreen, { min: DARK_FLOOR }), midGreen);
  });

  it("is stable: clamping an already-clamped color returns itself", () => {
    const once = clampLuminance("#ffff00", { max: LIGHT_CEILING });
    const twice = clampLuminance(once, { max: LIGHT_CEILING });
    assert.equal(once, twice);
  });

  it("only darkens when capping (light-mode ceiling must not brighten)", () => {
    // A yellow clamped below the ceiling should lose luminance, never gain.
    const before = relativeLuminance("#ffff00");
    const after = relativeLuminance(
      clampLuminance("#ffff00", { max: LIGHT_CEILING })
    );
    assert.ok(after < before);
  });

  it("only lightens when flooring (dark-mode floor must not darken)", () => {
    const before = relativeLuminance("#07090f");
    const after = relativeLuminance(
      clampLuminance("#07090f", { min: DARK_FLOOR })
    );
    assert.ok(after > before);
  });

  it("preserves the color when neither bound applies", () => {
    assert.equal(clampLuminance("#abcdef", {}), "#abcdef");
  });
});

/**
 * HSL round trips aren't bit-exact because the conversion goes through
 * float math and channel quantization, but they should stay within 1/255
 * per channel. These tests lock in the contract so later refactors can't
 * silently introduce larger drift.
 */
describe("hexToHsl / hslToHex", () => {
  it("extracts pure hues for the primaries", () => {
    const red = hexToHsl("#ff0000");
    assert.equal(Math.round(red.h), 0);
    assert.equal(Math.round(red.s), 100);
    assert.equal(Math.round(red.l), 50);

    const green = hexToHsl("#00ff00");
    assert.equal(Math.round(green.h), 120);
    assert.equal(Math.round(green.s), 100);
    assert.equal(Math.round(green.l), 50);

    const blue = hexToHsl("#0000ff");
    assert.equal(Math.round(blue.h), 240);
    assert.equal(Math.round(blue.s), 100);
    assert.equal(Math.round(blue.l), 50);
  });

  it("reports zero saturation for grays regardless of lightness", () => {
    assert.equal(hexToHsl("#000000").s, 0);
    assert.equal(hexToHsl("#808080").s, 0);
    assert.equal(hexToHsl("#ffffff").s, 0);
  });

  it("round-trips primary hues without drift", () => {
    assert.equal(hslToHex(0, 100, 50), "#ff0000");
    assert.equal(hslToHex(120, 100, 50), "#00ff00");
    assert.equal(hslToHex(240, 100, 50), "#0000ff");
    assert.equal(hslToHex(0, 0, 50), "#808080");
  });

  it("falls back to medium gray on malformed input", () => {
    // Invariant: hexToHsl never throws on bad input; the medium-gray
    // fallback means clampAccentLightness produces a safe readable
    // color instead of something transparent or neon.
    const { h, s, l } = hexToHsl("not-a-color");
    assert.equal(h, 0);
    assert.equal(s, 0);
    assert.equal(l, 50);
  });
});

/**
 * `clampAccentLightness` is the app's "safe band" normalizer: it pulls any
 * color's HSL lightness into `[ACCENT_LIGHTNESS_MIN, ACCENT_LIGHTNESS_MAX]`
 * while preserving hue and saturation. Unlike the previous "pin to 50%"
 * approach, shade variation inside the band is preserved — the picker
 * produces colors in this range, and existing bot colors outside the
 * range get pulled in at render time so legacy data keeps working.
 */
describe("clampAccentLightness", () => {
  it("pulls a too-dark color UP to the minimum lightness", () => {
    // A near-black red (L ≈ 13) should be lifted to exactly the floor.
    const deep = "#400000";
    assert.ok(
      hexToHsl(deep).l < ACCENT_LIGHTNESS_MIN,
      "test precondition: input must start below the floor"
    );
    const { l: clampedL } = hexToHsl(clampAccentLightness(deep));
    assert.ok(
      Math.abs(clampedL - ACCENT_LIGHTNESS_MIN) <= 1,
      `expected lightness ~${ACCENT_LIGHTNESS_MIN}, got ${clampedL}`
    );
  });

  it("pulls a too-light color DOWN to the maximum lightness", () => {
    // A pale pink (L ≈ 88) should be pulled to the ceiling.
    const pastel = "#ffcce0";
    assert.ok(
      hexToHsl(pastel).l > ACCENT_LIGHTNESS_MAX,
      "test precondition: input must start above the ceiling"
    );
    const { l: clampedL } = hexToHsl(clampAccentLightness(pastel));
    assert.ok(
      Math.abs(clampedL - ACCENT_LIGHTNESS_MAX) <= 1,
      `expected lightness ~${ACCENT_LIGHTNESS_MAX}, got ${clampedL}`
    );
  });

  it("passes through colors already inside the band unchanged", () => {
    // Medium picks stay put — shade variation inside the band is the
    // whole point; we don't flatten everyone to L=50 anymore.
    const inRange = ["#b23a3a", "#3a6ab2", "#4db24d", "#b29b3a"];
    for (const hex of inRange) {
      const before = hexToHsl(hex).l;
      assert.ok(
        before >= ACCENT_LIGHTNESS_MIN - 1 && before <= ACCENT_LIGHTNESS_MAX + 1,
        `test precondition: ${hex} must be in-range (L=${before})`
      );
      const after = hexToHsl(clampAccentLightness(hex)).l;
      assert.ok(
        Math.abs(after - before) <= 1,
        `expected ${hex} to pass through, got L=${after} (was ${before})`
      );
    }
  });

  it("preserves hue when clamping", () => {
    // A too-dark blue and a too-light blue should both end up at
    // different lightnesses but the same hue.
    const darkBlue = "#00001a";
    const lightBlue = "#e6e6ff";
    const darkClamped = clampAccentLightness(darkBlue);
    const lightClamped = clampAccentLightness(lightBlue);
    assert.equal(
      Math.round(hexToHsl(darkClamped).h),
      Math.round(hexToHsl(darkBlue).h)
    );
    assert.equal(
      Math.round(hexToHsl(lightClamped).h),
      Math.round(hexToHsl(lightBlue).h)
    );
  });

  it("preserves saturation (grays stay gray, vivid stays vivid)", () => {
    const gray = "#808080";
    assert.equal(hexToHsl(clampAccentLightness(gray)).s, 0);

    const lime = "#aaee55";
    const beforeSat = Math.round(hexToHsl(lime).s);
    const afterSat = Math.round(hexToHsl(clampAccentLightness(lime)).s);
    assert.equal(afterSat, beforeSat);
  });

  it("is idempotent: clamping a clamped color is a no-op", () => {
    const once = clampAccentLightness("#400000");
    const twice = clampAccentLightness(once);
    assert.equal(once, twice);
  });

  it("preserves shade variation between two picks in the same band", () => {
    // A key contract: two in-range picks with different lightnesses
    // must NOT collapse to the same color (unlike the old pin-to-50%
    // approach). This guards against anyone re-introducing the
    // shade-flattening behavior by accident.
    const slightlyDarker = hslToHex(0, 80, 40);
    const slightlyLighter = hslToHex(0, 80, 60);
    assert.notEqual(
      clampAccentLightness(slightlyDarker),
      clampAccentLightness(slightlyLighter)
    );
  });

  it("returns a safe medium gray for malformed input", () => {
    // hexToHsl's malformed-input fallback is {h:0, s:0, l:50}, which
    // sits inside the band and round-trips to #808080.
    assert.equal(clampAccentLightness("not-a-color"), "#808080");
    assert.equal(clampAccentLightness(""), "#808080");
  });
});

/**
 * `accentLightnessBand` centralizes which `[min, max]` HSL range the
 * picker, the CSS overlay, and the render-time clamp should all use for
 * the active theme. These tests pin the contract so any future retune of
 * the dark-mode band keeps the three consumers in sync instead of
 * drifting apart.
 */
describe("accentLightnessBand", () => {
  it("returns the light-mode band when no theme is passed", () => {
    const { min, max } = accentLightnessBand();
    assert.equal(min, ACCENT_LIGHTNESS_MIN);
    assert.equal(max, ACCENT_LIGHTNESS_MAX);
  });

  it("returns the light-mode band for theme=light", () => {
    const { min, max } = accentLightnessBand("light");
    assert.equal(min, ACCENT_LIGHTNESS_MIN);
    assert.equal(max, ACCENT_LIGHTNESS_MAX);
  });

  it("returns the compressed dark-mode band for theme=dark", () => {
    const { min, max } = accentLightnessBand("dark");
    assert.equal(min, ACCENT_LIGHTNESS_MIN_DARK);
    assert.equal(max, ACCENT_LIGHTNESS_MAX_DARK);
  });

  it("keeps dark-mode band strictly inside the light-mode band", () => {
    // Invariant: "dark mode compresses toward midpoint, never expands".
    // If anyone accidentally sets the dark bounds wider than the light
    // bounds the picker would silently produce colors outside the
    // accent-lightness contract the rest of the app assumes.
    assert.ok(ACCENT_LIGHTNESS_MIN_DARK > ACCENT_LIGHTNESS_MIN);
    assert.ok(ACCENT_LIGHTNESS_MAX_DARK < ACCENT_LIGHTNESS_MAX);
  });

  it("keeps the dark band symmetric around the midpoint (L=50)", () => {
    // The picker's vertical alpha overlay assumes symmetry — any
    // asymmetric band would desync the click-handler math from the
    // visible gradient. If you deliberately break symmetry, update
    // the `.colorSquare` CSS overlay to paint two separate alphas.
    const lowerGap = 50 - ACCENT_LIGHTNESS_MIN_DARK;
    const upperGap = ACCENT_LIGHTNESS_MAX_DARK - 50;
    assert.equal(lowerGap, upperGap);
  });
});

/**
 * Dark-mode behavior of `clampAccentLightness`. The same raw hex should
 * render inside a tighter band when the caller signals `theme: "dark"`,
 * so deep picks don't disappear against the dark shell and pale picks
 * don't glare — while hue and saturation stay identical to the input.
 */
describe("clampAccentLightness (dark mode)", () => {
  it("lifts a near-black blue (the triangle-glyph screenshot) into the dark band", () => {
    // The regression case: pure blue at L=30 clamps to L=30 in light mode
    // but lifts to L=38 in dark mode so the glyph stroke reads against
    // the `#0a0a0b` chat bg instead of vanishing into it.
    const pureBlueAtPickerFloor = hslToHex(240, 100, 30);
    const lightClamped = clampAccentLightness(pureBlueAtPickerFloor, "light");
    const darkClamped = clampAccentLightness(pureBlueAtPickerFloor, "dark");

    assert.equal(Math.round(hexToHsl(lightClamped).l), ACCENT_LIGHTNESS_MIN);
    assert.equal(Math.round(hexToHsl(darkClamped).l), ACCENT_LIGHTNESS_MIN_DARK);
    assert.ok(
      relativeLuminance(darkClamped) > relativeLuminance(lightClamped),
      "dark-mode clamp must brighten deep colors, not darken them"
    );
  });

  it("dims a pale yellow at the picker ceiling in dark mode", () => {
    // Symmetric counterpart: a bright pastel that glares at L=70 dims
    // to L=62 in dark mode so it reads as "accent", not "flashbang".
    const pastelYellowAtPickerCeiling = hslToHex(60, 100, 70);
    const lightClamped = clampAccentLightness(pastelYellowAtPickerCeiling, "light");
    const darkClamped = clampAccentLightness(pastelYellowAtPickerCeiling, "dark");

    assert.equal(Math.round(hexToHsl(lightClamped).l), ACCENT_LIGHTNESS_MAX);
    assert.equal(Math.round(hexToHsl(darkClamped).l), ACCENT_LIGHTNESS_MAX_DARK);
    assert.ok(
      relativeLuminance(darkClamped) < relativeLuminance(lightClamped),
      "dark-mode clamp must dim pale colors, not brighten them"
    );
  });

  it("preserves hue and saturation when compressing for dark mode", () => {
    // The user contract: "maintain the same level of saturation". We only
    // move along the L axis, never H or S — so a fully saturated pick
    // stays fully saturated; a vivid mid-green stays vivid.
    const vivid = hslToHex(140, 100, 30);
    const clamped = clampAccentLightness(vivid, "dark");
    const before = hexToHsl(vivid);
    const after = hexToHsl(clamped);
    assert.equal(Math.round(after.h), Math.round(before.h));
    assert.equal(Math.round(after.s), Math.round(before.s));
  });

  it("passes through colors already inside the dark-mode band", () => {
    // Mid-band picks the user deliberately chose (e.g. a medium teal at
    // L=50) must not be nudged either direction — that would flatten
    // shade variation the whole band was designed to preserve.
    const midTeal = hslToHex(180, 70, 50);
    const before = hexToHsl(midTeal).l;
    const after = hexToHsl(clampAccentLightness(midTeal, "dark")).l;
    assert.ok(
      Math.abs(after - before) <= 1,
      `expected mid-band L=${before} to pass through, got L=${after}`
    );
  });

  it("is idempotent per-theme (stable under re-clamping)", () => {
    // Re-running the dark-mode clamp on an already-dark-clamped color
    // must be a no-op. Without this, drag interactions could drift
    // lightness down a slippery slope as each frame re-normalizes.
    const once = clampAccentLightness("#0000ff", "dark");
    const twice = clampAccentLightness(once, "dark");
    assert.equal(once, twice);
  });

  it("is NOT cross-theme-idempotent (document the sharp edge)", () => {
    // Explicitly NOT idempotent across themes: a color clamped for light
    // mode at L=30 must still lift to L=38 when re-clamped for dark. If
    // this ever flips (e.g. someone caches a light-clamped value and
    // reuses it on the dark shell), the deep-hue washout bug returns.
    const deepRed = hslToHex(0, 100, 25);
    const lightClamped = clampAccentLightness(deepRed, "light");
    const thenDark = clampAccentLightness(lightClamped, "dark");
    assert.notEqual(lightClamped, thenDark);
    assert.equal(Math.round(hexToHsl(thenDark).l), ACCENT_LIGHTNESS_MIN_DARK);
  });
});

/**
 * `normalizeAccentForTheme` is the render-time bot color normalizer. It keeps
 * the existing HSL lightness band, then adds a light-mode luminance cap so
 * bright warm hues stay readable on the ivory light theme.
 */
describe("normalizeAccentForTheme", () => {
  it("dims bright yellow light-mode colors below the stronger yellow ceiling", () => {
    const brightYellow = hslToHex(52, 100, ACCENT_LIGHTNESS_MAX);
    const normalized = normalizeAccentForTheme(brightYellow, "light");

    assert.ok(
      relativeLuminance(normalized) <= ACCENT_LUMINANCE_MAX_LIGHT_YELLOW + 1e-3,
      `expected luminance <= ${ACCENT_LUMINANCE_MAX_LIGHT_YELLOW}, got ${relativeLuminance(normalized)}`
    );
    assert.ok(
      relativeLuminance(normalized) < relativeLuminance(brightYellow),
      "light-mode normalization should darken bright yellow colors"
    );
  });

  it("keeps non-yellow bright colors on the general light-mode ceiling", () => {
    const brightCyan = hslToHex(180, 100, ACCENT_LIGHTNESS_MAX);
    const normalized = normalizeAccentForTheme(brightCyan, "light");

    assert.ok(
      relativeLuminance(normalized) <= ACCENT_LUMINANCE_MAX_LIGHT + 1e-3,
      `expected luminance <= ${ACCENT_LUMINANCE_MAX_LIGHT}, got ${relativeLuminance(normalized)}`
    );
    assert.ok(
      relativeLuminance(normalized) > ACCENT_LUMINANCE_MAX_LIGHT_YELLOW,
      "non-yellow bright colors should not use the stronger yellow cap"
    );
  });

  it("leaves readable mid-warm light-mode colors unchanged", () => {
    const orange = "#f97316";
    assert.equal(normalizeAccentForTheme(orange, "light"), orange);
  });

  it("keeps dark-mode behavior to the HSL lightness band only", () => {
    const pastelYellow = hslToHex(60, 100, ACCENT_LIGHTNESS_MAX);
    assert.equal(
      normalizeAccentForTheme(pastelYellow, "dark"),
      clampAccentLightness(pastelYellow, "dark")
    );
  });
});

/**
 * `swatchBorderCompensation` drives the swatch button's border so dark
 * picks in dark mode (and light picks in light mode) remain visible
 * against the surface they sit on. These tests lock in the ramp's shape
 * without asserting exact numbers — exact thresholds are tunable but the
 * invariants (monotonic, bounded, eased) must hold.
 */
describe("swatchBorderCompensation", () => {
  const DARK_SURFACE = "#121214";
  const LIGHT_SURFACE = "#ffffff";

  it("returns 1 (full compensation) when fill and surface are identical", () => {
    assert.equal(swatchBorderCompensation(DARK_SURFACE, DARK_SURFACE), 1);
    assert.equal(swatchBorderCompensation(LIGHT_SURFACE, LIGHT_SURFACE), 1);
  });

  it("returns 0 (no compensation) for high-contrast fill/surface pairs", () => {
    // White on dark surface and black on light surface are the extreme
    // cases where the border never needs help separating from the surface.
    assert.equal(swatchBorderCompensation("#ffffff", DARK_SURFACE), 0);
    assert.equal(swatchBorderCompensation("#000000", LIGHT_SURFACE), 0);
  });

  it("stays within [0, 1] for all inputs", () => {
    const fills = ["#000000", "#333333", "#555555", "#888888", "#cccccc", "#ffffff", "#ff0000", "#00ff00"];
    for (const fill of fills) {
      for (const surface of [DARK_SURFACE, LIGHT_SURFACE]) {
        const value = swatchBorderCompensation(fill, surface);
        assert.ok(value >= 0 && value <= 1, `out of range for ${fill} on ${surface}: ${value}`);
      }
    }
  });

  it("is monotonic-decreasing in contrast ratio on a dark surface", () => {
    // As the fill gets lighter against a dark surface, contrast rises
    // and compensation must fall (never rise).
    const fills = ["#0d0d0f", "#1a1a1d", "#2d2d32", "#4a4a52", "#707078", "#a0a0a8"];
    let prev = Infinity;
    for (const fill of fills) {
      const value = swatchBorderCompensation(fill, DARK_SURFACE);
      assert.ok(value <= prev + 1e-9, `not monotonic at ${fill}: ${value} > ${prev}`);
      prev = value;
    }
  });

  it("respects custom ramp bounds", () => {
    // Tightening the ramp to [1.5, 1.05] must make high-contrast pairs
    // register as 0 sooner. The `start=1.5` ramp means a fill with
    // contrast ratio exactly 1.5 against the surface sits at t=0.
    const loose = swatchBorderCompensation("#444444", DARK_SURFACE, {
      startRatio: 5.0,
      endRatio: 1.05,
    });
    const tight = swatchBorderCompensation("#444444", DARK_SURFACE, {
      startRatio: 1.5,
      endRatio: 1.05,
    });
    assert.ok(
      tight <= loose,
      `tight ramp (${tight}) should not exceed loose ramp (${loose}) for the same fill`
    );
  });
});
