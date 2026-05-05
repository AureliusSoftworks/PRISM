---
title: "packages/shared/src/color.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/color.ts"
status: "active"
---

# packages/shared/src/color.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/ssr/apps_web_src_app_page_tsx_0kq.zh9._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0d3xlyf._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_page_tsx_0c644d_._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_07_jkvv._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_0p__g8u._.js]]
- [[02-apps/web/src/app/page.tsx]]

## Source path
- `packages/shared/src/color.ts`

## Import references
- _No imports detected_

## Source preview
```text
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

  const r = to

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
