# Handoff: Coffee Mode freeze — typewriter reconciliation

Generated: 2026-08-19 (updated) · Branch: dev · Status: freeze #1 mitigated, freeze #2's identified vetoes all closed. Unstaged, unflown.

## Mission

Coffee Mode freezes hard enough that Jared has force-quit Prism twice. Definition of done: a 5-bot Coffee table stays typeable for a full session, messages commit in authored order, and the app never needs force-quitting.

**There are two distinct freezes.** Do not conflate them.

## Freeze #1 (saturation) — what landed

Reveal progress no longer travels through `HomeContent` state per character.

- **New module** [apps/web/src/app/coffeeRevealProgressChannel.ts](apps/web/src/app/coffeeRevealProgressChannel.ts) — a module-level store in the house `botHubVoicePreviewMouth` shape: `publishCoffeeRevealProgress(length)`, `subscribeCoffeeRevealProgress`, `coffeeRevealVisibleLength()`, plus `coffeeRevealCoarseShouldCommit` and `COFFEE_REVEAL_COARSE_COMMIT_MS = 120`.
- **Two publish helpers in `HomeContent`** (next to the state, ~`page.tsx:65540`): `advanceCoffeeTypewriterLength({nowMs, length, totalLength})` for the RAF steps (exact to the channel every frame, coarse React mirror once per 120ms mouth phase, always on the final character) and `assignCoffeeTypewriterLength(length)` for discrete jumps (reset / settle / seal).
- **`coffeeTypewriterLengthRef` is gone.** It was assigned during render (`page.tsx:65508`), which only worked because every length change forced a render. All five readers now call `coffeeRevealVisibleLength()`.
- **`coffeeTypewriterLength` state survives but is deliberately coarse** — it drives only mouth-cadence consumers: seat mouth shapes, stage-direction badges, gaze mentions, player plate mouth.
- **New leaf component `CoffeeRevealTypewriterLine`** at module scope (~`page.tsx:31809`), `memo`, `useSyncExternalStore`. It is the only thing that renders per character. Both the bot line and the player line use it; replay passes `fixedLength={coffeeReplayTypewriterLength}`.
- **Center-feed auto-follow moved into the leaf's `useLayoutEffect`**, via the stable `followCoffeeCenterFeedReveal` callback, so the scroll is ordered after the text it follows. The top-level auto-follow effect keeps its other triggers.
- **Three effects converted from a length dependency to a channel subscription**, keeping their closures intact: the automatic cut-in gate, the player action SFX cue, the bot action SFX + authored-reaction cue. All three callees are fired-key idempotent, and the cut-in callback re-checks `coffeeAutomaticCutInConsideredRef` on entry.
- **`coffeeSessionClockMs` stays a dependency of the cut-in effect on purpose.** A holding reveal publishes nothing, and `holdLongEnough` is the branch that exists for that pause — the 1 Hz re-subscribe is what re-checks it. The hold window itself now reads `Date.now()` so a subscription closure cannot age.
- **Both FPS-gated budgets deleted.** `coffeeTypewriterCommitBudgetMs` and `coffeeComposerDraftSyncDelayMs` are gone from [coffee-user-reveal-flow.ts](apps/web/src/app/coffee-user-reveal-flow.ts) (a comment marks the grave). The composer draft sync is back on the committed constant `COFFEE_COMPOSER_PARENT_DRAFT_SYNC_MS = 240`.

Nothing is committed. `page.tsx` also carries Jared's in-flight work — **never `git add -A`**.

## Freeze #2 (deadlock) — what landed

The rhythm state could park on `"cooldown"` with nothing able to release it: `cooldown` disables the composer, the reconciliation effect ([page.tsx:69149](apps/web/src/app/page.tsx)) deliberately refuses to reset out of it, and `clearCoffeeRhythmTimers` cancels the hand-off timer that `cooldown` exists to bridge to without touching the state.

The watchdog that should have caught this **already matched the shape** — `deadPendingReveal` is true during any cooldown, since `queueCoffeeReveal` sets the pending reveal before the state. It could not fire because it measured elapsed time on `coffeeSessionClockMs`, which model warmup deliberately freezes (`if (!modelWarmupActive) setCoffeeSessionClockMs(now)`), *and* that same clock was its only regular re-evaluation driver. A recovery path must not share a clock with the thing it recovers from.

- **Recovery, time base** — the stall threshold now measures on `Date.now()`, not the pausable session clock.
- **Recovery, tick** — new `COFFEE_STALL_RECOVERY_TICK_MS = 5_000` interval and `coffeeStallRecoveryTickMs` dep, live only while the phase is `live`/`arriving`, so the watchdog keeps evaluating no matter what holds the session clock. 0.2 Hz; negligible against the render budget.
- **Predicate extracted** — the dead-shape check is now `coffeeTableStallShapeV1` in [coffee-user-reveal-flow.ts](apps/web/src/app/coffee-user-reveal-flow.ts), unit-tested. It gains a `cooldown` clause **and** a `cooldownTimerArmed` input: a healthy cooldown and a stranded one are identical apart from that pending timer, so without it the watchdog would count against every ordinary cooldown.
- **Prevention** — `clearCoffeeRhythmTimers` releases the rhythm to `idle` when it cancels an armed cooldown timer; `beginSpeakingAndScheduleReveal` gained `releaseStalledHandoff()` on the `durationMs === null` path and on a rejected promise. Both are epoch-guarded: a stale epoch means another turn took the floor and owns the state, so those cases still return silently.
- **What actually froze the clock, most likely.** `releaseCoffeeModelWarmup` returns early on `phase === "failed"`, so a failed warmup is terminal until a retry replaces it — and `modelWarmupActive` treated any non-null warmup as active, so a single failed warmup froze `coffeeSessionClockMs` for the rest of the session. That is the mechanism behind a 100-minute wedge, and it fits the timing (a new turn after the 5th seat arrives triggers a warmup). `modelWarmupActive` now excludes the `failed` phase.
- **Recovery deliberately still declines to resume autoplay while a warmup is failed.** Releasing the rhythm un-greys the composer and hands the player the floor; restarting autoplay against a model that is genuinely unavailable would only spin, so the retry affordance owns that. If the wanted behaviour is full self-resume, `releaseCoffeeModelWarmup()` belongs in the recovery body before that gate — it is a product call, not an oversight.
- The three sites that clear `coffeeCooldownTimerRef` directly (~:70051, :72862, :80735) were checked and left alone: they are teardown paths (leaving the view, ending the session) where the predicate's `live`/`arriving` phase check already excludes a stall, and the new `cooldown` clause covers them by recovery anyway.
- Ruled out by inspection, deliberately left alone: `waitForActiveCoffeeSipBeforeTalk` is bounded (`COFFEE_SIP_TALK_FALLBACK_MS = 3_200`), and both `coffeeTurnAbortRef` / `coffeeContinueAbortRef` clear in `finally` with identity guards. `requestInFlight` was **not** loosened — a hung fetch with no timeout remains a theoretical veto on the watchdog, and is the first place to look if a wedge survives this.

**Be honest about what this is.** Which veto actually fired in session `2253b3903a` cannot be determined from source. What shipped is: every veto I could identify is closed, the recovery no longer shares a clock with the thing it recovers from, and the stall shapes are under unit test. If a table wedges again, that is new information, not a regression — start from `requestInFlight`.

## Honest sufficiency — do not call freeze #1 fixed yet

Freeze #2's fix is verifiable from source (pure predicate under unit test, plus source-shape pins on the wiring). Freeze #1's is not, and this is the part that still needs a flight.

Reveal-driven full-surface renders go from ~60 Hz (healthy frames) to ~8.3 Hz. That is a real 7× cut, but **`setCoffeeLiveAvatarSpeech` still commits at mouth-shape rate during voiced speech** (`coffeeLiveAvatarSpeechProgressShouldCommit`, [zenLiveMouth.ts:1220](apps/web/src/app/zenLiveMouth.ts)), which lands at the same cadence. Whether ~8 Hz clears the ratchet depends on whether one `HomeContent` render finishes under 120ms, which cannot be measured from source.

**The discriminating run to ask Jared for:** a 5-bot reveal with voice on, then the same table with voice muted, watching the `busy Nms/s` readout in the FPS badge.
- Muted dramatically better → `setCoffeeLiveAvatarSpeech` is the next target, and the same channel carries it (publish mouth shape per participant instead of a snapshot into state).
- Both still bad → the cost is the ~700 lines of per-seat computation upstream of `coffeeSeatAvatarRenderKey`, and the seat map needs its own memo boundary. Note `CoffeeSeatAvatarRenderer` is already `memo`'d on `renderKey` alone, so the avatar subtree itself is protected — the expense is everything computed *before* the key.

## Next actions (in order)

1. Get the voice-on / voice-muted comparison from Jared and pick the branch above.
2. Nothing for freeze #2 unless a table wedges again. If one does: the recovery now fires on a 45s wall-clock threshold, so a wedge lasting minutes means the watchdog is still being vetoed — check `requestInFlight` first (a fetch with no timeout leaving `coffeeTurnAbortRef` set is the one veto deliberately left in place).
3. **The replay typewriter is the same defect, untouched.** The replay reveal RAF (`page.tsx:68401/68411`) still commits per character into `coffeeReplayTypewriterLength` state — a full-surface reconcile per character while scrubbing a recording. It was left alone because the reported freeze is live-only, but Jared reviews sessions *through* replay, so a freeze while scrubbing is this. Wiring it onto the same channel is mechanical: `CoffeeRevealTypewriterLine` already accepts `fixedLength`, so replay would pass `null` and publish instead.
4. **The composer draft sync can now be removed, and that was not true when this fix was written.** It was left in place because `placeholder` sat in the `useEditor` deps and TipTap mounted with `content: value`, so a Coffee phase flip mid-typing rebuilt the editor from the parent's lagging draft — stopping the sync would have widened that loss window from 240ms to the whole session. `4fcfb179` closed that: the placeholder is read through a ref, and recreation now seeds from `pendingValueRef ?? lastEmittedRef` rather than `value`. With the hazard gone, keystrokes can stop reaching top-level state entirely (publish upward only on send, keeping the coarse `coffeeComposerHasDraft` boolean for the `playerComposing` rhythm at `page.tsx:69053`), which removes the last ~4 Hz of typing-driven full-surface renders. Fly the table first — this may already be inaudible next to the mouth-cadence renders.

## Decisions & constraints

- **Avatar tier shedding is dead everywhere and must stay dead.** Coffee seats, Signal stage, and Debate stage all pin `minimumRenderedSizeTier="full"`. `busy 3519ms/s` disproved the GPU theory.
- **This repo has no Prettier.** No config, no dependency, no format script — `page.tsx` is hand-formatted and `npx prettier --write` reformats ~4,200 lines of it. It was run once this session and reverted by 3-way merge against `prettier(HEAD)`; do not run it.
- Jared prefers fixes delivered without proactive test runs — run tests to verify a fix you doubt, or when touching a hot path like this one.
- Work directly on `dev`. Never branch, never push unless asked. Jared also commits from Cursor.

## Landmines

- **FPS-gated intervals are feedback loops, not fixes.** They widen as frames collapse and narrow as they recover, so they oscillate — the same flaw that retired the load sheds. `coffeeRevealProgressChannel.ts` carries no frame-rate input at all; keep it that way.
- **Hunk-level staging silently drops hunks.** Filtering `git diff` hunks into `git apply --cached` breaks once earlier hunks are staged. After any partial staging, verify: `git show HEAD:<path> | grep -c "<removed symbol>"`.
- **`page.tsx` is ~149k lines and one component.** That is *why* this bug is severe — there is no smaller reconciliation boundary.
- The `busy Nms/s` readout settles GPU-vs-CPU arguments. `busy 0ms/s` at 66 FPS = deadlock; `busy 3519ms/s` at 1 FPS = reconciliation storm. Use it before theorizing.
- The ordering inversion in review `47d7aa3d` (Jared's `Soooooooo` recorded 12s before Peter's reply to the prior message) is **plausibly** relieved by this fix but unverified. `coffeePendingRevealAfterUserRef` and `coffeeDeferBotRevealForPlayerLineRef` sequence by timing, not by an explicit commit order — if the inversion survives, that is where to look.

## Map

- [apps/web/src/app/coffeeRevealProgressChannel.ts](apps/web/src/app/coffeeRevealProgressChannel.ts) — the channel.
- [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx) — `CoffeeRevealTypewriterLine` ~:31809, coarse state + publish helpers ~:65530, reveal RAF loops ~:69100-69390, cut-in subscription ~:69543, SFX subscriptions ~:73560/:73630, draft sync ~:88790, `activeTypewriterLength` ~:135921.
- [apps/web/src/app/voiceLightEnvelope.ts](apps/web/src/app/voiceLightEnvelope.ts) — per-element publish pattern, :144-194.
- [apps/web/src/app/botHubVoicePreviewMouth.ts](apps/web/src/app/botHubVoicePreviewMouth.ts) — the external-store shape the channel copies.
- Commands: `npm run dev` · `node --test apps/web/src/app/<file>.test.ts` · `npm run typecheck` · `npm run lint`
- Environment: web on :18788, API on :18787. Jared runs the app; **logged-in UI checks are his**.

## Verification (state as of this handoff)

- `npm run typecheck` — fully clean. (The two `SessionReviewRecordingEvidence` errors noted earlier were resolved by the parallel session.)
- `npm run lint` — 0 errors in the touched files. Three pre-existing errors remain in `CoffeeSeatPlateEmoji.tsx` and `PronunciationAtlas.tsx`.
- `node --test apps/web/src/app/*.test.ts` (the whole web suite, not just `coffee-*`) — **zero new failures attributable to this change**, verified by diffing the failure set against a detached worktree at `HEAD` with `node_modules` symlinked. Re-run against `f3160dc0`: 177 failures now vs 182 at `HEAD`; 6 fixed, 1 new. That one new failure — `traps focus, makes the background inert, and restores the opener` in `bot-group-room-atmosphere-integration.test.ts` — is Jared's in-flight work: the test pins `node.setAttribute("inert", "")`, which he replaced with the still-uncommitted `applyPrismInert(node)` / `releasePrismInert(node)` (4 occurrences in the tree, 0 at `HEAD`).
  Reproduce the comparison with: `git worktree add --detach <tmp> HEAD`, symlink root and `apps/web` `node_modules` in, run the suite in both, `comm -23` the sorted `✖` lines.
- Re-run after the freeze #2 fix, against `371fda86`: 177 failures now vs 182 at `HEAD`, same single non-attributable `inert` failure.
- Updated source-shape pins: `coffee-live-immersion.test.ts` asserts the channel wiring, that neither FPS-gated helper can return, and the whole freeze #2 recovery path; `coffee-user-reveal-flow.test.ts` covers the channel's publish/subscribe, the fixed coarse cadence, and `coffeeTableStallShapeV1` (including that a healthy armed cooldown is *not* a stall and a stranded one is).
- One pre-existing pin was rewritten rather than widened: `never wedges the table on stuck reveals or dead thinking seats` anchored on a byte distance (`[\s\S]{0,700}`) between `stuckThinkingShape` and the threshold constant, and broke the moment a comment landed between them. It now anchors on the relationship (`if (!stuckThinkingShape) { coffeeStuckThinkingSinceMsRef.current = null;`).
