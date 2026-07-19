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
      /const beginSpeakingAndScheduleReveal[\s\S]*?durationMs === null \|\| !revealDeliveryIsCurrent\(\)[\s\S]*?coffeeVoiceRevealFallbackDelayMs\(durationMs, voiced\)/,
    );
    assert.match(
      pageSource,
      /const applyReveal = \(\) => \{[\s\S]*?if \(!revealDeliveryIsCurrent\(\)\) return;/,
    );
  });

  it("lets natural voice completion own the end of a spoken reveal", () => {
    assert.match(
      pageSource,
      /onEnd: \(\) => \{[\s\S]*?const ownsReveal =[\s\S]*?releaseCoffeeVoicePlayback\(\);[\s\S]*?coffeeRevealCompleteFnRef\.current\?\.\(\);/,
    );
    assert.match(
      pageSource,
      /coffeeVoiceRevealFallbackDelayMs\(durationMs, voiced\)/,
    );
  });

  it("hands a refreshed player line to one visible owner", () => {
    assert.match(
      pageSource,
      /persistedUserMessageVisible:[\s\S]*?coffeePersistedUserLineOwnsPendingReveal\(\{[\s\S]*?messages:\s*centerFeedSourceMessages,[\s\S]*?userRevealText:\s*coffeeUserRevealText/,
    );
  });

  it("feeds accepted pending turns into Table talk without revealing bot prose early", () => {
    assert.match(
      pageSource,
      /const liveTranscriptMessages =\s*coffeePendingRevealConversation\?\.id === coffeeConversation\.id[\s\S]*?coffeePendingRevealConversation\.messages[\s\S]*?coffeeConversation\.messages/,
    );
    assert.match(
      pageSource,
      /pendingTranscriptMessageId && !pendingTranscriptRevealStarted[\s\S]*?message\.id !== pendingTranscriptMessageId/,
    );
    assert.match(
      pageSource,
      /pendingTranscriptLineTyping[\s\S]*?revealPlainTextWithBotMentions\([\s\S]*?coffeeTypewriterLength/,
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
      /const nameplateCallback = \(\) => \{[\s\S]*?coffeeCupConsumptionStartedAtMsBySeatKeyRef\.current\.set\([\s\S]*?Date\.now\(\)[\s\S]*?assignCoffeeNameplatePendingBotIds/,
    );
    assert.match(
      pageSource,
      /nameplateTimer: setTimeout\(nameplateCallback, nameplateDelayMs\)/,
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

  it("leaves Auto's ambient cup clock in charge when no accepted sip exists", () => {
    assert.match(
      pageSource,
      /const hasExplicitCupSipState =\s*cupSipCount > 0 \|\| activeSipAnimationCount !== null;/,
    );
    assert.match(
      pageSource,
      /sipCount:\s*seatIsFirmlySeated && hasExplicitCupSipState[\s\S]*?\? visualCupSipCount[\s\S]*?: null/,
    );
    assert.match(
      pageSource,
      /sippingOverride:[\s\S]*?hasExplicitCupSipState[\s\S]*?\? false[\s\S]*?: null/,
    );
  });
});
