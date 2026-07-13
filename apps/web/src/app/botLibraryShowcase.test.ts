import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("selected bot library showcase", () => {
  it("renders a large interactive avatar over the left-side panel backdrop", () => {
    assert.match(pageSource, /className=\{styles\.botPanelHubShowcase\}/);
    assert.match(
      pageSource,
      /className=\{styles\.botPanelHubShowcase\}[\s\S]*?data-prism-panel-layer="true"/
    );
    assert.match(pageSource, /node\.dataset\.prismPanelLayer !== "true"/);
    assert.match(pageSource, /className=\{`\$\{styles\.zenLiveBotPresencePlate\} \$\{styles\.botPanelHubAvatarPlate\}`\}/);
    assert.match(pageSource, /void regenerateBotHubAudioSample\(bot\)/);
    assert.match(pageSource, /void playBotHubVoicePreview\(bot, "bottish"\)/);
    assert.match(pageSource, /"--zen-live-bot-avatar-size": "min\(520px, 72vmin\)"/);
    assert.match(pageSource, /\{renderBotHubShowcase\(\)\}[\s\S]*?\{renderUsagePanel\(\)\}/);
    assert.match(cssSource, /\.botPanelHubShowcase\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0 min\(479px, calc\(100vw - 32px\)\) 0 0;/);
    assert.match(cssSource, /@keyframes botPanelHubAvatarIdle/);
    assert.match(
      cssSource,
      /\.botPanelHubAvatarPlate \.zenLiveBotPresenceBody\s*\{[\s\S]*?--zen-live-bot-avatar-face-glyph-size:\s*calc\(var\(--zen-live-bot-body-frame-size\) \* 0\.217\)/
    );
  });

  it("opens the selected bot actions from the showcase context menu", () => {
    assert.match(
      pageSource,
      /onContextMenuCapture=\{\(event\) => \{[\s\S]*?openBotShowcaseContextMenu\(bot, event\.clientX, event\.clientY\)/
    );
    assert.match(pageSource, /source: "showcase"/);
    assert.match(pageSource, /aria-label=\{`\$\{bot\.name\} preview actions`\}/);
    for (const label of [
      "Avatar Studio",
      "Memories",
      "Images",
      "Settings",
    ]) {
      assert.match(pageSource, new RegExp(`<span>${label}<\\/span>`));
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
    const previewSource = pageSource.slice(
      pageSource.indexOf("className={styles.botPanelHubAvatarPreview}"),
      pageSource.indexOf("className={styles.botPanelHubShowcasePrompt}")
    );
    assert.doesNotMatch(previewSource, /onClick=/);
    assert.doesNotMatch(previewSource, /playBotHubVoicePreview/);
    assert.match(
      pageSource,
      /aria-label="Voice preview language"[\s\S]*?onClick=\{\(\) => void regenerateBotHubAudioSample\(bot\)\}[\s\S]*?onClick=\{\(\) => void playBotHubVoicePreview\(bot, "bottish"\)\}/
    );
  });

  it("regenerates and automatically plays every English sample in one click", () => {
    const regenerationSource = pageSource.slice(
      pageSource.indexOf("async function regenerateBotHubAudioSample"),
      pageSource.indexOf("async function loadElevenLabsVoiceCatalog")
    );
    assert.match(regenerationSource, /voicePreviewAudioCacheRef\.current\.clear\(\)/);
    assert.match(regenerationSource, /JSON\.stringify\(\{ voicePreviewLine: null \}\)/);
    assert.match(regenerationSource, /await playBotHubVoicePreview\(regeneratedBot, "english"\)/);
    assert.match(pageSource, /previewStatus === "generating" \|\| previewStatus === "playing"/);
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

  it("uses thinking while generating and then plays on the same click", () => {
    assert.match(pageSource, /showThinkingSpinner=\{previewStatus === "generating"\}/);
    assert.match(pageSource, /Generating audio sample…/);
    assert.match(pageSource, /English"\} preview played\./);
    assert.match(pageSource, /data-talking=\{previewStatus === "playing"/);
  });

  it("awaits persona copy and plays the first English sample", () => {
    const previewHandlerSource = pageSource.slice(
      pageSource.indexOf("async function playBotHubVoicePreview"),
      pageSource.indexOf("async function loadElevenLabsVoiceCatalog")
    );
    assert.match(
      previewHandlerSource,
      /setBotHubVoicePreview\(\{ botId: showcaseVoiceId, mode, status: "generating"/
    );
    assert.match(
      previewHandlerSource,
      /Voice settings are still loading\. Try again in a moment\./
    );
    assert.match(previewHandlerSource, /await resolveBotHubVoicePreviewText\(bot\)/);
    assert.match(
      previewHandlerSource,
      /const previewText = `My name is \$\{showcaseName\}\./
    );
    assert.equal(previewHandlerSource.match(/await previewSelectedVoice\(/g)?.length, 1);
    assert.doesNotMatch(previewHandlerSource, /generateOnly/);
    assert.match(previewHandlerSource, /onPlaybackStart:/);
  });

  it("guarantees visible click feedback even when playback settles immediately", () => {
    assert.match(pageSource, /"playing" \| "complete" \| "error"/);
    assert.match(pageSource, /BOT_HUB_VOICE_CLICK_FEEDBACK_MS = 1400/);
    assert.match(
      pageSource,
      /setBotHubVoicePreview\(\{ botId: showcaseVoiceId, mode, status: "complete", error: null \}\)/
    );
    assert.match(pageSource, /data-feedback=\{previewMode === "english" \? previewStatus : undefined\}/);
    assert.match(pageSource, /aria-busy=\{previewMode === "bottish" && previewStatus === "generating"\}/);
    assert.match(pageSource, /preview played\./);
    assert.match(cssSource, /button\[data-feedback="generating"\]::before/);
    assert.match(cssSource, /button\[data-feedback="complete"\]::before[\s\S]*?content: "✓"/);
    assert.match(cssSource, /@keyframes botPanelHubVoiceFeedbackSpin/);
  });

  it("animates the authored mouth through speech shapes instead of pinning :o", () => {
    assert.match(pageSource, /BOT_AVATAR_PREVIEW_MOUTH_SHAPES/);
    assert.match(pageSource, /window\.setInterval\(advanceMouthShape, 118\)/);
    assert.match(pageSource, /mouthShape=\{previewMouthShape\}/);
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("const renderBotHubShowcase"),
        pageSource.indexOf("const renderSharedPanels")
      ),
      /mouthShape=\{previewStatus === "playing" \? "open-small"/
    );
  });

  it("persists across bot-owned panels and replaces the matching canvas presence", () => {
    assert.match(pageSource, /panel === "bots"[\s\S]*?botPanelView === "botHub"[\s\S]*?botPanelView === "customize"[\s\S]*?botPanelView === "settings"/);
    assert.match(pageSource, /panel === "memories" && memoryPanelScope === "bot"/);
    assert.match(pageSource, /panel === "images" && imagePanelScope === "bot"/);
    assert.match(pageSource, /zenLivePresenceBot\?\.id === botPanelShowcaseBotId/);
    assert.match(pageSource, /zenLivePresenceRailVisible && !zenCanvasBotSuppressedForPanel/);
    assert.match(cssSource, /\.botPanelHubShowcase\[data-panel="images"\]/);
  });

  it("offers English and Bottish independently of the global voice mode", () => {
    assert.match(pageSource, /mode: Exclude<VoiceMode, "mute">/);
    assert.match(pageSource, /playBotHubVoicePreview\(\s*bot: Bot \| null,\s*mode: Exclude<VoiceMode, "mute">/);
    assert.match(pageSource, /aria-label="Voice preview language"/);
    assert.match(pageSource, /aria-pressed=\{previewMode === "english"\}/);
    assert.match(pageSource, /Generating audio sample…/);
    assert.match(pageSource, /Playing Bottish…/);
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("async function playBotHubVoicePreview"),
        pageSource.indexOf("async function loadElevenLabsVoiceCatalog")
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
    assert.match(pageSource, />\s*Customize Prism\s*</);
    assert.match(pageSource, /onClick=\{\(\) => selectBotPanelShowcase\(null\)\}/);
    assert.match(pageSource, /selectBotPanelShowcase\(b\);/);
    assert.match(pageSource, /onDoubleClick=\{\(event\) => \{[\s\S]*?openBotPanelHub\(b\);/);
    assert.match(pageSource, /double-click to manage/);
    assert.match(cssSource, /\.botCard\[data-preview-selected="true"\]/);
  });

  it("keeps Default Prism visible on the Bots home panel", () => {
    assert.match(pageSource, /className=\{styles\.botPanelHomePrismCard\}/);
    assert.match(pageSource, /aria-label="Default Prism bot"/);
    assert.match(pageSource, /scheduleKey="bots-home-default-prism"/);
    assert.match(pageSource, /faceStyle=\{zenDefaultPrismFaceStyle\}/);
    assert.match(pageSource, /frameMaterialSeed=\{PRISM_FACTORY_CLEAN_FRAME_SEED\}/);
    assert.match(
      pageSource,
      /className=\{styles\.botPanelHomePrismCustomize\}[\s\S]*?onClick=\{openDefaultBotCustomizer\}[\s\S]*?Customize Prism/,
    );
    assert.match(cssSource, /\.botPanelHomePrismCard\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
    assert.match(cssSource, /\.botPanelHomePrismAvatarPlate/);
    assert.match(cssSource, /\.botPanelHomePrismCustomize/);
  });

  it("keeps each selected Library bot on its stable frame material seed", () => {
    assert.match(
      pageSource,
      /bot \? botFrameMaterialSeedForBot\(bot, bot\.id\) : PRISM_FACTORY_CLEAN_FRAME_SEED/
    );
  });

  it("removes the retired voice texture setting", () => {
    assert.doesNotMatch(pageSource, /<strong>Voice textures<\/strong>/);
    assert.doesNotMatch(pageSource, /Apply each bot&apos;s CRT or damaged-speaker texture/);
  });

  it("caches generated English samples and replays them through the bot voice profile", () => {
    assert.match(pageSource, /voicePreviewAudioCacheRef/);
    assert.match(pageSource, /voicePreviewAudioCacheRef\.current\.set\(options\.cacheKey, previewBytes\.slice\(0\)\)/);
    assert.match(pageSource, /normalizeOptionalBotAudioVoiceProfileV1\(bot\.audio_voice_profile_override\)/);
    assert.match(pageSource, /resolveBotHubVoicePreviewText\(bot\)/);
    assert.doesNotMatch(pageSource, /generateOnly/);
    assert.match(pageSource, /voice_preview_line: line/);
    assert.match(pageSource, /onPlaybackStart:/);
  });

  it("invalidates bot audio when the global TTS voice changes", () => {
    assert.match(pageSource, /function resolveVoicePreviewProfileWithGlobalDefaults\(/);
    assert.match(
      pageSource,
      /normalized\.systemVoiceName \?\? settings\.defaultSystemVoiceName/
    );
    assert.match(
      pageSource,
      /normalized\.elevenLabsVoiceId \?\? settings\.defaultElevenLabsVoiceId/
    );
    assert.match(
      pageSource,
      /voicePreviewAudioCacheRef\.current\.clear\(\);[\s\S]*?settings\?\.defaultSystemVoiceName,[\s\S]*?settings\?\.defaultElevenLabsVoiceId/
    );
    assert.match(
      pageSource,
      /const profile = resolveVoicePreviewProfileWithGlobalDefaults\([\s\S]*?JSON\.stringify\(profile\)/
    );
  });
});
