# PRISM Figma Applet — Reference

Shared chrome details + per-applet pointers. Read from `_prism-figma-applet` when implementing.

## Shared navbar sources

| Concern | Location |
|---------|----------|
| Shell | `page.tsx` → `renderSharedAppletNavbar`, `renderSharedAppletBrand` |
| Tools | `renderUniversalNavbarButtons` |
| Model + effort | `ComposerModelPicker`; CSS `.composeModelControl`, `.composeModelTrigger`, `.composeModelTriggerChevron`, `.composeModelEffortTrigger` |
| App version pill | `PRISM_APP_VERSION` in `apps/web/src/prismAppVersion.ts` |
| Applet label / version | `AppletHeaderLabel`, `prismAppletVersionLabel`, `PRISM_APPLETS` / `appletVersions.ts` |
| Light wordmark | `.themeLight .hubHomeWordmark { filter: brightness(0); }` |
| Light applet label | `.themeLight .appletHeaderLabel` → near-black |

### Brand lockup (shared applet)

```
[ PrismWordmarkWithVersion size=sm ]
  wordmark height ~20px
  version pill → e.g. 0.14.0
[ AppletHeaderLabel ]
  APPLET NAME (uppercase via CSS) + v{applet}
```

No refraction emblem in the shared applet navbar brand button.

**Figma:** rasterize `apps/web/public/wordmark.svg` (rainbow for Dark; force strokes `#000` for Light). Display ~169×20.

### Tool glyphs (exact order)

1. **Prompt Center** — `SlashCommandGlyph` (16 viewBox, stroke 1.6)  
   `M10.8 2.5 5.2 13.5` · `M2.9 5.9h2.15` · `M10.95 10.1h2.15`
2. **Refresh** — Lucide `Recycle` size 18, strokeWidth 2.2
3. **Settings** — `WrenchGlyph` (gear, 24 viewBox, ~15px, stroke ~1.65)
4. **Usage** — Lucide `BarChart3` / `chart-column` size 18, strokeWidth 2.2
5. **Memories** — `BookmarkGlyph` (16 viewBox)
6. **Images** — `ImagesGlyph` (16 viewBox)
7. **Bots** — `BotsGlyph` (24 viewBox robot)
8. **Theme** — `ThemeGlyph`: moon / sun / system half-disk

Baseline CSS: `.headerIconGlyph` → 14×14, stroke 1.6.

### Model chevron

Inside **model trigger** only (`margin-left: auto` in live):

```
viewBox 0 0 10 10
M2 3.5 L5 6.5 L8 3.5
```

Not inside the effort cell. Effort uses `public/reasoning-effort/*.svg`.

---

## Coffee (worked example)

| Item | Value |
|------|--------|
| Page | `05 · Coffee` (`1:6`) |
| Section | `Coffee · States` (`7:21`) |
| Live Dark | `7:22` |
| Live Light | `16:18` |
| Group Setup Dark | `91:2` (`Coffee / Group Setup / Dark`) |
| Group Setup Light | `91:196` (`Coffee / Group Setup / Light`) |
| Seat component (Live) | `Coffee Seat` (`8:34`) — **Live only** |
| Live wiring | `renderSharedAppletNavbar("Coffee tools", …)` |

### States (do not mix)

| State | Live signals | Seats | Show | Hide / omit |
|-------|--------------|-------|------|-------------|
| **Live / session** | `data-phase` arriving/live; conversation active | Full zen body + face plate + cups | Pot, Table Talk, turn/dock as live | — |
| **Group Setup** | `data-mode="group-setup"`; `data-compact`; `data-roster-preview` on seats; selecting + selected group | **Roster preview**: colored **circle** + `BotGlyph` + name pill | Sidebar groups, group overview, Start session CTA | Faces, bot-frames, mugs, pot, Table Talk, End session, live timer/dock |

Setup seats in code (`page.tsx`): when `rosterPreviewSeat` / `compactCoffeeStage`, render `coffeeSeatPlate` + `BotFaceScreenFill` + `BotGlyph` — **not** `data-live-body-style="zen"` face frames.

### Group Setup chrome (CSS/JSX)

| Surface | Live sources |
|---------|--------------|
| Sidebar | `.coffeeSidebar`, `.coffeeGroupButton` (gradient **under** dark/light wash), `data-current` ring, delete + new (`+`) |
| Overview | `renderCoffeeGroupOverview` — name **input**, Duration Auto/Timed + note, Preset select, auto-topic **checkbox**, Table identity (Name/Ethos/Atmosphere), Guest Invited/Away rows, mood meter + Group tools, Recent sessions + Reuse |
| Start CTA | `renderCoffeeGroupStartComposer` / `.coffeeSetupComposerButton` — eyebrow “Coffee Group”, “Start session with N”, topic meta, → arrow |
| Center copy | Ready path: **“This group is ready.”** only (no invented second line) |

### Table camera

| Perspective | Show | Hide |
|-------------|------|------|
| Overhead / waiting / setup / “camera above” | `.coffeeTableDisk` flat circle | First-person table PNG |
| First-person live/arriving | `public/coffee-table/table_{dark,light}.png` | Disk (opacity 0 in live) |

Disk recipes: `.coffeeTableDisk` and `.themeLight.coffeeShell .coffeeTableDisk` in `page.module.css`.

### Sprites

- Cups: `public/coffee-cups/` — **frame crops**, not full sheets — **Live session only**
- Frames: `public/bot-frame/` — **Live session only** (not Group Setup)
- Pot: `public/coffee-pot/` — **Live session only**
- Designed seat count: **5**
- Flip language: **Mirror** vs **Handstand**

### Layout (Group Setup)

- Main content should use most of `(frame − sidebar)` width — avoid empty L/R gutters from a narrow ~820 stage.
- Give the compact table enough height for a comfortable seat orbit; don’t let overview steal the whole column.

### Light accents

Darken via app recipe (`normalizeAccentForTheme` + nameplate ink mix) — don’t keep Dark neon on Light.
Group Setup Light seats still use **glyph circles** (porcelain plate), not Dark live face seats recolored.

---

## Signal (botcast)

| Item | Value |
|------|--------|
| Player name | Signal |
| Code | `botcast` · `apps/web/src/app/BotcastExperience.tsx` |
| Navbar | `renderSharedAppletNavbar("Signal tools", { brandAppletId: "botcast", … })` |
| Placement / studio | `signalStudioPlacement.ts`, CSS under botcast/signal in `page.module.css` / `botcast.module.css` |
| Captions / voice | `signalLiveCaptions.ts`, `signalVoicePerformance.ts` |
| Review skill (code) | `/signal-review` — different from this Figma skill |

When mocking **Signal live session**:

1. Start from shared navbar rules above (wordmark black on Light).
2. Capture or screenshot the live on-air / live-session layout before inventing studio geometry.
3. Prefer real Signal/botcast public assets when present; otherwise match CSS stage proportions.
4. Twin Dark + Light; shelf assets; screenshot both.

Expand this section with node IDs and sprite paths once the Signal page exists in the Figma notebook.

---

## Debate

- Entry: `DebateExperience.tsx`
- Navbar: `renderSharedAppletNavbar("Debate tools", { brandAppletId: "debate", … })`
- Stage: motion, sides, exhibits/gallery — match live before drawing

## Slate

- Navbar: `renderSharedAppletNavbar("Slate tools", …)`
- Desk / manuscript surfaces — CSS-faithful

## Chat / Zen

- Navbar variants via shared header; brand may omit applet id when sidebar owns identity
- Don’t confuse Chat companion chrome with Coffee/Signal live session chrome

---

## Figma hygiene

- Asset shelf ~`x = -3200`; prefix `_Assets ·`
- Hide/rename upload spares; no `_Upload ·` left on mockups
- Twin both themes in the same pass when chrome/stage changes
- Re-query by name after rebuilds — don’t trust stale node IDs
