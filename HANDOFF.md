# Handoff: Repair recurring Zen first-session scroll lock

Generated: 2026-07-11 · Branch: dev · Status: code and automated checks pass; Jared's live retest is still required

## Mission
Finish and validate the fix for Jared's recurring Zen startup regression: “The same annoying glitch preventing me from scrolling at the start of a zen session has presented itself YET again.” The affected view showed a completed assistant reply with a newer user prompt beneath it, but downward scrolling was blocked. Jared also supplied a React console error: `Maximum update depth exceeded`.

Done means a fresh Zen session can scroll through the first reply and newest prompt without locking, and the autonomy scheduler produces no update-depth loop with Autonomy either disabled or enabled.

## Current state
- ✅ Done: identified the scroll cause in `apps/web/src/app/page.tsx`. `resolveZenReadableAnchorRow()` preferred `latestAssistantMessageId` over the conversation's actual last message, so the intentional readable-bottom guard could stop at the previous assistant reply and hide/block a newer user prompt.
- ✅ Done: added `apps/web/src/app/zenReadableScroll.ts` and `zenReadableScroll.test.ts`. `zenReadableAnchorMessageIds()` now prioritizes `lastMessageId`, then uses assistant/user IDs only as rendering fallbacks and removes duplicates.
- ✅ Done: hardened Zen autonomy scheduling in `page.tsx` and `zenAutonomy.ts`. Queued animation-frame ticks now check `zenAutonomySchedulingActiveRef`; deactivation/unmount prevents stale state updates; the inactive reset effect no longer schedules another tick.
- ✅ Done: added `zenAutonomySchedulerIsActive()` and focused unit coverage.
- ✅ Done: documented the regression rule in `tasks/lessons.md`.
- ✅ Done: focused tests passed: 7 tests, 0 failures.
- ✅ Done: `npm run typecheck -w apps/web` passed.
- ✅ Done: mocked Chromium reproductions loaded the two-message first-session shape with the newest user prompt visible and no console errors, with `zenAutonomyEnabled` both `false` and `true`.
- ✅ Done: API and web were consolidated into one fresh dev stack; both returned HTTP 200 at handoff time.
- 🔄 In progress: manual validation was presented through AskQuestion, but Jared canceled the questionnaire to request this handoff. Treat the result as untested, not failed.
- ⬜ Not started: commit/push. Do not commit until Jared completes the live test.

The working tree is heavily mixed: 40 tracked files changed plus new files, approximately 3,081 insertions and 985 deletions. Most changes predate this Zen fix and belong to ongoing Avatar/Coffee/API work. Do not revert, stage, or commit them indiscriminately. This Zen task directly changed:
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/zenAutonomy.ts`
- `apps/web/src/app/zenAutonomy.test.ts`
- `apps/web/src/app/zenReadableScroll.ts` (new)
- `apps/web/src/app/zenReadableScroll.test.ts` (new)
- `tasks/lessons.md`

`page.tsx` and `tasks/lessons.md` also contain substantial pre-existing edits. Preserve all unrelated hunks.

## Next actions (in order)
1. Confirm the existing dev stack before starting another:
   `lsof -nP -iTCP:18787 -sTCP:LISTEN; lsof -nP -iTCP:18788 -sTCP:LISTEN`
2. If either service is missing, run `npm run dev` from `/Users/jared/Developer/Web Apps/PRISM`. Avoid launching a duplicate stack.
3. Ask Jared to perform the remaining live check:
   - Start a fresh Zen session.
   - Let the first bot reply finish.
   - Send one message so the new user prompt sits beneath that reply.
   - Scroll down through the canvas.
4. Use AskQuestion for the result. If green, ask one final check: open the browser console and confirm no `Maximum update depth exceeded` appears after the first reply.
5. If scrolling is still locked, request a screenshot in normal chat before editing. Inspect the live `.messages[data-chat-ephemeral]` values for `scrollTop`, `scrollHeight`, `clientHeight`, and `--zen-readable-tail-padding`.
6. If the console loop persists, capture the full current stack and inspect every caller of `requestZenAutonomyScheduleTick`; do not remove Autonomy as a workaround.
7. Re-run the focused tests and web type check after any adjustment.
8. Only after Jared approves the live behavior, discuss committing. There are many unrelated changes, so isolate the Zen files/hunks carefully and never use `git add -A`.

## Decisions & constraints
- Preserve the readable-bottom experience rather than deleting it. The correct fix is to anchor it to the newest chronological message.
- Keep the change incremental. Jared approved fixing the scroll lock and update loop together.
- Do not introduce a workaround that disables scrolling guards or Autonomy; Jared requires approval before workarounds.
- Manual confirmation is mandatory before any commit.
- The user's latest prompt must remain reachable even when the previous assistant reply is long.
- Scheduler state updates are permitted only while the signed-in Chat/Zen surface has Autonomy enabled.

## Landmines
- The earlier scroll repair in `page.module.css` is still correct: first/last ephemeral messages use `margin-block: 0` because flex auto margins can absorb first-turn overflow. Do not undo that fix.
- `resolveZenReadableMaxScrollTop()` deliberately clamps native scrolling. Removing the clamp would fix the symptom but regress the designed Zen reading endpoint.
- During a live assistant reply, `lastMessageId` and `latestAssistantMessageId` normally match. The critical regression case is a newer user message after the assistant reply.
- The mocked endpoint `POST /api/conversations/zen/open` returns `{ conversationId }`, not `{ conversation }`. Using the wrong fixture shape causes unrelated null-state crashes.
- Killing only the top-level `npm run dev` process can leave Node watch/Next children holding ports 18787/18788. Check listeners before restarting.
- The user's `Maximum update depth` stack pointed at `requestZenAutonomyScheduleTick`. Post-fix browser probes produced zero errors, but the exact live-user path still needs confirmation.
- `page.tsx` is roughly 94k lines and has many unrelated uncommitted edits. Search for function names; do not rely on old line numbers.

## Map
- `apps/web/src/app/page.tsx:784-786` — imports the scheduler and readable-anchor helpers.
- `apps/web/src/app/page.tsx:33646` — active-scheduler ref.
- `apps/web/src/app/page.tsx:40567-40605` — guarded animation-frame tick and inactive reset.
- `apps/web/src/app/page.tsx:46684-46697` — readable anchor selection.
- `apps/web/src/app/zenReadableScroll.ts` — newest-first anchor ordering.
- `apps/web/src/app/zenReadableScroll.test.ts` — regression tests for newer-user-message priority and fallback de-duplication.
- `apps/web/src/app/zenAutonomy.ts:42-50` — scheduler-active predicate.
- `apps/web/src/app/zenAutonomy.test.ts:91-110` — scheduler-active unit coverage.
- `tasks/lessons.md:7-10` — durable Zen scroll/scheduler lesson.
- Commands:
  - `node --experimental-strip-types --test "apps/web/src/app/zenReadableScroll.test.ts" "apps/web/src/app/zenAutonomy.test.ts"`
  - `npm run typecheck -w apps/web`
  - `npm run dev`
- Environment: API `http://127.0.0.1:18787`, web `http://127.0.0.1:18788`, branch `dev`.

## Verification
- Automated unit result: 7/7 passed using the focused Node test command above.
- Type result: web type check passed, including the shared package prebuild.
- Browser evidence: first-session fixture rendered two messages; newest user prompt was visible; no console errors with Autonomy off or on.
- Service evidence at handoff: `GET /api/health` returned 200 and the web root returned 200.
- Remaining manual acceptance:
  - Fresh Zen session scrolls downward normally after the first reply.
  - Newest user prompt remains reachable.
  - Scrolling does not feel constrained or jumpy.
  - Browser console stays free of `Maximum update depth exceeded`.
