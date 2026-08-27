import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const coffeeReplaySource = readFileSync(
  new URL("./coffee-replay.ts", import.meta.url),
  "utf8",
);

describe("Coffee player response UI wiring", () => {
  it("routes table composition through the shared latency-critical input", () => {
    assert.match(
      pageSource,
      /enabled=\{coffeeComposerUsesRichInput\(\{[\s\S]*?variant,[\s\S]*?markdownEditorEnabled:\s*composerMarkdownEditorEnabled,[\s\S]*?\}\)\}/,
    );
    assert.match(
      pageSource,
      /latencyCritical=\{variant === "coffee-table" \|\| variant === "signal"\}/u,
    );
    assert.match(
      pageSource,
      /latencyCriticalRichMentions=\{variant === "coffee-table"\}/u,
    );
  });

  it("keeps ordinary latency-critical editing uncontrolled while restoring Coffee mentions", () => {
    const composerStart = pageSource.indexOf("const ComposerInput = forwardRef<");
    const composerEnd = pageSource.indexOf(
      'ComposerInput.displayName = "ComposerInput"',
      composerStart,
    );
    const composer = pageSource.slice(composerStart, composerEnd);
    assert.ok(composerStart >= 0 && composerEnd > composerStart);
    assert.match(
      composer,
      /const enabled =\s*\(requestedRichInputEnabled && !latencyCritical\) \|\|\s*\(latencyCriticalRichMentions && nativeMentionRichInputActive\)/u,
    );
    assert.match(
      composer,
      /value=\{latencyCritical \? undefined : textareaDisplayValue\}[\s\S]{0,100}defaultValue=\{latencyCritical \? visibleValue : undefined\}/u,
    );
    assert.match(
      composer,
      /onValueChange\(nextValue\);\s*resizeTextareaToContent\(el\);\s*if \(latencyCritical\) \{[\s\S]{0,240}?latencyCriticalRichMentions &&[\s\S]{0,180}?syncTextareaMention\(el\);[\s\S]{0,80}?return;\s*\}\s*textareaChipActivationRef/u,
    );
    assert.match(
      composer,
      /onEmptyBackspaceRef\.current\?\.\(\) === true\s*\) \{\s*event\.preventDefault\(\);\s*\}\s*return;\s*\}\s*if \(\s*event\.key === "Escape"/u,
    );
    assert.match(
      composer,
      /if \(latencyCritical\) return;\s*const interval = window\.setInterval/u,
    );
    assert.match(
      composer,
      /const activateLatencyCriticalRichMention = useCallback\([\s\S]{0,500}?setNativeMentionRichInputActive\(true\)[\s\S]{0,260}?wysiwygRef\.current\?\.focus\(\)/u,
    );
    assert.match(
      composer,
      /<ComposerBotMentionPopover/u,
    );
    assert.match(
      composer,
      /if \(latencyCritical && latencyCriticalRichMentions\) \{\s*activateLatencyCriticalRichMention\(act\.replacement\)/u,
    );
    assert.match(
      composer,
      /const nextHasBotMention = tokenizeBotMentionSource\(/u,
    );
    assert.match(
      composer,
      /\.some\(\(segment\) => segment\.kind === "mention"\)/u,
    );
    assert.match(
      composer,
      /setNativeMentionRichInputActive\(nextHasBotMention\)/u,
    );
  });

  it("keeps Coffee keystrokes entirely out of parent React state", () => {
    const handlerStart = pageSource.indexOf(
      "function updateCoffeeDraftFromComposer(next: string): void",
    );
    const handlerEnd = pageSource.indexOf(
      "async function setCoffeeContextSparkState",
      handlerStart,
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
    assert.match(handlerSource, /preemptCoffeeAutonomyForPlayerInput\(\)/u);
    assert.match(handlerSource, /coffeeDraftRef\.current = next/u);
    assert.match(handlerSource, /const nextHasText = next\.trim\(\)\.length > 0/u);
    assert.match(handlerSource, /scheduleCoffeeComposerInputPriorityRelease\(\)/u);
    assert.doesNotMatch(handlerSource, /setCoffeeDraft|setCoffeeComposerHasDraft/);
    assert.doesNotMatch(pageSource, /pendingCoffeeDraftSync/);
    assert.doesNotMatch(pageSource, /COFFEE_COMPOSER_PARENT_DRAFT_SYNC_MS/);
  });

  it("lets Enter paint before live-table send orchestration", () => {
    const schedulerStart = pageSource.indexOf(
      "const scheduleCoffeeTurnAfterInputPaint",
    );
    const handlerStart = pageSource.indexOf(
      "const handleCoffeeComposerKeyDown",
      schedulerStart,
    );
    const scheduler = pageSource.slice(schedulerStart, handlerStart);
    assert.ok(schedulerStart >= 0 && handlerStart > schedulerStart);
    assert.match(
      scheduler,
      /window\.requestAnimationFrame\([\s\S]*?window\.setTimeout\([\s\S]*?void sendCoffeeTurn\(\)/u,
    );
    assert.match(
      pageSource,
      /if \(event\.key === "Enter"\) \{[\s\S]{0,180}?scheduleCoffeeTurnAfterInputPaint\(\)/u,
    );
    assert.match(
      pageSource,
      /onSubmit: \(event\) => \{[\s\S]{0,220}?scheduleCoffeeTurnAfterInputPaint\(\)/u,
    );
    assert.doesNotMatch(
      pageSource,
      /if \(event\.key === "Enter"\) \{[\s\S]{0,180}?void sendCoffeeTurn\(\)/u,
    );
  });

  it("projects the live interruption and player reveal as transitions", () => {
    const captureStart = pageSource.indexOf(
      "const captureCoffeePlayerInterruption =",
    );
    const sendStart = pageSource.indexOf("const sendCoffeeTurn = async");
    const sendEnd = pageSource.indexOf(
      "const interruptCoffeeWithTechnique",
      sendStart,
    );
    const send = pageSource.slice(sendStart, sendEnd);
    const capture = pageSource.slice(captureStart, sendStart);
    assert.ok(captureStart >= 0 && sendStart > captureStart);
    assert.ok(sendStart >= 0 && sendEnd > sendStart);
    assert.match(
      capture,
      /coffeeTurnRhythmStateRef\.current = "playerComposing";\s*startTransition\(\(\) => \{[\s\S]{0,700}?setCoffeeTurnRhythmState\("playerComposing"\)/u,
    );
    assert.match(
      send,
      /coffeeTurnRhythmStateRef\.current = "userTableTyping";\s*startTransition\(\(\) => \{[\s\S]{0,260}?setCoffeeUserRevealText\(trimmed\);[\s\S]{0,100}?setCoffeeTurnRhythmState\("userTableTyping"\)/u,
    );
    assert.match(
      capture,
      /clearCoffeeRhythmTimers\(\);/u,
    );
    assert.match(send, /captureCoffeePlayerInterruption\(/u);
  });

  it("gives the native composer immediate priority over local autonomous inference", () => {
    assert.match(
      pageSource,
      /target\.closest\('\[data-coffee-table-compose="true"\]'\)[\s\S]{0,100}coffeePlayerInputPreemptRef\.current\(\)/u,
    );
    assert.match(
      pageSource,
      /const preemptCoffeeAutonomyForPlayerInput = \(\): void => \{\s*coffeeComposerInputPriorityRef\.current = true;[\s\S]{0,220}const controller = coffeeContinueAbortRef\.current;[\s\S]{0,120}controller\.abort\(\)/u,
    );
    assert.match(
      pageSource,
      /if \(coffeeComposerInputPriorityRef\.current\) \{\s*scheduleCoffeeLoopTimer\(startAutonomousTurn, 240\);\s*return;/u,
    );
    assert.match(
      pageSource,
      /controller\.abort\(\);[\s\S]{0,420}window\.requestAnimationFrame\(\(\) => \{\s*startTransition/u,
    );
  });

  it("lets active user input outrank polling and generated presentation commits", () => {
    const gateStart = pageSource.indexOf("const waitForCoffeeUserInputIdle");
    const gateEnd = pageSource.indexOf(
      "const runCoffeeTurnJobOnce",
      gateStart,
    );
    const gate = pageSource.slice(gateStart, gateEnd);
    assert.ok(gateStart >= 0 && gateEnd > gateStart);
    assert.match(pageSource, /COFFEE_TURN_JOB_POLL_INTERVAL_MS = 600/u);
    assert.match(pageSource, /COFFEE_USER_INPUT_QUIET_WINDOW_MS = 160/u);
    assert.match(gate, /scheduling\?\.isInputPending/u);
    assert.match(gate, /window\.requestAnimationFrame/u);
    assert.match(
      pageSource,
      /window\.addEventListener\("pointerdown", noteCoffeeUserInput, true\)[\s\S]{0,180}window\.addEventListener\("keydown", noteCoffeeUserInput, true\)[\s\S]{0,180}window\.addEventListener\("beforeinput", noteCoffeeUserInput, true\)/u,
    );
    assert.match(
      pageSource,
      /job\.response \|\|[\s\S]{0,120}presentationKeyForJob\(job\) !== presentedJobKey[\s\S]{0,120}await waitForCoffeeUserInputIdle\(signal\);[\s\S]{0,80}publishPresentedJob\(job\)/u,
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
    // Thinking owns the rhythm even while the leaf composer has local input.
    assert.match(
      pageSource,
      /if \(coffeeBusy \|\| coffeeAutoBusy\) \{\s*setCoffeeTurnRhythmState\("botThinking"\);\s*return;\s*\}\s*if \(coffeeTurnRhythmState !== "idle"\)/,
    );
    assert.doesNotMatch(
      pageSource,
      /coffeeDraftRef\.current\.trim\(\)\.length > 0[\s\S]{0,40}\? "playerComposing"[\s\S]{0,40}: "botThinking"/,
    );
  });

  it("keeps visible speech intact while player input preempts unfinished generation", () => {
    // No delayed typing-grace machinery may let inference race the keystroke.
    assert.doesNotMatch(pageSource, /coffeeTableTalkAutoplayDeferralMs/);
    assert.doesNotMatch(pageSource, /coffeeGeneratedReplyRevealDeferralMs/);
    assert.doesNotMatch(pageSource, /COFFEE_TABLE_TALK_TYPING_GRACE_MS/);
    assert.doesNotMatch(pageSource, /paused while you type/);
    // A line that was already audible can finish because playback does not own
    // the autonomous request controller. Sending still prints/speaks at once.
    assert.match(
      pageSource,
      /const canQueueAlongsideThinkingBot =\s*coffeeTurnRhythmState === "botThinking" &&\s*\(coffeeAutoBusy \|\|\s*coffeeContinueAbortRef\.current !== null \|\|\s*coffeePendingSpeakerBotId !== null\);/,
    );
    assert.match(
      pageSource,
      /const sendParallelDuringThinkingBot =\s*!draftIsActionOnly && canQueueAlongsideThinkingBot;/,
    );
    assert.match(
      pageSource,
      /if \(!inputShouldWaitForBotReveal && !sendParallelDuringThinkingBot\) \{\s*clearCoffeeLoopTimer\(\);\s*coffeeContinueAbortRef\.current\?\.abort\(\);/,
    );
    assert.match(
      pageSource,
      /const turnJobPromise = \(async \(\) => \{\s*if \(sendParallelDuringThinkingBot\) \{[\s\S]*?await waitForCoffeeRevealToSettle\(\);/,
    );
    assert.match(
      pageSource,
      /if \(inputShouldWaitForBotReveal\) \{[\s\S]{0,420}?await waitForCoffeeRevealToSettle\(\);/,
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
    assert.match(
      pageSource,
      /coffeeTurnRhythmStateRef\.current = "tableTyping";\s*startTransition\(\(\) => \{\s*setCoffeeTurnRhythmState\("tableTyping"\);[\s\S]{0,360}setCoffeeSipTalkGateEpochByBotId/,
      "player input must be able to preempt the bot voice-to-face handoff",
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

  it("takes the Coffee floor when the player's voice actually starts", () => {
    assert.match(
      pageSource,
      /const takePlayerFloor = \(\): void => \{[\s\S]*?setCoffeeUserRevealText\(trimmed\);[\s\S]*?setCoffeeTurnRhythmState\("userTableTyping"\);[\s\S]*?startCoffeePlayerVoiceForReveal\(trimmed, \{[\s\S]*?onFloorTaken: takePlayerFloor/,
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

  it("keeps audible interruption preparation in the faithful Coffee master", () => {
    // Quiet player-only prep is compacted; an outgoing bot still speaking
    // keeps the master clock live until the player takes the floor.
    assert.match(
      pageSource,
      /draftTableText\.length > 0 && !pendingPlayerInterruption[\s\S]{0,400}setReplayAudioMasterCompactHold\(activeConversation\.id, true\)/,
    );
    assert.match(
      pageSource,
      /startCoffeePlayerVoiceForReveal\(trimmed, \{[\s\S]{0,260}preserveOutgoingVoice: Boolean\(pendingPlayerInterruption\)[\s\S]{0,220}setReplayAudioMasterCompactHold\(activeConversation\.id, false\)/,
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
      /const liveTranscriptMessagesRaw =\s*coffeePendingRevealConversation\?\.id === coffeeConversation\.id[\s\S]*?coffeePendingRevealConversation\.messages[\s\S]*?coffeeConversation\.messages[\s\S]*?const liveTranscriptMessages = coffeeMessagesWithHeardCutoffs/,
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

  it("keeps generation provenance in copied transcripts, not Table talk cards", () => {
    const tableTalkStart = pageSource.indexOf(
      '<ul className={styles.coffeeMessages}>',
    );
    const tableTalkEnd = pageSource.indexOf("</ul>", tableTalkStart);
    assert.ok(tableTalkStart >= 0 && tableTalkEnd > tableTalkStart);
    const tableTalk = pageSource.slice(tableTalkStart, tableTalkEnd);
    assert.doesNotMatch(
      tableTalk,
      /assistantGenerationMetadata|messageGenerationMetadata|data-message-generation-metadata/u,
    );

    const copyStart = pageSource.indexOf("const coffeeTranscriptText = async");
    const copyEnd = pageSource.indexOf(
      "const copyCoffeeTranscriptToClipboard",
      copyStart,
    );
    assert.ok(copyStart >= 0 && copyEnd > copyStart);
    assert.match(
      pageSource.slice(copyStart, copyEnd),
      /formatCoffeeReviewClipboardText\(\{[\s\S]*?messages,/u,
    );
    assert.match(coffeeReplaySource, /`- Turn routing: \$\{/u);
    assert.match(coffeeReplaySource, /`- Generation: \$\{/u);
    assert.match(coffeeReplaySource, /`- AUTO recovery: \$\{/u);
  });

  it("freezes Shh at the heard fragment and shares it with table and Table talk", () => {
    assert.match(
      pageSource,
      /const captureCoffeePlayerInterruption =[\s\S]*?clearCoffeeRhythmTimers\(\);[\s\S]*?rememberCoffeeHeardCutoff\(conversationId, pendingMessage, snippet\)[\s\S]*?setCoffeePendingRevealConversation\(null\)/,
    );
    assert.match(
      pageSource,
      /const capturedPlayerInterruption =[\s\S]*?captureCoffeePlayerInterruption\([\s\S]*?sendCoffeeTurn\(text, capturedPlayerInterruption\)/,
    );
    assert.match(
      pageSource,
      /const messages = coffeeMessagesWithHeardCutoffs\([\s\S]*?const pendingMessages = coffeeMessagesWithHeardCutoffs\(/,
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
