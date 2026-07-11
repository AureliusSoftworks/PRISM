# Handoff: Avatar Studio UX overhaul — verification & polish tail

Generated: 2026-07-10 · Branch: dev · Status: reorganization committed, visual verification outstanding

## Mission

Overhaul the Avatar Studio (the full-screen bot avatar customizer) to match the caliber of the Settings menu. Jared's framing: it was "extremely hard to navigate… barely legible because there isn't enough distinction between sections. Eye positioning is inaccessible entirely… It is imperative that we capture the caliber that we have in the settings menu. Prism needs to be consistent." Constraints: keep the full-screen effect; minimal text/symbols in the UI (bot customization is glyph-centric); "items should go with items that make sense."

Done means: the studio renders with correct theming in both light and dark, every control is reachable and grouped by feature, and the chrome visibly matches the Settings panel's design language.

## Current state

- ✅ Done (committed in `41a361ec`…`1c5e7c50`, tests green — `node --test` 16/16 on `botAvatarCustomizerModal.test.ts`):
  - **Theme-scope portal fix** — the modal portals to `document.body`, outside the `main.themeDark/.themeLight` CSS-variable scope, so every `color-mix(var(--accent)…)` declaration silently collapsed (invisible XY pads, stock blue sliders, missing borders). Fixed by wrapping portal content in `.botAvatarStudioThemeScope` (`display: contents`) carrying the theme class + `--editor-bot-*` inline vars. See `botAvatarStudioThemeScope` in `apps/web/src/app/page.tsx` and `page.module.css`.
  - **Unreachable-controls fix** — `.botAvatarControlGroup` had `overflow: hidden`, making it a scroll container whose content contribution zeroes out during the stack's grid track sizing; everything below the fold was clipped and unscrollable. The accent strip now clips its own corners instead.
  - **Tab reorganization** — `face | eyes | mouth | motion | identity`. Eyes tab: style row, glyph mode, size, position pad. Mouth tab: same + rotation. Face: presets + stroke weight. Identity: bot name field + inline color/glyph picker (auto-opens on tab entry).
  - **Chrome polish** — Settings-eyebrow section legends, per-tab section accent hues, group-header typography, rotation-slider `accent-color` fix.
- 🔄 In progress: **visual verification in both themes** — never completed after the reorganization landed.
- ⬜ Not started: any follow-up polish that verification surfaces.

Uncommitted changes (`git status`): `apps/web/src/app/page.tsx` (marquee-selection gesture changes around line 59495) and `botCanvasMarqueeSelection.test.ts` — these belong to a **parallel Codex session** (`.codex/tmp/` present). Do not touch, revert, or commit them.

## Next actions (in order)

1. Start the app: `npm run dev` from repo root (API :18787, web :18788) — or use the Claude preview server config `prism-dev` in `.claude/launch.json` if no dev server is already on :18788 (check `lsof -nP -iTCP:18788 -sTCP:LISTEN` first; a parallel session may own it).
2. Log in at `http://localhost:18788` (dev DB `apps/api/data/localai.db` has throwaway QA users; create a fresh account via Register if needed — ask Jared rather than seeding session tokens; the permission gate blocks credential seeding).
3. Open Avatar Studio: Bots toolbar icon (top-right) → Browse bots → pick a bot (e.g. Mr. Rogers) → Customize → "Open Avatar Studio".
4. Verify each tab in dark AND light (preview toolbar has a Dark/Light toggle inside the studio): 5-tab strip fits the ~420px control panel without ugly wrapping; Eyes/Mouth position pads render (crosshair grid + thumb) and drag/arrow-key correctly; Mouth rotation slider is accent-colored, not blue; Identity tab shows name field + picker already open; section legends read as small-caps with per-tab accent tint.
5. Check the default-Prism-bot variant (Bots → Default card → Customize): Identity tab must be absent, face-only customization intact.
6. Fix what verification surfaces, run `node --test --experimental-strip-types src/app/botAvatarCustomizerModal.test.ts` from `apps/web`, plus `npm run lint` and `npm run typecheck` from root.

## Decisions & constraints

- Grouping is by facial feature, not by control type — user rejected the old Face/Glyphs split ("the organization is awful").
- Identity tab absorbed bot NAME + color + glyph — user chose this scope ("Name + color + glyph") over also moving AI parameters or profile sections into the studio.
- Name edits do NOT autosave per keystroke (would persist half-typed names); they mark the draft dirty and ride the Save button. Face edits autosave (existing behavior, pinned by tests).
- Full-screen studio layout stays; only chrome and organization changed.
- Keep UI text minimal — glyphs carry meaning; labels are short ("Style", "Presets", not sentences).

## Landmines

- **The customizer tests are source-regex tests** (`botAvatarCustomizerModal.test.ts` reads `page.tsx`/`page.module.css` as text and asserts structure). Renaming a class or reordering JSX branches breaks them by design — update the pins deliberately, don't fight them.
- **Anything portaled to `document.body` loses all theme variables.** If you add a new overlay, either mount it inside the app shell or reuse `.botAvatarStudioThemeScope`.
- **`overflow: hidden` on grid items inside the control stack** re-introduces the unreachable-controls bug (scroll-container items contribute ~0 height to track sizing). Use `clip-path` or clip children instead.
- **A parallel Codex session is active on this working tree** — it commits frequently (it committed this session's studio work). Re-run `git status` before every commit and never `git add -A`.
- `page.tsx` is ~92k lines; the studio code lives at roughly: modal ~31500+, face controls ~30750, identity controls ~30424, tab constants ~29990. Grep for `BotAvatarCustomizerModal` / `BotAvatarFaceControls` rather than trusting line numbers.

## Map

- `apps/web/src/app/page.tsx` — all studio components (`BotAvatarCustomizerModal`, `BotAvatarFaceControls`, `BotAvatarIdentityControls`, `BotAvatarCoordinateControl`)
- `apps/web/src/app/page.module.css` — studio styles (`botAvatar*` rules, `.botAvatarStudioThemeScope`, section accents by `data-avatar-control-tab`)
- `apps/web/src/app/botAvatarCustomizerModal.test.ts` — structural pins for everything above
- `packages/shared/src/botAvatar.ts` — shared avatar logic
- Commands: `npm run dev` · `npm run lint` · `npm run typecheck` · tests: `cd apps/web && node --test --experimental-strip-types src/app/botAvatarCustomizerModal.test.ts`
- Environment: API :18787, web :18788, dev DB `apps/api/data/localai.db`; `.claude/launch.json` defines the `prism-dev` preview config

## Verification

- All four control tabs + Identity, in dark and light, for a colored bot AND the default Prism bot.
- Eye/mouth position pads: drag with mouse, arrow keys (Shift = 3× step), reset buttons.
- Save flow: rename bot on Identity tab → status chip shows "Unsaved" → Save persists; face edits autosave without pressing Save.
- `node --test` suite above stays 16/16; lint + typecheck clean.
