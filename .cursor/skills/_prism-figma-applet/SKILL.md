---
name: _prism-figma-applet
description: Create and polish PRISM applet mockups in Figma to match the live app (Dark+Light twins, shared navbar chrome, real public sprites, CSS-faithful layout). Use when building Coffee, Signal, Debate, Slate, Chat/Zen, or Hub screens in Figma, matching live applet UI, or when the user invokes /figma-applet.
---

# PRISM Figma Applet

Build **live-faithful** Figma mockups for PRISM applets — not redesigns, not generic dashboards.

Default notebook (verify before write):
- URL: `https://www.figma.com/design/EKKUr0CXYDb8PBJQetYU2m`
- fileKey: `EKKUr0CXYDb8PBJQetYU2m`

## Applets (player-facing → code id)

| Applet | Code id / entry | Notes |
|--------|-----------------|-------|
| Coffee | `coffee` | Multi-bot table; seats, pot, Table Talk |
| Signal | `botcast` · `BotcastExperience.tsx` | Podcast studio; host/guest, captions |
| Debate | `debate` · `DebateExperience.tsx` | Motion, sides, gallery/exhibits |
| Slate | `slate` | Writing desk / manuscript |
| Chat / Zen | `zen` / chat shell | Companion lanes; shared header variants |
| Hub / Home | living shell home | Wordmark lockups, applet tiles |

Always confirm the **state** (setup / live / finished / replay) before drawing.
**State is not a theme tweak** — setup vs live often changes seats, chrome, and which props exist. Read the live mode/`data-*` flags first.

## Non-negotiables

1. **Dark + Light twins** for every applet state you ship.
2. **Instrument Sans** for UI chrome (not Inter).
3. **Real sprites** from `apps/web/public/` over redraws whenever they exist.
4. **Shelf uploads off-canvas** (~`x = -3200`), named `_Assets · …`. Never leave upload debris on the mockup.
5. **CSS/JSX-faithful** — read live sources before inventing chrome.
6. **Screenshot-validate** both themes after each meaningful pass; ask 🟢/🟡/🔴.
7. **Audit Dark screenshots for white slabs** — accidental solid-white container fills are the #1 “broken dark mode” failure.

## Shared chrome (all applets)

Most live applets use `renderSharedAppletNavbar` in `apps/web/src/app/page.tsx`.

Structure: **Identity | Controls | flex spacer | Tools**

| Piece | Live rule |
|-------|-----------|
| Brand | Wordmark + app version pill + applet label — **no** refraction emblem in shared applet navbar |
| Wordmark Dark | Rainbow five-letter strokes (`wordmark.svg` / `PrismWordmark`) |
| Wordmark Light | **Solid black** (live: `.themeLight .hubHomeWordmark { filter: brightness(0) }`) |
| End session | Studio danger chip when `liveSessionActive` (soft pink), not solid maroon |
| Lane | Usually **LOCAL \| ONLINE** (no AUTO in the lane toggle) |
| Model | One **split pill**: model name + chevron in **model trigger**; effort glyph only in **effort** cell |
| Voice | `Voice · …` + chevron when `showVoiceSelector` |
| Tools order | Prompt Center → Refresh (Recycle) → Settings → Usage → Memories → Images → Bots → Theme |
| Tool glyphs | Exact live SVG/Lucide paths — not Unicode/emoji stand-ins |
| Rainbow rule | **1px**, ~0.44 opacity |

Glyph paths, selectors, and raster tips: [reference.md](reference.md).

### Flip vocabulary (cups / props)

- **Mirror** = horizontal flip (handle swap)
- **Handstand** = vertical flip  
Never say bare “H/V flip” without those words.

## Workflow

```
Task Progress:
- [ ] 1. Name applet + state + Dark/Light twins
- [ ] 2. Diff Figma vs live (screenshot + CSS/JSX entry)
- [ ] 3. Build/patch one concern at a time (chrome → stage → seats/props → copy)
- [ ] 4. Mirror the other theme
- [ ] 5. Shelf assets; clean canvas
- [ ] 6. Screenshot both; ask 🟢/🟡/🔴
```

### Before editing

1. Load Figma `figma-use`, then `use_figma`.
2. Re-query nodes by **name** (IDs drift after rebuilds).
3. Open the applet’s live entry + `page.module.css` selectors for that surface **and state**.
4. Prefer incremental `use_figma` steps — big one-shot chrome rebuilds go “worse than before.”
5. If cloning a sibling state (e.g. Live → Setup), treat it as a **source of parts**, not a finished frame — strip live-only debris before reshaping.

### Asset / SVG pitfalls

- `createNodeFromSvg` **collapses vertical strokes** (wordmark I/M). Rasterize with sharp (or equivalent) to PNG.
- Sprite sheets (cups, frames): crop a **single frame** — don’t paste the whole sheet.
- Effort icons: `apps/web/public/reasoning-effort/*.svg`, not a placeholder star.

### `use_figma` API pitfalls (hard-won)

| Trap | Fix |
|------|-----|
| `createAutoLayout` defaults to **solid white fills** | Set structural containers to `fills = []` (esp. Dark). After big builds, scan for near-white solid fills on FRAME/AutoLayout parents. |
| Paint helpers that **return arrays** nested into `fills: [grad, solid(...)]` | Use a single paint **object** helper; `fills` must be an array of paint objects, not nested arrays. |
| CSS `background: A, B` = A on top; Figma = **last paint on top** | Reverse stack when porting overlays (e.g. dark wash over group gradient → `[GROUP_GRAD, darkOverlay]`). |
| `layoutGrow` float (`1.2`) | Must be an **integer**. |
| Cloning Live and hiding pot/dock/timer | Hidden nodes still count as debris — **remove** live-only chrome for setup states. |
| Narrow ~820 content in a ~1160 main | Side gutters look empty and crush the stage — widen stage/overview/CTA toward available main width. |
| Tiny stage + huge overview | Balance vertical stack so seats aren’t pinned to the top; overview can clip/hug, but table needs orbit room. |

### Layout pass (after content is correct)

1. Clear accidental white container fills (Dark).
2. Widen content to kill empty L/R gutters.
3. Rebalance stage vs panel heights so the stage isn’t a thin strip.
4. Screenshot Dark first for contrast bugs, then Light.

## Per-applet notes

Keep applet-specific camera, seats, and copy rules in [reference.md](reference.md).

- **Coffee** — worked example: Live (overhead disk, faces/frames, pot, Table Talk) **and** Group Setup (roster-preview circles + `BotGlyph`, no faces/mugs/frames).
- **Signal** — studio placement, host/guest, live captions; entry `BotcastExperience.tsx`.
- **Debate / Slate / Chat** — expand when those states are mocked; still use shared navbar rules.

## Anti-patterns

- Shipping only Dark (or only Light)
- Invented toolbars that don’t match `renderSharedAppletNavbar`
- Colorful wordmark on Light
- Effort chevron inside the effort cell
- Boxed chip icons instead of borderless header glyphs
- Leaving `_Upload ·` targets on the mockup canvas
- **Live faces / bot-frames / mugs on Coffee Group Setup** (live uses roster-preview glyph circles)
- Stub overview cards when live has real controls (Duration, Preset, Guest Invited/Away, mood meter, Recent sessions)
- Unicode ☑ / emoji trash as stand-ins when live controls are specific (checkbox, `IconTrash`) — fine briefly, fix before calling done
- Declaring a twin “done” after a Live clone reshape without a Dark screenshot contrast audit

## Done bar

- Twins match the live concern for that applet/state
- No accidental white slabs on Dark; content uses available width
- Assets shelved; canvas clean; live-only debris removed for this state
- User 🟢 (or explicit accept) before expanding to another state
