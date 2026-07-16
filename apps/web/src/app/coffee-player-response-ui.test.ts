import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee player response UI wiring", () => {
  it("renders the table composer through the rich mention-capable input", () => {
    assert.match(
      pageSource,
      /enabled=\{coffeeComposerUsesRichInput\(\{[\s\S]*?variant,[\s\S]*?markdownEditorEnabled:\s*composerMarkdownEditorEnabled,[\s\S]*?\}\)\}/,
    );
  });

  it("requests the bot response immediately after the player line settles", () => {
    assert.match(
      pageSource,
      /await waitForCoffeeUserRevealToSettle\(\);[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\);[\s\S]*?const presentBotIds =[\s\S]*?runCoffeeTurnJob\(/,
    );
    assert.doesNotMatch(pageSource, /coffeePlayerResponseBeatMs/);
    assert.match(
      pageSource,
      /resolveCoffeeUserRevealSettledWaiters\(\);[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\)/,
    );
    assert.match(
      pageSource,
      /const revealArgs: CoffeePendingRevealQueueArgs = \{[\s\S]*?includeCooldown: false,/,
    );
  });

  it("keeps the responding bot thinking until speaking actually begins", () => {
    assert.match(
      pageSource,
      /const beginSpeaking = async[\s\S]*?await startCoffeeVoiceForReveal\([\s\S]*?setCoffeeTurnRhythmState\("tableTyping"\)/,
    );
    assert.match(
      pageSource,
      /coffeeDraftRef\.current\.trim\(\)\.length > 0[\s\S]*?\? "playerComposing"[\s\S]*?: "botThinking"/,
    );
  });

  it("does not let canceled voice preparation reclaim the table", () => {
    assert.match(
      pageSource,
      /const beginSpeaking = async[\s\S]*?await startCoffeeVoiceForReveal\([\s\S]*?if \(!revealDeliveryIsCurrent\(\)\) return null;[\s\S]*?setCoffeeTurnRhythmState\("tableTyping"\)/,
    );
    assert.match(
      pageSource,
      /const beginSpeakingAndScheduleReveal[\s\S]*?durationMs === null \|\| !revealDeliveryIsCurrent\(\)[\s\S]*?setTimeout\(applyReveal, durationMs\)/,
    );
    assert.match(
      pageSource,
      /const applyReveal = \(\) => \{[\s\S]*?if \(!revealDeliveryIsCurrent\(\)\) return;/,
    );
  });

  it("hands a refreshed player line to one visible owner", () => {
    assert.match(
      pageSource,
      /persistedUserMessageVisible:[\s\S]*?coffeePersistedUserLineOwnsPendingReveal\(\{[\s\S]*?messages:\s*centerFeedSourceMessages,[\s\S]*?userRevealText:\s*coffeeUserRevealText/,
    );
  });

  it("hides a pending bot response through cooldown and voice preparation", () => {
    assert.match(
      pageSource,
      /const pendingAssistantRevealActive =\s*pendingLatestMessage\?\.role === "assistant";/,
    );
    assert.match(
      pageSource,
      /const tableTimelineMessages = coffeeCenterFeedMessagesDuringPendingReveal\(\{[\s\S]*?messages: tableTimelineMessagesRaw,[\s\S]*?revealInProgress: pendingAssistantRevealActive/,
    );
    assert.match(
      pageSource,
      /const centerFeedSourceMessages =[\s\S]*?revealInProgress: pendingAssistantRevealActive/,
    );
  });

  it("keeps punctuation-only interruption rows out of visible table text", () => {
    assert.match(
      pageSource,
      /function coffeeMessageHasTableText[\s\S]*?coffeeTableMessageContentIsVisible\([\s\S]*?coffeeTableDisplayText\(message\.content\)/,
    );
  });

  it("lets the active thinking state suppress the matching seat's sip", () => {
    assert.match(
      pageSource,
      /const seatIsThinking = thinkingBotId === bot\.id;/,
    );
    assert.match(
      pageSource,
      /buildCoffeeCupVisualState\(\{[\s\S]*?thinking:\s*seatIsThinking,/,
    );
    assert.match(
      pageSource,
      /completedSipAnimationActive\s*=\s*[\s\S]*?!seatIsThinking/,
    );
  });

  it("starts each bot's cup clock when that seat finishes arriving", () => {
    assert.match(
      pageSource,
      /coffeeCupConsumptionStartedAtMsBySeatKeyRef = useRef<[\s\S]*?Map<string, number>/,
    );
    assert.match(
      pageSource,
      /nameplateTimer: setTimeout\(\(\) => \{[\s\S]*?coffeeCupConsumptionStartedAtMsBySeatKeyRef\.current\.set\([\s\S]*?Date\.now\(\)[\s\S]*?assignCoffeeNameplatePendingBotIds/,
    );
    assert.match(
      pageSource,
      /coffeeCupConsumptionTimingForSeat\(\{[\s\S]*?seatActive: seatIsFirmlySeated,[\s\S]*?seatActivatedAtMs:[\s\S]*?fallbackSessionStartedAtMs:[\s\S]*?fallbackSessionEndsAtMs:/,
    );
    assert.match(
      pageSource,
      /buildCoffeeCupVisualState\(\{[\s\S]*?\.\.\.coffeeCupConsumptionTiming,[\s\S]*?durationMinutes: coffeeCupDurationMinutes/,
    );
  });
});
