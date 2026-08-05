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

  it("defers full Coffee table rerenders while the player keeps typing", () => {
    const handlerStart = pageSource.indexOf(
      "function updateCoffeeDraftFromComposer(next: string): void",
    );
    const handlerEnd = pageSource.indexOf(
      "type ShellComposerVariant",
      handlerStart,
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
    assert.match(
      handlerSource,
      /function updateCoffeeDraftFromComposer\(next: string\): void \{[\s\S]*?coffeeDraftRef\.current = next;[\s\S]*?nextHasDraft !== previousHasDraft[\s\S]*?setCoffeeComposerHasDraft\(nextHasDraft\);[\s\S]*?scheduleDeferredCoffeeDraftState\(next\);/,
    );
    assert.match(
      pageSource,
      /COFFEE_COMPOSER_PARENT_DRAFT_SYNC_MS = 240/,
    );
    assert.ok(
      handlerSource.indexOf("setCoffeeDraft(next)") >
        handlerSource.indexOf("if (nextHasDraft !== previousHasDraft)"),
    );
  });

  it("requests the bot response immediately after the player line settles", () => {
    assert.match(
      pageSource,
      /await userRevealSettlePromise;[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\);[\s\S]*?const presentBotIds =[\s\S]*?runCoffeeTurnJob\(/,
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
    // Thinking owns the rhythm even while the player is composing.
    assert.match(
      pageSource,
      /if \(coffeeBusy \|\| coffeeAutoBusy\) \{\s*setCoffeeTurnRhythmState\("botThinking"\);\s*return;\s*\}\s*if \(coffeeComposerHasDraft\) \{\s*setCoffeeTurnRhythmState\("playerComposing"\);/,
    );
    assert.doesNotMatch(
      pageSource,
      /coffeeDraftRef\.current\.trim\(\)\.length > 0[\s\S]{0,40}\? "playerComposing"[\s\S]{0,40}: "botThinking"/,
    );
  });

  it("never lets typing pause the table and queues sends behind a thinking bot", () => {
    // No typing-grace deferral machinery remains anywhere in the Coffee flow.
    assert.doesNotMatch(pageSource, /coffeeTableTalkAutoplayDeferralMs/);
    assert.doesNotMatch(pageSource, /coffeeGeneratedReplyRevealDeferralMs/);
    assert.doesNotMatch(pageSource, /COFFEE_TABLE_TALK_TYPING_GRACE_MS/);
    assert.doesNotMatch(pageSource, /paused while you type/);
    // Sending while a bot thinks waits for its line instead of aborting it.
    assert.match(
      pageSource,
      /const sendShouldWaitForThinkingBot =\s*!draftIsActionOnly &&\s*coffeeTurnRhythmState === "botThinking" &&\s*\(coffeeAutoBusy \|\|\s*coffeeContinueAbortRef\.current !== null \|\|\s*coffeePendingSpeakerBotId !== null\);/,
    );
    assert.match(
      pageSource,
      /if \(!actionShouldWaitForBotReveal && !sendShouldWaitForThinkingBot\) \{\s*clearCoffeeLoopTimer\(\);\s*coffeeContinueAbortRef\.current\?\.abort\(\);/,
    );
    assert.match(
      pageSource,
      /if \(actionShouldWaitForBotReveal \|\| sendShouldWaitForThinkingBot\) \{[\s\S]{0,220}?await waitForCoffeeRevealToSettle\(\);/,
    );
    // A visible reveal (tableTyping) is still a real player interruption.
    assert.match(
      pageSource,
      /!draftIsActionOnly &&\s*coffeeTurnRhythmState === "tableTyping" &&\s*pendingRevealLatestMessage\?\.role === "assistant" &&\s*coffeePendingSpeakerBotId/,
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
    assert.match(
      pageSource,
      /coffeeVoiceRevealStallWatchdogDelayMs\(\)/u,
    );
    assert.match(
      pageSource,
      /coffeeRevealTimerRef\.current = setTimeout\(\(\) => \{\s*coffeeRevealCompleteFnRef\.current\?\.\(\);/u,
    );
  });

  it("starts the speaking reveal only from real voice playback start", () => {
    assert.match(
      pageSource,
      /const resolvedDurationMs =\s*coffeeVoiceStartedDurationMs\(durationMs, fallbackDuration\) \?\?\s*Math\.max\(1, fallbackDuration\);/,
    );
    assert.match(
      pageSource,
      /setCoffeeLiveAvatarSpeech\(\{[\s\S]*?durationMs: resolvedDurationMs,[\s\S]*?\}\);[\s\S]*?settle\(resolvedDurationMs\)/,
    );
    assert.match(
      pageSource,
      /window\.setTimeout\(\(\) => \{[\s\S]*?if \(settled\) return;[\s\S]*?controller\.abort\(\);[\s\S]*?releaseCoffeeVoicePlayback\(\);[\s\S]*?settle\(null\);/,
    );
    assert.doesNotMatch(
      pageSource,
      /resolve\(durationMs && durationMs > 0 \? durationMs : fallbackDuration\)/,
    );
  });

  it("hands a refreshed player line to one visible owner", () => {
    assert.match(
      pageSource,
      /persistedUserMessageVisible:[\s\S]*?coffeePersistedUserLineOwnsPendingReveal\(\{[\s\S]*?messages:\s*centerFeedSourceMessages,[\s\S]*?userRevealText:\s*coffeeUserRevealText/,
    );
  });

  it("streams the player line to the table before voice preparation finishes", () => {
    assert.match(
      pageSource,
      /setCoffeeUserRevealText\(trimmed\);[\s\S]*?setCoffeeTurnRhythmState\("userTableTyping"\);[\s\S]*?waitForCoffeeUserRevealToSettle\(\)[\s\S]*?await startCoffeePlayerVoiceForReveal\(trimmed\)/,
    );
    assert.match(
      pageSource,
      /coffeePlayerVoiceRevealReadyRef\.current = false;[\s\S]*?setCoffeeTurnRhythmState\("userTableTyping"\)/,
    );
    assert.match(
      pageSource,
      /!deliveryComplete \|\| !coffeePlayerVoiceRevealReadyRef\.current/,
    );
  });

  it("hands a finished player line to botThinking before a queued bot reveal", () => {
    assert.match(
      pageSource,
      /resolveCoffeeUserRevealSettledWaiters\(\);[\s\S]*?setCoffeeTypewriterLength\(charCount\);[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\);[\s\S]*?if \(queued\) \{[\s\S]*?queueCoffeeRevealFnRef\.current\(queued\);/,
    );
    assert.match(
      pageSource,
      /coffeeUserTableTypingShouldRestart\(\{[\s\S]*?settled:\s*coffeeUserTableTypingSettledRef\.current,[\s\S]*?visibleLength:\s*coffeeTypewriterLengthRef\.current,[\s\S]*?fullDisplayLength:\s*charCount/,
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
    assert.match(
      pageSource,
      /const transcriptMessagesWithInterruptions =\s*coffeeTranscriptMessagesWithInterruptions\(\{[\s\S]*?messages:\s*transcriptSourceMessages,[\s\S]*?const transcriptMessages = coffeeTranscriptVisibleMessages\(\s*transcriptMessagesWithInterruptions,/,
    );
    assert.match(
      pageSource,
      /function mergeCoffeeTranscriptMessageSources[\s\S]*?\{\s*\.\.\.historyMessage,\s*\.\.\.liveMessage\s*\}/,
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
      /coffeePendingRevealConversation != null &&[\s\S]*?coffeePendingRevealConversation\.id === coffeeConversation\?\.id[\s\S]*?coffeePendingRevealConversation\.messages[\s\S]*?: messages;/,
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

  it("makes the active thinking state immediately suppress every matching seat sip", () => {
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
      /const visualSeatSipInProgress =[\s\S]{0,220}seatIsThinking[\s\S]{0,80}\? false[\s\S]{0,40}: seatSipInProgress;/,
    );
    assert.match(
      pageSource,
      /completedSipAnimationActive\s*=\s*[\s\S]{0,260}!seatIsThinking/,
    );
    assert.match(
      pageSource,
      /ambientSipAllowed:\s*!coffeeSipTalkGateActive &&\s*!seatIsThinking/,
    );
    assert.match(
      pageSource,
      /completedSipAnimationAgeMs:\s*refillSipLocked \|\| seatIsThinking\s*\? Number\.POSITIVE_INFINITY/,
    );
    assert.match(
      pageSource,
      /cupSipping:\s*refillSipLocked \|\| seatIsThinking\s*\? false/,
    );
    assert.match(
      pageSource,
      /const seatThinkingVisualActive = seatIsThinkingThisSeat;/,
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
    assert.match(
      pageSource,
      /ambientSipAllowed:[\s\S]*?coffeeAmbientSipSpeakerBotId === null \|\|[\s\S]*?coffeeAmbientSipSpeakerBotId !== bot\.id/,
    );
  });
});
