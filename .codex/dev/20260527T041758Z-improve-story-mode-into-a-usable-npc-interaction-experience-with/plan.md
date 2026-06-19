# Plan

Goal: Improve Story Mode into a usable NPC interaction experience with dialog, choices, animated NPC faces, and collectable scene items

Acceptance criteria:
- Story narration progresses through click-through dialog beats.
- Choices appear only after the current dialog has finished.
- Choices are represented as player responses, not bot actions.
- NPC scenes show bot identity and animated face/mouth treatment.
- Scene item buttons call the pickup endpoint and collected items appear in inventory.
- Player progress, NPC actor display, dialog cursor, and inventory view state remain separated.

Work slices:
- Add small Story dialog/inventory helper module with focused tests.
- Wire Story play UI to dialog cursor state and reset cursor on scene changes.
- Update NPC actor rendering and Story copy to clarify bots are NPCs.
- Reuse existing item pickup endpoint and inventory panel.
- Verify with tests, typecheck, build, and browser smoke check.
