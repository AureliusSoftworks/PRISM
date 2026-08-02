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

test("Zen reveals player text on clean English playback", () => {
  const start = source.indexOf("const playZenPlayerMessage =");
  const end = source.indexOf("const playSignalProducerGuestActionSfx", start);
  const playerPlayback = source.slice(start, end);
  assert.match(playerPlayback, /voiceSpokenText\(messageText\)/);
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
  assert.match(playerPlayback, /bundledActionSfxCueAtMs/);
  assert.match(playerPlayback, /startChatSpeechReveal/);
  assert.doesNotMatch(playerPlayback, /voicePerformanceTextFromActionCues/);

  assert.match(
    source,
    /playZenPlayerMessage\(optimisticMessageId, optimisticUserContent\)/,
  );
  assert.match(
    source,
    /zenPlayerRevealTimeline[\s\S]*?speechRevealVisibleTokenCount/,
  );
});
