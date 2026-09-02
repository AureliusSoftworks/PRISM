import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const normalizedCssSource = cssSource
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")");

describe("selected bot library showcase", () => {
  it("renders a large interactive avatar over the left-side panel backdrop", () => {
    assert.match(pageSource, /className=\{styles\.botPanelHubShowcase\}/);
    assert.match(
      pageSource,
      /className=\{styles\.botPanelHubShowcase\}[\s\S]*?data-prism-panel-layer="true"/
    );
    assert.match(pageSource, /if \(event\.target !== event\.currentTarget\) return;/);
    assert.match(pageSource, /className=\{`\$\{styles\.zenLiveBotPresencePlate\} \$\{styles\.botPanelHubAvatarPlate\}`\}/);
    for (const mode of ["english", "premium", "babble", "bottish"]) {
      assert.match(
        pageSource,
        new RegExp(`playShowcaseVoiceMode\\("${mode}"\\)`),
      );
    }
    assert.match(pageSource, /"--zen-live-bot-avatar-size":[\s\S]*?"min\(520px, 72vmin\)"/);
    assert.match(pageSource, /\{renderBotHubShowcase\(\)\}[\s\S]*?\{renderUsagePanel\(\)\}/);
    assert.match(
      cssSource,
      /\.botPanelHubShowcase\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*var\(\s*--app-shell-top-nav-height[\s\S]*?right:\s*min\(479px, calc\(100vw - 32px\)\);[\s\S]*?bottom:\s*0;[\s\S]*?left:\s*0;/,
    );
    assert.match(cssSource, /@keyframes botPanelHubAvatarIdle/);
    assert.doesNotMatch(
      normalizedCssSource,
      /\.botPanelHubAvatarPlate \.zenLiveBotPresenceBody\s*\{[\s\S]*?--zen-live-bot-avatar-face-glyph-size:/,
    );
  });

  it("keeps the populated drawer painted above its showcase after WebKit settles the entrance animation", () => {
    const panelRule = normalizedCssSource.slice(
      normalizedCssSource.indexOf(".panel {"),
      normalizedCssSource.indexOf('.panel[data-closing="true"]'),
    );
    const showcaseRule = normalizedCssSource.slice(
      normalizedCssSource.indexOf(".botPanelHubShowcase {"),
      normalizedCssSource.indexOf(
        '.botPanelHubShowcase[data-panel="bots"][data-bot-view="botHub"]',
      ),
    );

    assert.match(panelRule, /z-index:\s*102;/u);
    assert.match(panelRule, /transform:\s*translateX\(0\);/u);
    assert.match(panelRule, /opacity:\s*1;/u);
    assert.match(showcaseRule, /z-index:\s*100;/u);
  });

  it("matches the Avatar Editor alloy and buckle proportions", () => {
    assert.match(
      normalizedCssSource,
      /\.botPanelHubAvatarPlate \.zenLiveBotPresenceBody\s*\{[\s\S]*?--zen-live-bot-body-glyph-size:\s*calc\(var\(--zen-live-bot-body-frame-size\) \* 0\.145\)/,
    );
    assert.match(
      pageSource,
      /const previewVoicePreset = profile\.core\.communicationStyle;[\s\S]*?const avatarStyle = botAvatarFoundryPreviewStyle\([\s\S]*?previewVoicePreset/,
    );
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    const showcasePlateSource = pageSource.slice(
      pageSource.indexOf("function BotHubVoicePreviewAvatarPlate"),
      pageSource.indexOf("function ZenLiveBotPresencePlate"),
    );
    assert.match(
      showcaseSource,
      /const showcaseVoicePreset = coffeeSeatVoicePreset\(bot\);[\s\S]*?botAvatarFullScaleIdentityStyle\([\s\S]*?voicePreset: showcaseVoicePreset/,
    );
    assert.match(
      showcasePlateSource,
      /<ZenLiveBotMannequin[\s\S]*?voicePreset=\{showcaseVoicePreset\}/,
    );
    assert.match(
      showcasePlateSource,
      /metalAlloyEnabled=\{!isDefaultPrism\}/,
    );
  });

  it("reserves the triangle for Prism and keeps persona glyphs canonical", () => {
    assert.match(
      pageSource,
      /function resolveCustomBotGlyph\([\s\S]*?value !== DEFAULT_PRISM_BOT_GLYPH[\s\S]*?: DEFAULT_BOT_GLYPH;/,
    );
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    const showcasePlateSource = pageSource.slice(
      pageSource.indexOf("function BotHubVoicePreviewAvatarPlate"),
      pageSource.indexOf("function ZenLiveBotPresencePlate"),
    );
    assert.match(
      showcasePlateSource,
      /glyph=\{[\s\S]*?bot[\s\S]*?\? resolveCustomBotGlyph\(bot\.glyph\)[\s\S]*?: DEFAULT_PRISM_BOT_GLYPH[\s\S]*?\}/,
    );
    assert.match(showcaseSource, /<BotHubVoicePreviewAvatarPlate/);
    assert.match(
      pageSource,
      /const seededGlyph: BotGlyphName = resolveCustomBotGlyph\(bot\.glyph\);/,
    );
    assert.doesNotMatch(
      pageSource,
      /bot && isBotGlyphName\(bot\.glyph\) \? bot\.glyph : defaultPrismGlyph/,
    );
  });

  it("opens the selected bot actions from the showcase context menu", () => {
    assert.match(
      pageSource,
      /onContextMenuCapture=\{\(event\) => \{[\s\S]*?openBotShowcaseContextMenu\(bot, event\.clientX, event\.clientY\)/
    );
    assert.match(pageSource, /source: "showcase"/);
    assert.match(pageSource, /label:\s*\n?\s*botContextMenu\.source === "showcase"[\s\S]*?`\$\{bot\.name\} preview actions`/);
    for (const label of [
      "Avatar Studio",
      "Memories",
      "Images",
      "Settings",
    ]) {
      assert.match(pageSource, new RegExp(`label: "${label}"`));
    }
    const showcaseMenuSource = pageSource.slice(
      pageSource.indexOf('if (botContextMenu.source === "showcase")'),
      pageSource.indexOf("if (botContextMenu.groupId && !botLibraryGroupContext)")
    );
    assert.doesNotMatch(showcaseMenuSource, /Regenerate audio sample/);
  });

  it("keeps the showcase context menu authoritative in Coffee Mode", () => {
    assert.match(pageSource, /data-bot-showcase-context="true"/);
    assert.match(
      pageSource,
      /handleCoffeeShellContextMenu[\s\S]*?event\.target\.closest\('\[data-bot-showcase-context="true"\]'\)[\s\S]*?return;/
    );
  });

  it("keeps shared panel navigation above the Coffee toolbar", () => {
    assert.match(
      cssSource,
      /\.chatHeader\s*\{[\s\S]*?z-index:\s*180;/
    );
    assert.match(
      cssSource,
      /\.coffeeShell \.panel\s*\{[\s\S]*?z-index:\s*181;/
    );
  });

  it("keeps the large preview silent and plays only from its voice buttons", () => {
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    const previewSource = pageSource.slice(
      pageSource.indexOf("className={styles.botPanelHubAvatarPreview}"),
      pageSource.indexOf("className={styles.botPanelHubShowcasePrompt}")
    );
    assert.doesNotMatch(previewSource, /onClick=/);
    assert.doesNotMatch(previewSource, /playBotHubVoicePreview/);
    assert.match(showcaseSource, /aria-label="Voice preview mode"/);
    for (const mode of ["english", "premium", "babble", "bottish"]) {
      assert.match(
        showcaseSource,
        new RegExp(`onClick=\\{\\(\\) => void playShowcaseVoiceMode\\("${mode}"\\)\\}`),
      );
    }
  });

  it("opens every Avatar Studio section directly from the bot hub", () => {
    const hubSource = pageSource.slice(
      pageSource.indexOf('{botPanelView === "botHub"'),
      pageSource.indexOf("{/* One form, two modes.", pageSource.indexOf('{botPanelView === "botHub"')),
    );
    assert.match(
      hubSource,
      /BOT_AVATAR_CUSTOMIZER_TABS\.map\(\(tab\) =>/,
    );
    assert.match(
      hubSource,
      /data-avatar-studio-shortcut=\{tab\.value\}/,
    );
    assert.match(
      hubSource,
      /openBotCustomizer\(\s*selectedBotPanelBot,\s*tab\.value,\s*\)/,
    );
    for (const [value, label] of [
      ["face", "Identity"],
      ["profile", "Profile"],
      ["powers", "Powers"],
      ["eyes", "Eyes"],
      ["mouth", "Mouth"],
      ["voice", "Voice"],
      ["sfx", "SFX"],
      ["settings", "Settings"],
      ["details", "Details"],
    ] as const) {
      assert.match(
        pageSource,
        new RegExp(`\\{ value: "${value}", label: "${label}" \\}`),
      );
    }
  });

  it("speaks the bot hub test line without creating a chat or LLM turn", () => {
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    const hubSource = pageSource.slice(
      pageSource.indexOf('{botPanelView === "botHub"'),
      pageSource.indexOf(
        "{/* One form, two modes.",
        pageSource.indexOf('{botPanelView === "botHub"'),
      ),
    );
    const submitSource = pageSource.slice(
      pageSource.indexOf("async function submitBotHubVoiceEcho"),
      pageSource.indexOf("async function previewSelectedBotVoice"),
    );
    const playbackSource = pageSource.slice(
      pageSource.indexOf("async function playBotHubVoicePreview"),
      pageSource.indexOf("async function submitBotHubVoiceEcho"),
    );
    assert.match(
      playbackSource,
      /options: \{ exactText\?: string \} = \{\}/,
    );
    assert.ok(
      playbackSource.indexOf("const exactPreviewText") <
        playbackSource.indexOf("await resolveBotHubVoicePreviewText(bot)"),
      "exact text should be selected before generated sample text is resolved",
    );
    assert.match(
      submitSource,
      /playBotHubVoicePreview\(bot, mode, \{ exactText \}\)/,
    );
    assert.doesNotMatch(
      submitSource,
      /sendMessage|createConversation|resolveBotHubVoicePreviewText|\/api\//,
    );
    assert.match(
      showcaseSource,
      /placeholder="Type exactly what this bot should say…"/,
    );
    assert.ok(
      showcaseSource.indexOf("className={styles.botPanelHubVoiceTest}") >
        showcaseSource.indexOf("className={styles.botPanelHubVoiceChoices}"),
      "the composer should follow the four sample buttons",
    );
    assert.doesNotMatch(hubSource, /botPanelHubVoiceTest/);
    assert.match(
      normalizedCssSource,
      /\.botPanelHubVoiceTest\s*\{[^}]*width:\s*min\(560px, calc\(100vw - 48px\)\);/,
    );
  });

  it("seeds one editable sample and routes every voice button through it", () => {
    const openHubSource = pageSource.slice(
      pageSource.indexOf("function openBotPanelHub"),
      pageSource.indexOf("async function createBot"),
    );
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    assert.match(
      openHubSource,
      /setBotHubVoiceEchoDraft\([\s\S]*?bot\.voice_preview_line\?\.trim\(\) \|\| VOICE_PREVIEW_TEXT/,
    );
    assert.match(
      showcaseSource,
      /voiceTestBot \? \{ exactText: botHubVoiceEchoDraft \} : undefined/,
    );
    for (const mode of ["english", "premium", "babble", "bottish"]) {
      assert.match(
        showcaseSource,
        new RegExp(`playShowcaseVoiceMode\\("${mode}"\\)`),
      );
    }
    assert.doesNotMatch(pageSource, /regenerateBotHubAudioSample/);
  });

  it("keeps the Bots panel open when the surrounding backdrop is clicked", () => {
    const panelOverlaySource = pageSource.slice(
      pageSource.indexOf('className={styles.panelOverlay}'),
      pageSource.indexOf("{renderBotHubShowcase()}")
    );
    assert.match(panelOverlaySource, /if \(panel === "bots"\) return;/);
    assert.match(panelOverlaySource, /closePanel\(\);/);
    assert.match(
      pageSource,
      /data-prism-panel="bots"[\s\S]*?className=\{styles\.panelClose\}[\s\S]*?onClick=\{closePanel\}/
    );
    assert.match(
      pageSource,
      /if \(event\.key === "Escape"\) \{[\s\S]*?closePanel\(\);/
    );
  });

  it("refreshes the current account's bots whenever the library opens", () => {
    const refreshBotsSource = pageSource.slice(
      pageSource.indexOf("async function refreshBots"),
      pageSource.indexOf(
        "async function refreshImages",
        pageSource.indexOf("async function refreshBots"),
      ),
    );
    const openLibrarySource = pageSource.slice(
      pageSource.indexOf("function openExistingBotLibrary"),
      pageSource.indexOf("function selectBotPanelShowcase"),
    );

    assert.match(refreshBotsSource, /captureAccountOwnerGeneration\(\)/u);
    assert.match(refreshBotsSource, /runForAccountOwner\(ownerGeneration/u);
    assert.match(
      refreshBotsSource,
      /if \(botsResult\.status === "stale"\) return \[\];/u,
    );
    assert.match(
      openLibrarySource,
      /openRightPanel\("bots"\);[\s\S]*?void refreshBots\(\)\s*\.catch/u,
    );
    assert.match(openLibrarySource, /isPrismBackendUnavailableError\(err\)/u);
    assert.match(openLibrarySource, /setBotLibraryRefreshing\(true\)/u);
    assert.match(openLibrarySource, /\.finally\(\(\) =>/u);
    assert.match(
      pageSource,
      /botLibraryRefreshing\s*\?\s*"Loading library…"/u,
    );
    assert.match(
      pageSource,
      /botLibraryRefreshing && bots\.length === 0[\s\S]*?role="status"[\s\S]*?Loading your bots…/u,
    );
  });

  it("uses thinking while generating and then plays on the same click", () => {
    assert.match(pageSource, /showThinkingSpinner=\{previewStatus === "generating"\}/);
    assert.match(pageSource, /Generating audio sample…/);
    assert.match(pageSource, /voiceModeDisplayName\(previewMode\)[\s\S]*?preview played\./);
    assert.match(
      pageSource,
      /data-talking=\{previewPlaybackActive \? "true"/,
    );
  });

  it("awaits persona copy and plays the first English sample", () => {
    const previewHandlerSource = pageSource.slice(
      pageSource.indexOf("async function playBotHubVoicePreview"),
      pageSource.indexOf("async function playZenHeroVoicePreview")
    );
    assert.match(
      previewHandlerSource,
      /setBotHubVoicePreview\(\{[\s\S]*?botId: showcaseVoiceId,[\s\S]*?mode,[\s\S]*?status: "generating"/
    );
    assert.match(
      previewHandlerSource,
      /Voice settings are still loading\. Try again in a moment\./
    );
    assert.match(previewHandlerSource, /await resolveBotHubVoicePreviewText\(bot\)/);
    assert.match(
      previewHandlerSource,
      /const spokenShowcaseName = antiTruth/,
    );
    assert.match(
      previewHandlerSource,
      /My name is \$\{spokenShowcaseName\}\./,
    );
    assert.equal(previewHandlerSource.match(/await previewSelectedVoice\(/g)?.length, 1);
    assert.doesNotMatch(previewHandlerSource, /generateOnly/);
    assert.match(previewHandlerSource, /onPlaybackStart:/);
  });

  it("does not cancel a voice preview when its generated line updates the bot", () => {
    const resetEffectStart = pageSource.indexOf(
      "useEffect(() => {\n    voicePreviewPlaybackRunRef.current += 1;",
    );
    const resetEffectEnd = pageSource.indexOf(
      "  useEffect(() => {\n    signalVoicePrefetchSchedulerRef.current.clear();",
      resetEffectStart,
    );
    const resetEffectSource = pageSource.slice(
      resetEffectStart,
      resetEffectEnd,
    );
    assert.ok(resetEffectStart >= 0 && resetEffectEnd > resetEffectStart);
    assert.doesNotMatch(resetEffectSource, /\bbots\b/);
    assert.match(
      resetEffectSource,
      /settings\?\.englishVoiceEngine,[\s\S]*?settings\?\.preferredProvider/,
    );
  });

  it("guarantees visible click feedback even when playback settles immediately", () => {
    assert.match(pageSource, /"playing" \| "complete" \| "error"/);
    assert.match(pageSource, /BOT_HUB_VOICE_CLICK_FEEDBACK_MS = 1400/);
    assert.match(
      pageSource,
      /setBotHubVoicePreview\(\{[\s\S]*?botId: showcaseVoiceId,[\s\S]*?mode,[\s\S]*?status: "complete",[\s\S]*?error: null,[\s\S]*?\}\)/
    );
    assert.match(
      pageSource,
      /data-feedback=\{\s*previewMode === "english" \? previewStatus : undefined\s*\}/
    );
    assert.match(
      pageSource,
      /data-feedback=\{\s*previewMode === "premium" \? previewStatus : undefined\s*\}/,
    );
    assert.match(
      pageSource,
      /aria-busy=\{\s*previewMode === "bottish" && previewStatus === "generating"\s*\}/
    );
    assert.match(pageSource, /preview played\./);
    assert.match(cssSource, /button\[data-feedback="generating"\]::before/);
    assert.match(cssSource, /button\[data-feedback="complete"\]::before[\s\S]*?content: "✓"/);
    assert.match(cssSource, /\.botPanelHubVoiceChoices\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
    assert.match(cssSource, /\.botPanelHubVoiceChoices button:disabled/);
    assert.match(cssSource, /@keyframes botPanelHubVoiceFeedbackSpin/);
  });

  it("animates the authored mouth through speech shapes instead of pinning :o", () => {
    assert.match(pageSource, /BOT_AVATAR_PREVIEW_MOUTH_SHAPES/);
    assert.match(pageSource, /window\.setInterval\(advanceMouthShape, 118\)/);
    assert.match(pageSource, /mouthShape=\{previewMouthShape\}/);
    assert.match(pageSource, /data-bot-hub-mouth-renderer="isolated"/);
    assert.match(
      pageSource,
      /useSyncExternalStore\(\s*subscribeBotHubVoicePreviewMouth/,
    );
    assert.doesNotMatch(pageSource, /setBotHubPreviewMouthShape/);
    assert.doesNotMatch(pageSource, /setBotHubPreviewVoicing/);
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("const renderBotHubShowcase"),
        pageSource.indexOf("const renderSharedPanels")
      ),
      /mouthShape=\{previewStatus === "playing" \? "open-small"/
    );
  });

  it("paces Bottish from audio progress instead of the rapid Babble timer", () => {
    assert.match(
      pageSource,
      /botHubVoicePreview\.mode === "bottish"[\s\S]{0,180}return;/,
    );
    assert.match(
      pageSource,
      /mode === "bottish"[\s\S]{0,500}bottishMouthShapeAtAlignedElapsedMs\(\{/,
    );
  });

  it("rests the English preview mouth in provider-timed phrase gaps", () => {
    const previewHandlerSource = pageSource.slice(
      pageSource.indexOf("async function playBotHubVoicePreview"),
      pageSource.indexOf("async function loadElevenLabsVoiceCatalog"),
    );
    assert.match(
      previewHandlerSource,
      /buildSpeechActivityWindows\(\s*alignment,\s*durationMs/,
    );
    assert.match(previewHandlerSource, /speechActivityAtMs\(/);
    assert.match(
      previewHandlerSource,
      /crtSpeechMouthShapeAtAlignedElapsedMs\(\{[\s\S]*?alignment,/,
    );
    assert.match(
      pageSource,
      /const previewPlaybackActive = previewStatus === "playing";[\s\S]{0,240}mouthSnapshot\.botId === showcaseVoiceId[\s\S]{0,120}mouthSnapshot\.talking/,
    );
    assert.match(pageSource, /isTalking=\{previewTalking\}/);
    assert.match(
      pageSource,
      /voiceLightTarget=\{botVoiceLightTarget\([\s\S]{0,100}"bot-preview"[\s\S]{0,100}"hub"/,
      "provider-timed mouth pauses keep the always-alive frame bound to voice energy",
    );
  });

  it("persists across bot-owned panels and replaces the matching canvas presence", () => {
    assert.match(
      pageSource,
      /panel === "bots"[\s\S]*?botPanelView === "library"[\s\S]*?botPanelView === "botHub"[\s\S]*?return null/,
    );
    assert.match(
      pageSource,
      /setBotPanelView\("botHub"\)[\s\S]*?setBotAvatarCustomizerOpen\(true\)/,
    );
    assert.match(pageSource, /panel === "memories" && memoryPanelScope === "bot"/);
    assert.match(pageSource, /panel === "images" && imagePanelScope === "bot"/);
    assert.match(pageSource, /zenLivePresenceBot\?\.id === botPanelShowcaseBotId/);
    assert.match(
      pageSource,
      /zenLivePresenceRailVisible\s*&&\s*!zenCanvasBotSuppressedForPanel/
    );
    assert.match(cssSource, /\.botPanelHubShowcase\[data-panel="images"\]/);
  });

  it("dismisses the bot management hub only from the empty showcase backdrop", () => {
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );

    assert.match(
      showcaseSource,
      /const showcaseBackdropDismissible =\s*panel === "bots" && botPanelView === "botHub"/u,
    );
    assert.match(showcaseSource, /data-bot-hub-showcase-backdrop="true"/u);
    assert.match(
      showcaseSource,
      /if \(event\.target !== event\.currentTarget\) return;\s*closePanel\(\);/u,
    );
  });

  it("offers English, Premium, Babble, and Bottish independently of the global voice mode", () => {
    assert.match(pageSource, /mode: Exclude<VoicePlaybackChoice, "mute">/);
    assert.match(pageSource, /playBotHubVoicePreview\(\s*bot: Bot \| null,\s*mode: Exclude<VoicePlaybackChoice, "mute">/);
    assert.match(pageSource, /aria-label="Voice preview mode"/);
    assert.match(pageSource, /aria-pressed=\{previewMode === "english"\}/);
    assert.match(pageSource, /aria-pressed=\{previewMode === "premium"\}/);
    assert.match(pageSource, /aria-pressed=\{previewMode === "babble"\}/);
    assert.match(pageSource, /playShowcaseVoiceMode\("premium"\)/);
    assert.match(pageSource, /playShowcaseVoiceMode\("babble"\)/);
    assert.match(
      pageSource,
      /playBotHubVoicePreview\([\s\S]*?bot,[\s\S]*?mode,[\s\S]*?voiceTestBot \? \{ exactText: botHubVoiceEchoDraft \} : undefined/,
    );
    assert.match(pageSource, /mode === "premium" \? "english" : mode/);
    assert.match(pageSource, /mode === "premium" \? "elevenlabs" : "builtin"/);
    assert.match(
      pageSource,
      /Connect an ElevenLabs key in Settings → Keys to preview Premium\./,
    );
    assert.match(pageSource, /Generating audio sample…/);
    assert.match(pageSource, /Playing Bottish…/);
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("async function playBotHubVoicePreview"),
        pageSource.indexOf("async function playZenHeroVoicePreview")
      ),
      /settings\.voiceMode/
    );
  });

  it("uses exclusion for neutral frame wear without shipping the dev picker", () => {
    assert.doesNotMatch(pageSource, /Developer scuff blend mode/);
    assert.doesNotMatch(cssSource, /\.botPanelHubScuffBlendDev/);
    assert.match(cssSource, /\.botFaceFrameWearLayer\s*\{[\s\S]*?mix-blend-mode:\s*exclusion\s*;/);
    assert.match(cssSource, /\.botFaceFrameMetalScratchLayer\s*\{[\s\S]*?mix-blend-mode:\s*exclusion\s*;/);
  });

  it("shows Prism first and separates library preview from bot management", () => {
    assert.match(pageSource, /botPanelShowcaseIsDefaultPrism/);
    assert.match(pageSource, /showcaseName = bot\?\.name \?\? "Prism"/);
    assert.match(pageSource, /onClick=\{\(\) => selectBotPanelShowcase\(null\)\}/);
    assert.match(
      pageSource,
      /onClick=\{\(\) =>\s*selectBotPanelShowcase\(b\)\s*\}/
    );
    assert.match(
      pageSource,
      /onDoubleClick=\{\(event\) => \{[\s\S]*?openBotPanelHub\(b,\s*\{[\s\S]*?origin: "library"/,
    );
    assert.match(pageSource, /double-click to manage/);
    assert.match(cssSource, /\.botCard\[data-preview-selected="true"\]/);
  });

  it("keeps customization out of the Default Prism Library preview", () => {
    const previewStart = pageSource.indexOf("const renderBotHubShowcase");
    const previewEnd = pageSource.indexOf(
      "const renderSharedPanels",
      previewStart,
    );
    assert.notEqual(previewStart, -1);
    assert.notEqual(previewEnd, -1);
    assert.doesNotMatch(
      pageSource.slice(previewStart, previewEnd),
      /Customize Prism/,
    );
  });

  it("keeps Default Prism visible on the Bots home panel", () => {
    assert.match(pageSource, /className=\{styles\.botPanelHomePrismCard\}/);
    assert.match(pageSource, /aria-label="Default Prism bot"/);
    assert.match(
      pageSource,
      /<PrismTriangleMark\s+className=\{styles\.botPanelHomePrismGlyph\}/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.botPanelHomePrismCustomize\}[\s\S]*?onClick=\{openDefaultBotCustomizer\}[\s\S]*?Customize Prism/,
    );
    assert.match(cssSource, /\.botPanelHomePrismCard\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
    assert.match(cssSource, /\.botPanelHomePrismGlyph/);
    assert.match(cssSource, /\.botPanelHomePrismCustomize/);
  });

  it("keeps each selected Library bot on its stable frame material seed", () => {
    assert.match(
      pageSource,
      /bot\s*\?\s*botFrameMaterialSeedForBot\(bot, bot\.id\)\s*:\s*PRISM_FACTORY_CLEAN_FRAME_SEED/
    );
  });

  it("removes the retired voice texture setting", () => {
    assert.doesNotMatch(pageSource, /<strong>Voice textures<\/strong>/);
    assert.doesNotMatch(pageSource, /Apply each bot&apos;s CRT or damaged-speaker texture/);
  });

  it("caches generated English samples and replays them through the bot voice profile", () => {
    assert.match(pageSource, /voicePreviewAudioCacheRef/);
    assert.match(
      pageSource,
      /cachedPreviewClip &&[\s\S]*?previewEngine !== "elevenlabs" \|\|[\s\S]*?cachedPreviewClip\.engineUsed === "elevenlabs"/,
    );
    assert.match(
      pageSource,
      /voicePreviewAudioCacheRef\.current\.set\(\s*effectiveCacheKey,\s*\{[\s\S]*?bytes: previewClip\.bytes\.slice\(0\),[\s\S]*?engineUsed: previewClip\.engineUsed,[\s\S]*?\},\s*\)/
    );
    assert.match(
      pageSource,
      /effectiveCacheKey &&[\s\S]*?previewEngine !== "elevenlabs" \|\|[\s\S]*?previewClip\.engineUsed === "elevenlabs"[\s\S]*?voicePreviewAudioCacheRef\.current\.set/,
    );
    assert.match(
      pageSource,
      /resolveBotAudioVoiceProfileV1\(\s*bot\.authored_audio_voice_profile,\s*bot\.audio_voice_profile_override,?\s*\)/
    );
    assert.match(pageSource, /resolveBotHubVoicePreviewText\(bot\)/);
    assert.doesNotMatch(pageSource, /generateOnly/);
    assert.match(pageSource, /voice_preview_line: line/);
    assert.match(pageSource, /onPlaybackStart:/);
  });

  it("keeps preview audio scoped to the profile-owned voice identity", () => {
    assert.match(pageSource, /function resolveVoicePreviewProfile\(/);
    assert.doesNotMatch(pageSource, /defaultSystemVoiceName/);
    assert.doesNotMatch(pageSource, /defaultElevenLabsVoiceId/);
    assert.match(pageSource, /avatarVoicePlaybackCacheProfile\(profile\)/);
    const cacheProfileSource = pageSource.slice(
      pageSource.indexOf("function avatarVoicePlaybackCacheProfile"),
      pageSource.indexOf("function BotAvatarSfxEditor"),
    );
    assert.match(cacheProfileSource, /normalizeBotAudioVoiceProfileV1\(profile\)/);
    assert.match(cacheProfileSource, /return JSON\.stringify\(\{[\s\S]*voiceProfile,[\s\S]*speechprintRuleset:/);
    assert.match(cacheProfileSource, /avatarSfx:\s*_avatarSfx/);
    assert.match(cacheProfileSource, /avatarSfxMuted:\s*_avatarSfxMuted/);
  });
});
