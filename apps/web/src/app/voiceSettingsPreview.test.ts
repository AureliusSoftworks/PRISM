import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageStyles = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

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
    assert.match(pageSource, /onVoicePreview=\{previewSelectedBotVoice\}/);
    assert.doesNotMatch(pageSource, /aria-label="Bottish tone/);
  });

  it("previews Bottish, Babble, and English with the same resolved phrase", () => {
    assert.match(
      pageSource,
      /mode: "bottish",[\s\S]*?source: \{ text: spokenPreviewText \}[\s\S]*?sourceText: spokenPreviewText/,
    );
    assert.match(
      pageSource,
      /mode: "babble",[\s\S]*?source: \{ text: spokenPreviewText \}[\s\S]*?sourceText: spokenPreviewText/,
    );
    assert.match(pageSource, /allowBabbleFallback: false/);
    assert.match(pageSource, /Babble voice is still loading\/unavailable/);
    assert.match(pageSource, /text: spokenPreviewText,\s*mode: "english"/);
    assert.match(
      pageSource,
      /explicitOnlineContext: true,[\s\S]*?includeAlignment: true,[\s\S]*?profile: previewProfile/,
    );
    assert.match(pageSource, /await enqueueEnglishVoice\(/);
    assert.match(
      pageSource,
      /onStart: \(\) => options\.onPlaybackStart\?\.\(\)/,
    );
  });

  it("previews the unsaved Avatar Studio voice directly in every audible mode", () => {
    assert.match(
      pageSource,
      /previewing === "bottish" \? "Restart Bottish" : "Bottish"/,
    );
    assert.match(
      pageSource,
      /previewing === "babble" \? "Restart Babble" : "Babble"/,
    );
    assert.match(pageSource, /: "Preview English"/);
    assert.match(pageSource, /: "Preview Premium"/);
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
      /onClick=\{\(\) => void previewVoice\("premium"\)\}/,
    );
    assert.match(
      pageSource,
      /onPlaybackStart: \(\) => \{[\s\S]*?setEnglishPreviewState\("playing"\)/,
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
      /await onPreview\([\s\S]*?normalizedProfile,[\s\S]*?mode,[\s\S]*?previewText/,
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

  it("keeps Mute silent while explicit previews honor the active provider voice", () => {
    assert.match(
      pageSource,
      /Mute is silent\. Choose English, Premium, Babble, or Bottish to hear a preview\./,
    );
    assert.match(
      pageSource,
      /options\.englishVoiceEngine \?\?[\s\S]*?resolveVoicePreviewEngine\(previewProfile\)/,
    );
    assert.match(pageSource, /explicitVoicePreview: true/);
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

  it("presents offline English as the bundled local neural voice pack", () => {
    assert.match(pageSource, /aria-label="Offline English voice engine"/);
    assert.match(pageSource, /PRISM Voice Pack · 12 included/);
    assert.match(
      pageSource,
      /Default for every bot and every LOCAL reply/,
    );
    assert.match(pageSource, /Neural speech runs locally and never leaves this/);
    assert.match(pageSource, /Operating-system voices/);
  });

  it("presents Premium as a mode instead of a second engine dropdown", () => {
    const settingsSource = pageSource.slice(
      pageSource.indexOf('aria-labelledby="voice-engine-settings-title"'),
      pageSource.indexOf("<div className={styles.settingsSaveDock}"),
    );
    assert.match(
      settingsSource,
      /<span>Offline engine<\/span>[\s\S]*?aria-label="Offline English voice engine"/,
    );
    assert.match(settingsSource, /Premium English · ElevenLabs/);
    assert.match(settingsSource, /English never uses ElevenLabs credits/);
    assert.doesNotMatch(settingsSource, /aria-label="Online English voice engine"/);
    assert.match(settingsSource, /type="checkbox"/);
    assert.match(settingsSource, /operatingSystemVoicesEnabled/);
    assert.doesNotMatch(settingsSource, /ElevenLabs model/);
    assert.doesNotMatch(settingsSource, /Load voices/);
    assert.match(settingsSource, /ElevenLabs voice library/);
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

  it("shows separate per-profile local and ElevenLabs voice identities", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /English and Premium identities share the performance controls/);
    assert.match(editorSource, /aria-label="Local voice identity"/);
    assert.match(
      editorSource,
      /data-kind="online"[\s\S]*?PREMIUM VOICE · ELEVENLABS[\s\S]*?premiumVoiceLabel/,
    );
    assert.match(editorSource, /aria-label="ElevenLabs voice identity"/);
    assert.match(editorSource, /Use an exact Voice ID/);
    assert.match(editorSource, /aria-label="ElevenLabs voice ID override"/);
    assert.match(editorSource, /elevenLabsVoiceIdOverride: value/);
    assert.match(
      editorSource,
      /elevenLabsVoiceId: value,[\s\S]*?elevenLabsVoiceIdOverride: null/,
    );
    assert.match(
      editorSource,
      /value=\{[\s\S]*?elevenLabsVoiceIdOverrideValue[\s\S]*?\? ""[\s\S]*?: selectedElevenLabsVoiceValue/,
    );
    assert.match(editorSource, /Choose a library voice here to replace the exact Voice ID/);
    assert.match(editorSource, /event\.currentTarget\.blur\(\)/);
    assert.match(editorSource, /effectiveElevenLabsVoiceValue/);
    assert.match(
      editorSource,
      /Connection restored\. Preview \$\{premiumVoiceLabel\} again\.[\s\S]*?BACKEND_AVAILABLE_EVENT/,
    );
    assert.match(editorSource, /data-voice-id-resolution="true"/);
    assert.match(editorSource, /Validating Voice ID…/);
    assert.match(editorSource, /Voice name/);
    assert.match(editorSource, /voiceIdResolutionRunRef\.current !== runId/);
    assert.match(editorSource, /controller\.abort\(\)/);
    assert.match(
      editorSource,
      /\/api\/voices\/elevenlabs\/\$\{encodeURIComponent\(voiceId\)\}/,
    );
    assert.match(
      editorSource,
      /Voice unavailable · Check the ID or ElevenLabs[\s\S]*?access/,
    );
    assert.match(editorSource, /travels with[\s\S]*exported \.bot[\s\S]*?files/);
    assert.match(
      editorSource,
      /disabled=\{identityCatalog\.elevenLabs\.loading\}/,
    );
    assert.match(editorSource, /No Premium voice · use local fallback/);
    assert.match(editorSource, /Used for English and whenever Premium cannot play/);
    assert.match(editorSource, /aria-label="Online voice"/);
    assert.match(editorSource, /aria-label="Offline and fallback voice"/);
    assert.match(editorSource, /data-bot-voice-source-card="online"/);
    assert.match(editorSource, /data-bot-voice-source-card="system"/);
    assert.match(editorSource, /Choose from your connected ElevenLabs library/);
    assert.match(pageSource, /applyOfflineVoiceSelection/);
    assert.match(pageSource, /elevenLabsVoiceId: value/);
    assert.match(editorSource, /elevenLabsVoiceInitialized: true/);
    const resetBotFormSource = pageSource.slice(
      pageSource.indexOf("const resetBotForm = useCallback"),
      pageSource.indexOf("function resetBotPanelDraftNavigation"),
    );
    assert.doesNotMatch(resetBotFormSource, /voiceAutosavePendingRef\.current = null/);
    assert.doesNotMatch(resetBotFormSource, /clearTimeout\(voiceAutosaveTimerRef\.current\)/);
    assert.doesNotMatch(editorSource, /identityCatalog\.onlineEnabled/);
    assert.doesNotMatch(
      pageSource,
      /\["Fred", "Zarvox", "Trinoids", "Junior", "Ralph"\]/,
    );
    assert.doesNotMatch(pageSource, /className=\{styles\.botVoiceSlots\}/);
  });

  it("keeps Pace local and exposes only ElevenLabs performance stability", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /\["pace", "Pace"\]/);
    assert.match(editorSource, /Pace is the only duration control\./);
    assert.match(editorSource, /aria-label="ElevenLabs performance stability"/);
    assert.match(editorSource, /elevenLabsStability:/);
    assert.match(editorSource, /Eleven v3 uses this setting alone\./);
    assert.doesNotMatch(editorSource, /Speaker Boost/);
    assert.doesNotMatch(editorSource, /Similarity/);
    assert.doesNotMatch(editorSource, /\bStyle\b/);
  });

  it("keeps advanced identity controls tucked away and preview actions in reach", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /className=\{styles\.botVoiceOverrideDisclosure\}/);
    assert.match(editorSource, /<summary>[\s\S]*?Use an exact Voice ID/);
    assert.match(
      editorSource,
      /open=\{elevenLabsVoiceIdOverrideValue \? true : undefined\}/,
    );
    assert.match(
      pageStyles,
      /\.botVoiceEditor\s*\{[\s\S]*?overflow:\s*visible/,
    );
    assert.match(
      pageStyles,
      /\.botVoiceActions\s*\{[\s\S]*?position:\s*sticky[\s\S]*?backdrop-filter:\s*blur/,
    );
    assert.match(
      editorSource,
      /className=\{styles\.botVoiceDeliveryDisclosure\}[\s\S]*?<summary>[\s\S]*?Fine-tune delivery/,
    );
    assert.match(
      editorSource,
      /className=\{`\$\{styles\.botVoiceSourceCard\} \$\{styles\.botVoiceFallbackDisclosure\}`\}[\s\S]*?<summary/,
    );
    assert.match(editorSource, /className=\{styles\.botVoicePreviewStatus\}/);
    assert.match(
      editorSource,
      /English previews \$\{fallbackVoiceLabel\}\. Premium checks ElevenLabs directly and never substitutes fallback audio/,
    );
    assert.match(
      pageStyles,
      /\.botVoiceControls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/,
    );
  });

  it("loads the configured ElevenLabs catalog from Avatar Studio in any response mode", () => {
    const catalogEffectSource = pageSource.slice(
      pageSource.indexOf("if (!botAvatarCustomizerOpen)"),
      pageSource.indexOf("const [botAvatarSavePromptOpen"),
    );
    assert.match(catalogEffectSource, /settings\.elevenLabsApiKeySource === "none"/);
    assert.match(catalogEffectSource, /void loadElevenLabsVoiceCatalog\(true\)/);
    assert.match(
      catalogEffectSource,
      /const attemptKey = `\$\{user\.id\}:\$\{settings\.elevenLabsApiKeySource\}:\$\{settings\.elevenLabsVoiceCollectionId\}`/,
    );
    assert.doesNotMatch(catalogEffectSource, /preferredProvider/);
    assert.doesNotMatch(pageSource, /Switch to ONLINE to load your ElevenLabs voice catalog/);
  });

  it("lets Voice Settings pick an authenticated ElevenLabs collection", () => {
    const catalogEffectSource = pageSource.slice(
      pageSource.indexOf("if (!botAvatarCustomizerOpen)"),
      pageSource.indexOf("const [botAvatarSavePromptOpen"),
    );
    assert.match(pageSource, /data-elevenlabs-collection-picker/);
    assert.match(pageSource, /aria-label="ElevenLabs voice collection"/);
    assert.match(pageSource, /All ElevenLabs voices/);
    assert.match(pageSource, /\/api\/voices\/elevenlabs\/collections/);
    assert.match(pageSource, /Collections come directly from your connected/);
    assert.match(
      pageSource,
      /elevenLabsVoiceCollectionId:\s*settings\.elevenLabsVoiceCollectionId/,
    );
    assert.doesNotMatch(pageSource, /Collection ID \(blank = all voices\)/);
    assert.match(
      pageSource,
      /Saved ElevenLabs voice \(outside selected collection\)/,
    );
    assert.doesNotMatch(catalogEffectSource, /elevenLabsVoiceCatalog\.length > 0/);
  });

  it("shows per-profile effects for every voice engine", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    const performanceSource = editorSource.slice(
      editorSource.indexOf('id="bot-voice-performance-title"'),
      editorSource.indexOf("<footer", editorSource.indexOf('id="bot-voice-performance-title"')),
    );
    assert.match(
      performanceSource,
      /<label htmlFor="bot-voice-effect">Voice effect<\/label>/,
    );
    assert.match(performanceSource, /aria-label="Voice effect"/);
    assert.match(performanceSource, /VOICE_EFFECTS\.map/);
    assert.match(performanceSource, /VOICE_EFFECT_DESCRIPTIONS/);
    assert.match(performanceSource, /Applied locally to PRISM/);
    assert.match(pageSource, /enqueueEnglishVoice\([\s\S]*?clip\.engineUsed/);
    assert.match(
      editorSource,
      /elevenLabsEffect:[\s\S]*?saveImmediately: true/,
    );
    assert.match(pageSource, /async function flushBotVoiceAutosaveQueue/);
    assert.match(pageSource, /voiceAutosavePendingRef/);
    assert.match(pageSource, /voiceAutosaveInFlightRef/);
  });

  it("offers a persisted keyword deck for Eleven v3 performance direction", () => {
    const chipEditorSource = pageSource.slice(
      pageSource.indexOf("function ElevenLabsVoiceDirectionChips("),
      pageSource.indexOf("interface BotVoiceProfileChangeOptions"),
    );
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    const directionSource = `${chipEditorSource}\n${editorSource}`;
    assert.match(editorSource, /Direction cues · ElevenLabs v3/);
    assert.match(
      directionSource,
      /data-voice-direction-chip-field="true"/,
    );
    assert.match(
      directionSource,
      /aria-label="Add ElevenLabs voice direction cue"/,
    );
    assert.match(directionSource, /aria-label=\{`Remove voice direction/);
    assert.match(editorSource, /elevenLabsDirection: direction/);
    assert.match(directionSource, /normalizeElevenLabsVoiceDirection/);
    assert.match(
      editorSource,
      /Add 1–3 compatible delivery cues\. Two usually sound best\./,
    );
    assert.match(directionSource, /event\.key === "Enter"/);
    assert.match(directionSource, /event\.key === "Backspace"/);
  });

  it("keeps only audible performance controls and removes custom textures", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function BotVoiceEditor("),
      pageSource.indexOf("type BotEditOriginalSnapshot"),
    );
    assert.match(editorSource, /\["pitch", "Pitch"\]/);
    assert.match(editorSource, /\["lilt", "Lilt"\]/);
    assert.doesNotMatch(editorSource, /<span>Tone<\/span>/);
    assert.match(editorSource, /Pace is the only duration control\./);
    assert.match(editorSource, /\["pace", "Pace"\]/);
    assert.doesNotMatch(editorSource, /\["warmth", "Warmth"\]/);
    assert.doesNotMatch(editorSource, /<span>Volume<\/span>/);
    assert.doesNotMatch(editorSource, />Texture</);
    assert.doesNotMatch(editorSource, /Voice texture/);
    assert.doesNotMatch(editorSource, /Texture amount/);
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

  it("commits pitch, pace, and lilt through the selected bot profile instead of global settings", () => {
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
    assert.match(editorSource, /\["pace", "Pace"\]/);
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
    assert.match(
      autosaveSource,
      /payload\.namePronunciation = pending\.namePronunciation/,
    );
    assert.match(
      pageSource,
      /onBotNamePronunciationChange=\{\(next\) => \{[\s\S]*?queueBotNamePronunciationAutosave\(next\)/,
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
    assert.match(englishSource, /audio\.preservesPitch = true/);
    assert.match(englishSource, /resolveVoicePlaybackTransform\(profile\)\.tempo/);
    assert.match(effectsSource, /formantCorrectionNodeConstructor/);
    assert.match(effectsSource, /\/worklets\/formant-correction-processor\.js/);
  });

  it("ties live Bottish to visible speech and hard-stops interruptions", () => {
    assert.match(pageSource, /liveBottishRevealKeyRef/);
    assert.match(pageSource, /prepareChatSpeechReveal/);
    assert.match(pageSource, /startChatSpeechReveal/);
    assert.match(pageSource, /progressChatSpeechReveal/);
    assert.match(pageSource, /\{ targetDurationMs \}/);
    assert.match(
      pageSource,
      /view === "chat" &&[\s\S]*?voiceSelection\.voiceMode === "bottish" \|\|[\s\S]*?voiceSelection\.voiceMode === "babble"/,
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
