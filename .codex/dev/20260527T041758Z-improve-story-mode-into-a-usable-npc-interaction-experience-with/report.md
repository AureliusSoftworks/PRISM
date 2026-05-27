# Report

Goal: Improve Story Mode into a usable NPC interaction experience with dialog, choices, animated NPC faces, and collectable scene items

Changed files:
- `apps/web/src/app/story-mode-dialog.ts`
- `apps/web/src/app/story-mode-dialog.test.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/page.module.css`
- `apps/web/package.json`

Outcome:
- Story Mode now has click-through dialog beats with player choices revealed after dialog completion.
- Bots in Story scenes are presented as NPC actors with a simple animated face and a pulsing chest glyph badge.
- Story setup copy calls selected bots the NPC cast.
- Scene item pickups use the existing API and inventory remains separate from dialog/actor state.
- Choice gating checks inventory through a focused helper.

Verification:
- Web tests, web typecheck, web production build, and browser smoke check passed.
- Temporary database fixture was deleted after browser verification.

Evidence:
- `evidence/screenshots/story-npc-dialog.png`
