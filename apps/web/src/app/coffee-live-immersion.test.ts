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
    // Live seats clamp above the composer so the player is never clipped.
    assert.match(
      pageSource,
      /coffeeLivePlayerSeatPosition\(coffeeReviewLayout\)/u,
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
