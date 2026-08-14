import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Zen voice reveal fallback", () => {
  it("keeps reveal-clock rerenders from restarting completed-message voice", () => {
    assert.match(
      pageSource,
      /const effectiveChatRevealTiming = useMemo\([\s\S]*?zenCanvasTypingDelayMultiplier,[\s\S]*?\]\s*\)/
    );
    const effectStart = pageSource.indexOf("const assistantMessages = detail.messages.filter");
    const effectEnd = pageSource.indexOf(
      "\n  useEffect(\n    () => () => {",
      effectStart
    );
    assert.notEqual(effectStart, -1);
    assert.notEqual(effectEnd, -1);
    const voiceEffect = pageSource.slice(effectStart, effectEnd);
    assert.doesNotMatch(voiceEffect, /settings\?\.preferredProvider,/);
    assert.doesNotMatch(voiceEffect, /\n    settings,\n/);
  });

  it("keeps in-flight Premium speech alive through harmless Zen refreshes", () => {
    const effectStart = pageSource.indexOf(
      "const assistantMessages = detail.messages.filter",
    );
    const effectEnd = pageSource.indexOf(
      "\n  useEffect(\n    () => () => {",
      effectStart,
    );
    assert.notEqual(effectStart, -1);
    assert.notEqual(effectEnd, -1);
    const voiceEffect = pageSource.slice(effectStart, effectEnd);
    assert.match(
      voiceEffect,
      /voiceSynthesisAbortRef\.current\?\.abort\(\);[\s\S]*voiceSynthesisAbortRef\.current = controller;/,
    );
    assert.doesNotMatch(
      voiceEffect,
      /return \(\) => controller\.abort\(\);/,
    );
  });

  it("keeps cold or queued local voice preparation alive until the bounded worker settles", () => {
    assert.match(
      pageSource,
      /const ZEN_VOICE_REVEAL_PREPARATION_NOTICE_MS = 12000;/
    );
    assert.match(
      pageSource,
      /speechRevealTimelineWaitingForAudio\([\s\S]*?setVoicePlaybackNotice\(ZEN_VOICE_REVEAL_PREPARING_NOTICE\);/
    );
    const timeoutStart = pageSource.indexOf(
      "const revealKey = activeAssistantRevealKey",
    );
    const timeoutEnd = pageSource.indexOf(
      "const activeChatVoiceMode",
      timeoutStart,
    );
    const timeoutSource = pageSource.slice(timeoutStart, timeoutEnd);
    assert.doesNotMatch(timeoutSource, /voiceSynthesisAbortRef\.current\?\.abort/);
    assert.doesNotMatch(timeoutSource, /handoffChatSpeechRevealToCanvasClock/);
    assert.match(pageSource, /Voice is still preparing\. Use Shh if you want to stop it\./);
  });

  it("starts stream-safe Zen Premium speech before the full clip is buffered", () => {
    const effectStart = pageSource.indexOf(
      "const assistantMessages = detail.messages.filter",
    );
    const effectEnd = pageSource.indexOf(
      "\n  useEffect(\n    () => () => {",
      effectStart,
    );
    const voiceEffect = pageSource.slice(effectStart, effectEnd);
    assert.match(
      voiceEffect,
      /const requestStreamingEnglishVoice =[\s\S]*?detail\.mode === "zen"[\s\S]*?effectiveEnglishEngine === "elevenlabs"/,
    );
    assert.match(
      voiceEffect,
      /const playEnglishVoiceWhileStreaming =[\s\S]*?requestStreamingEnglishVoice &&[\s\S]*?englishVoiceProfileSupportsStreaming/,
    );
    assert.match(
      voiceEffect,
      /includeAlignment: !\([\s\S]*?requestLocalEnglishChunks[\s\S]*?playEnglishVoiceWhileStreaming[\s\S]*?elevenlabs/,
    );
    assert.match(
      voiceEffect,
      /englishVoiceResponseSupportsStreaming\(response\)[\s\S]*?enqueueStreamingEnglishVoice\(/,
    );
    assert.match(
      voiceEffect,
      /else \{[\s\S]*?readEnglishVoiceSynthesisClip\(response\)[\s\S]*?enqueueEnglishVoice\(/,
    );
  });

  it("requests and plays local Zen English as progressive WAV chunks", () => {
    const effectStart = pageSource.indexOf(
      "const assistantMessages = detail.messages.filter",
    );
    const effectEnd = pageSource.indexOf(
      "\n  useEffect(\n    () => () => {",
      effectStart,
    );
    const voiceEffect = pageSource.slice(effectStart, effectEnd);
    assert.match(
      voiceEffect,
      /const requestLocalEnglishChunks =[\s\S]*?effectiveEnglishEngine === "builtin"/,
    );
    assert.match(voiceEffect, /streamChunks:[\s\S]*?requestLocalEnglishChunks/);
    assert.match(
      voiceEffect,
      /englishVoiceResponseSupportsChunkedStreaming\(response\)[\s\S]*?enqueueChunkedEnglishVoice\(/,
    );
  });

  it("keeps both robot Speech Types on an audible lifecycle for mouth motion", () => {
    const eligibilityStart = pageSource.indexOf(
      "const markLatestAssistantRevealEligible",
    );
    const eligibilityEnd = pageSource.indexOf(
      "const latestUserMessageId",
      eligibilityStart,
    );
    const eligibilitySource = pageSource.slice(
      eligibilityStart,
      eligibilityEnd,
    );
    assert.match(
      eligibilitySource,
      /voiceModeDrivesCanvasReveal\([\s\S]*?chatTurnVoiceSelectionRef\.current\?\.voiceMode \?\? settings\.voiceMode/,
    );

    const effectStart = pageSource.indexOf(
      'const shouldRun =\n      view === "chat"',
    );
    const effectEnd = pageSource.indexOf(
      "const zenLiveReplyActionText",
      effectStart,
    );
    const effectSource = pageSource.slice(effectStart, effectEnd);
    assert.match(
      effectSource,
      /const audioDrivesReveal =[\s\S]*?voiceModeDrivesCanvasReveal\(liveRobotVoiceMode\)/,
    );
    assert.match(
      effectSource,
      /else if \(!audioDrivesReveal\) \{[\s\S]*?releaseChatSpeechReveal\(revealKey\);/,
    );
    assert.match(effectSource, /lifecycle: audioDrivesReveal/);
    assert.match(effectSource, /streamChunks: audioDrivesReveal/);
    assert.match(
      effectSource,
      /const targetDurationMs =[\s\S]*?DEFAULT_CHAT_REVEAL_TIMING,[\s\S]*?proceduralTiming: \{ targetDurationMs \}/,
    );
    assert.doesNotMatch(
      effectSource,
      /const targetDurationMs =[\s\S]*?effectiveChatRevealTiming/,
    );
    assert.match(
      effectSource,
      /if \(audioDrivesReveal\) \{[\s\S]*?releaseChatSpeechReveal\(revealKey\);[\s\S]*?chatRevealPaceByKeyRef\.current\.delete\(revealKey\);/,
    );
  });

  it("advances Chat and Zen prose on a visual clock independent from speech", () => {
    const resolverStart = pageSource.indexOf(
      "function resolveAssistantRevealVisibleTokenCount",
    );
    const resolverEnd = pageSource.indexOf(
      "\n  useEffect(() => {",
      resolverStart,
    );
    const resolverSource = pageSource.slice(resolverStart, resolverEnd);
    assert.match(
      resolverSource,
      /Speech timelines remain authoritative for audio, interruption, and mouth[\s\S]*?resolvePacedChatRevealVisibleTokenCount\(/,
    );
    assert.doesNotMatch(
      resolverSource,
      /return Math\.min\([\s\S]*?speechRevealVisibleTokenCount\(speechTimeline\)/,
    );

    const progressiveStart = pageSource.indexOf(
      "const scheduleProgressiveZenSegment",
    );
    const progressiveEnd = pageSource.indexOf(
      "const finishProgressiveZenStream",
      progressiveStart,
    );
    const progressiveSource = pageSource.slice(
      progressiveStart,
      progressiveEnd,
    );
    assert.match(
      progressiveSource,
      /startDisplay\(\);[\s\S]*?const prepared = await preparedVoice;/,
    );
    assert.match(
      progressiveSource,
      /onStart:[\s\S]*?startAudioTimeline\(/,
    );
    assert.match(
      pageSource,
      /const textRevealInProgress =[\s\S]*?const speechInProgress =[\s\S]*?return textRevealInProgress \|\| speechInProgress;/,
    );
    assert.match(
      pageSource,
      /const textVisuallyComplete =[\s\S]*?const speechComplete =[\s\S]*?const visuallyComplete = textVisuallyComplete && speechComplete;/,
    );
  });

  it("never blocks real speech behind a throwaway synthesis warmup", () => {
    assert.doesNotMatch(pageSource, /prepareBuiltinVoiceSynthesis/);
    assert.doesNotMatch(pageSource, /text:\s*"Ready\."/);
    assert.match(
      pageSource,
      /const outgoingVoiceMode = outgoingVoiceSelection\.voiceMode;[\s\S]*?primeVoiceModePlaybackFromUserGesture\(outgoingVoiceMode\);/,
    );
  });

  it("does not let the account default downgrade an online Premium reply", () => {
    const effectStart = pageSource.indexOf(
      "const assistantMessages = detail.messages.filter",
    );
    const effectEnd = pageSource.indexOf(
      "\n  useEffect(\n    () => () => {",
      effectStart,
    );
    const voiceEffect = pageSource.slice(effectStart, effectEnd);
    assert.match(
      voiceEffect,
      /conversationEnglishVoiceEngine\([\s\S]*?voiceSelection\.englishVoiceEngine,[\s\S]*?message\.provider,/,
    );
    assert.doesNotMatch(
      voiceEffect,
      /message\.provider === "local" \|\|[\s\S]*?settings\.preferredProvider === "local"/,
    );
  });

  it("keeps progressive Zen Premium on the selected engine and retries after failure", () => {
    const prepareStart = pageSource.indexOf(
      "async function prepareZenProgressiveSegmentVoice",
    );
    const prepareEnd = pageSource.indexOf(
      "\n  useEffect(() => {",
      prepareStart,
    );
    const prepareSource = pageSource.slice(prepareStart, prepareEnd);
    assert.match(
      prepareSource,
      /conversationEnglishVoiceEngine\([\s\S]*?voiceSelection\.englishVoiceEngine,[\s\S]*?event\.provider,/,
    );
    assert.match(
      prepareSource,
      /includeAlignment: engine === "elevenlabs" && !canStreamPremium/,
    );
    assert.match(
      pageSource,
      /voiceSeenAssistantMessageIdsRef\.current\.delete\(\s*event\.assistantMessageId,?\s*\)/,
    );
  });

  it("sends speakerBotId and playback-selection engine for Chat Premium synthesize", () => {
    assert.match(
      pageSource,
      /voiceSelection\.englishVoiceEngine,[\s\S]*?message\.provider,[\s\S]*?speakerBotId: messageBot\.id/,
    );
  });

  it("keeps Babble playback and replay independent from canonical text", () => {
    const effectStart = pageSource.indexOf(
      'const shouldRun =\n      view === "chat"',
    );
    const effectEnd = pageSource.indexOf(
      "const zenLiveReplyActionText",
      effectStart,
    );
    const effectSource = pageSource.slice(effectStart, effectEnd);
    assert.match(
      effectSource,
      /voiceSelection\.voiceMode === "bottish" \|\|[\s\S]*?voiceSelection\.voiceMode === "babble"/,
    );
    assert.match(
      effectSource,
      /const displayContent = resolveVisibleMessageContent\(latestAssistantMessage\);/,
    );
    assert.match(effectSource, /return enqueueRobotVoiceMode\(\{/);
    assert.match(effectSource, /lifecycle: audioDrivesReveal[\s\S]*?: undefined,/);

    const replayStart = pageSource.indexOf(
      "async function replayAssistantMessageVoice",
    );
    const replayEnd = pageSource.indexOf(
      "function stopPendingReply",
      replayStart,
    );
    const replaySource = pageSource.slice(replayStart, replayEnd);
    assert.match(
      replaySource,
      /settings\.voiceMode === "bottish" \|\| settings\.voiceMode === "babble"/,
    );
    assert.match(
      replaySource,
      /const sourceText =[\s\S]*?resolveVisibleMessageContentForVoiceRef\.current\(message\);[\s\S]*?await enqueueRobotVoiceMode\(\{[\s\S]*?sourceText,/,
    );
    assert.match(
      replaySource,
      /messageId: message\.id,[\s\S]*?spokenText: sourceText/,
    );
  });

  it("discards a hidden reply when Shh lands before audio begins", () => {
    const handlerStart = pageSource.indexOf("const handleTypingIndicatorPress");
    const handlerEnd = pageSource.indexOf(
      "function finishActiveAssistantRevealForCompaction",
      handlerStart
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);
    assert.doesNotMatch(handlerSource, /speechRevealTimelineWaitingForAudio/);
    assert.doesNotMatch(
      handlerSource,
      /finishActiveAssistantRevealForCompaction\(\)/,
    );
    assert.match(
      handlerSource,
      /interruption\.interruptionContent\s*\?\s*applyActiveAssistantRevealInterruption\(interruption\)\s*:\s*discardActiveAssistantRevealForGrace\(interruption\)/,
    );
    assert.match(
      handlerSource,
      /if \(!interruption\.interruptionContent\) return;/,
    );
  });

  it("routes progressive Shh through the audible cutoff and reaction transaction", () => {
    const interruptionStart = pageSource.indexOf(
      "function prepareActiveAssistantRevealInterruption",
    );
    const interruptionEnd = pageSource.indexOf(
      "function isLocalOnlyAssistantInterruptionId",
      interruptionStart,
    );
    const interruptionSource = pageSource.slice(
      interruptionStart,
      interruptionEnd,
    );
    assert.match(
      interruptionSource,
      /!chatAssistantRevealInProgress &&[\s\S]*?latestAssistant\.zenProgressive\?\.inProgress !== true/,
    );

    const handlerStart = pageSource.indexOf("const handleTypingIndicatorPress");
    const handlerEnd = pageSource.indexOf(
      "function finishActiveAssistantRevealForCompaction",
      handlerStart,
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);
    assert.doesNotMatch(
      handlerSource,
      /latestAssistant\?\.zenProgressive\?\.inProgress === true/,
    );
    assert.match(
      handlerSource,
      /await persistence;[\s\S]*?assistantInterruptionReaction:/,
    );
    assert.match(
      handlerSource,
      /shhReactionStartedMessageIdsRef\.current\.has[\s\S]*?shhReactionStartedMessageIdsRef\.current\.add/,
    );
    assert.match(
      handlerSource,
      /setShhReactionPending\(true\)[\s\S]*?await sendMessage[\s\S]*?setShhReactionPending\(false\)/,
    );
    assert.match(
      handlerSource,
      /clientTurnId: `shh:\$\{interruption\.assistantMessageId\}`/,
    );
    assert.match(
      handlerSource,
      /for \(const delayMs of \[0, 250, 750, 1_500, 2_500\]\)[\s\S]*?isRetryableAssistantInterruptionError/,
    );
    assert.match(
      pageSource,
      /if \(isAssistantInterruptionReaction\) \{\s*throw err;\s*\}/,
    );
    assert.match(
      pageSource,
      /!promptFinalizationActive &&[\s\S]*?!shhReactionPending &&[\s\S]*?releaseChatTurnVoiceSelection/,
    );
  });

  it("rejects a raced original envelope before it can restore the hidden suffix", () => {
    const responseStart = pageSource.indexOf(
      "const d =\n        chatBody.progressiveZenVoice",
    );
    const responseEnd = pageSource.indexOf(
      "showZenAutoRecovery(d.autoRecovery)",
      responseStart,
    );
    assert.notEqual(responseStart, -1);
    assert.notEqual(responseEnd, -1);
    const responseWindow = pageSource.slice(responseStart, responseEnd);
    assert.match(
      responseWindow,
      /if \(chatRequestController\.signal\.aborted\) \{[\s\S]*?throw new DOMException\("Aborted", "AbortError"\)/,
    );
    assert.ok(
      responseWindow.lastIndexOf("chatRequestController.signal.aborted") >
        responseWindow.indexOf("await progressivePlaybackChain"),
    );
    const progressiveStart = pageSource.indexOf(
      "const scheduleProgressiveZenSegment",
    );
    const progressiveEnd = pageSource.indexOf(
      "const finishProgressiveZenStream",
      progressiveStart,
    );
    const progressiveWindow = pageSource.slice(
      progressiveStart,
      progressiveEnd,
    );
    assert.match(
      progressiveWindow,
      /const startDisplay = \([\s\S]*?chatRequestController\.signal\.aborted\) return;/,
    );
    assert.match(
      progressiveWindow,
      /onStart: \(durationMs\) => \{[\s\S]*?chatRequestController\.signal\.aborted\) return;/,
    );
  });

  it("does not re-arm voiceSeen after an abort/interrupt during progressive synth", () => {
    const prepareStart = pageSource.indexOf(
      "async function prepareZenProgressiveSegmentVoice",
    );
    // Find the progressive segment catch that retries settled-message voice.
    const catchMarker =
      "Progressive synthesis failed — allow the settled-message path";
    const catchStart = pageSource.indexOf(catchMarker, prepareStart);
    assert.ok(catchStart > prepareStart);
    const catchWindow = pageSource.slice(catchStart - 480, catchStart + 420);
    assert.match(
      catchWindow,
      /chatRequestController\.signal\.aborted[\s\S]*?isAbortLikeError\(error\)[\s\S]*?throw error/,
    );
    assert.match(
      catchWindow,
      /voiceSeenAssistantMessageIdsRef\.current\.delete/,
    );
  });

  it("retries a completed-message voice once before terminal text fallback", () => {
    assert.match(
      pageSource,
      /const COMPLETED_MESSAGE_VOICE_PRESTART_RETRY_LIMIT = 1;/,
    );
    const effectStart = pageSource.indexOf(
      "const voiceSelection = voicePlaybackSelectionRef.current;",
    );
    const catchStart = pageSource.indexOf(
      "const aborted =",
      effectStart,
    );
    const catchEnd = pageSource.indexOf(
      "} finally {",
      catchStart,
    );
    const catchSource = pageSource.slice(catchStart, catchEnd);
    assert.match(
      catchSource,
      /controller\.signal\.aborted \|\| isAbortLikeError\(err\)/,
    );
    assert.match(
      catchSource,
      /!aborted &&[\s\S]*?!activeSpeechStarted &&[\s\S]*?retryAttempt < COMPLETED_MESSAGE_VOICE_PRESTART_RETRY_LIMIT/,
    );
    assert.match(
      catchSource,
      /voiceSeenAssistantMessageIdsRef\.current\.delete\([\s\S]*?setCompletedVoiceRetryVersion/,
    );
    assert.ok(
      catchSource.indexOf("setCompletedVoiceRetryVersion") <
        catchSource.indexOf("handoffChatSpeechRevealToCanvasClock"),
      "terminal canvas fallback must happen only after the bounded retry path",
    );
    assert.match(
      pageSource,
      /onStart: \(durationMs\) => \{[\s\S]*?activeSpeechStarted = true;[\s\S]*?startChatSpeechReveal/,
    );
    assert.match(
      pageSource,
      /\}, \[[\s\S]*?completedVoiceRetryVersion,[\s\S]*?detail,/,
    );
  });
});
