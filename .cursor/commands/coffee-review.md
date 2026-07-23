# /coffee-review — Coffee lane code review

Review the current diff (or the files I name) with a Coffee-lane focus. Coffee is the multi-bot group-chat lane where the server orchestrates turn order and lane isolation is hard-enforced.

## Files that shape Coffee behavior

- **Backend**: `apps/api/src/coffee.ts`, `apps/api/src/coffee-turn-jobs.ts`, `apps/api/src/coffee-powers.ts`, plus turn hooks in `apps/api/src/chat.ts` and `apps/api/src/conversations.ts`.
- **Frontend**: no single entry component — Coffee UI is spread across many `apps/web/src/app/coffee-*.ts(x)` modules (arrivals, atmosphere, bot-info-card, center-scroll, configuration-lock, cup-sprites, live-immersion, poll-turn-response, replay, seat-*, etc.), plus `botGroupCoffeeStaging.ts` and `botGroupCoffeeReturnCheckpoint.ts`.
- Note: `BotcastExperience.tsx` is Signal, not Coffee — don't confuse the two.

## Invariants to check (from CLAUDE.md)

- **Bot count**: 2–5 bots per Coffee session.
- **Turn orchestration**: server-driven, not client-driven. No client can force who speaks next.
- **Lane isolation**: Coffee must not read Chat companion memory, and Chat must not receive Coffee session context.
- **Runtime knob leakage**: advanced knobs that are legal in Sandbox (provider/model overrides, aux-only settings) must be ignored server-side when the origin is Coffee.
- **LOCAL/ONLINE gate**: any new fetch in Coffee must respect the mode gate — no outbound packets in LOCAL mode.

## Report shape

- **Correctness**: bugs, race conditions, dropped turns, missing await, orphaned rows.
- **Invariant risks**: any weakening of the checks above.
- **UX/vibe**: does it fit Coffee's multi-voice pacing and arrivals?
- **Test coverage**: point to the sibling `coffee-*.test.ts` files that should also change.
