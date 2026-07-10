import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(resolve(appDir, "page.module.css"), "utf8");
const apiServerSource = readFileSync(resolve(appDir, "../../../api/src/server.ts"), "utf8");
const tauriConfig = JSON.parse(
  readFileSync(resolve(appDir, "../../../desktop/src-tauri/tauri.conf.json"), "utf8")
) as {
  app?: {
    windows?: Array<{
      fullscreen?: boolean;
      minWidth?: number;
      minHeight?: number;
    }>;
  };
};

function cssRuleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = cssSource.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Expected CSS rule for ${selector}`);
  return match[1] ?? "";
}

test("avatar customization is a floating modal that reuses the Zen mannequin", () => {
  assert.match(pageSource, /function BotAvatarCustomizerModal\(/);
  assert.doesNotMatch(pageSource, /<BotAvatarBuilder\b/);
  assert.match(pageSource, /data-avatar-customizer-preview="true"/);
  assert.match(pageSource, /function ZenLiveBotMannequin\(/);
  assert.match(cssSource, /\.botAvatarCustomizerBackdrop/);
  assert.match(cssSource, /\.botProfileBuilder\.botAvatarCustomizer/);
});

test("avatar customizer supports explicit custom eye, blink, mouth, and thinking controls", () => {
  assert.match(pageSource, /faceEyeCharacter: string \| null/);
  assert.match(pageSource, /faceMouthCharacter: string \| null/);
  assert.match(pageSource, /faceEyeScale: number/);
  assert.match(pageSource, /faceEyeOffsetX: number/);
  assert.match(pageSource, /faceEyeOffsetY: number/);
  assert.match(pageSource, /faceMouthScale: number/);
  assert.match(pageSource, /faceMouthOffsetX: number/);
  assert.match(pageSource, /faceMouthOffsetY: number/);
  assert.match(pageSource, /faceMouthRotationDeg: number/);
  assert.match(pageSource, /faceBlinkBar: BotFaceBlinkBar/);
  assert.match(pageSource, /faceThinkingFrames: BotFaceThinkingFrames/);
  assert.match(pageSource, /normalizeBotFaceEyeCharacter\(event\.currentTarget\.value\)/);
  assert.match(pageSource, /normalizeBotFaceMouthCharacter\(event\.currentTarget\.value\)/);
  assert.match(pageSource, /faceEyeCharacter=\{newBotFaceEyeCharacter\}/);
  assert.match(pageSource, /faceMouthCharacter=\{newBotFaceMouthCharacter\}/);
  assert.match(pageSource, /faceEyeScale=\{newBotFaceEyeScale\}/);
  assert.match(pageSource, /faceEyeOffsetX=\{newBotFaceEyeOffsetX\}/);
  assert.match(pageSource, /faceEyeOffsetY=\{newBotFaceEyeOffsetY\}/);
  assert.match(pageSource, /faceMouthScale=\{newBotFaceMouthScale\}/);
  assert.match(pageSource, /faceMouthOffsetX=\{newBotFaceMouthOffsetX\}/);
  assert.match(pageSource, /faceMouthOffsetY=\{newBotFaceMouthOffsetY\}/);
  assert.match(pageSource, /faceMouthRotationDeg=\{newBotFaceMouthRotationDeg\}/);
  assert.match(pageSource, /faceBlinkBar=\{newBotFaceBlinkBar\}/);
  assert.match(pageSource, /faceThinkingFrames=\{newBotFaceThinkingFrames\}/);
  assert.match(pageSource, /handleNewBotFaceEyeCharacterChange\(normalized\);/);
  assert.match(pageSource, /handleNewBotFaceMouthCharacterChange\(normalized\);/);
  assert.match(pageSource, /handleNewBotFaceEyeScaleChange\(normalizedScale\);/);
  assert.match(pageSource, /handleNewBotFaceEyeOffsetXChange\(normalizedOffsetX\);/);
  assert.match(pageSource, /handleNewBotFaceEyeOffsetYChange\(normalizedOffsetY\);/);
  assert.match(pageSource, /handleNewBotFaceMouthScaleChange\(normalizedScale\);/);
  assert.match(pageSource, /handleNewBotFaceMouthOffsetXChange\(normalizedOffsetX\);/);
  assert.match(pageSource, /handleNewBotFaceMouthOffsetYChange\(normalizedOffsetY\);/);
  assert.match(pageSource, /handleNewBotFaceMouthRotationDegChange\(normalizedRotationDeg\);/);
  assert.match(pageSource, /handleNewBotFaceBlinkBarChange\(normalizedBlinkBar\);/);
  assert.match(pageSource, /handleNewBotFaceThinkingFramesChange\(normalizedFrames\);/);
  assert.match(pageSource, /const faceStyle = resolveBotFaceStyle\(/);
  assert.match(pageSource, /faceEyeCharacter,/);
  assert.match(pageSource, /faceMouthCharacter,/);
  assert.match(pageSource, /faceEyeScale,/);
  assert.match(pageSource, /faceEyeOffsetX,/);
  assert.match(pageSource, /faceEyeOffsetY,/);
  assert.match(pageSource, /faceMouthScale,/);
  assert.match(pageSource, /faceMouthOffsetX,/);
  assert.match(pageSource, /faceMouthOffsetY,/);
  assert.match(pageSource, /faceMouthRotationDeg,/);
  assert.match(pageSource, /faceBlinkBar,/);
  assert.match(pageSource, /faceThinkingFrames,/);
  assert.match(pageSource, /botAvatarBlinkBarInputValue\(faceBlinkBar\)/);
  assert.match(pageSource, /botAvatarThinkingFramesFromPaste/);
  assert.match(cssSource, /\.botAvatarOverrideControl/);
  assert.match(cssSource, /\.botAvatarGlyphModeControl/);
  assert.match(cssSource, /\.botAvatarGlyphInputField/);
  assert.match(cssSource, /\.botAvatarThinkingControl/);
  assert.match(cssSource, /\.botAvatarInlineResetButton/);
  assert.match(pageSource, />\s*Eye glyph\s*</);
  assert.match(pageSource, />\s*Mouth glyph\s*</);
  assert.match(pageSource, /aria-label="Eye glyph mode"/);
  assert.match(pageSource, /aria-label="Mouth glyph mode"/);
  assert.match(pageSource, /aria-label="Eyes"/);
  assert.match(pageSource, /aria-label="Mouth"/);
  assert.match(pageSource, />\s*Blink\s*</);
  assert.match(pageSource, />\s*Thinking\s*</);
  assert.match(pageSource, /aria-label="Custom blink bar"/);
  assert.match(pageSource, /aria-label="Eye glyph"/);
  assert.match(pageSource, /aria-label="Mouth glyph"/);
  assert.match(pageSource, /aria-label=\{`Custom thinking frame \$\{index \+ 1\}`\}/);
  assert.match(pageSource, /BOT_AVATAR_CUSTOM_EYE_START/);
  assert.match(pageSource, /BOT_AVATAR_CUSTOM_MOUTH_START/);
  assert.match(pageSource, /BOT_AVATAR_CUSTOM_THINKING_FRAMES/);
  assert.match(pageSource, /BOT_AVATAR_RANDOM_CUSTOM_BLINK_GLYPHS/);
  assert.match(pageSource, /BOT_AVATAR_RANDOM_CUSTOM_THINKING_FRAME_SETS/);
  assert.match(pageSource, /function botAvatarRandomIndex/);
  assert.match(pageSource, /cryptoApi\?\.getRandomValues/);
  assert.match(pageSource, /normalizeBotFaceEyeCharacter\(faceEyeCharacter\) \?\? BOT_AVATAR_CUSTOM_EYE_START/);
  assert.match(pageSource, /normalizeBotFaceMouthCharacter\(faceMouthCharacter\) \?\? BOT_AVATAR_CUSTOM_MOUTH_START/);
  assert.match(pageSource, /pendingGlyphFocusRef\.current = "eye";/);
  assert.match(pageSource, /pendingGlyphFocusRef\.current = "mouth";/);
  assert.doesNotMatch(pageSource, /randomBotAvatarCustomEyeGlyph/);
  assert.doesNotMatch(pageSource, /randomBotAvatarCustomMouthGlyph/);
  assert.match(pageSource, /: randomBotAvatarCustomBlinkGlyph\(\)/);
  assert.match(pageSource, /: randomBotAvatarCustomThinkingFrames\(\)/);
  assert.match(pageSource, /label="Eye size"/);
  assert.match(pageSource, /label="Eye position"/);
  assert.match(pageSource, /label="Mouth size"/);
  assert.match(pageSource, /label="Mouth position"/);
  assert.match(pageSource, /function BotAvatarCoordinateControl\(/);
  assert.match(pageSource, /function BotAvatarMouthRotationWheel\(/);
  assert.match(pageSource, /aria-label="Mouth rotation"/);
  assert.match(pageSource, /normalizeBotFaceMouthRotationDeg/);
  assert.match(pageSource, /label="Stroke weight"/);
  assert.match(cssRuleBody(".botAvatarCoordinatePad"), /cursor:\s*grab;/);
  assert.match(cssSource, /\.botAvatarCoordinatePad::before/);
  assert.match(cssRuleBody(".botAvatarCoordinateThumb"), /width:\s*20px;/);
  const faceBranchStart = pageSource.indexOf(
    '{activeTab === "face" ? (\n        <div className={styles.botAvatarFaceControls}>'
  );
  const advancedBranchStart = pageSource.indexOf(
    ') : activeTab === "advanced" ? (',
    faceBranchStart
  );
  const motionBranchStart = pageSource.indexOf(
    ') : (\n        <div className={styles.botAvatarMotionControls}>',
    advancedBranchStart
  );
  assert.notEqual(faceBranchStart, -1);
  assert.notEqual(advancedBranchStart, -1);
  assert.notEqual(motionBranchStart, -1);
  const faceTabSource = pageSource.slice(faceBranchStart, advancedBranchStart);
  const advancedTabSource = pageSource.slice(advancedBranchStart, motionBranchStart);
  assert.doesNotMatch(faceTabSource, /label="Eye size"/);
  assert.doesNotMatch(faceTabSource, /label="Eye position"/);
  assert.doesNotMatch(faceTabSource, /Mouth rotation/);
  assert.doesNotMatch(faceTabSource, /botAvatarEyeScalePresetButton/);
  assert.doesNotMatch(faceTabSource, /enableCustomEye/);
  assert.doesNotMatch(faceTabSource, /enableCustomMouth/);
  assert.match(advancedTabSource, /aria-label="Eye glyph mode"/);
  assert.match(advancedTabSource, /aria-label="Mouth glyph mode"/);
  assert.match(advancedTabSource, />\s*Built-in\s*</);
  assert.match(advancedTabSource, />\s*Custom\s*</);
  assert.match(advancedTabSource, /customEyeActive \? \(/);
  assert.match(advancedTabSource, /label="Eye size"/);
  assert.match(advancedTabSource, /label="Eye position"/);
  assert.match(
    advancedTabSource,
    /customEyeActive \? \([\s\S]*aria-label="Eye glyph"[\s\S]*\) : null\}\s*<div className=\{styles\.botAvatarCustomGeometry\}>[\s\S]*label="Eye size"[\s\S]*label="Eye position"/
  );
  assert.match(advancedTabSource, /customMouthActive \? \(/);
  assert.match(advancedTabSource, /label="Mouth size"/);
  assert.match(advancedTabSource, /<BotAvatarMouthRotationWheel/);
  assert.match(advancedTabSource, /label="Mouth position"/);
  assert.match(
    advancedTabSource,
    /customMouthActive \? \([\s\S]*aria-label="Mouth glyph"[\s\S]*\) : null\}\s*<div className=\{styles\.botAvatarCustomGeometry\}>[\s\S]*label="Mouth size"[\s\S]*<BotAvatarMouthRotationWheel[\s\S]*label="Mouth position"/
  );
  assert.ok(
    advancedTabSource.indexOf("<BotAvatarMouthRotationWheel") <
      advancedTabSource.indexOf('label="Mouth position"'),
    "Mouth rotation should sit before mouth position inside the Mouth section"
  );
  assert.match(cssSource, /\.botAvatarMouthRotationControl/);
  assert.match(cssSource, /\.botAvatarMouthRotationWheel/);
  assert.doesNotMatch(pageSource, />\s*Inflation\s*</);
  assert.doesNotMatch(pageSource, />\s*Eye height\s*</);
});

test("avatar face edits autosave immediately to saved bots", () => {
  assert.match(pageSource, /const \[botAvatarAutoSaving, setBotAvatarAutoSaving\] = useState\(false\);/);
  assert.match(pageSource, /const \[botAvatarAutoSavingBotId, setBotAvatarAutoSavingBotId\] = useState<string \| null>\(null\);/);
  assert.match(pageSource, /const botAvatarAutoSaveFlushPromiseRef = useRef<Promise<boolean> \| null>\(null\);/);
  assert.match(pageSource, /function queueBotAvatarAutosave\(id: string \| null, patch: BotCustomizerSavePatch\): void/);
  assert.match(pageSource, /async function flushBotAvatarAutosaveQueue\(id: string\): Promise<boolean>/);
  assert.match(pageSource, /botAvatarAutoSaveQueuedPatchRef\.current = mergeBotAvatarAutosavePatch/);
  assert.match(pageSource, /applyBotAvatarAutosavePatchToSnapshot/);
  assert.match(pageSource, /setBotAvatarAutoSavingBotId\(id\);/);
  assert.match(pageSource, /return botAvatarAutoSaveFlushPromiseRef\.current \?\? true;/);
  assert.match(pageSource, /const avatarSaved = await flushBotAvatarAutosaveQueue\(id\);/);
  assert.match(pageSource, /if \(!avatarSaved\) return false;/);
  assert.match(pageSource, /saving=\{avatarCustomizerSaving\}/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ color: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ glyph: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyesFont: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeCharacter: normalized \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceMouthFont: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceMouthCharacter: normalized \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceFontWeight: normalizedWeight \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeScale: normalizedScale \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeOffsetX: normalizedOffsetX \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeOffsetY: normalizedOffsetY \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceMouthScale: normalizedScale \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceMouthOffsetX: normalizedOffsetX \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceMouthOffsetY: normalizedOffsetY \}\);/);
  assert.match(pageSource, /faceMouthRotationDeg: normalizedRotationDeg/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceBlinkBar: normalizedBlinkBar \}\);/);
  assert.match(pageSource, /faceThinkingFrames: normalizedFrames/);
});

test("avatar save state is scoped and bounded so prompts cannot stay stuck", () => {
  assert.match(pageSource, /const BOT_AVATAR_SAVE_TIMEOUT_MS = 15000;/);
  assert.match(pageSource, /async function withBotAvatarSaveTimeout<T>/);
  assert.match(pageSource, /controller\.abort\(\);/);
  assert.match(pageSource, /Avatar save took too long\. Please try again\./);
  assert.match(pageSource, /withBotAvatarSaveTimeout\(\(signal\) =>\s*api<\{ defaultBot\?: Record<string, unknown> \}>/);
  assert.match(pageSource, /withBotAvatarSaveTimeout\(\(signal\) =>\s*api<\{ bot\?: Bot \}>/);
  assert.match(
    pageSource,
    /const avatarCustomizerSaving =\s*busy \|\|\s*Boolean\(\s*editingBotId &&\s*botAvatarAutoSaving &&\s*botAvatarAutoSavingBotId === editingBotId\s*\);/
  );
  assert.doesNotMatch(pageSource, /saving=\{busy \|\| botAvatarAutoSaving\}/);
});

test("avatar customizer keeps explicit save and dirty prompts for broader edits", () => {
  assert.match(pageSource, /hasUnsavedChanges: boolean;/);
  assert.match(pageSource, /draftMode\?: boolean;/);
  assert.match(pageSource, /draftMode = false/);
  assert.match(pageSource, /savePromptOpen: boolean;/);
  assert.match(pageSource, /className=\{styles\.botAvatarCustomizerSaveButton\}/);
  assert.match(pageSource, /Do you want to save your changes\?/);
  assert.match(pageSource, /setBotAvatarSavePromptOpen\(true\);/);
  assert.match(pageSource, /const saved = await saveBot\(editingBotId\);/);
  assert.match(pageSource, /restoreBotAvatarDraftFromPristine/);
  assert.match(pageSource, /discardBotAvatarCustomizerChanges/);
  assert.match(pageSource, /async function saveBot\(id: string\): Promise<boolean>/);
  assert.doesNotMatch(pageSource, /flushBotAvatarLiveSave/);
  assert.doesNotMatch(pageSource, /BotAvatarLiveSavePatch/);
  assert.match(pageSource, /const saveButtonVisible = saving \|\| hasUnsavedChanges;/);
  assert.match(pageSource, /\{saveButtonVisible \? \(/);
  assert.match(pageSource, /draftMode\s*\?\s*"Draft synced"\s*:\s*"Saved"/);
  assert.match(pageSource, /draftMode=\{botPanelCreateMode && !editingBotId && !editingDefaultBot\}/);

  const saveButtonRule = cssRuleBody(".botProfileBuilderHeader .botAvatarCustomizerSaveButton");
  assert.match(saveButtonRule, /min-width:\s*92px;/);
  assert.match(saveButtonRule, /display:\s*inline-flex;/);
  assert.match(saveButtonRule, /background:\s*[\s\S]*linear-gradient/);
  assert.match(cssRuleBody(".botAvatarSaveStatus"), /border-radius:\s*999px;/);

  const promptBackdropRule = cssRuleBody(".botAvatarSavePromptBackdrop");
  assert.match(promptBackdropRule, /z-index:\s*3010;/);
  assert.match(promptBackdropRule, /place-items:\s*center;/);
  assert.match(cssRuleBody(".botAvatarPanelHeader"), /justify-content:\s*space-between;/);
  assert.match(cssSource, /\.botAvatarPreviewToolbar\s*\{[\s\S]*display:\s*grid;/);
});

test("avatar summary card previews identity, eyes, and mouth", () => {
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryGlyphSocket\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryFaceParts\}/);
  assert.match(pageSource, /aria-label="Open Avatar Studio to edit bot avatar"/);
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryEditHint\}/);
  assert.match(pageSource, />\s*Open Avatar Studio\s*</);
  assert.match(pageSource, /data-part="eyes"/);
  assert.match(pageSource, /data-face-font=\{newBotFaceEyesFont\}/);
  assert.match(pageSource, /data-part="mouth"/);
  assert.match(pageSource, /data-face-font=\{newBotFaceMouthFont\}/);
  assert.match(pageSource, /const botAvatarSummaryEyeGlyph = newBotFaceEyeCharacter \?\? "••";/);
  assert.match(pageSource, /const botAvatarSummaryEyeLabel = newBotFaceEyeCharacter/);
  assert.match(pageSource, /`Eye glyph \$\{newBotFaceEyeCharacter\}`/);
  assert.match(pageSource, /const botAvatarSummaryMouthLabel = newBotFaceMouthCharacter/);
  assert.match(pageSource, /`Mouth glyph \$\{newBotFaceMouthCharacter\}`/);
  assert.match(pageSource, /botAvatarSummaryMouthRotationLabel/);
  assert.match(pageSource, /\{botAvatarSummaryEyeLabel\} · \{botAvatarSummaryMouthLabel\}/);

  const summaryFaceStart = pageSource.indexOf("className={styles.botAvatarSummaryFace}");
  assert.notEqual(summaryFaceStart, -1);
  const summaryButtonEnd = pageSource.indexOf("</button>", summaryFaceStart);
  assert.notEqual(summaryButtonEnd, -1);
  const summaryFaceMarkup = pageSource.slice(summaryFaceStart, summaryButtonEnd);
  assert.doesNotMatch(summaryFaceMarkup, /<BotFaceFrame/);
  assert.doesNotMatch(summaryFaceMarkup, /<CoffeeSeatPlateEmoji/);
  assert.doesNotMatch(summaryFaceMarkup, /botAvatarFacePlate/);

  assert.match(
    cssRuleBody(".botAvatarSummaryFace"),
    /grid-template-columns:\s*auto auto minmax\(0,\s*1fr\) auto;/
  );
  assert.match(cssSource, /\.botAvatarSummaryEditHint/);
  assert.match(cssRuleBody(".botAvatarSummaryFaceParts"), /grid-template-rows:\s*repeat\(2,\s*28px\);/);
  assert.match(cssRuleBody(".botAvatarSummaryFacePart"), /place-items:\s*center;/);
  assert.match(cssRuleBody(".botAvatarSummaryFacePartGlyph"), /font-size:\s*18px;/);
});

test("default Prism bot card opens an avatar-only customizer path", () => {
  assert.match(pageSource, /\| "defaultCustomize"/);
  assert.match(pageSource, /const DEFAULT_PRISM_BOT_GLYPH: BotGlyphName = "triangle";/);
  assert.match(pageSource, /const zenDefaultPrismGlyph = DEFAULT_PRISM_BOT_GLYPH;/);
  assert.doesNotMatch(pageSource, /const zenDefaultPrismGlyph = useMemo<BotGlyphName>/);
  assert.match(pageSource, /const zenDefaultPrismFaceStyle = useMemo<BotFaceStyle>/);
  assert.match(pageSource, /defaultPrismGlyph\?: BotGlyphName;/);
  assert.match(pageSource, /defaultPrismFaceStyle\?: BotFaceStyle;/);
  assert.match(pageSource, /defaultPrismGlyph = DEFAULT_PRISM_BOT_GLYPH/);
  assert.match(pageSource, /bot && isBotGlyphName\(bot\.glyph\) \? bot\.glyph : defaultPrismGlyph/);
  assert.match(pageSource, /defaultPrismFaceStyle \?\? DEFAULT_BOT_FACE_STYLE/);
  assert.match(pageSource, /userActionVisible \? "attentive" : "warm"/);
  assert.match(pageSource, /defaultPrismGlyph=\{zenDefaultPrismGlyph\}/);
  assert.match(pageSource, /defaultPrismFaceStyle=\{zenDefaultPrismFaceStyle\}/);
  assert.match(pageSource, /function openDefaultBotCustomizer\(\): void/);
  assert.match(pageSource, /async function saveDefaultBot\(\): Promise<boolean>/);
  assert.match(pageSource, /"\/api\/default-bot"/);
  assert.match(pageSource, /const seededName = "Default";/);
  assert.match(pageSource, /const rawStoredPrompt = "";/);
  assert.match(pageSource, /const seededColor = DEFAULT_PRISM_BOT_CUSTOMIZER_COLOR;/);
  assert.match(pageSource, /const seededGlyph = DEFAULT_PRISM_BOT_GLYPH;/);
  assert.match(pageSource, /const hasDefaultBotAvatarChanges = editPristine/);
  assert.match(pageSource, /\? hasDefaultBotAvatarChanges/);
  assert.match(pageSource, /identityControlsVisible\?: boolean;/);
  assert.match(pageSource, /identityControlsVisible = true/);
  assert.match(pageSource, /identityControlsVisible=\{!editingDefaultBot\}/);
  assert.match(pageSource, /Default Prism identity is fixed; customize its face\./);
  assert.match(pageSource, /activeControlTab === "identity" && identityControlsVisible \? \(/);
  assert.match(pageSource, /const defaultBotCardGlyph = DEFAULT_PRISM_BOT_GLYPH;/);
  assert.match(pageSource, /const defaultBotCardStyle = undefined;/);
  assert.match(pageSource, /botPanelAdvancedEditorAvailable =\s*botPanelView === "create" \|\| botPanelView === "customize";/);
  assert.match(pageSource, /!editingDefaultBot \? \(/);
  assert.match(pageSource, /className=\{styles\.botCardDefaultCustomizeButton\}/);
  assert.match(pageSource, /aria-label="Customize Default Prism bot"/);
  assert.match(pageSource, /onClick=\{openDefaultBotCustomizer\}/);
  assert.match(cssSource, /\.botCardDefaultCustomizeButton/);

  const openDefaultStart = pageSource.indexOf("function openDefaultBotCustomizer(): void");
  assert.notEqual(openDefaultStart, -1);
  const openDefaultEnd = pageSource.indexOf("function openBotMarketplace(): void", openDefaultStart);
  assert.notEqual(openDefaultEnd, -1);
  const openDefaultSource = pageSource.slice(openDefaultStart, openDefaultEnd);
  assert.doesNotMatch(openDefaultSource, /settings\.prismDefaultBotColor/);
  assert.doesNotMatch(openDefaultSource, /settings\.prismDefaultBotGlyph/);
  assert.match(openDefaultSource, /setBotAvatarCustomizerOpen\(true\);/);

  const avatarSummaryCardStart = pageSource.indexOf(
    "className={`${styles.botParameterCard} ${styles.botAvatarSummaryCard}`"
  );
  assert.notEqual(avatarSummaryCardStart, -1);
  const avatarSummaryGuardStart = pageSource.lastIndexOf(
    "{!editingDefaultBot ? (",
    avatarSummaryCardStart
  );
  assert.notEqual(avatarSummaryGuardStart, -1);
  assert.ok(
    avatarSummaryCardStart - avatarSummaryGuardStart < 160,
    "Default Prism should skip the avatar summary card"
  );
  const avatarSummarySectionEnd = pageSource.indexOf("</section>", avatarSummaryCardStart);
  const avatarCustomizerMount = pageSource.indexOf(
    "<BotAvatarCustomizerModal",
    avatarSummaryCardStart
  );
  assert.notEqual(avatarSummarySectionEnd, -1);
  assert.notEqual(avatarCustomizerMount, -1);
  assert.ok(
    avatarSummarySectionEnd < avatarCustomizerMount,
    "Avatar Studio mount should not live inside the summary card"
  );
  const avatarCustomizerMountSource = pageSource.slice(
    avatarCustomizerMount,
    avatarCustomizerMount + 2400
  );
  assert.doesNotMatch(avatarCustomizerMountSource, /if \(editingDefaultBot\) closePanel\(\);/);
  assert.doesNotMatch(avatarCustomizerMountSource, /closePanel\(\);/);

  const saveDefaultStart = pageSource.indexOf("async function saveDefaultBot(): Promise<boolean>");
  assert.notEqual(saveDefaultStart, -1);
  const saveDefaultEnd = pageSource.indexOf("async function flushBotAvatarAutosaveQueue", saveDefaultStart);
  assert.notEqual(saveDefaultEnd, -1);
  const saveDefaultSource = pageSource.slice(saveDefaultStart, saveDefaultEnd);
  assert.doesNotMatch(saveDefaultSource, /color:\s*newBotColor/);
  assert.doesNotMatch(saveDefaultSource, /glyph:\s*newBotGlyph/);
  assert.match(saveDefaultSource, /faceEyesFont: newBotFaceEyesFont/);
  assert.match(saveDefaultSource, /faceMouthCharacter: newBotFaceMouthCharacter/);
  assert.match(saveDefaultSource, /faceMouthRotationDeg: newBotFaceMouthRotationDeg/);
  assert.match(saveDefaultSource, /faceBlinkBar: newBotFaceBlinkBar/);
  assert.match(saveDefaultSource, /faceThinkingFrames: newBotFaceThinkingFrames/);
  assert.match(saveDefaultSource, /prismDefaultBotColor: ""/);
  assert.match(saveDefaultSource, /prismDefaultBotGlyph: ""/);

  const defaultDirtyStart = pageSource.indexOf("const hasDefaultBotAvatarChanges = editPristine");
  assert.notEqual(defaultDirtyStart, -1);
  const defaultDirtyEnd = pageSource.indexOf("const hasEditChanges = editPristine", defaultDirtyStart);
  assert.notEqual(defaultDirtyEnd, -1);
  const defaultDirtySource = pageSource.slice(defaultDirtyStart, defaultDirtyEnd);
  assert.doesNotMatch(defaultDirtySource, /newBotColor/);
  assert.doesNotMatch(defaultDirtySource, /newBotGlyph/);
  assert.match(defaultDirtySource, /newBotFaceMouthCharacter/);
  assert.match(defaultDirtySource, /newBotFaceMouthRotationDeg/);

  const defaultBotRouteStart = apiServerSource.indexOf('route("PATCH", "/api/default-bot"');
  assert.notEqual(defaultBotRouteStart, -1);
  const defaultBotRouteEnd = apiServerSource.indexOf('route("PATCH", "/api/settings"', defaultBotRouteStart);
  assert.notEqual(defaultBotRouteEnd, -1);
  const defaultBotRouteSource = apiServerSource.slice(defaultBotRouteStart, defaultBotRouteEnd);
  assert.doesNotMatch(defaultBotRouteSource, /body\.color/);
  assert.doesNotMatch(defaultBotRouteSource, /body\.glyph/);
  assert.match(defaultBotRouteSource, /prism_default_bot_color = NULL/);
  assert.match(defaultBotRouteSource, /prism_default_bot_glyph = NULL/);
  assert.match(defaultBotRouteSource, /prism_default_bot_face_mouth_character = \?/);
  assert.match(defaultBotRouteSource, /prism_default_bot_face_mouth_rotation_deg = \?/);
  assert.match(defaultBotRouteSource, /prism_default_bot_face_thinking_frames = \?/);
  assert.match(apiServerSource, /prismDefaultBotColor: ""/);
  assert.match(apiServerSource, /prismDefaultBotGlyph: ""/);
});

test("avatar customization modal is a contained foreground sheet", () => {
  const backdropRule = cssRuleBody(".botAvatarCustomizerBackdrop");
  const modalRule = cssRuleBody(".botAvatarCustomizer");
  const modalBackingRule = cssRuleBody(".botAvatarCustomizer::before");
  const modalRailRule = cssRuleBody(".botAvatarCustomizer::after");
  assert.match(backdropRule, /z-index:\s*3000;/);
  assert.match(backdropRule, /overflow:\s*hidden;/);
  assert.match(backdropRule, /backdrop-filter:\s*blur\(12px\)\s*saturate\(112%\);/);
  assert.match(modalRule, /position:\s*fixed;/);
  assert.match(modalRule, /left:\s*max\(var\(--bot-avatar-studio-inline-margin\),\s*calc\(\(100vw - 1480px\) \/ 2\)\)/);
  assert.match(modalRule, /right:\s*max\(var\(--bot-avatar-studio-inline-margin\),\s*calc\(\(100vw - 1480px\) \/ 2\)\)/);
  assert.match(modalRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(modalRule, /overflow:\s*hidden;/);
  assert.match(modalRule, /background:\s*#0d1017;/);
  assert.doesNotMatch(modalRule, /var\(--panel-width/);
  assert.match(modalBackingRule, /position:\s*absolute;/);
  assert.match(modalBackingRule, /inset:\s*0;/);
  assert.match(modalBackingRule, /background:/);
  assert.match(modalRailRule, /width:\s*3px;/);
  assert.match(cssSource, /\.botAvatarControlPanel\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(cssSource, /\.botAvatarControlStack\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.doesNotMatch(backdropRule, /overflow-y:\s*auto;/);
  assert.match(cssRuleBody(".botAvatarControlStack"), /overflow-y:\s*auto;/);
  assert.doesNotMatch(cssRuleBody(".botAvatarControlStack"), /overflow:\s*hidden;/);
  assert.match(
    cssSource,
    /\.botAvatarCustomizer\s*>\s*\.botProfileBuilderHeader,\s*\.botAvatarCustomizerBody\s*\{[\s\S]*z-index:\s*1;/
  );
});

test("avatar customizer uses a studio preview and grouped editor controls", () => {
  assert.match(pageSource, /<span>Avatar Studio<\/span>/);
  assert.match(pageSource, /function BotAvatarPreviewPanel\(/);
  assert.match(pageSource, /function BotAvatarIdentityControls\(/);
  assert.match(pageSource, /function BotAvatarFaceControls\(/);
  assert.match(pageSource, /function BotAvatarSavePrompt\(/);
  assert.match(pageSource, /className=\{styles\.botAvatarPanelHeader\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarPreviewToolbar\}/);
  assert.doesNotMatch(pageSource, /className=\{styles\.botAvatarPreviewMeta\}/);
  assert.doesNotMatch(pageSource, /previewSummaryItems/);
  assert.match(pageSource, /className=\{styles\.botAvatarControlTabs\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarControlStack\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarCustomControls\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarMotionControls\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarPresetStrip\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarExpressionMatrix\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarSliderStack\}/);
  assert.doesNotMatch(pageSource, /className=\{styles\.botAvatarEyeScalePresetStrip\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarThinkingTiles\}/);
  assert.match(pageSource, /const BOT_AVATAR_THINKING_PRESETS = \[/);
  assert.match(pageSource, /Random thinking preset/);
  assert.match(pageSource, /role="tablist"[\s\S]*aria-label="Avatar control sections"/);
  assert.match(
    pageSource,
    /const BOT_AVATAR_CUSTOMIZER_TABS = \[\s*\{ value: "face", label: "Face" \},\s*\{ value: "advanced", label: "Glyphs" \},\s*\{ value: "motion", label: "Motion" \},\s*\{ value: "identity", label: "Identity" \}/
  );
  assert.match(pageSource, /const avatarControlTabsVisible = true;/);
  assert.match(pageSource, /\(tab\) => identityControlsVisible \|\| tab\.value !== "identity"/);
  assert.match(pageSource, /activeControlTab === "identity" \? \[\] : \[activeControlTab\]/);
  assert.doesNotMatch(pageSource, /: BOT_AVATAR_FACE_CONTROL_TABS;/);
  assert.match(pageSource, /\? "Face"\s*: activeTab === "advanced"\s*\? "Glyphs"\s*: "Motion"/);
  assert.match(pageSource, /Presets and built-in styles/);
  assert.match(pageSource, /Glyphs, size, and position/);
  assert.match(pageSource, /Blink and thinking animation/);
  assert.match(pageSource, /type BotAvatarCustomizerTab = "identity" \| "face" \| "advanced" \| "motion"/);
  assert.match(pageSource, /useState<BotAvatarCustomizerTab>\("face"\)/);
  assert.match(pageSource, /setActiveControlTab\("face"\)/);
  assert.match(pageSource, /aria-label=\{controlLabel\}/);
  assert.match(pageSource, /<Sparkles size=\{16\}/);
  assert.match(pageSource, /<Timer size=\{16\}/);
  assert.match(pageSource, /const previewWeightSummary =/);
  assert.doesNotMatch(pageSource, /const previewFaceSummary =/);
  assert.doesNotMatch(pageSource, /botAvatarFeaturePositionSummary/);
  assert.match(pageSource, /const BOT_AVATAR_FACE_PRESETS = \[/);
  assert.match(pageSource, /Classic/);
  assert.match(pageSource, /Sharp/);
  assert.match(pageSource, /Bouncy/);
  assert.match(pageSource, /Reset face/);
  assert.doesNotMatch(pageSource, /BOT_AVATAR_SCREEN_MASK_BLEND_MODES/);
  assert.doesNotMatch(pageSource, /Screen mask blend mode/);

  assert.match(cssSource, /\.botAvatarControlGroup\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(cssSource, /\.botAvatarControlGroup::before\s*\{/);
  assert.match(cssSource, /\.botAvatarControlGroup\[data-avatar-control-tab="advanced"\]/);
  assert.match(cssSource, /\.botAvatarControlTabs\s*\{/);
  assert.match(cssSource, /\.botAvatarControlGroupHeader\s*\{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\) auto;/);
  assert.match(cssSource, /\.botAvatarPresetStrip\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(cssRuleBody(".botAvatarControlStack"), /overflow-y:\s*auto;/);
  assert.match(cssRuleBody(".botAvatarOverrideGrid"), /grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(cssRuleBody(".botAvatarControlGroup::before"), /width:\s*3px;/);
  assert.doesNotMatch(cssSource, /\.botAvatarPreviewMeta/);
  assert.match(cssSource, /\.botAvatarThinkingPresetStrip\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(54px,\s*1fr\)\);/);
  assert.match(cssSource, /\.botAvatarPreviewModeToggle\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(cssSource, /\.botAvatarSectionResetButton/);
  assert.match(cssSource, /\.botAvatarRangeControl/);
  assert.match(cssRuleBody(".botAvatarIdentityPicker .colorSwatchButton"), /width:\s*72px;/);
  const avatarSwatchGlyphRule = cssRuleBody(
    ".botAvatarIdentityPicker .colorPickerWrapper .colorSwatchButton > svg"
  );
  assert.match(avatarSwatchGlyphRule, /width:\s*46px;/);
  assert.match(avatarSwatchGlyphRule, /height:\s*46px;/);
  assert.match(avatarSwatchGlyphRule, /stroke-width:\s*1\.75;/);

  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /background-size:\s*34px 34px,\s*34px 34px,\s*auto;/);
  assert.doesNotMatch(stageRule, /radial-gradient/);
});

test("avatar preview theme keeps persona ink on normalized color without Prism rainbow aura", () => {
  assert.match(pageSource, /const \[previewTheme, setPreviewTheme\] = useState<"light" \| "dark">\(resolvedTheme\)/);
  assert.match(pageSource, /setPreviewTheme\(resolvedTheme\)/);
  assert.match(pageSource, /function botAvatarPreviewIdentityStyle\(rawHex: string, prismPersona = false\): CSSProperties/);
  assert.match(pageSource, /if \(prismPersona\) return \{\};/);
  assert.match(pageSource, /const accentStyle = botAccentStyle\(rawHex, "dark"\) \?\? \{\};/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_BODY_PLACEMENT: ZenLiveBotBodyPlacement = \{\s*xPct: 50,\s*yPct: 50,\s*\};/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_AVATAR_SIZE_PX = 330;/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_BODY_SIZE_PX = 300;/);
  assert.doesNotMatch(pageSource, /BOT_AVATAR_CUSTOMIZER_FACE_GLYPH_SIZE_REM/);
  assert.match(pageSource, /\["--zen-live-bot-face-ink" as string\]: "var\(--coffee-bot-color\)"/);
  assert.match(pageSource, /\["--zen-live-bot-glyph-ink" as string\]: "var\(--coffee-bot-color\)"/);
  assert.match(pageSource, /\.\.\.botAvatarPreviewIdentityStyle\(color, isDefaultPrismBot\)/);
  assert.doesNotMatch(pageSource, /\.\.\.botAccentStyle\(color, previewTheme\)/);
  assert.match(pageSource, /isDefaultPrismBot\?: boolean;/);
  assert.match(pageSource, /isDefaultPrismBot = false/);
  assert.match(pageSource, /isDefaultPrismBot=\{editingDefaultBot\}/);
  assert.match(pageSource, /data-source=\{isDefaultPrismBot \? "prism" : "persona"\}/);
  assert.match(pageSource, /data-prism-persona=\{isDefaultPrismBot \? "true" : undefined\}/);
  assert.match(pageSource, /data-preview-theme=\{previewTheme\}/);
  assert.match(pageSource, /data-avatar-preview-theme=\{previewTheme\}/);
  assert.match(pageSource, /data-theme=\{previewTheme\}/);
  assert.match(
    pageSource,
    /"--bot-face-crt-screen-texture-blend-mode":\s*previewTheme === "light" \? "overlay" : "luminosity"/
  );
  assert.match(pageSource, /resolvedTheme=\{resolvedTheme\}/);
  assert.match(pageSource, /onPreviewThemeChange\("light"\)/);
  assert.match(pageSource, /onPreviewThemeChange\("dark"\)/);
  assert.match(cssSource, /\.botAvatarPreviewThemeToggle/);
  assert.match(cssSource, /\.botAvatarMannequinStage\[data-preview-theme="light"\]/);
  assert.match(cssRuleBody(".botFaceCrtNoiseLayer"), /118px 92px/);
  assert.match(cssRuleBody(".botFaceCrtNoiseLayer"), /148px 112px/);
  assert.match(pageSource, /"--zen-live-bot-avatar-size": `\$\{BOT_AVATAR_CUSTOMIZER_AVATAR_SIZE_PX\}px`/);
  assert.doesNotMatch(
    pageSource,
    /"--zen-live-bot-avatar-face-glyph-size":/
  );
  const livePlateRule = cssRuleBody(".zenLiveBotPresencePlate");
  assert.match(livePlateRule, /--zen-live-bot-face-ink:\s*var\(--coffee-bot-color\)\s*;/);
  assert.match(livePlateRule, /--zen-live-bot-glyph-ink:\s*var\(--coffee-bot-color\)\s*;/);
  assert.match(livePlateRule, /--zen-presence-face-ink:\s*var\(--coffee-bot-color\)\s*;/);
  const prismPlateRule = cssRuleBody('.zenLiveBotPresencePlate[data-prism-persona="true"]');
  assert.match(prismPlateRule, /--zen-live-bot-face-ink:\s*#ffffff\s*;/);
  assert.match(prismPlateRule, /--zen-live-bot-glyph-ink:\s*#ffffff\s*;/);
  assert.match(prismPlateRule, /--zen-presence-face-ink:\s*#ffffff\s*;/);
  assert.match(
    cssRuleBody(".themeLight.coffeeShell .coffeeSeatPlateEmoji"),
    /color:\s*var\(--coffee-bot-color\)\s*;/
  );
  assert.match(
    cssRuleBody(".themeLight.coffeeShell .coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph"),
    /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\)\s*;/
  );
  const faceGlyphRule = cssSource.match(/^\.zenLiveBotPresenceFaceGlyph\s*\{([\s\S]*?)\n\}/m)?.[1] ?? "";
  assert.match(faceGlyphRule, /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\);/);
  const coffeeFaceColorIndex = cssSource.indexOf(
    ".coffeeSeatPlateEmoji {\n  --coffee-face-eye-track"
  );
  assert.notEqual(coffeeFaceColorIndex, -1);
  const zenFaceOverrideIndex = cssSource.lastIndexOf(
    ".coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph"
  );
  assert.ok(zenFaceOverrideIndex > coffeeFaceColorIndex);
  assert.match(
    cssSource.slice(zenFaceOverrideIndex, zenFaceOverrideIndex + 180),
    /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\)\s*;/
  );
  assert.match(cssRuleBody(".zenLiveBotPresenceBotGlyph"), /--zen-live-bot-glyph-ink/);
  const previewFaceRule = cssRuleBody(
    '.zenLiveBotPresencePlate[data-avatar-customizer-preview="true"] .zenLiveBotPresenceFaceGlyph'
  );
  assert.match(previewFaceRule, /text-shadow:/);
  assert.doesNotMatch(previewFaceRule, /var\(--coffee-bot-color\)/);
  assert.doesNotMatch(
    cssSource,
    /\.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s+\.zenLiveBotPresenceFaceGlyph::before/
  );
  const previewPlateRule = cssRuleBody(
    '.botAvatarMannequinStage .zenLiveBotPresencePlate[data-avatar-customizer-preview="true"]'
  );
  assert.match(previewPlateRule, /transform:\s*scale\(1\)\s*;/);
  assert.match(
    cssSource,
    /\.botAvatarMannequinStage \.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s*\{[\s\S]*transform:\s*translateY\(-8px\) scale\(1\.16\);/
  );
  assert.doesNotMatch(previewPlateRule, /scale\(1\.28\)/);
  const previewBodyRule = cssRuleBody(".botAvatarMannequinStage .zenLiveBotPresenceBody");
  assert.match(previewBodyRule, /pointer-events:\s*auto\s*;/);
  assert.match(
    previewBodyRule,
    /--zen-live-bot-avatar-buckle-glyph-size:\s*clamp\(18px,\s*calc\(var\(--zen-live-bot-body-frame-size\) \* 0\.145\),\s*48px\)\s*;/
  );
  assert.match(
    previewBodyRule,
    /--zen-live-bot-body-glyph-size:\s*var\(--zen-live-bot-avatar-buckle-glyph-size\)\s*;/
  );
  assert.doesNotMatch(previewBodyRule, /--zen-live-bot-body-glyph-height/);
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarMannequinStage\s+\.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s+\.zenLiveBotPresenceBody\s*\{[\s\S]*--zen-live-bot-avatar-face-glyph-size/
  );
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarMannequinStage\s+\.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s+\.zenLiveBotPresenceBotGlyph\s*\{[\s\S]*height:\s*var\(--zen-live-bot-body-glyph-size\)/
  );
  const previewTorsoGlyphRule = cssRuleBody(".botAvatarMannequinStage .zenLiveBotPresenceBotGlyph");
  assert.match(
    previewTorsoGlyphRule,
    /width:\s*var\(--zen-live-bot-body-glyph-render-size\)\s*;/
  );
  assert.match(
    previewTorsoGlyphRule,
    /height:\s*var\(--zen-live-bot-body-glyph-render-size\)\s*;/
  );
});

test("avatar customizer preview uses tightened studio framing", () => {
  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /min-height:\s*0\s*;/);
  assert.match(stageRule, /height:\s*100%\s*;/);
  assert.match(stageRule, /padding:\s*24px\s*;/);
  assert.match(stageRule, /overflow:\s*visible\s*;/);
  assert.doesNotMatch(cssSource, /\.botAvatarMannequinStage\s*\{[\s\S]*min-height:\s*clamp\(500px,\s*calc\(100dvh - 318px\),\s*620px\);/);
  assert.match(cssSource, /\.botAvatarMannequinStage\s*\{[\s\S]*padding:\s*18px;/);
});

test("avatar customizer preview has explicit expression states", () => {
  assert.match(pageSource, /const \[previewMode, setPreviewMode\] = useState<BotAvatarPreviewMode>\("idle"\)/);
  assert.match(pageSource, /const \[previewMoodIndex, setPreviewMoodIndex\] = useState\(0\);/);
  assert.match(pageSource, /type BotAvatarPreviewMode = "idle" \| "blink" \| "talking" \| "thinking";/);
  assert.match(pageSource, /const BOT_AVATAR_PREVIEW_MODES = \[/);
  assert.match(pageSource, /const BOT_AVATAR_PREVIEW_MOODS = \[/);
  assert.match(pageSource, /const previewTalking = previewMode === "talking";/);
  assert.match(pageSource, /const previewBlink = previewMode === "blink";/);
  assert.doesNotMatch(pageSource, /previewHovered/);
  assert.doesNotMatch(pageSource, /onPreviewHoveredChange/);
  assert.match(pageSource, /blinkWhileTalking/);
  assert.match(pageSource, /if \(!open \|\| !previewTalking\) \{\s*setMouthPhase\(0\);\s*return;\s*\}/);
  assert.match(pageSource, /\}, \[open, previewTalking\]\);/);
  assert.match(pageSource, /data-talking=\{previewTalking \? "true" : undefined\}/);
  assert.match(pageSource, /data-mood=\{previewMoodHint\}/);
  assert.match(pageSource, /data-prism-mood=\{previewMood\}/);
  assert.match(pageSource, /data-avatar-preview-mood=\{previewMood\}/);
  assert.match(pageSource, /data-mouth-shape=\{previewTalking \? displayedPreviewMouthShape : undefined\}/);
  assert.match(pageSource, /data-avatar-preview-mode=\{previewMode\}/);
  assert.match(pageSource, /onPreviewModeChange=\{setPreviewMode\}/);
  assert.match(pageSource, /onPreviewMoodCycle=\{\(\) =>/);
  assert.match(pageSource, /setPreviewMoodIndex\(\(current\) => \(current \+ 1\) % BOT_AVATAR_PREVIEW_MOODS\.length\)/);
  assert.match(pageSource, /className=\{styles\.botAvatarMoodPreviewButton\}/);
  assert.match(pageSource, /isTalking=\{previewTalking\}/);
  assert.match(pageSource, /blinkWhileTalking\s+mouthShape=\{displayedPreviewMouthShape\}/);
  assert.match(pageSource, /forceBlinkPhase=\{previewBlink \? "closed" : undefined\}/);
  assert.match(pageSource, /showThinkingSpinner=\{previewThinking\}/);
  assert.doesNotMatch(cssSource, /\[data-avatar-preview-mode="blink"\][\s\S]{0,240}--eye-blink-scale-y:/);
  assert.doesNotMatch(pageSource, /data-talking="true"/);
  assert.doesNotMatch(pageSource, /\s+isTalking\s+mouthShape=\{previewMouthShape\}/);
});

test("desktop kiosk shell uses a fixed 1280x900 clipping floor and fullscreen launch", () => {
  assert.match(cssSource, /min-width:\s*1280px/);
  assert.match(cssSource, /min-height:\s*900px/);
  assert.match(cssSource, /max\(100vw,\s*1280px\)/);
  const mainWindow = tauriConfig.app?.windows?.[0];
  assert.equal(mainWindow?.fullscreen, true);
  assert.equal(mainWindow?.minWidth, 1280);
  assert.equal(mainWindow?.minHeight, 900);
});

test("desktop kiosk shell shows a full-screen notice below the viewport floor", () => {
  assert.match(pageSource, /function DesktopViewportNotice\(/);
  assert.match(pageSource, /Scale your viewport up/);
  assert.match(pageSource, /PRISM will support mobile devices soon\./);
  assert.match(cssSource, /\.desktopViewportNotice\s*\{\s*display:\s*none;/);
  assert.match(cssSource, /@media\s*\(max-width:\s*1279px\)[\s\S]*\.desktopViewportNotice\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(cssSource, /@media\s*\(max-width:\s*1279px\)[\s\S]*\.desktopViewportNotice\s*\{[\s\S]*inset:\s*0;/);
});
