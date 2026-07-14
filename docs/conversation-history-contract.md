# Conversation History contract

PRISM treats a saved conversation as an episode inside a stable context. The
API exposes this as `history` on conversation list and detail payloads while
retaining the older `botId`, `hubRole`, `hubBotId`, and `parentHubId` fields.

## Relationship Homes

- Prism Home uses `contextKey: "prism"` and has no owner bot.
- A persona Home uses `contextKey: "bot:<id>"` and stores that immutable owner
  on the Zen conversation row and in `conversation_hubs`.
- Starting a new session creates another episode with the same context key and
  updates `continuationConversationId` to the latest resumable episode.
- Visiting a Home changes context. A guest invitation or mention only adds a
  participant; guest replies and last-speaker metadata never change ownership.
- A stale conversation id is rerouted to the explicitly requested Home instead
  of crossing into Prism or another persona relationship.

## Other contexts

`ConversationHistoryEntry` explicitly represents side-chat forks, standalone
Coffee sessions, saved Coffee Groups, Sandbox threads, and legacy rows. Each
entry includes its root and episode ids, immutable owner/origin, participant
snapshot, timestamps/status, continuation target, and native route.

## Compatibility and privacy

- Old global Zen rows resolve to Prism Home without rewriting account data.
- Old Zen rows with a stable `bot_id` resolve to that persona Home.
- Existing hub/side metadata remains readable, including deleted bot ids.
- Archived episodes are not resumed; private conversations are never returned
  by the saved-history list.
- Last-speaker fields remain available for presentation, but must not be used
  for grouping, ownership, continuation, or native routing.
