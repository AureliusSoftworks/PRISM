# PRISM Design System

The source of truth for cross-applet visual consistency is **`:root` in
`apps/web/src/app/globals.css`**, plus the `next/font` declarations in
`apps/web/src/app/layout.tsx`. Applets reference roles from that layer; they do
not re-author faces, radii, or spacing locally.

`apps/web/src/app/design-tokens-contract.test.ts` pins this contract.

## What is deliberately *not* unified

Per-applet accent hue is authored intent, not drift. `docs/brand-ethos.md` is
explicit that "colors suggest plurality" and that a mode should never be
"permanently reduced to one brand color." Debate leaning violet and Signal
leaning near-black/red is the spectrum working as designed. Unify structure —
type, radius, spacing, control chrome — and leave the palettes distinct.

## Typeface roles

Faces are loaded once in `layout.tsx` via `next/font/google`.

| Role variable            | Face               |
| ------------------------ | ------------------ |
| `--font-ui-sans`         | Instrument Sans    |
| `--font-title-sans`      | Raleway 300        |
| `--font-chat-serif`      | Lora               |
| `--font-formal-serif`    | Cormorant Garamond |
| `--font-playful-display` | Chewy              |
| `--font-concise-rounded` | Fredoka            |
| `--font-macondo-face`    | Macondo            |
| `--font-technical-mono`  | Noto Sans Mono     |
| `--font-geist-mono`      | Geist Mono         |

### Composed roles

Applets ask for an intent; only `:root` names a face.

| Role                     | Resolves to                                     |
| ------------------------ | ----------------------------------------------- |
| `--font-title`           | Raleway → Instrument Sans → system              |
| `--font-serif`           | Lora → Georgia → serif                          |
| `--font-mono`            | Geist Mono → `ui-monospace` → SF Mono → Menlo   |
| `--font-ui-mono`         | alias of `--font-mono`                          |

`--font-title` was previously authored only on `.appLayout`, so it resolved
inside the shell subtree and silently fell back everywhere else.

`--font-serif`, `--font-mono`, and `--font-ui-mono` were referenced but defined
nowhere. Before: 19 `--font-serif` surfaces rendered Georgia, 7 more asked for
the separate `--font-editorial-serif` and rendered inherited sans, and 7 mono
surfaces (6 `--font-mono`, 1 `--font-ui-mono`) rendered SF Mono/Menlo. After:
`--font-editorial-serif` was folded into `--font-serif` and no longer exists,
so 26 serif surfaces now resolve to Lora and the 7 mono surfaces to Geist Mono.

Serif consumers are `DebateExperience`, `slateMirrorDesk`,
`slateStoryBibleDesk`, and `slateCreativeStudiosDesk`.

### Still unresolved

| Referenced name     | Uses | Where                      | What actually renders |
| ------------------- | ---- | -------------------------- | --------------------- |
| `--font-display`    | 1    | `PrismFirstRunLivingLayer` | Georgia (fallback)    |
| `--font-geist-sans` | 1    | `page.module.css`          | inherited sans        |

Geist Sans is not among the loaded faces at all. Both are listed in
`UNMAPPED_FONT_ROLES` in the contract test, which fails on any *new* dead
reference.

### Keep fallbacks inside `var()`

`--font-geist-sans` is written as `var(--name), ui-sans-serif, …` — with the
fallback *outside* the parentheses. An undefined custom property used without an
in-`var()` fallback makes the whole declaration invalid at computed-value time,
so `font-family` resolves to the inherited value rather than to the listed
faces. The now-removed `--font-editorial-serif` had the same shape.

Verified in-browser against a sans-font parent:

| Declaration                              | Computed `font-family`   |
| ---------------------------------------- | ------------------------ |
| `var(--undefined), Georgia, serif`       | inherited sans           |
| `var(--undefined, ui-serif, Georgia, serif)` | `ui-serif, Georgia, serif` |

This is why the seven former "editorial serif" surfaces were rendering the
inherited **sans**, not a serif at all. When those references were folded into
`--font-serif` the fallback moved inside the parentheses, so they now resolve to
Lora. Keep fallbacks inside `var()`.

## Radius and spacing scales

Both scales use one step name → pixel mapping, so `lg` means 12px whichever
scale it comes from.

| Step  | Value  | Radius | Spacing |
| ----- | ------ | ------ | ------- |
| `3xs` | `2px`  |        | ✓       |
| `2xs` | `4px`  | ✓      | ✓       |
| `xs`  | `6px`  | ✓      | ✓       |
| `sm`  | `8px`  | ✓      | ✓       |
| `md`  | `10px` | ✓      | ✓       |
| `lg`  | `12px` | ✓      | ✓       |
| `xl`  | `14px` | ✓      | ✓       |
| `2xl` | `16px` | ✓      | ✓       |
| `3xl` | `18px` | ✓      | ✓       |
| `4xl` | `20px` | ✓      | ✓       |
| `5xl` | `24px` |        | ✓       |

Plus `--prism-radius-pill` (`999px`) and `--prism-radius-circle` (`50%`).

### On the scales

These name the dominant even spine already in the tree; they do not describe
what the tree currently does. Radius is presently used at every integer from
2–24px plus 28/32/40/44/56/99/180px, and spacing at nearly every integer 1–24px
— `7px` alone appears in 405 spacing declarations and `9px` in 356. The odd
steps are drift to snap onto the nearest token during migration, not additional
rungs.

The scale deliberately runs in 2px increments rather than a doubling ramp,
because the tree's most-used values are that dense: 14px (330 spacing uses) and
18px (185) are as load-bearing as 16px (151), so a 4/8/16/24 ramp would have
nowhere to put them short of changing layout.

Nothing consumes these tokens yet; adding them changed no rendering.

## Missing layers

There is no shared component library — no `components/` directory, no shared
Button, Card, Modal, or Input. Each applet hand-rolls its chrome inside its own
stylesheet, which is why control styling diverges even where intent matches.
There are also no shared surface, border, or text-color tokens; only the two
`--baseline-*` anti-flash colors exist.
