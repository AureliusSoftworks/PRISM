# Project Lessons Learned

LocalAI-specific patterns and corrections. Updated when project-specific behavior needs to be remembered.

---

### 2026-05-02 · [workflow]
**Trigger**: A memory-pipeline fix was tested against a stale API dev process, causing the app to appear unchanged after code edits.
**Lesson**: After changing API/backend behavior, especially memory extraction, inference, chat, or server routes, proactively restart the API dev server before asking for browser retests. If port 18787 is held by a stale Node process, clear that process and start `npm run dev -w apps/api` cleanly.
**Applies to**: LocalAI API/backend changes and manual browser retest loops.

### 2026-05-02 · [architecture]
**Trigger**: A user prompt like "I love potatoes, don't you?" was stored as "You love potatoes, don't you." instead of the clean fact "You love potatoes."
**Lesson**: Memory extraction should strip trailing conversational tag questions before first-person-to-second-person rewriting. Store only the durable user fact, not the social prompt fragment.
**Applies to**: `apps/api/src/memory-extraction.ts` `rewriteMemoryText()` and memory extraction regression tests.

### 2026-05-02 · [architecture]
**Trigger**: Memory inference could merge "Potatoes are your favorite" and "Spuds are your favorite" into the lossy synonym-only memory "Potatoes are spuds."
**Lesson**: Inferred synonym/equivalence memories must preserve the durable user-fact payload from their parent memories before deleting those parents. For favorite-style facts, the inferred memory should keep both the equivalence and the preference, e.g. "Potatoes are spuds, and they are your favorite." If the model output keeps only one side of the fact, reject the merge and preserve the direct memories instead.
**Applies to**: `apps/api/src/memory-inference.ts` merge normalization and `apps/api/src/__tests__/memory-inference.test.ts`.

### 2026-05-02 · [architecture]
**Trigger**: A one-off task prompt, "Write a quick email to my landlord about the sink leak," became an inferred ASSUMPTION memory because the extractor treated any sentence containing "my" as personal.
**Lesson**: Imperative task requests are working context, not durable memory, even when they contain first-person possessives. Block command-style requests at direct extraction, and reject inferred task-like merges that would delete real preference memories.
**Applies to**: `apps/api/src/memory-extraction.ts` task request filtering and `apps/api/src/memory-inference.ts` task-like merge guard.

### 2026-05-02 · [UX]
**Trigger**: Conversation starter chips were rendered inside the compose form, so their absolute positioning was relative to the composer/full viewport area and they visually floated too low instead of belonging to the message canvas.
**Lesson**: Conversation starter chips should render as an overlay inside `.messagesFrame` and be width-constrained to the centered `.messages` canvas, not the composer. In this app, "canvas area" means the visible message region above the editor and below existing message bubbles.
**Applies to**: `apps/web/src/app/page.tsx` `renderConversationStarterRail()` placement and `apps/web/src/app/page.module.css` `.conversationStarterRail`.

### 2026-05-02 · [UX]
**Trigger**: Individual bot-memory prose bubbles in the bot memory panel were too large and overlapped after several memories were seeded for one bot. Shrinking them meant text would naturally trail off, so the full prose needed a click/focus expansion target.
**Lesson**: Individual memory bubbles should stay compact and use collision-aware relaxation to avoid overlap. Their size must visibly reflect confidence/certainty across the visible confidence band, not raw 0..1 in a way that makes normal memories look identical. At rest, prose may truncate inside the orb; clicking/focusing a memory changes that selected orb to its confidence/certainty score and opens a separate full-prose card inside the memory cloud with an explicit `Delete memory` button. Do not show the score in the prose card, do not use a tiny `×` for deletion in the prose card, and do not enlarge every memory bubble just to fit full text.
**Applies to**: `apps/web/src/app/page.tsx` `memoryBubbleLayoutById` sizing/relaxation and selected-memory detail rendering; `apps/web/src/app/page.module.css` compact memory bubble text and `.memoryFullProseCard`.

### 2026-05-01 · [UX]
**Trigger**: Numeric badges throughout iMemories (PRISM family bot count, default Prism memory count, per-bot orb memory count in the family drill-down) read as clutter once size, color, and inner motes already communicated memory volume. The whole panel was meant to feel atmospheric/visual, but the explicit numbers fought that.
**Lesson**: iMemories is **purely visual end-to-end**: no on-screen numeric badges at any level. Directory-level PRISM family bubbles render with **letter mark only**; the default Prism orb shows the **triangle mark only**; bot orbs in the family drill-down show **glyph + inner memory motes only** (no count badge). All counts move into the `aria-label` and `title` attributes for accessibility / hover info, never on-screen text. The visual hierarchy is: size = memory volume, color = identity, glyph = identity mark, inner motes = memory granularity. This **supersedes** prior "letter plus bot count" and per-orb count-badge rules.
**Applies to**: `apps/web/src/app/page.tsx` PRISM family directory, default Prism orb, and bot-cluster JSX; `apps/web/src/app/page.module.css` removal of `.memoryFamilyCluster strong`, `.memoryFamilyCluster small`, and `.memorySourceClusterCount`.

### 2026-05-01 · [UX]
**Trigger**: PRISM family bubble size was scaled by bot count, which meant a family with many bots and no memories (e.g., 110 R-family bots, none with memories) appeared as a large bubble despite having nothing inside, masking the actual memory landscape.
**Lesson**: Size the PRISM family bubbles (and the default Prism orb) by **memory volume**, not bot count, on a shared scale. Visual size communicates "how much memory lives here". Keep the disable-on-zero-bots rule for the family button so families with bots-but-no-memories remain tappable and route to the "No memories yet" empty state.
**Applies to**: `apps/web/src/app/page.tsx` `memoryFamilyDirectories` size math and `defaultMemoryDirectoryStyle` shared scale.

### 2026-05-01 · [UX]
**Trigger**: In the PRISM family drill-down, bots with zero memories were rendered as small "presence" circles for roster completeness, but at higher counts (e.g., 110 R-family bots, none with memories) the empty circles dominated the canvas and read as noise rather than information.
**Lesson**: In the PRISM family drill-down, only render orbs for bots that actually have memories. If a family contains bots but none have memories yet, fall through to a dedicated empty state ("No memories in this family yet") instead of rendering blank presence circles. This **reverses** the 2026-04-30 "blank/glyphless bubble for zero-memory bots" rule for the family drill-down specifically. The 2026-04-30 rule still applies elsewhere (e.g., default Prism scope), but inside a PRISM family drill-down, presence-without-memories is now communicated via empty-state copy, not a circle.
**Applies to**: `apps/web/src/app/page.tsx` `selectedFamilyBotClusters` filtering and family-drill-down empty-state branching; `apps/web/src/app/page.module.css` removal of `data-source-cluster-empty` rules.

### 2026-05-01 · [UX]
**Trigger**: Main iMemories PRISM letters showed raw memory counts, but tapping a letter revealed bot orbs, creating a count mismatch. Bot orb inner dots also used a decorative sqrt scale that overpromised actual memory count.
**Lesson**: In iMemories, every visible count should predict the next interaction: root PRISM letter counts represent child bot/default orbs, and bot-orb badges/inner dots should use explicit direct-memory counts from the API, not the filtered all-memories list. Empty PRISM letters stay as blank circles with no text/glyph.
**Applies to**: `apps/web/src/app/page.tsx` iMemories PRISM directory counts, family drill-in clusters, and inner memory mote rendering.

### 2026-05-01 · [UX]
**Trigger**: The main iMemories tab showed extra featured bubbles in addition to the PRISM category nodes, which read as visual noise.
**Lesson**: Main iMemories should render exactly five PRISM directory bubbles at root level. Bubble size/count should scale by child bot/default-orb count per category, and drilling into a category should reveal that category's floating bot/default orbs.
**Applies to**: `apps/web/src/app/page.tsx` all-memories panel rendering and PRISM family directory drill-in behavior.

### 2026-05-01 · [UX]
**Trigger**: PRISM-family drill-in initially opened raw memory bubbles, but the expected mental model was bot-grid style filtering.
**Lesson**: Drilling into a PRISM memory family should show bot orbs/glyph clusters for that family with orbit indicators for memory volume, plus an explicit back button in the panel header to return to the 5-directory root.
**Applies to**: `apps/web/src/app/page.tsx` memory family drill-in rendering and memories panel header navigation.

### 2026-05-01 · [UX]
**Trigger**: Inner memory indicators in family drill-in visually collided with the centered bot glyph.
**Lesson**: When rendering memory indicators inside bot orbs, reserve a center-safe zone around the glyph, place indicators with non-overlap constraints, and use subtle in-orb drift/bounce motion rather than static or center-crossing placement.
**Applies to**: `apps/web/src/app/page.tsx` inner memory bubble placement and `apps/web/src/app/page.module.css` inner bubble animation.

### 2026-05-01 · [UX]
**Trigger**: In-orb memory bubbles still felt centered and disconnected from memory volume.
**Lesson**: Inner memory bubble count and bubble size should scale with child memory volume. Placement should still use the full orb, but be biased toward the outer ring for stronger visual energy and cleaner glyph readability.
**Applies to**: `apps/web/src/app/page.tsx` in-orb memory bubble density/size math and radial placement weighting.

### 2026-05-01 · [UX]
**Trigger**: Family drill-in bot orbs overlapped heavily when counts and orb sizes increased.
**Lesson**: Family drill-in orb layout needs collision-aware placement and adaptive downscaling under crowding so bot orbs remain visually distinct and non-overlapping.
**Applies to**: `apps/web/src/app/page.tsx` selected family bot-cluster layout and sizing logic.

### 2026-05-01 · [architecture]
**Trigger**: Opening bot memories from PRISM family drill-in rendered the wrong color/glyph because panel styling depended on `activeBot` instead of the explicitly opened bot.
**Lesson**: Memories panel bot mode must track its own bot context (`memoryPanelBotId`) so accent, header glyph/name, and refresh/delete behavior stay bound to the opened bot even when navigation did not change global active-bot selection.
**Applies to**: `apps/web/src/app/page.tsx` memories panel state, accent resolution, and bot-memory refresh paths.

### 2026-05-01 · [UX]
**Trigger**: Bot-memory bubbles could overlap/clip, and there was no visual lane for inferred/compiled assumptions.
**Lesson**: Bot-memory bubble placement should be collision-aware and boundary-clamped to avoid overlap/clipping. Low-confidence memories should render as smaller unlabeled bubbles. Inferred/compiled assumptions should render in a rounded bottom dock with opacity mapped to certainty.
**Applies to**: `apps/web/src/app/page.tsx` bot-memory layout/segmentation and `apps/web/src/app/page.module.css` uncertain bubble + assumptions dock styling.

### 2026-05-01 · [workflow]
**Trigger**: Needed to verify inferred/compiled memory behavior before dynamic generation was fully online.
**Lesson**: Developer tools should include memory-source and certainty controls (direct/inferred/compiled) plus seeding actions scoped to all bots or the active bot. Inferred/compiled assumptions should be delete-only in UI.
**Applies to**: `apps/web/src/app/page.tsx` dev-tools memories controls and assumptions-card actions.

### 2026-05-01 · [UX]
**Trigger**: High-count All Memories family clusters needed to stay legible as bot counts scale.
**Lesson**: PRISM family clusters should use living organic motion (warbling blob edges), avoid overlap through fixed high-count slots/size caps, and display only the PRISM family letter plus bot count. Keep memory-count detail in accessibility labels/tooltips, not the visible blob.
**Applies to**: `apps/web/src/app/page.tsx` memory family cluster rendering and `apps/web/src/app/page.module.css` family cluster styling.

### 2026-05-01 · [UX]
**Trigger**: Higher bot counts made the All Memories bubble map claustrophobic again even after decorative aura/orbit treatments.
**Lesson**: All Memories needs count-based density stages like the bot picker. Low counts can show bot bubbles; medium counts should cap large spotlight bubbles and render the rest as compact stars; high counts should collapse into color-family/constellation clusters or a tiny dot-field so adding bots cannot increase full-size bubble occupancy without bound.
**Applies to**: `apps/web/src/app/page.tsx` All Memories clustering and `apps/web/src/app/page.module.css` memory map density styling.

### 2026-04-30 · [architecture]
**Trigger**: Deleting all bots left bot-scoped memories orphaned, causing the main Memories panel to show them under the default Prism source.
**Lesson**: Bot-scoped memories belong to the bot lifecycle. Deleting one or more bots should preserve chat history by nulling historical `bot_id` references, but should delete `memories` rows with those bot IDs. Preserve only global/default memories where `bot_id IS NULL`.
**Applies to**: `apps/api/src/bots.ts` bot deletion helpers and Memories panel source clustering.

### 2026-04-30 · [UX]
**Trigger**: The bot memory bubble delete state used CSS-drawn X bars and trapped interaction until the panel was closed.
**Lesson**: Destructive marks inside memory bubbles should be rendered as real integrated glyphs, not pseudo-element bars. Any selected/armed bubble state must preserve an obvious escape path: tapping blank bubbles, dimmed space, or panel background should cancel instead of making the drawer feel input-locked.
**Applies to**: `apps/web/src/app/page.tsx` memory bubble interactions and `apps/web/src/app/page.module.css` memory delete glyph styling.

### 2026-04-30 · [UX]
**Trigger**: The main Memories panel was updated to cluster memories by bot, but initially only showed bots that already had memories.
**Lesson**: The primary Memories panel should represent the full bot roster. Bots with memories render as larger glyph bubbles sized by memory count; bots with zero memories still render as small blank/glyphless bubbles so the panel reads as a complete bot memory map.
**Applies to**: `apps/web/src/app/page.tsx` memory source clustering and `apps/web/src/app/page.module.css` memory bubble styling.

### 2026-04-27 · [UX]
**Trigger**: The user wanted a true live markdown editor in the compose surface, not a split view or rendered preview pane.
**Lesson**: Desktop markdown authoring should use a WYSIWYG surface (TipTap + `@tiptap/markdown`) so formatting is visible while editing, with Markdown as the wire format to match bubble rendering. Use a vertical tool rail beside the field; mobile stays plain textarea; chat bubbles keep safe `react-markdown` rendering.
**Applies to**: `apps/web/src/app/page.tsx` composer (`ComposerInput`) and `apps/web/src/app/page.module.css` markdown composer styling.

### 2026-04-25 · [UX]
**Trigger**: A sidebar Conversations delete-all header × was first aligned to the outer sidebar edge, then overcorrected too far left before landing on the row delete column.
**Lesson**: Sidebar header actions that correspond to row actions should align to the row action column inside the conversation list inset, not the outer sidebar edge or label width. For the Conversations delete-all ×, use the same effective gutter as `.conversationDelete` rather than `space-between` across the whole sidebar.
**Applies to**: `apps/web/src/app/page.module.css` `.conversationHeaderRow`, `.conversationDeleteAllButton`, and sidebar row action alignment.

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

### 2026-05-01 · [UX]
**Trigger**: Message actions were initially split into Resend, Revert, and Edit, but the desired interaction is a single Edit flow that rewinds from the edited message and sends the revised text.
**Lesson**: For chat message correction, prefer one Edit action over separate Resend/Revert controls. Saving an edited user message should truncate the thread from that message, delete linked direct/compiled memories, and send the revised message for a fresh assistant reply.
**Applies to**: `apps/web/src/app/page.tsx` message actions/composer edit mode and `apps/api/src/conversations.ts` memory cascade behavior.

### 2026-05-01 · [UX]
**Trigger**: Bundling fork creation into Edit made the correction flow fragile and confusing, including duplicate target messages and fork-message id mismatches.
**Lesson**: Do not bundle Fork into Edit. Edit should be same-chat correction with rewind/regenerate semantics. If branching is needed, expose it as a separate explicit Fork-from-here action rather than overloading message correction.
**Applies to**: `apps/web/src/app/page.tsx` message actions and `apps/api/src/server.ts` fork route behavior.

### 2026-04-27 · [UX]
**Trigger**: A stage-1 bot picker overlap fix moved cards into normal flow below the hero, which prevented overlap but made mobile require scrolling to see all bot cards.
**Lesson**: Bot picker stages exist to prevent scrollbars in the editor/start window. Do not fix hero overlap by pushing the picker downward in normal flow. Instead, compute the available hero-to-composer window and let picker geometry shrink or advance density stages until the visible bot set fits without scrolling.
**Applies to**: `apps/web/src/app/page.tsx` picker geometry/density stage thresholds and `apps/web/src/app/page.module.css` `.chatBotPickerFrame` positioning.

### 2026-04-27 · [workflow]
**Trigger**: Browser-inspector debugging was attempted against a presumed running LocalAI web surface without first using the repo's launcher.
**Lesson**: Before using the local browser inspector for Prism web debugging, run the appropriate `.command` launcher first. Use `start-dev.command` for dev inspection (`http://localhost:3003`, dev API/db) unless explicitly validating production behavior via `start.command`.
**Applies to**: LocalAI browser-based UI inspection and layout debugging.

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
