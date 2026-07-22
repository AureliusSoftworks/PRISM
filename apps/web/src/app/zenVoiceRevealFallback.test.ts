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

  it("cancels late speech before releasing visual text", () => {
    assert.match(
      pageSource,
      /const ZEN_VOICE_REVEAL_PREPARATION_TIMEOUT_MS = 12000;/
    );
    assert.match(
      pageSource,
      /speechRevealTimelineWaitingForAudio\([\s\S]*?chatSpeechRevealVisualFallbackKeysRef\.current\.add\(revealKey\);[\s\S]*?voiceSynthesisAbortRef\.current\?\.abort\(\);[\s\S]*?stopBottishVoice\(\);[\s\S]*?stopEnglishVoice\(\);[\s\S]*?handoffChatSpeechRevealToCanvasClock\(revealKey\);/
    );
    const timeoutStart = pageSource.indexOf(
      "const revealKey = activeAssistantRevealKey",
    );
    const timeoutEnd = pageSource.indexOf(
      "const zenLiveBotMouthPhaseMs",
      timeoutStart,
    );
    const timeoutSource = pageSource.slice(timeoutStart, timeoutEnd);
    assert.match(timeoutSource, /voiceSynthesisAbortRef\.current\?\.abort/);
    assert.match(timeoutSource, /stopEnglishVoice\(\)/);
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
      /includeAlignment: !requestStreamingEnglishVoice/,
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

  it("keeps Bottish immediate while generated Babble owns reveal timing", () => {
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
      /voiceModeDrivesCanvasReveal\(settings\.voiceMode\)/,
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
      /if \(audioDrivesReveal\) \{[\s\S]*?releaseChatSpeechReveal\(revealKey\);[\s\S]*?chatRevealPaceByKeyRef\.current\.delete\(revealKey\);/,
    );
  });

  it("never blocks real speech behind a throwaway synthesis warmup", () => {
    assert.doesNotMatch(pageSource, /prepareBuiltinVoiceSynthesis/);
    assert.doesNotMatch(pageSource, /text:\s*"Ready\."/);
    assert.match(
      pageSource,
      /const outgoingVoiceMode = settings\?\.voiceMode;[\s\S]*?primeVoiceModePlaybackFromUserGesture\(outgoingVoiceMode\);/,
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
  });

  it("makes Shh non-destructive before audio playback begins", () => {
    const handlerStart = pageSource.indexOf("const handleTypingIndicatorPress");
    const handlerEnd = pageSource.indexOf(
      "function finishActiveAssistantRevealForCompaction",
      handlerStart
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);
    assert.match(handlerSource, /speechRevealTimelineWaitingForAudio/);
    assert.match(handlerSource, /finishActiveAssistantRevealForCompaction\(\)/);
    assert.ok(
      handlerSource.indexOf("finishActiveAssistantRevealForCompaction()") <
        handlerSource.indexOf("prepareActiveAssistantRevealInterruption()")
    );
  });
});
