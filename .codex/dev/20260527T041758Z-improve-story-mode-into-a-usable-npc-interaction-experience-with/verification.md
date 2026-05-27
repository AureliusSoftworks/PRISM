# Verification

Goal: Improve Story Mode into a usable NPC interaction experience with dialog, choices, animated NPC faces, and collectable scene items

Passed:
- `node --test --experimental-strip-types src/app/story-mode-dialog.test.ts`
- `npm run test -w apps/web`
- `npm run typecheck -w apps/web`
- `npm run build -w apps/web`
- Browser smoke check on `http://127.0.0.1:18788/?view=story` via `scripts/prism web`.

Browser smoke evidence:
- Logged in as local admin.
- Opened Story Mode.
- Inserted temporary Story fixture with one NPC, two dialog beats, one visible item, one item-gated choice, and one ungated choice.
- Confirmed click-through dialog hides choices until final beat.
- Confirmed NPC label shows `NPC · speaking`.
- Confirmed visible item pickup removes scene item, enables item-gated choice, and adds the item to inventory.
- Confirmed choosing the item-gated response advances to the next scene.
- Removed temporary fixture from `story_sessions`.

Screenshot:
- `evidence/screenshots/story-npc-dialog.png`
- `evidence/screenshots/story-npc-chest-glyph.png`
- `evidence/screenshots/story-npc-face-and-chest-glyph.png`

Gap:
- No automated React/browser integration test exists for the large `page.tsx` Story UI; coverage is helper-level plus browser smoke.
