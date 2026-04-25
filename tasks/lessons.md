# Project Lessons Learned

LocalAI-specific patterns and corrections. Updated when project-specific behavior needs to be remembered.

---

### 2026-04-25 · [UX]
**Trigger**: The stage-4+ bot picker used center-out/radial population ordering, and PRISM category dashboard tiles used radial/conic color treatment.
**Lesson**: Bot picker grid population should stay row-major left-to-right across all density stages. PRISM category dashboard gradients should read left-to-right, not radial/conic.
**Applies to**: `apps/web/src/app/page.tsx` `pickerFormationCells()` and `buildBotGroupGradient()`.

### 2026-04-25 · [UX]
**Trigger**: The hue lens showed all five PRISM color bars even when the library only had one green bot, then still appeared when only one color category existed.
**Lesson**: The hue lens should only appear when at least two PRISM color families have filterable bots. If multiple families exist, compact those available bars to fill the full rail; if only one family exists, hide the lens entirely. The range thumb should stay black on both mobile and desktop.
**Applies to**: `apps/web/src/app/page.tsx` `hueLensGradient()` and `apps/web/src/app/page.module.css` `.hueLensSlider` thumb styling.

### 2026-04-25 · [UX]
**Trigger**: A request to make colors rotate radially was incorrectly applied to the hue lens instead of the bot buttons in the editor.
**Lesson**: When the user says "bot buttons in the editor," apply visual gradient/palette treatments to the Bots panel dashboard/card buttons, not the chat hue lens. Only change the hue lens when it is explicitly named.
**Applies to**: `apps/web/src/app/page.tsx` `hueLensGradient()` and `buildBotGroupGradient()` plus `apps/web/src/app/page.module.css` Bots panel button styling.

### 2026-04-25 · [UX]
**Trigger**: Desktop start-screen bot cards were still bleeding into the hero after mobile sizing looked correct.
**Lesson**: Treat desktop low-count bot-picker sizing separately from mobile. Mobile can keep the approved compact stacked treatment, but desktop 5-10 bot grids need a much narrower low-count frame and smaller tile cap so the grid starts below the hero title/hint instead of occupying the same visual band. Dense desktop grids should be fixed by reducing the picker parent frame max height in geometry, then deriving density thresholds from the effective constrained frame width/height; CSS top-clearance offsets hide the real geometry problem and let stage selection drift. A desktop max height around 260px uses the available air above the grid without returning to the old hero overlap. When Spotlight bot search is open, the picker must switch from bottom-anchored absolute positioning to an in-flow clipped results panel below the search box so dense rainbow/grid states can never sit behind the search surface.
**Applies to**: `apps/web/src/app/page.tsx` picker frame geometry/density thresholds and `apps/web/src/app/page.module.css` search-active picker positioning.

### 2026-04-25 · [UX]
**Trigger**: Exact PRISM wordmark hue seeding made every generated bot inside a hue family look nearly identical, and hue-slider filtering felt too page-like when it snapped to available families.
**Lesson**: Treat PRISM bot colors as five hue families, not five exact hexes: generated swatches need slight hue/saturation/lightness variation inside each family so large grids retain a living spectrum. The hue slider should filter continuously through a compressed lens coordinate instead of snapping, but the track should only color families with existing filterable bots.
**Applies to**: `apps/web/src/app/page.tsx` bot color generation and hue lens interaction.

### 2026-04-25 · [UX]
**Trigger**: The bot customizer needed more vertical room, and the full bot list below it was competing with future bot-attribute controls.
**Lesson**: The Bots panel should prioritize the customizer at the top, keep textareas non-resizable, and use the PRISM category dashboard as the default collapsed browsing surface for any non-empty bot library. The long bot-card list should only appear after drilling into a PRISM category.
**Applies to**: `apps/web/src/app/page.tsx` Bots panel category gating and `apps/web/src/app/page.module.css` Bots panel/textarea layout.

### 2026-04-25 · [UX]
**Trigger**: The chat-header Edit badge opened the Bots panel into edit mode, but the panel-open randomizer overwrote the selected bot's saved color/glyph.
**Lesson**: Bots-panel create-mode randomization must be gated off while `editingBotId` is set. Header edit deep links should preserve the active bot's hydrated form values, highlight that bot card, and show the customizer above the list.
**Applies to**: `apps/web/src/app/page.tsx` Bots panel open effect and header edit deep links.

### 2026-04-25 · [UX]
**Trigger**: Darkening the active-chat BOT popout interior in light mode made colored bot labels harder to read instead of improving contrast.
**Lesson**: For light-mode BOT popouts, keep the light surface language and improve readability with per-color contrast-safe bot ink, not a fixed CSS darkening mix. Avoid globally darkening the popout surface unless the text treatment is also redesigned for a dark surface.
**Applies to**: `apps/web/src/app/page.module.css` `.composeBotMenu`, `.composeBotOptionGlyph`, and `.composeBotOptionName` light-mode styling.

### 2026-04-25 · [UX]
**Trigger**: The bot-picker density ladder was corrected after dense-library test controls exposed the stage labels directly.
**Lesson**: The six bot-picker stages are now: Stage 1 full cards, Stage 2 flat cards, Stage 3 larger glyph-to-container ratio, Stage 4 glyphless cards and the first stage where clicking relocates the user to that color grouping on the hue slider, Stage 5 solid swatches/pixel grid with selected-dot treatment active, and Stage 6 radial rainbow gradient as the fully abstract high-density state. In the pixel-grid stages, desktop mouse clicks should select the exact bot and also move the hue slider to that bot's color scope. Treat the Stage 6 bot ceiling as provisional until it is explicitly tuned.
**Applies to**: `apps/web/src/app/page.tsx` and `apps/web/src/app/page.module.css` bot picker density states.

### 2026-04-25 · [UX]
**Trigger**: The chat-header Edit badge opened the bot customizer correctly, but auto-selected the bot name text.
**Lesson**: Bot customizer deep links should focus the target form without selecting existing text. Opening an edit surface should feel ready for input, not like it is inviting accidental replacement of the current bot name.
**Applies to**: `apps/web/src/app/page.tsx` bot customizer focus behavior.

### 2026-04-24 · [UX]
**Trigger**: Bot-picker density states drifted into overlapping visual treatments.
**Lesson**: Keep the bot picker as six cumulative density levels: level 1 full style, level 2 remove gradient, level 3 remove in-tile glyph, level 4 remove border and rounded edges, level 5 collapse very large bot libraries into a compact pixel grid with no gaps, transparency, parallax, or zoom, and level 6 keeps the same pixel-grid rules while simplifying the selected pixel's resting glyph to a black/white inverted solid dot. Stage 2 should activate much sooner than the later simplification stages so the larger glyph-to-box ratio appears before the grid feels crowded, but stage 3 should have a long runway before stage 4 removes borders/rounding. Cursor treatment is not aligned 1:1 with visual density levels: pointer should give way to crosshair right as stage 2 begins, then quickly become the circle/dot cursor while glyphs are still visible; do not wait until glyphs disappear. The picker should claim a mobile-square frame on small screens and a viewport-width-driven 16:9 widescreen frame on desktop/ultrawide screens. Fit an explicit CSS grid inside that frame so the group silhouette stays consistent as counts grow, but cap mobile modestly so one bot does not swallow the hero area. Choose grid columns from `ceil(sqrt(occupied cells * frame aspect ratio))`, then derive rows from the column count and complete the frame with non-interactive blank filler tiles. Use simple row-major ordering for every density stage; do not switch stage 4+ to center-out/radial population ordering. Low counts need bespoke composition: one bot uses a featured-card treatment; three bots use a compact 2-over-1 pyramid on mobile/narrow frames so hover preview text has room, but render as a centered row on widescreen; four bots are 2x2 on mobile and one row on desktop; five to ten bots use a taller two-column mobile layout with no visible placeholders, while desktop can use wider rows such as 5x2. Only reserve a leading blank cell for odd counts above ten, where density makes the balance read as intentional instead of broken. Higher counts shrink tiles through the same frame occupancy math. Breakpoints should scale from the effective picker width rather than fixed counts: mobile can compress below base thresholds, while desktop uses the viewport-derived available picker width but never lets thresholds fall below their base counts, so 320 bots can be dense on phones, phase 3 on normal desktop, and phase 2 on ultrawide. On hover/focus before level 5, the tile should show the Prism triangle and the hero should show that bot's actual glyph. Parallax should activate only from actual bot-button entry/movement and never in the level-5 pixel grid. In level 5, dark mode should dim bot colors toward black and light mode should lift them only modestly toward white so light-mode swatches remain readable; hovered pixel glyphs should use the normalized bot color, while selected pixels keep the black/white inverted glyph treatment. In level 6, the selected pixel should show the dot only at rest; hover/focus/active should reveal the bot's real glyph instead of enlarging the dot, and selected pixels should not show a hard border/ring at rest or on hover. The picker should stay bottom-anchored without participating in flex layout so large grids do not push into the hero.
**Applies to**: `apps/web/src/app/page.tsx` and `apps/web/src/app/page.module.css` bot picker density states.

### 2026-04-24 · [UX]
**Trigger**: Bot-picker buttons disappeared after selecting a bot/item before the first message was sent.
**Lesson**: Bot buttons should remain on screen after any item/tile click and only disappear when a message is sent and the conversation actually begins. Selection can still arm/highlight a bot, update the hero, and populate the compose picker, but it must not remove the button grid pre-send.
**Applies to**: `apps/web/src/app/page.tsx` Chat and Sandbox empty-state bot pickers.

### 2026-04-24 · [UX]
**Trigger**: Bot glyph selection icons needed to be easier to distinguish at a glance, while the approved 28px/1.45-stroke glyph treatment should become the baseline visual standard.
**Lesson**: Use 28px glyphs with 1.45 stroke as the standard standalone bot-glyph treatment. Stroke width should scale inversely with rendered glyph size: larger glyphs use thinner strokes, smaller glyphs use thicker strokes until they become too small to recognize and should be removed. Dense chooser grids should use fixed square cells and fit glyphs inside those cells, not let oversized SVGs inflate or clip the selection buttons. Customizer glyph buttons should rest black with white glyph marks and invert to white with black marks when selected/clicked in the glyph box under the color wheel. Because this picker lives inside `.form`, glyph tile CSS must be scoped as `button.glyphOption` (or stronger) so the generic `.form button` primary styling cannot override the tile polarity. Hovering the selected item keeps the selected button surface fixed and changes only the glyph ink to the normalized color-wheel color. Hovering non-selected items uses the normalized color-wheel color with readable glyph ink; dark-mode hovered glyphs should be lifted brighter, while light-mode hovered glyphs should be pulled darker for contrast, and the hover border should match that same contrast-adjusted glyph color.
**Applies to**: `apps/web/src/app/page.tsx` bot glyph rendering and `apps/web/src/app/page.module.css` glyph picker styling.

### 2026-04-24 · [UX]
**Trigger**: Mobile bot customizer color/glyph popover used vertical space well but felt ambiguous to dismiss because it behaved like a near-full-height sheet.
**Lesson**: Third-layer mobile popovers inside the right drawer should read as centered modal cards, not full-height sheets. Keep a visible dimmed outside area around the card so tap-outside dismissal is obvious; use a moderate viewport-height cap and let the internal glyph grid scroll instead of stretching the whole popover to the top and bottom safe areas.
**Applies to**: `apps/web/src/app/page.module.css` `.colorGlyphPopover` mobile styling.
