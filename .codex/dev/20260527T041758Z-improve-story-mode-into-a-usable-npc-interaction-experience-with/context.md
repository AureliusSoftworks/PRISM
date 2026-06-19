# Context

Goal: Improve Story Mode into a usable NPC interaction experience with dialog, choices, animated NPC faces, and collectable scene items

Project root: `/Users/jared/Developer/Web Apps/LocalAI`

Initial git state: branch `codex/story-mode`, clean before the dossier was created.

Relevant architecture:
- Shared runtime already owns Story episode, progress, transcript, choice, travel, and item pickup state in `packages/shared/src/storyRuntime.ts`.
- API already persists Story sessions and exposes `/api/story/sessions/:id/choices`, `/travel`, and `/items`.
- Web Story Mode lived primarily in `apps/web/src/app/page.tsx` with styles in `page.module.css`.

Constraints followed:
- Player state remains `StorySessionProgress` and inventory ids.
- NPC state remains scene actor metadata plus bot profile lookup.
- Dialog cursor is UI-only and separate from persisted progress.
- Item pickup uses the existing item mutation endpoint.
