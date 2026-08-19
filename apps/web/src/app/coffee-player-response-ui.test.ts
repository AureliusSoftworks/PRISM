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
    // The parent draft sync settles on a fixed debounce. It must not back off
    // by measured frame rate: an interval that widens as frames collapse and
    // narrows as they recover oscillates instead of settling, and it degrades
    // most on exactly the tables that can least afford it.
    assert.match(
      pageSource,
      /COFFEE_COMPOSER_PARENT_DRAFT_SYNC_MS = 240/,
    );
    assert.ok(
      handlerSource.indexOf("setCoffeeDraft(next)") >
        handlerSource.indexOf("if (nextHasDraft !== previousHasDraft)"),
    );
  });

  it("requests the bot response after the player line settles, deferring past an in-flight thinking bot", () => {
    assert.match(
      pageSource,
      /await userRevealSettlePromise;[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\);[\s\S]*?const turnJob = await turnJobPromise;/,
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
    assert.match(
      pageSource,
      /const turnJobPromise = \(async \(\) => \{\s*if \(sendParallelDuringThinkingBot\) \{[\s\S]*?runCoffeeTurnJob\(/,
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

  it("never lets typing pause the table and keeps thinking bots intact while the player speaks", () => {
    // No typing-grace deferral machinery remains anywhere in the Coffee flow.
    assert.doesNotMatch(pageSource, /coffeeTableTalkAutoplayDeferralMs/);
    assert.doesNotMatch(pageSource, /coffeeGeneratedReplyRevealDeferralMs/);
    assert.doesNotMatch(pageSource, /COFFEE_TABLE_TALK_TYPING_GRACE_MS/);
    assert.doesNotMatch(pageSource, /paused while you type/);
    // Sending while a bot thinks prints/speaks immediately without aborting synthesis.
    assert.match(
      pageSource,
      /const sendParallelDuringThinkingBot =\s*!draftIsActionOnly &&\s*coffeeTurnRhythmState === "botThinking" &&\s*\(coffeeAutoBusy \|\|\s*coffeeContinueAbortRef\.current !== null \|\|\s*coffeePendingSpeakerBotId !== null\);/,
    );
    assert.match(
      pageSource,
      /if \(!actionShouldWaitForBotReveal && !sendParallelDuringThinkingBot\) \{\s*clearCoffeeLoopTimer\(\);\s*coffeeContinueAbortRef\.current\?\.abort\(\);/,
    );
    assert.match(
      pageSource,
      /const turnJobPromise = \(async \(\) => \{\s*if \(sendParallelDuringThinkingBot\) \{[\s\S]*?await waitForCoffeeRevealToSettle\(\);/,
    );
    assert.match(
      pageSource,
      /if \(actionShouldWaitForBotReveal\) \{[\s\S]{0,220}?await waitForCoffeeRevealToSettle\(\);/,
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
    // Both guards still stand between a dead preparation and the reveal timer.
    // They are two statements rather than one `||` so a hand-off that dies
    // while we still own the floor can release the rhythm instead of parking
    // the table in `cooldown` forever (session 2253b3903a) — but releasing is
    // itself epoch-guarded, so a superseded turn still reclaims nothing.
    assert.match(
      pageSource,
      /const beginSpeakingAndScheduleReveal[\s\S]*?if \(durationMs === null\) \{\s*releaseStalledHandoff\(\);\s*return;\s*\}\s*if \(!revealDeliveryIsCurrent\(\)\) return;[\s\S]*?coffeeVoiceRevealFallbackDelayMs\(durationMs, voiced\)/,
    );
    assert.match(
      pageSource,
      /const releaseStalledHandoff = \(\) => \{\s*if \(!revealDeliveryIsCurrent\(\)\) return;/,
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
    // Stall watchdog must re-arm while voice still owns the floor — never
    // seal mid-monologue between English clause chunks.
    assert.match(
      pageSource,
      /armVoiceRevealWatchdog\(\s*coffeeVoiceRevealFallbackDelayMs\(remainingMs, true\)/,
    );
    assert.match(
      pageSource,
      /if \(coffeeActiveVoiceMessageIdRef\.current === message\.id\) \{\s*armVoiceRevealWatchdog\(\s*coffeeVoiceRevealStallWatchdogDelayMs\(\)/u,
    );
  });

  it("starts the speaking reveal only from real voice playback start", () => {
    const botVoice = pageSource.slice(
      pageSource.indexOf("const startCoffeeVoiceForReveal = async"),
      pageSource.indexOf("const startCoffeePlayerVoiceForReveal = async"),
    );
    assert.match(
      botVoice,
      /const resolvedDurationMs =\s*coffeeVoiceStartedDurationMs\(durationMs, fallbackDuration\) \?\?\s*Math\.max\(1, fallbackDuration\);/,
    );
    assert.match(
      botVoice,
      /setCoffeeLiveAvatarSpeech\(\{[\s\S]*?durationMs: resolvedDurationMs,[\s\S]*?\}\);[\s\S]*?settle\(resolvedDurationMs\)/,
    );
    assert.doesNotMatch(
      botVoice,
      /revealVoiceToken\.valid = false|\}, 1800\);/,
      "slow valid synthesis must stay eligible to become the audible reveal",
    );
    assert.doesNotMatch(
      botVoice,
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

  it("compacts the player's voice-preparation gap out of the faithful master", () => {
    // Hold begins with the instant provisional stream and always releases
    // once player voice resolves (started, muted, or failed) — Signal parity.
    assert.match(
      pageSource,
      /setCoffeeTurnRhythmState\("userTableTyping"\);[\s\S]{0,400}setReplayAudioMasterCompactHold\(activeConversation\.id, true\)/,
    );
    assert.match(
      pageSource,
      /startCoffeePlayerVoiceForReveal\(trimmed\)\.finally\(\(\) =>\s*setReplayAudioMasterCompactHold\(activeConversation\.id, false\),?\s*\)/,
    );
  });

  it("hands a finished player line to botThinking before a queued bot reveal", () => {
    assert.match(
      pageSource,
      /resolveCoffeeUserRevealSettledWaiters\(\);[\s\S]*?assignCoffeeTypewriterLength\(charCount\);[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\);[\s\S]*?if \(queued\) \{[\s\S]*?queueCoffeeRevealFnRef\.current\(queued\);/,
    );
    assert.match(
      pageSource,
      /coffeeUserTableTypingShouldRestart\(\{[\s\S]*?settled:\s*coffeeUserTableTypingSettledRef\.current,[\s\S]*?visibleLength:\s*coffeeRevealVisibleLength\(\),[\s\S]*?fullDisplayLength:\s*charCount/,
    );
  });

  it("drops whole settled lines into Table talk and never streams the panel", () => {
    assert.match(
      pageSource,
      /const liveTranscriptMessages =\s*coffeePendingRevealConversation\?\.id === coffeeConversation\.id[\s\S]*?coffeePendingRevealConversation\.messages[\s\S]*?coffeeConversation\.messages/,
    );
    assert.match(
      pageSource,
      /pendingTranscriptMessageId && !pendingTranscriptRevealSettled[\s\S]*?message\.id !== pendingTranscriptMessageId/,
    );
    // The panel has no partial-reveal branch: a pending line is filtered out
    // until its table reveal settles, then rendered whole.
    assert.doesNotMatch(pageSource, /transcript-typing-/);
    assert.doesNotMatch(pageSource, /pendingTranscriptLineTyping/);
    assert.match(
      pageSource,
      /const transcriptProjection = projectCoffeePublicTranscript\(\{[\s\S]*?messages:\s*transcriptSourceMessages,[\s\S]*?const transcriptMessages = transcriptProjection\.visibleRows;/,
    );
    assert.match(
      pageSource,
      /function mergeCoffeeTranscriptMessageSources[\s\S]*?\{\s*\.\.\.historyMessage,\s*\.\.\.liveMessage\s*\}/,
    );
  });

  it("always refetches the full transcript for a review export", () => {
    // A Table talk cache captured earlier in the session can be short at the
    // head, which silently shipped exports missing their opening turns. The
    // export path is a one-off action, so it always asks the server first.
    assert.match(
      pageSource,
      /const loadCoffeeTranscriptMessagesForClipboard[\s\S]{0,1400}sessions\/\$\{encodeURIComponent\(conversation\.id\)\}\/transcript/u,
    );
    const loaderStart = pageSource.indexOf(
      "const loadCoffeeTranscriptMessagesForClipboard",
    );
    const loaderEnd =
      pageSource.indexOf("const api", loaderStart) > loaderStart
        ? pageSource.indexOf("const api", loaderStart)
        : loaderStart + 2400;
    const loader = pageSource.slice(loaderStart, loaderEnd);
    assert.doesNotMatch(
      loader,
      /if \(cached\) \{\s*return mergeCoffeeTranscriptMessageSources/u,
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
