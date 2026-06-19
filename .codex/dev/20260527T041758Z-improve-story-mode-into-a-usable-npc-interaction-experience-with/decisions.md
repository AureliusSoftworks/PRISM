# Decisions

Goal: Improve Story Mode into a usable NPC interaction experience with dialog, choices, animated NPC faces, and collectable scene items

- No creative-direction changes were made beyond clarifying existing bots as NPC cast members.
- No new backend contract was introduced; existing Story session mutation endpoints were reused.
- Dialog progression is client-side UI state because persisted story progress already changes only on choices, travel, and item pickup.
- Temporary browser verification used a local database fixture, then deleted it after checks.
