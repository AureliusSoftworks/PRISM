import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Chat settings expose the persisted Zen player voice controls", () => {
  assert.match(source, /Speak my messages in Zen/);
  assert.match(source, /id="settings-player-premium-voice"/);
  assert.match(source, /id="settings-player-local-voice"/);
  assert.match(source, /Premium voice/);
  assert.match(source, /Local fallback/);
  assert.match(source, /playerAudioVoiceProfile/);
  assert.match(source, /zenPlayerVoiceEnabled/);
  assert.match(source, /Preview Premium voice/);
  assert.match(source, /Preview local fallback/);
});

test("Zen player voice toggle captures the checked value before updating state", () => {
  const toggleStart = source.indexOf("Speak my messages in Zen");
  const toggleMarkup = source.slice(Math.max(0, toggleStart - 1_200), toggleStart);

  assert.match(
    toggleMarkup,
    /const checked = event\.currentTarget\.checked;[\s\S]*?zenPlayerVoiceEnabled: checked/,
  );
  assert.doesNotMatch(
    toggleMarkup,
    /setSettings\(\(previous\)[\s\S]*?event\.currentTarget\.checked/,
  );
});

test("Chat and Zen reveal player text through one shared presentation path", () => {
  const start = source.indexOf("const presentChatPlayerMessage =");
  const end = source.indexOf("const playSignalProducerGuestActionSfx", start);
  const playerPlayback = source.slice(start, end);
  assert.match(
    playerPlayback,
    /voiceSpokenText\(messageText, \{ leadingMarkedAction: true \}\)/,
  );
  assert.match(
    playerPlayback,
    /const voiceSelection = voicePlaybackSelectionRef\.current;/,
  );
  assert.match(
    playerPlayback,
    /resolvePlayerVoicePlayback\(\{[\s\S]*?voiceMode: voiceSelection\.voiceMode,[\s\S]*?englishVoiceEngine: voiceSelection\.englishVoiceEngine/,
  );
  assert.match(
    playerPlayback,
    /enqueueEnglishVoice\([\s\S]*?cleanProfile,[\s\S]*?revealKey,[\s\S]*?false,/,
  );
  assert.match(
    playerPlayback,
    /const performanceText = voicePerformanceTextFromActionCues\(messageText, \{[\s\S]*?leadingMarkedAction: true,[\s\S]*?omitLocalFoleyTags: true/,
  );
  assert.match(
    playerPlayback,
    /engine === "elevenlabs" && performanceText[\s\S]*?elevenLabsText: performanceText/,
  );
  assert.match(playerPlayback, /bundledActionSfxCueAtMs/);
  assert.match(playerPlayback, /playChatPlayerActionSfx\(messageText\)/);
  assert.match(playerPlayback, /startChatSpeechReveal/);

  assert.match(
    source,
    /presentChatPlayerMessage\(optimisticMessageId, optimisticUserContent\)/,
  );
  assert.match(
    source,
    /zenPlayerRevealTimeline[\s\S]*?speechRevealVisibleTokenCount/,
  );
});

test("Zen uses one audio-owned reveal while muted Chat uses one fast reveal", () => {
  const start = source.indexOf("const presentChatPlayerMessage =");
  const end = source.indexOf("const playSignalProducerGuestActionSfx", start);
  const playerPlayback = source.slice(start, end);

  assert.match(
    playerPlayback,
    /let revealStarted = false;[\s\S]*?if \(revealStarted \|\| revealFinished \|\| controller\.signal\.aborted\) return;[\s\S]*?revealStarted = true;/u,
  );
  assert.match(
    playerPlayback,
    /onStart: \(durationMs\) => \{[\s\S]*?flushSync\(\(\) => \{[\s\S]*?beginReveal\(/u,
  );
  assert.doesNotMatch(playerPlayback, /waitForPlayerTextPaint/u);
  assert.match(
    playerPlayback,
    /const silentRevealDurationMs = chatVoiceForcedMuted[\s\S]*?ZEN_MUTED_REVEAL_TIMING_MULTIPLIER/u,
  );
  assert.match(
    playerPlayback,
    /chatVoiceForcedMuted \|\|[\s\S]*?!settings\.zenPlayerVoiceEnabled[\s\S]*?runSilentFallback\(\)/u,
  );
  assert.equal(
    source.match(/presentChatPlayerMessage\([^)]*optimistic[^)]*\)/gu)?.length,
    2,
  );
  assert.equal(
    source.match(
      /const zenPlayerRevealMatches = Boolean\(\s*view === "chat" &&\s*msg\.role === "user"/gu,
    )?.length,
    2,
  );
  assert.match(playerPlayback, /onCancel: cancelReveal/u);
  assert.match(
    source,
    /const zenPlayerMessageRevealActive = Boolean\([\s\S]*?!speechRevealTimelineComplete\(timeline\)/u,
  );
  assert.match(
    source,
    /const zenInitialThinkingActive =[\s\S]*?!zenPlayerMessageRevealActive[\s\S]*?pendingReplyStartMessageCount === 0/u,
  );
  assert.match(
    source,
    /const zenPendingReplyPlaceholderVisible =[\s\S]*?!zenPlayerMessageRevealActive[\s\S]*?!chatAssistantRevealInProgress/u,
  );
  assert.match(
    source,
    /const zenInitialReplyRevealActive =[\s\S]*?chatAssistantRevealInProgress[\s\S]*?!zenPlayerMessageRevealActive/u,
  );
  assert.match(
    source,
    /const typingIndicatorVisible = chatLikeSurface[\s\S]*?!zenPlayerMessageRevealActive[\s\S]*?!zenInitialReplyRevealActive/u,
  );
  assert.match(
    source,
    /: !zenPlayerMessageRevealActive &&\s*\(zenFollowupActive \|\|/u,
  );
});
