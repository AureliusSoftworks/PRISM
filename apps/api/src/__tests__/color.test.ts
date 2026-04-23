import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampLuminance,
  contrastRatio,
  ensureContrast,
  pickReadableText,
  relativeLuminance,
} from "@localai/shared";

const LIGHT_BG = "#f5f5f7";
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
