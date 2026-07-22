import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(appDir, "page.module.css"), "utf8");

describe("Coffee live immersion", () => {
  it("embodies the service bot in waiter visits instead of showing a coffee emoji", () => {
    assert.match(
      pageSource,
      /const renderCoffeeWaiterAvatar = \(\): React\.JSX\.Element => \([\s\S]*className=\{styles\.coffeeWaiterAvatar\}[\s\S]*<ZenLiveBotMannequin[\s\S]*glyph=\{coffeeBarServiceGlyph\}[\s\S]*avatarDetails=\{coffeeBarServiceAvatarDetails\}/u,
    );
    assert.equal(
      pageSource.match(/\{renderCoffeeWaiterAvatar\(\)\}/gu)?.length,
      2,
    );
    assert.doesNotMatch(pageSource, /<span aria-hidden="true">☕<\/span>/u);
    assert.match(
      cssSource,
      /\.coffeeWaiterAvatar\s*\{[\s\S]*--zen-live-bot-avatar-size:\s*clamp\(112px,\s*9cqw,\s*148px\);/u,
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
