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
      'if (settings?.voiceMode !== "mute") return;',
      effectStart
    );
    assert.notEqual(effectStart, -1);
    assert.notEqual(effectEnd, -1);
    const voiceEffect = pageSource.slice(effectStart, effectEnd);
    assert.match(voiceEffect, /settings\?\.preferredProvider,/);
    assert.doesNotMatch(voiceEffect, /\n    settings,\n/);
  });

  it("releases visual text when synthesized speech stays in preparation", () => {
    assert.match(
      pageSource,
      /const ZEN_VOICE_REVEAL_PREPARATION_TIMEOUT_MS = 4000;/
    );
    assert.match(
      pageSource,
      /speechRevealTimelineWaitingForAudio\([\s\S]*?chatSpeechRevealVisualFallbackKeysRef\.current\.add\(revealKey\);[\s\S]*?handoffChatSpeechRevealToCanvasClock\(revealKey\);[\s\S]*?late clip from reclaiming transcript reveal ownership/
    );
    const timeoutStart = pageSource.indexOf(
      "const revealKey = activeAssistantRevealKey",
    );
    const timeoutEnd = pageSource.indexOf(
      "const zenLiveBotMouthPhaseMs",
      timeoutStart,
    );
    const timeoutSource = pageSource.slice(timeoutStart, timeoutEnd);
    assert.doesNotMatch(timeoutSource, /voiceSynthesisAbortRef\.current\?\.abort/);
    assert.doesNotMatch(timeoutSource, /stopEnglishVoice\(\)/);
  });

  it("keeps robot voices on the canvas reveal clock", () => {
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
    assert.match(
      effectSource,
      /if \(audioDrivesReveal\) \{[\s\S]*?releaseChatSpeechReveal\(revealKey\);[\s\S]*?chatRevealPaceByKeyRef\.current\.delete\(revealKey\);/,
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
      /settings\?\.voiceMode === "bottish" \|\| settings\?\.voiceMode === "babble"/,
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
