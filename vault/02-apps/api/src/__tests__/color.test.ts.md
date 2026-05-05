---
title: "apps/api/src/__tests__/color.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/color.test.ts"
status: "active"
---

# apps/api/src/__tests__/color.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it ensures that the color contrast calculations are accurate and consistent across different themes, preventing visually unappealing combinations of light and dark colors on the web. By locking in this "bright colors get dark text" contract, these tests prevent potential regressions if future changes alter the luminance math or WCAG guidelines.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/web/src/app/page.tsx]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/color.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `@localai/shared`

## Source preview
```text
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
    const l = relativeLumi

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
