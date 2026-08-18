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
    assert.match(
      pageSource,
      /const stuckThinkingShape =[\s\S]{0,400}COFFEE_STUCK_THINKING_WATCHDOG_MS/u,
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
