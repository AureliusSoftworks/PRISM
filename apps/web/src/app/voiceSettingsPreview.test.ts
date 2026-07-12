import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("voice settings preview", () => {
  it("keeps the global voice settings preview tied to the selected mode", () => {
    assert.match(pageSource, /async function previewSelectedVoice\(/);
    assert.match(pageSource, /onClick=\{\(\) => void previewSelectedVoice\(\)\}/);
    assert.match(pageSource, />\s*Preview\s*<\/button>/);
    assert.match(
      pageSource,
      /rawProfile \?\? \{[\s\S]*?DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,[\s\S]*?systemVoiceName: settings\.defaultSystemVoiceName,[\s\S]*?elevenLabsVoiceId: settings\.defaultElevenLabsVoiceId/
    );
  });

  it("previews a customized bot with the currently selected global mode", () => {
    assert.match(pageSource, /voiceMode=\{normalizeVoiceMode\(settings\?\.voiceMode\)\}/);
    assert.match(pageSource, /onVoicePreview=\{previewSelectedVoice\}/);
    assert.match(pageSource, /Bottish tone from organic to synthetic/);
  });

  it("previews Bottish and English with the same resolved phrase", () => {
    assert.match(pageSource, /enqueueBottishVoice\(\s*previewText/);
    assert.match(pageSource, /text: previewText,\s*mode: "english"/);
    assert.match(pageSource, /await enqueueEnglishVoice\(/);
  });

  it("previews the unsaved Avatar Studio voice directly in either mode", () => {
    assert.match(pageSource, /Preview Bottish/);
    assert.match(pageSource, /Preview English/);
    assert.match(pageSource, /onClick=\{\(\) => void previewVoice\("bottish"\)\}/);
    assert.match(pageSource, /onClick=\{\(\) => void previewVoice\("english"\)\}/);
    assert.match(pageSource, /await onPreview\(normalizedProfile, mode, previewText\)/);
    assert.match(pageSource, /voicePreviewPlaybackRunRef/);
    assert.match(pageSource, /stopBottishVoice\(\);\s*stopEnglishVoice\(\);/);
    assert.match(pageSource, /const previewVoiceMode = forcedMode \?\? settings\.voiceMode/);
    assert.match(pageSource, /await onVoicePreview\(profile, forcedMode, previewText\)/);
    assert.doesNotMatch(pageSource, /disabled=\{previewing !== null\}/);
    assert.doesNotMatch(pageSource, /previewMode !== "bottish"/);
  });

  it("supports global defaults, randomization, and session-cached persona previews", () => {
    assert.match(pageSource, /<span>Global default voice<\/span>/);
    assert.match(pageSource, /defaultSystemVoiceName/);
    assert.match(pageSource, /defaultElevenLabsVoiceId/);
    assert.match(pageSource, />\s*Randomize\s*<\/button>/);
    assert.match(pageSource, /voicePreviewLineCacheRef/);
    assert.match(pageSource, /\/api\/voices\/preview-line/);
    assert.match(pageSource, /DEFAULT_PRISM_VOICE_PREVIEW_LINES/);
  });

  it("keeps Mute silent and LOCAL English previews offline", () => {
    assert.match(pageSource, /Mute is silent\. Choose Bottish or English to hear a preview\./);
    assert.match(
      pageSource,
      /settings\.preferredProvider === "local"\s*\? "builtin"\s*:\s*settings\.englishVoiceEngine/
    );
  });

  it("routes Story NPC dialogue through the shared per-bot voice path", () => {
    assert.match(pageSource, /beat\.actorRole !== "npc"/);
    assert.match(pageSource, /storyVoiceBeatKeyRef/);
    assert.match(pageSource, /storySession\.provider === "local"\s*\? "builtin"/);
    assert.match(pageSource, /enqueueBottishVoice\([\s\S]*settings\.voiceEffectsEnabled !== false/);
    assert.match(pageSource, /enqueueEnglishVoice\([\s\S]*settings\.voiceEffectsEnabled !== false/);
  });

  it("presents offline English as native system speech rather than a bundled neural voice", () => {
    assert.match(pageSource, /System Classic \(Offline\)/);
    assert.match(pageSource, /voices installed by macOS or Windows/);
    assert.doesNotMatch(pageSource, /Built-in English is packaged with Prism/);
  });

  it("selects real provider voices from a dropdown instead of five fixed slots", () => {
    assert.match(pageSource, /<select[\s\S]*aria-label="Voice identity"/);
    assert.match(pageSource, /Voices on this computer/);
    assert.match(pageSource, /ElevenLabs voices/);
    assert.match(pageSource, /systemVoiceName: value/);
    assert.match(pageSource, /elevenLabsVoiceId: value/);
    assert.doesNotMatch(pageSource, /\["Fred", "Zarvox", "Trinoids", "Junior", "Ralph"\]/);
    assert.doesNotMatch(pageSource, /className=\{styles\.botVoiceSlots\}/);
  });

  it("keeps only audible performance controls and removes custom textures", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot")
    );
    assert.match(editorSource, /\["pitch", "Pitch"\]/);
    assert.match(editorSource, /\["lilt", "Lilt"\]/);
    assert.match(editorSource, /Bottish tone/);
    assert.doesNotMatch(editorSource, /\["pace", "Pace"\]/);
    assert.doesNotMatch(editorSource, /\["warmth", "Warmth"\]/);
    assert.doesNotMatch(editorSource, /<span>Volume<\/span>/);
    assert.doesNotMatch(editorSource, />Texture</);
    assert.doesNotMatch(editorSource, /Voice texture/);
    assert.doesNotMatch(editorSource, /Texture amount/);
    assert.doesNotMatch(editorSource, />Advanced</);
    assert.match(editorSource, /texture: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1\.texture/);
    assert.match(pageSource, /<strong>Voice volume<\/strong>/);
    assert.match(pageSource, /voiceVolume: normalizeBotVoiceVolume\(settings\.voiceVolume\)/);
  });

  it("does not wait forever for Web Audio before falling back to media playback", () => {
    const bottishSource = readFileSync(new URL("./bottishVoice.ts", import.meta.url), "utf8");
    const englishSource = readFileSync(new URL("./englishVoice.ts", import.meta.url), "utf8");
    const effectsSource = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(bottishSource, /encodeBottishPlanWave/);
    assert.match(bottishSource, /playPlanWithMedia/);
    assert.match(effectsSource, /Promise\.race\(/);
    assert.match(englishSource, /beginMediaUnlock\(\);/);
    assert.match(englishSource, /playBytesWithMedia/);
    assert.match(englishSource, /audio\.preservesPitch = false/);
    assert.match(englishSource, /activeMediaLiltTimer = window\.setInterval\(updatePlaybackRate, 100\)/);
  });

  it("ties live Bottish to visible speech and hard-stops interruptions", () => {
    assert.match(pageSource, /liveBottishRevealKeyRef/);
    assert.match(pageSource, /prepareChatSpeechReveal/);
    assert.match(pageSource, /startChatSpeechReveal/);
    assert.match(pageSource, /progressChatSpeechReveal/);
    assert.match(pageSource, /\{ targetDurationMs \}/);
    assert.match(
      pageSource,
      /view === "chat" && settings\.voiceMode === "bottish"\) return;/
    );
    assert.match(pageSource, /function stopVoicePlaybackForAssistantInterruption\(\)/);
    assert.match(
      pageSource,
      /function applyActiveAssistantRevealInterruption\([\s\S]*?stopVoicePlaybackForAssistantInterruption\(\);/
    );
    assert.match(
      pageSource,
      /function discardActiveAssistantRevealForGrace\([\s\S]*?stopVoicePlaybackForAssistantInterruption\(\);/
    );
  });

  it("uses actual audio progress as the Chat and Zen reveal clock", () => {
    const effectsSource = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(effectsSource, /onProgress\?: \(elapsedMs: number, durationMs: number\)/);
    assert.match(effectsSource, /beginVoicePlaybackProgress/);
    assert.match(pageSource, /speechRevealVisibleTokenCount\(speechTimeline\)/);
    assert.match(pageSource, /onProgress: \(elapsedMs\) =>/);
    assert.match(pageSource, /releaseChatSpeechReveal\(interruption\.revealKey\)/);
  });

  it("buffers native speech and requests exact provider timing", () => {
    assert.match(pageSource, /buildSpeechRevealPhrases\(speechRevealTokens\)/);
    assert.match(pageSource, /startChatSpeechRevealPhrase\(/);
    assert.match(pageSource, /includeAlignment: true/);
    assert.match(pageSource, /readEnglishVoiceSynthesisClip\(response\)/);
  });

  it("starts Coffee Bottish locally with its reveal instead of a synthesis round trip", () => {
    const coffeeVoiceStart = pageSource.slice(
      pageSource.indexOf("const startCoffeeVoiceForReveal = async"),
      pageSource.indexOf("const queueCoffeeReveal =")
    );
    assert.match(coffeeVoiceStart, /enqueueBottishVoice\(\s*displayText,\s*profile,/);
    assert.match(coffeeVoiceStart, /targetDurationMs: fallbackDuration/);
    const bottishBranch = coffeeVoiceStart.slice(
      coffeeVoiceStart.indexOf('if (settings.voiceMode === "bottish")'),
      coffeeVoiceStart.indexOf("} else {")
    );
    assert.doesNotMatch(bottishBranch, /\/api\/voices\/synthesize/);
  });

  it("does not let inactive Chat or Coffee Replay tear down another surface's voice", () => {
    assert.match(
      pageSource,
      /const chatOwnedPlayback = voiceConversationIdRef\.current !== null;[\s\S]*?if \(chatOwnedPlayback\) \{[\s\S]*?stopBottishVoice\(\);[\s\S]*?stopEnglishVoice\(\);/
    );
    assert.match(pageSource, /const coffeeReplayOwnsVoicePlaybackRef = useRef\(false\);/);
    assert.match(
      pageSource,
      /if \(coffeeReplayOwnsVoicePlaybackRef\.current\) \{[\s\S]*?coffeeReplayOwnsVoicePlaybackRef\.current = false;[\s\S]*?stopBottishVoice\(\);[\s\S]*?stopEnglishVoice\(\);/
    );
  });
});
