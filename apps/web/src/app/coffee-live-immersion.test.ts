import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(appDir, "page.module.css"), "utf8");

describe("Coffee live immersion", () => {
  it("tags a seated bot in the composer on click, one tag at a time", () => {
    assert.match(
      pageSource,
      /const tagCoffeeBotInComposer[\s\S]{0,700}PRISM_BOT_MARKDOWN_LINK_RE\.source[\s\S]{0,400}setCoffeeDraft\(nextDraft\)/u,
    );
    assert.match(
      pageSource,
      /if \(liveSeatTagEnabled\) \{\s*tagCoffeeBotInComposer\(bot\);/u,
    );
    // Tagging hands focus to the composer so typing can start immediately.
    assert.match(
      pageSource,
      /const tagCoffeeBotInComposer[\s\S]{0,1100}requestAnimationFrame\(\(\) => coffeeComposerRichRef\.current\?\.focus\(\)\)/u,
    );
    // Live seats clamp above the composer so the player is never clipped.
    assert.match(
      pageSource,
      /coffeeLivePlayerSeatPosition\(coffeeReviewLayout\)/u,
    );
  });

  it("tells the player which invitees couldn't make it tonight", () => {
    assert.match(
      pageSource,
      /coffeeAbsentBotNames[\s\S]{0,700}couldn't make it tonight\./u,
    );
    assert.match(pageSource, /className=\{styles\.coffeeAbsentNote\}/u);
    assert.match(cssSource, /\.coffeeAbsentNote\s*\{/u);
  });

  it("gives dice-based cut-ins an opening-lines grace period", () => {
    // Review f2647f86: Meg cut off Brian's first sentence of the night on a
    // bare crossTalk roll. Chance-based interruptions need table history;
    // only Power-certain cut-ins may fire on the opening lines.
    assert.match(
      pageSource,
      /if \(!unconditionalInterruption && assistantCount < 3\) \{\s*return;\s*\}/u,
    );
  });

  it("seats the player mug opposite the nameplate glyph", () => {
    assert.match(
      pageSource,
      /className=\{styles\.coffeePlayerCupButton\}[\s\S]{0,700}data-cup-side="left"/u,
    );
    assert.match(cssSource, /\.coffeePlayerCupButton \{[\s\S]{0,80}left: -14px;/u);
    // The seat is pointer-transparent; the button must opt back in or every
    // click falls through to the stage ("clicking it does nothing").
    assert.match(
      cssSource,
      /\.coffeePlayerCupButton \{[\s\S]{0,500}pointer-events: auto;/u,
    );
    // Session-start hint pulse so "how do I drink my coffee?" answers itself.
    assert.match(cssSource, /@keyframes coffeePlayerCupHint/u);
    assert.match(
      cssSource,
      /animation: coffeePlayerCupHint 900ms ease-in-out 1400ms 3;/u,
    );
  });

  it("keeps the live table to one coffee affordance — the sip mug", () => {
    // Review 8e012a9d: the decorative replay pot sat beside the interactive
    // mug on a live table and read as a second, dead control.
    assert.match(
      pageSource,
      /data-pot-live-hidden=\{\s*!coffeeReplayActive \? "true" : undefined\s*\}/u,
    );
    assert.match(
      cssSource,
      /\.coffeeReplayPlayerPot\[data-pot-live-hidden="true"\] img\s*\{[\s\S]{0,60}opacity: 0/u,
    );
    assert.match(
      cssSource,
      /\.coffeePlayerCupButton:hover:not\(:disabled\) \.coffeeCup/u,
    );
  });

  it("omits waiter presentation and keeps the live player off camera", () => {
    assert.doesNotMatch(pageSource, /coffeeBarScene|coffeeWaiterVisit/u);
    assert.match(
      pageSource,
      /coffeeReplayActive && \(replayState\?\.playerPresent \?\? true\)[\s\S]*?className=\{styles\.coffeeReplayPlayerSeat\}/u,
    );
    assert.doesNotMatch(pageSource, /coffeeReplayOffCameraPotDock/u);
    assert.doesNotMatch(
      pageSource,
      /coffeeSessionPhase === "live"[\s\S]{0,180}className=\{styles\.coffeeReplayPlayerSeat\}/u,
    );
  });

  it("claims the living session from the topic picker onward", () => {
    // An unclaimed page gets render-throttled by WebKit/App Nap when the
    // player steps away, and the throttle can stick (session 9c2a7b79 froze
    // at the topic picker at 1 FPS with an idle main thread).
    assert.match(
      pageSource,
      /coffeeSessionPhase !== "live" &&\s*coffeeSessionPhase !== "arriving" &&\s*coffeeSessionPhase !== "topic"[\s\S]{0,200}acquirePrismLivingSession\("coffee", ownerId\)/u,
    );
  });

  it("can always recover a wedged table, whatever is holding the clock", () => {
    // Session 2253b3903a sat 100 minutes at 66 FPS with busy 0ms/s and Send
    // greyed. The watchdog existed; it just could not fire. Two reasons, both
    // pinned here.
    // 1. It measured elapsed time on `coffeeSessionClockMs`, which model warmup
    //    deliberately freezes — a recovery path must not share a clock with the
    //    thing it recovers from.
    assert.match(
      pageSource,
      /const nowMs = Date\.now\(\);\s*const stuckSinceMs = coffeeStuckThinkingSinceMsRef\.current \?\? nowMs;[\s\S]{0,200}nowMs - stuckSinceMs >= COFFEE_STUCK_THINKING_WATCHDOG_MS/u,
    );
    // 2. Its only regular driver was that same clock, so a frozen clock also
    //    stopped it re-evaluating. It now has a tick of its own.
    assert.match(pageSource, /COFFEE_STALL_RECOVERY_TICK_MS = 5_000;/u);
    assert.match(
      pageSource,
      /setCoffeeStallRecoveryTickMs\(Date\.now\(\)\);\s*\}, COFFEE_STALL_RECOVERY_TICK_MS\)/u,
    );
    assert.match(pageSource, /coffeeStallRecoveryTickMs,/u);
    // 3. What froze the clock: `releaseCoffeeModelWarmup` returns early on the
    //    `failed` phase, so a failed warmup is terminal until a retry — and
    //    holding the clock for it stopped the countdown indefinitely.
    assert.match(
      pageSource,
      /const modelWarmupActive =\s*coffeeModelWarmupRef\.current !== null &&\s*coffeeModelWarmupRef\.current\.phase !== "failed";/u,
    );
    // No recovery decision may read a clock the table can hold.
    assert.match(pageSource, /\(endsAt === null \|\| nowMs < endsAt\)/u);
    // Prevention: `cooldown` is a bridge to a timer, so cancelling the timer
    // must release the state rather than park the table behind a disabled
    // composer, and a hand-off that dies must not die silently.
    assert.match(
      pageSource,
      /coffeeCooldownTimerRef\.current = null;[\s\S]{0,420}coffeeTurnRhythmStateRef\.current === "cooldown"[\s\S]{0,120}setCoffeeTurnRhythmState\("idle"\)/u,
    );
    assert.match(
      pageSource,
      /const releaseStalledHandoff = \(\) => \{[\s\S]{0,320}revealDeliveryIsCurrent\(\)[\s\S]{0,320}setCoffeeTurnRhythmState\("idle"\)/u,
    );
    assert.match(pageSource, /\.catch\(\(\) => \{[\s\S]{0,160}releaseStalledHandoff\(\);/u);
  });

  it("keeps reveal progress out of full-surface renders", () => {
    // Review 47d7aa3d: per-character typewriter commits reconciled the entire
    // Coffee surface; at 5 seats that pinned the table at 1 FPS with
    // busy 3519ms/s and made typing "incredibly difficult". The exact
    // character now rides `coffeeRevealProgressChannel`; only a coarse
    // mouth-cadence mirror reaches React state.
    const revealAdvances = pageSource.match(
      /advanceCoffeeTypewriterLength\(\{/gu,
    );
    assert.equal(
      revealAdvances?.length,
      2,
      "both the player and bot typewriter loops publish to the channel",
    );
    assert.match(
      pageSource,
      /const revealedLength = fixedLength \?\? channelLength;/u,
    );
    // Frame-rate-gated commit intervals are feedback loops, not fixes: they
    // widen as frames collapse and narrow as they recover, so they oscillate
    // exactly like the avatar load sheds that were removed for the same flaw.
    assert.doesNotMatch(pageSource, /coffeeTypewriterCommitBudgetMs/u);
    assert.doesNotMatch(pageSource, /coffeeComposerDraftSyncDelayMs/u);
    // Audible phoneme/viseme transitions are committed discretely through
    // React; no imperative DOM driver may rotate or replace authored glyphs.
    assert.match(pageSource, /coffeeLiveAvatarSpeechProgressShouldCommit/u);
    assert.doesNotMatch(pageSource, /CoffeeLiveMouthDomDriver/u);
    // The live composer is native and ref-backed. A delayed parent draft sync
    // still creates periodic reconciliation work while the person is typing.
    assert.doesNotMatch(pageSource, /COFFEE_COMPOSER_PARENT_DRAFT_SYNC_MS/u);
    // Coffee seats are HD, always: review 47d7aa3d ran at 1 FPS with
    // busy 3519ms/s, so the bottleneck is the main thread, not avatar
    // materials, and no frame-rate shed may take the bodies away.
    assert.doesNotMatch(pageSource, /coffeeSeatLoadShedding/u);
    assert.doesNotMatch(pageSource, /coffeeSeatShouldDropRenderedSize/u);
    // A recovery-held room holds still: no idle animation may keep forcing
    // full-canvas filtered repaints under the grayscale pause.
    assert.match(
      cssSource,
      /\.coffeeStage\[data-model-warmup="held"\] \.coffeeTableCanvas \*[\s\S]{0,360}animation-play-state: paused !important/u,
    );
    assert.match(
      cssSource,
      /\.coffeeStage\[data-motion-shed="true"\][\s\S]{0,520}\[data-prism-decorative-motion="true"\][\s\S]{0,220}animation-play-state: paused !important/u,
    );
  });

  it("mutters stew asides over long thinking windows", () => {
    // While one bot's answer generates, another bot may take advantage of the
    // wait ("While A stews on that…") via a coexisting turn job. LOCAL keeps
    // one inference lane so the mutter cannot steal renderer time.
    assert.match(
      pageSource,
      /const stewShape =[\s\S]{0,900}COFFEE_STEW_ASIDE_DELAY_MS/u,
    );
    assert.match(
      pageSource,
      /COFFEE_STEW_ASIDE_DELAY_MS &&\s*coffeeSessionProviderRef\.current !== "local"/u,
    );
    assert.match(pageSource, /const runCoffeeStewAside = async/u);
    assert.match(pageSource, /thinkingAsideAboutBotId: args\.thinkerBotId,/u);
    // The lean poller must never touch the shared job refs or busy states —
    // the thinker's job stays the table's active job throughout.
    const pollerSource = pageSource.slice(
      pageSource.indexOf("const runCoffeeStewAside"),
      pageSource.indexOf("coffeeRunStewAsideRef.current = runCoffeeStewAside"),
    );
    assert.ok(pollerSource.length > 0);
    assert.doesNotMatch(
      pollerSource,
      /coffeeActiveTurnJobIdRef|setCoffeeActiveTurnJob|setCoffeeAutoBusy|setCoffeeBusy/u,
    );
  });

  it("never wedges the table on stuck reveals or dead thinking seats", () => {
    // Player voice prep that never reports a start reveals on the provisional
    // plan instead of holding the queued bot reveal hostage (review 8e012a9d:
    // SpongeBob's reply stayed invisible until a player poke).
    assert.match(
      pageSource,
      /voiceStartFailsafeTimer = window\.setTimeout\(\(\) => \{\s*voiceStartFailsafeTimer = null;\s*controller\.abort\(\);\s*settle\(null\);\s*\}, COFFEE_PLAYER_VOICE_START_FAILSAFE_MS\)/u,
    );
    // A botThinking seat with no in-flight work self-recovers and hands the
    // floor back to the stalled speaker (Plankton's 138s dangling question).
    // The same watchdog covers a pending reveal that never started (session
    // 6d6f1239's seven-minute dead table), an idle-with-pending-speaker, and a
    // stranded cooldown (session 2253b3903a). The shapes themselves live in
    // `coffeeTableStallShapeV1` and are unit-tested there.
    assert.match(
      pageSource,
      /const stuckThinkingShape = coffeeTableStallShapeV1\(\{[\s\S]{0,420}cooldownTimerArmed: coffeeCooldownTimerRef\.current !== null,/u,
    );
    assert.match(
      pageSource,
      /if \(!stuckThinkingShape\) \{\s*coffeeStuckThinkingSinceMsRef\.current = null;/u,
    );
    assert.match(
      pageSource,
      /stalledBotId \?\? undefined,/u,
    );
    // A player send that supersedes a queued, never-started bot reveal cuts it
    // off properly instead of letting the next sync dump the full text.
    assert.match(
      pageSource,
      /const supersededReveal = coffeePendingRevealAfterUserRef\.current;[\s\S]{0,900}visibleTokenCount: 1,/u,
    );
    // Session finish lets an actively revealing closing line settle before
    // tearing the reveal down (review 9c2a7b79: exit line heard after the
    // synopsis appeared).
    assert.match(
      pageSource,
      /const rhythmAtFinish = coffeeTurnRhythmStateRef\.current;[\s\S]{0,320}await waitForCoffeeRevealToSettle\(\);[\s\S]{0,240}resetCoffeeRhythm\(\);/u,
    );
  });

  it("holds a live departing seat through the authored walk-away animation", () => {
    assert.match(
      pageSource,
      /const \[coffeeLiveDepartingBotId, setCoffeeLiveDepartingBotId\][\s\S]*coffeeLiveDepartureTimerRef/u,
    );
    assert.match(
      pageSource,
      /liveDepartureEvent\?\.kind === "botDeparture"[\s\S]*setCoffeeLiveDepartingBotId\(departingBotId\)[\s\S]*coffeeReplayCompletionHoldMs\(pendingMessage, reducedMotion\)/u,
    );
    assert.match(
      pageSource,
      /const coffeeReviewSeatBotIds = restoreCoffeeReviewSeatBotIds\([\s\S]*coffeeRecordedDepartedBotIds\.has\(entry\.botId\)[\s\S]*coffeeLiveDepartingBotId !== entry\.botId/u,
    );
    assert.match(
      pageSource,
      /data-live-departing=\{[\s\S]*seatLiveDeparting \? "true" : undefined/u,
    );
    assert.match(
      cssSource,
      /\.coffeeStage\[data-phase="live"\] \.coffeeSeat\[data-live-departing="true"\]\s*\{[\s\S]*animation:\s*coffeeSeatWalkAway 2600ms/u,
    );
  });
});
