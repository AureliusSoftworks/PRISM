import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("voice settings preview", () => {
  it("keeps the global voice settings preview tied to the selected mode", () => {
    assert.match(pageSource, /async function previewSelectedVoice\(/);
    assert.match(
      pageSource,
      /onClick=\{\(\) => void previewSelectedVoice\(\)\}/,
    );
    assert.match(pageSource, />\s*Preview\s*<\/button>/);
    assert.match(
      pageSource,
      /resolveVoicePreviewProfile\(\s*rawProfile \?\? settings\.prismDefaultBotAudioVoiceProfile/,
    );
  });

  it("previews a customized bot with the currently selected global mode", () => {
    assert.match(
      pageSource,
      /voiceMode=\{normalizeVoiceMode\(settings\?\.voiceMode\)\}/,
    );
    assert.match(pageSource, /onVoicePreview=\{previewSelectedVoice\}/);
    assert.doesNotMatch(pageSource, /aria-label="Bottish tone/);
  });

  it("previews Bottish, Babble, and English with the same resolved phrase", () => {
    assert.match(
      pageSource,
      /mode: "bottish",[\s\S]*?source: \{ text: previewText \}[\s\S]*?sourceText: previewText/,
    );
    assert.match(
      pageSource,
      /mode: "babble",[\s\S]*?source: \{ text: previewText \}[\s\S]*?sourceText: previewText/,
    );
    assert.match(pageSource, /allowBabbleFallback: false/);
    assert.match(pageSource, /Babble voice is still loading\/unavailable/);
    assert.match(pageSource, /text: previewText,\s*mode: "english"/);
    assert.match(
      pageSource,
      /explicitOnlineContext: true,[\s\S]*?includeAlignment: true,[\s\S]*?profile: previewProfile/,
    );
    assert.match(pageSource, /await enqueueEnglishVoice\(/);
  });

  it("previews the unsaved Avatar Studio voice directly in every audible mode", () => {
    assert.match(pageSource, /Preview Bottish/);
    assert.match(pageSource, /Preview Babble/);
    assert.match(pageSource, /Preview English/);
    assert.match(
      pageSource,
      /onClick=\{\(\) => void previewVoice\("bottish"\)\}/,
    );
    assert.match(
      pageSource,
      /onClick=\{\(\) => void previewVoice\("babble"\)\}/,
    );
    assert.match(
      pageSource,
      /onClick=\{\(\) => void previewVoice\("english"\)\}/,
    );
    assert.match(
      pageSource,
      /onPlaybackStart: \(\) => setEnglishPreviewState\("playing"\)/,
    );
    assert.doesNotMatch(pageSource, /generateOnly/);
    assert.match(pageSource, /voicePreviewPlaybackRunRef/);
    assert.match(pageSource, /stopBottishVoice\(\);\s*stopEnglishVoice\(\);/);
    assert.match(
      pageSource,
      /const previewVoiceMode = forcedMode \?\? settings\.voiceMode/,
    );
    assert.match(
      pageSource,
      /await onVoicePreview\(profile, forcedMode, previewText, \{/,
    );
    assert.match(pageSource, /onPlaybackStart: \(\) => \{/);
    assert.doesNotMatch(pageSource, /disabled=\{previewing !== null\}/);
    assert.doesNotMatch(pageSource, /previewMode !== "bottish"/);
  });

  it("uses profile-owned identities for randomization and session-cached previews", () => {
    assert.doesNotMatch(pageSource, /System Classic default voice/);
    assert.doesNotMatch(pageSource, /ElevenLabs default voice/);
    assert.doesNotMatch(pageSource, /defaultSystemVoiceName/);
    assert.doesNotMatch(pageSource, /defaultElevenLabsVoiceId/);
    assert.match(pageSource, />\s*Randomize\s*<\/button>/);
    assert.match(pageSource, /voicePreviewLineCacheRef/);
    assert.match(pageSource, /\/api\/voices\/preview-line/);
    assert.match(pageSource, /DEFAULT_PRISM_VOICE_PREVIEW_LINES/);
  });

  it("keeps Mute silent and LOCAL English previews offline", () => {
    assert.match(
      pageSource,
      /Mute is silent\. Choose English, Babble, or Bottish to hear a preview\./,
    );
    assert.match(
      pageSource,
      /settings\.preferredProvider === "local"\s*\? "builtin"\s*:\s*settings\.englishVoiceEngine/,
    );
  });

  it("routes Story NPC dialogue through the shared per-bot voice path", () => {
    assert.match(pageSource, /beat\.actorRole !== "npc"/);
    assert.match(pageSource, /storyVoiceBeatKeyRef/);
    assert.match(
      pageSource,
      /storySession\.provider === "local"\s*\? "builtin"/,
    );
    assert.match(
      pageSource,
      /enqueueRobotVoiceMode\([\s\S]*settings\.voiceEffectsEnabled !== false/,
    );
    assert.match(
      pageSource,
      /enqueueEnglishVoice\([\s\S]*settings\.voiceEffectsEnabled !== false/,
    );
  });

  it("presents offline English as native system speech rather than a bundled neural voice", () => {
    assert.match(pageSource, /aria-label="Offline English voice engine"/);
    assert.match(pageSource, /System TTS · Installed/);
    assert.match(
      pageSource,
      /Default for every bot and every LOCAL reply/,
    );
    assert.doesNotMatch(pageSource, /Built-in English is packaged with Prism/);
  });

  it("shows only installed offline and available online engine dropdowns", () => {
    const settingsSource = pageSource.slice(
      pageSource.indexOf('aria-labelledby="voice-engine-settings-title"'),
      pageSource.indexOf("<div className={styles.settingsSaveDock}"),
    );
    assert.match(
      settingsSource,
      /<span>Offline engine<\/span>[\s\S]*?aria-label="Offline English voice engine"/,
    );
    assert.match(
      settingsSource,
      /<span>Online engine<\/span>[\s\S]*?aria-label="Online English voice engine"[\s\S]*?<option value="elevenlabs">ElevenLabs<\/option>/,
    );
    assert.doesNotMatch(settingsSource, /Use ElevenLabs online/);
    assert.doesNotMatch(settingsSource, /type="checkbox"/);
    assert.doesNotMatch(settingsSource, /ElevenLabs model/);
    assert.doesNotMatch(settingsSource, /Load voices/);
    assert.match(settingsSource, /Selecting an ElevenLabs voice in Prism or bot customization overrides/);
  });

  it("removes the legacy five-slot ElevenLabs mapping from Voice settings", () => {
    const settingsSource = pageSource.slice(
      pageSource.indexOf('aria-labelledby="voice-engine-settings-title"'),
      pageSource.indexOf("<div className={styles.settingsSaveDock}"),
    );
    assert.doesNotMatch(settingsSource, /Map the five portable Prism slots/);
    assert.doesNotMatch(settingsSource, /BOT_AUDIO_VOICE_IDS\.map/);
    assert.doesNotMatch(settingsSource, /elevenLabsVoiceBank/);
    assert.doesNotMatch(settingsSource, /default voice/);
  });

  it("shows separate per-profile system and ElevenLabs voice identities", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /System voice · OFFLINE/);
    assert.match(editorSource, /aria-label="System voice identity"/);
    assert.match(editorSource, /ElevenLabs voice · ONLINE/);
    assert.match(editorSource, /aria-label="ElevenLabs voice identity"/);
    assert.match(editorSource, /disabled=\{identityCatalog\.elevenLabs\.loading\}/);
    assert.match(editorSource, /Use System TTS/);
    assert.match(editorSource, /Selecting one overrides this profile's System TTS voice/);
    assert.match(pageSource, /systemVoiceName: value/);
    assert.match(pageSource, /elevenLabsVoiceId: value/);
    assert.doesNotMatch(editorSource, /identityCatalog\.onlineEnabled/);
    assert.doesNotMatch(
      pageSource,
      /\["Fred", "Zarvox", "Trinoids", "Junior", "Ralph"\]/,
    );
    assert.doesNotMatch(pageSource, /className=\{styles\.botVoiceSlots\}/);
  });

  it("shows per-profile effects only for the saved ElevenLabs lane", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(
      editorSource,
      /selectedElevenLabsVoiceValue \? \([\s\S]*?ElevenLabs effect · ONLINE only/,
    );
    assert.match(editorSource, /aria-label="ElevenLabs voice effect"/);
    assert.match(editorSource, /ELEVENLABS_VOICE_EFFECTS\.map/);
    assert.match(editorSource, /ELEVENLABS_VOICE_EFFECT_DESCRIPTIONS/);
    assert.match(
      editorSource,
      /Applied locally only to ElevenLabs audio; System TTS stays clean\./,
    );
    assert.match(
      pageSource,
      /enqueueEnglishVoice\([\s\S]*?clip\.engineUsed/,
    );
    assert.match(
      editorSource,
      /elevenLabsEffect:[\s\S]*?saveImmediately: true/,
    );
    assert.match(pageSource, /async function flushBotVoiceAutosaveQueue/);
    assert.match(pageSource, /voiceAutosavePendingRef/);
    assert.match(pageSource, /voiceAutosaveInFlightRef/);
  });

  it("offers a persisted keyword deck for Eleven v3 performance direction", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /Voice direction · ELEVENLABS v3/);
    assert.match(
      editorSource,
      /aria-label="ElevenLabs voice direction keywords"/,
    );
    assert.match(editorSource, /defaultValue=\{normalizedProfile\.elevenLabsDirection/);
    assert.match(editorSource, /elevenLabsDirection: direction/);
    assert.match(editorSource, /normalizeElevenLabsVoiceDirection/);
    assert.match(editorSource, /up to eight[\s\S]*?Eleven v3 audio tags/);
  });

  it("keeps only audible performance controls and removes custom textures", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /\["pitch", "Pitch"\]/);
    assert.match(editorSource, /\["lilt", "Lilt"\]/);
    assert.doesNotMatch(editorSource, /<span>Tone<\/span>/);
    assert.match(
      editorSource,
      /Pitch shapes every voice, including ElevenLabs\. Lilt shapes English in\s*both lanes\./,
    );
    assert.doesNotMatch(editorSource, /\["pace", "Pace"\]/);
    assert.doesNotMatch(editorSource, /\["warmth", "Warmth"\]/);
    assert.doesNotMatch(editorSource, /<span>Volume<\/span>/);
    assert.doesNotMatch(editorSource, />Texture</);
    assert.doesNotMatch(editorSource, /Voice texture/);
    assert.doesNotMatch(editorSource, /Texture amount/);
    assert.doesNotMatch(editorSource, />Advanced</);
    assert.match(
      editorSource,
      /texture: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1\.texture/,
    );
    assert.match(pageSource, /<strong>Voice volume<\/strong>/);
    assert.match(
      pageSource,
      /voiceVolume: normalizeBotVoiceVolume\(settings\.voiceVolume\)/,
    );
  });

  it("commits pitch and lilt through the selected bot profile instead of global settings", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    const autosaveSource = pageSource.slice(
      pageSource.indexOf("async function flushBotVoiceAutosaveQueue"),
      pageSource.indexOf("// Single submit handler for the top form"),
    );

    assert.match(editorSource, /\["pitch", "Pitch"\]/);
    assert.match(editorSource, /\["lilt", "Lilt"\]/);
    assert.match(
      editorSource,
      /onPointerUp=\{\(event\) =>[\s\S]*?saveImmediately: true/,
    );
    assert.match(
      editorSource,
      /onKeyUp=\{\(event\) =>[\s\S]*?saveImmediately: true/,
    );
    assert.match(autosaveSource, /targetId: editingBotId/);
    assert.match(
      autosaveSource,
      /`\/api\/bots\/\$\{pending\.targetId\}`/,
    );
    assert.doesNotMatch(
      autosaveSource,
      /\/api\/settings|prismDefaultBotAudioVoiceProfile/,
    );
  });

  it("does not wait forever for Web Audio before falling back to media playback", () => {
    const bottishSource = readFileSync(
      new URL("./bottishVoice.ts", import.meta.url),
      "utf8",
    );
    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    const effectsSource = readFileSync(
      new URL("./voiceEffects.ts", import.meta.url),
      "utf8",
    );
    assert.match(bottishSource, /encodeBottishPlanWave/);
    assert.match(bottishSource, /playPlanWithMedia/);
    assert.match(bottishSource, /playHybridBytesWithMedia/);
    assert.match(
      bottishSource,
      /if \(!played\) \{[\s\S]*?playHybridBytesWithMedia/,
    );
    assert.match(effectsSource, /Promise\.race\(/);
    assert.match(englishSource, /beginMediaUnlock\(\);/);
    assert.match(englishSource, /playBytesWithMedia/);
    assert.match(englishSource, /audio\.preservesPitch = false/);
    assert.match(
      englishSource,
      /activeMediaLiltTimer = window\.setInterval\(updatePlaybackRate, 100\)/,
    );
  });

  it("ties live Bottish to visible speech and hard-stops interruptions", () => {
    assert.match(pageSource, /liveBottishRevealKeyRef/);
    assert.match(pageSource, /prepareChatSpeechReveal/);
    assert.match(pageSource, /startChatSpeechReveal/);
    assert.match(pageSource, /progressChatSpeechReveal/);
    assert.match(pageSource, /\{ targetDurationMs \}/);
    assert.match(
      pageSource,
      /view === "chat" &&[\s\S]*?settings\.voiceMode === "bottish" \|\| settings\.voiceMode === "babble"/,
    );
    assert.match(
      pageSource,
      /function stopVoicePlaybackForAssistantInterruption\(\)/,
    );
    assert.match(
      pageSource,
      /function applyActiveAssistantRevealInterruption\([\s\S]*?stopVoicePlaybackForAssistantInterruption\(\);/,
    );
    assert.match(
      pageSource,
      /function discardActiveAssistantRevealForGrace\([\s\S]*?stopVoicePlaybackForAssistantInterruption\(\);/,
    );
  });

  it("uses actual audio progress as the Chat and Zen reveal clock", () => {
    const effectsSource = readFileSync(
      new URL("./voiceEffects.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      effectsSource,
      /onProgress\?: \(elapsedMs: number, durationMs: number\)/,
    );
    assert.match(effectsSource, /beginVoicePlaybackProgress/);
    assert.match(pageSource, /speechRevealVisibleTokenCount\(speechTimeline\)/);
    assert.match(pageSource, /onProgress: \(elapsedMs\) =>/);
    assert.match(
      pageSource,
      /releaseChatSpeechReveal\(interruption\.revealKey\)/,
    );
  });

  it("uses phoneme-aware visemes for English while robot modes keep their rhythm", () => {
    assert.match(
      pageSource,
      /phonemeAware: settings\?\.voiceMode === "english"/,
    );
    assert.match(
      pageSource,
      /coffeeSeatMouthShapeFromVisibleLength\([\s\S]*?settings\?\.voiceMode === "english"/,
    );
    assert.match(
      pageSource,
      /onPlaybackProgress\?: \([\s\S]*?elapsedMs: number,[\s\S]*?durationMs: number,[\s\S]*?alignment\?: SpeechCharacterAlignment \| null/,
    );
    assert.match(pageSource, /speechActivityAtMs\(/);
    assert.match(
      pageSource,
      /mode === "english"[\s\S]*?crtSpeechMouthShapeAtElapsedMs/,
    );
  });

  it("synthesizes one canonical message and requests exact provider timing", () => {
    assert.match(
      pageSource,
      /const requestEnglishClip = async \(input: \{[\s\S]*?messageId: string;[\s\S]*?messageId: input\.messageId,/,
    );
    assert.match(
      pageSource,
      /const clip = await requestEnglishClip\(\{[\s\S]*?messageId: message\.id,[\s\S]*?await enqueueEnglishVoice\([\s\S]*?message\.id,/,
    );
    assert.doesNotMatch(pageSource, /startChatSpeechRevealPhrase\(/);
    assert.match(pageSource, /includeAlignment: true/);
    assert.match(pageSource, /readEnglishVoiceSynthesisClip\(response\)/);
  });

  it("dispatches Coffee explicitly to procedural Bottish or system Babble fallback", () => {
    const coffeeVoiceStart = pageSource.slice(
      pageSource.indexOf("const startCoffeeVoiceForReveal = async"),
      pageSource.indexOf(
        "const queueCoffeeReveal =",
        pageSource.indexOf("const startCoffeeVoiceForReveal = async"),
      ),
    );
    assert.match(coffeeVoiceStart, /enqueueRobotVoiceMode\(\{/);
    assert.match(coffeeVoiceStart, /mode: settings\.voiceMode/);
    assert.match(coffeeVoiceStart, /targetDurationMs: fallbackDuration/);
    assert.match(
      coffeeVoiceStart,
      /if \(\s*settings\.voiceMode === "bottish" \|\|\s*settings\.voiceMode === "babble"\s*\)[\s\S]*?enqueueRobotVoiceMode/,
    );
  });

  it("does not let inactive Chat or Coffee Replay tear down another surface's voice", () => {
    assert.match(
      pageSource,
      /const chatOwnedPlayback = voiceConversationIdRef\.current !== null;[\s\S]*?if \(chatOwnedPlayback\) \{[\s\S]*?stopBottishVoice\(\);[\s\S]*?stopEnglishVoice\(\);/,
    );
    assert.match(
      pageSource,
      /const coffeeReplayOwnsVoicePlaybackRef = useRef\(false\);/,
    );
    assert.match(
      pageSource,
      /if \(coffeeReplayOwnsVoicePlaybackRef\.current\) \{[\s\S]*?coffeeReplayOwnsVoicePlaybackRef\.current = false;[\s\S]*?stopBottishVoice\(\);[\s\S]*?stopEnglishVoice\(\);/,
    );
  });
});
