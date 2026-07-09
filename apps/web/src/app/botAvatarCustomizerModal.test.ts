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

test("avatar customizer supports one-character eye overrides", () => {
  assert.match(pageSource, /faceEyeCharacter: string \| null/);
  assert.match(pageSource, /faceEyeScale: number/);
  assert.match(pageSource, /faceEyeOffsetY: number/);
  assert.match(pageSource, /faceBlinkBar: BotFaceBlinkBar/);
  assert.match(pageSource, /normalizeBotFaceEyeCharacter\(event\.currentTarget\.value\)/);
  assert.match(pageSource, /faceEyeCharacter=\{newBotFaceEyeCharacter\}/);
  assert.match(pageSource, /faceEyeScale=\{newBotFaceEyeScale\}/);
  assert.match(pageSource, /faceEyeOffsetY=\{newBotFaceEyeOffsetY\}/);
  assert.match(pageSource, /faceBlinkBar=\{newBotFaceBlinkBar\}/);
  assert.match(pageSource, /handleNewBotFaceEyeCharacterChange\(normalized\);/);
  assert.match(pageSource, /handleNewBotFaceEyeScaleChange\(normalizedScale\);/);
  assert.match(pageSource, /handleNewBotFaceEyeOffsetYChange\(normalizedOffsetY\);/);
  assert.match(pageSource, /handleNewBotFaceBlinkBarChange\(normalizedBlinkBar\);/);
  assert.match(pageSource, /eyeCharacter: faceEyeCharacter/);
  assert.match(pageSource, /eyeScale: faceEyeScale/);
  assert.match(pageSource, /eyeOffsetY: faceEyeOffsetY/);
  assert.match(pageSource, /blinkBar: faceBlinkBar/);
  assert.match(pageSource, /botAvatarBlinkBarInputValue\(faceBlinkBar\)/);
  assert.match(pageSource, /placeholder=\{DEFAULT_BOT_FACE_BLINK_BAR\}/);
  assert.match(pageSource, /aria-label="Custom blink bar"/);
  assert.match(cssSource, /\.botAvatarEyeCharacterControl/);
  assert.match(cssSource, /\.botAvatarEyeGlyphControls/);
  assert.doesNotMatch(cssSource, /\.botAvatarBlinkOptions/);
  assert.match(pageSource, />\s*Eye size\s*</);
  assert.match(pageSource, />\s*Eye height\s*</);
  assert.match(pageSource, />\s*Blink bar\s*</);
  assert.doesNotMatch(pageSource, /BOT_AVATAR_BLINK_BAR_OPTIONS/);
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
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceFontWeight: normalizedWeight \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeScale: normalizedScale \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeOffsetY: normalizedOffsetY \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceBlinkBar: normalizedBlinkBar \}\);/);
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

  const saveButtonRule = cssRuleBody(".botProfileBuilderHeader .botAvatarCustomizerSaveButton");
  assert.match(saveButtonRule, /min-width:\s*92px;/);
  assert.match(saveButtonRule, /display:\s*inline-flex;/);
  assert.match(saveButtonRule, /background:\s*[\s\S]*linear-gradient/);
  assert.match(cssRuleBody(".botAvatarSaveStatus"), /border-radius:\s*999px;/);

  const promptBackdropRule = cssRuleBody(".botAvatarSavePromptBackdrop");
  assert.match(promptBackdropRule, /z-index:\s*3010;/);
  assert.match(promptBackdropRule, /place-items:\s*center;/);
  assert.match(cssRuleBody(".botAvatarPanelHeader"), /justify-content:\s*space-between;/);
  assert.match(cssRuleBody(".botAvatarPreviewMeta"), /flex-wrap:\s*wrap;/);
});

test("avatar summary card previews identity, eyes, and mouth", () => {
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryGlyphSocket\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryFaceParts\}/);
  assert.match(pageSource, /data-part="eyes"/);
  assert.match(pageSource, /data-face-font=\{newBotFaceEyesFont\}/);
  assert.match(pageSource, /data-part="mouth"/);
  assert.match(pageSource, /data-face-font=\{newBotFaceMouthFont\}/);
  assert.match(pageSource, /const botAvatarSummaryEyeGlyph = newBotFaceEyeCharacter \?\? "••";/);

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
    /grid-template-columns:\s*auto minmax\(0,\s*1fr\);/
  );
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
  assert.match(pageSource, /Default Prism face only\./);
  assert.match(pageSource, /\{identityControlsVisible \? \(/);
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

  const saveDefaultStart = pageSource.indexOf("async function saveDefaultBot(): Promise<boolean>");
  assert.notEqual(saveDefaultStart, -1);
  const saveDefaultEnd = pageSource.indexOf("async function flushBotAvatarAutosaveQueue", saveDefaultStart);
  assert.notEqual(saveDefaultEnd, -1);
  const saveDefaultSource = pageSource.slice(saveDefaultStart, saveDefaultEnd);
  assert.doesNotMatch(saveDefaultSource, /color:\s*newBotColor/);
  assert.doesNotMatch(saveDefaultSource, /glyph:\s*newBotGlyph/);
  assert.match(saveDefaultSource, /faceEyesFont: newBotFaceEyesFont/);
  assert.match(saveDefaultSource, /faceBlinkBar: newBotFaceBlinkBar/);
  assert.match(saveDefaultSource, /prismDefaultBotColor: ""/);
  assert.match(saveDefaultSource, /prismDefaultBotGlyph: ""/);

  const defaultDirtyStart = pageSource.indexOf("const hasDefaultBotAvatarChanges = editPristine");
  assert.notEqual(defaultDirtyStart, -1);
  const defaultDirtyEnd = pageSource.indexOf("const hasEditChanges = editPristine", defaultDirtyStart);
  assert.notEqual(defaultDirtyEnd, -1);
  const defaultDirtySource = pageSource.slice(defaultDirtyStart, defaultDirtyEnd);
  assert.doesNotMatch(defaultDirtySource, /newBotColor/);
  assert.doesNotMatch(defaultDirtySource, /newBotGlyph/);

  const defaultBotRouteStart = apiServerSource.indexOf('route("PATCH", "/api/default-bot"');
  assert.notEqual(defaultBotRouteStart, -1);
  const defaultBotRouteEnd = apiServerSource.indexOf('route("PATCH", "/api/settings"', defaultBotRouteStart);
  assert.notEqual(defaultBotRouteEnd, -1);
  const defaultBotRouteSource = apiServerSource.slice(defaultBotRouteStart, defaultBotRouteEnd);
  assert.doesNotMatch(defaultBotRouteSource, /body\.color/);
  assert.doesNotMatch(defaultBotRouteSource, /body\.glyph/);
  assert.match(defaultBotRouteSource, /prism_default_bot_color = NULL/);
  assert.match(defaultBotRouteSource, /prism_default_bot_glyph = NULL/);
  assert.match(apiServerSource, /prismDefaultBotColor: ""/);
  assert.match(apiServerSource, /prismDefaultBotGlyph: ""/);
});

test("avatar customization modal is a contained foreground sheet", () => {
  const backdropRule = cssRuleBody(".botAvatarCustomizerBackdrop");
  const modalRule = cssRuleBody(".botAvatarCustomizer");
  const modalBackingRule = cssRuleBody(".botAvatarCustomizer::before");
  const modalRailRule = cssRuleBody(".botAvatarCustomizer::after");
  assert.match(backdropRule, /z-index:\s*3000;/);
  assert.match(backdropRule, /backdrop-filter:\s*blur\(12px\)\s*saturate\(112%\);/);
  assert.match(modalRule, /width:\s*min\(1180px,\s*calc\(100vw - 64px\)\)/);
  assert.match(modalRule, /left:\s*max\(32px,\s*calc\(\(100vw - 1180px\) \/ 2\)\)/);
  assert.match(modalRule, /background:\s*#0d1017;/);
  assert.doesNotMatch(modalRule, /var\(--panel-width/);
  assert.match(modalBackingRule, /position:\s*absolute;/);
  assert.match(modalBackingRule, /inset:\s*0;/);
  assert.match(modalBackingRule, /background:/);
  assert.match(modalRailRule, /width:\s*3px;/);
  assert.match(
    cssSource,
    /\.botAvatarControlPanel\s*\{\s*overflow-y:\s*auto;\s*overflow-x:\s*hidden;/
  );
  assert.match(
    cssSource,
    /\.botAvatarCustomizer\s*>\s*\.botProfileBuilderHeader,\s*\.botAvatarCustomizerBody\s*\{[\s\S]*z-index:\s*1;/
  );
});

test("avatar customizer uses a studio preview and grouped editor controls", () => {
  assert.match(pageSource, /<span>Avatar Studio<\/span>/);
  assert.match(pageSource, /className=\{styles\.botAvatarPanelHeader\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarPreviewHeaderControls\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarPreviewMeta\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarControlStack\}/);
  assert.match(pageSource, /aria-label="Identity"[\s\S]*<Brush size=\{16\}/);
  assert.match(pageSource, /aria-label="Face"[\s\S]*<Sparkles size=\{16\}/);
  assert.match(pageSource, /const previewFaceSummary =/);
  assert.match(pageSource, /const previewWeightSummary =/);

  const controlGroupRule = cssRuleBody(".botAvatarControlGroup");
  assert.match(controlGroupRule, /border-radius:\s*13px;/);
  assert.match(controlGroupRule, /background:\s*[\s\S]*linear-gradient/);
  assert.match(cssRuleBody(".botAvatarControlGroupHeader"), /grid-template-columns:\s*34px minmax\(0,\s*1fr\);/);
  assert.match(cssRuleBody(".botAvatarControlGroupIcon"), /place-items:\s*center;/);
  assert.match(cssRuleBody(".botAvatarPreviewHeaderControls"), /justify-content:\s*flex-end;/);
  assert.match(cssRuleBody(".botAvatarMaskBlendProbe"), /border:\s*1px dashed/);
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

test("avatar customizer exposes a temporary CRT screen mask blend tester", () => {
  assert.match(pageSource, /type BotAvatarScreenMaskBlendMode =/);
  assert.match(pageSource, /const BOT_AVATAR_SCREEN_MASK_BLEND_MODES =/);
  assert.match(
    pageSource,
    /function botAvatarScreenMaskBlendModeForTheme\(\s*theme: "light" \| "dark"\s*\): BotAvatarScreenMaskBlendMode/
  );
  assert.match(pageSource, /return theme === "light" \? "overlay" : "luminosity";/);
  assert.match(
    pageSource,
    /useState<BotAvatarScreenMaskBlendMode>\(\(\) =>\s*botAvatarScreenMaskBlendModeForTheme\(resolvedTheme\)\s*\)/
  );
  assert.match(
    pageSource,
    /setScreenMaskBlendMode\(botAvatarScreenMaskBlendModeForTheme\(resolvedTheme\)\)/
  );
  assert.match(
    pageSource,
    /setPreviewTheme\("dark"\);[\s\S]*?setScreenMaskBlendMode\(botAvatarScreenMaskBlendModeForTheme\("dark"\)\);/
  );
  assert.match(
    pageSource,
    /setPreviewTheme\("light"\);[\s\S]*?setScreenMaskBlendMode\(botAvatarScreenMaskBlendModeForTheme\("light"\)\);/
  );
  assert.match(
    pageSource,
    /"--bot-face-crt-screen-texture-blend-mode": screenMaskBlendMode/
  );
  assert.match(pageSource, /aria-label="Screen mask blend mode"/);
  assert.match(pageSource, /setScreenMaskBlendMode\(\s*event\.currentTarget\.value as BotAvatarScreenMaskBlendMode\s*\)/);
  for (const blendMode of [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "soft-light",
    "hard-light",
    "color-dodge",
    "plus-lighter",
    "color",
    "luminosity",
  ]) {
    assert.match(pageSource, new RegExp(`value: "${blendMode}"`));
  }
  const textureRule = cssRuleBody(".zenLiveBotPresenceFaceEmissionMask::before");
  assert.match(textureRule, /radial-gradient\(/);
  assert.match(
    textureRule,
    /var\(--bot-face-crt-color\) var\(--bot-face-crt-screen-texture-tint-strength\)/
  );
  assert.match(
    textureRule,
    /background-blend-mode:\s*var\(--bot-face-crt-screen-texture-blend-mode,\s*screen\)\s*;/
  );
  assert.match(
    textureRule,
    /mix-blend-mode:\s*var\(--bot-face-crt-screen-texture-blend-mode,\s*screen\)\s*;/
  );
  const sharedTextureScopeRule = cssRuleBody(".zenLiveBotPresenceFaceEmissionMask");
  assert.match(
    sharedTextureScopeRule,
    /--bot-face-crt-screen-texture-opacity:\s*0\.22\s*;/
  );
  assert.match(
    sharedTextureScopeRule,
    /--bot-face-crt-screen-texture-tint-strength:\s*48%\s*;/
  );
  const livePlateRule = cssRuleBody(".zenLiveBotPresencePlate");
  assert.match(
    livePlateRule,
    /--bot-face-crt-screen-texture-blend-mode:\s*luminosity\s*;/
  );
  const darkThemeRule = cssRuleBody('.zenLiveBotPresencePlate[data-theme="dark"]');
  assert.match(
    darkThemeRule,
    /--bot-face-crt-screen-texture-blend-mode:\s*luminosity\s*;/
  );
  const lightThemeRule = cssRuleBody('.zenLiveBotPresencePlate[data-theme="light"]');
  assert.match(
    lightThemeRule,
    /--bot-face-crt-screen-texture-blend-mode:\s*overlay\s*;/
  );
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarMannequinStage\s+\.zenLiveBotPresenceFaceEmissionMask(?:::before)?\s*\{/
  );
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
  assert.match(pageSource, /resolvedTheme=\{resolvedTheme\}/);
  assert.match(pageSource, /setPreviewTheme\("light"\)/);
  assert.match(pageSource, /setPreviewTheme\("dark"\)/);
  assert.match(cssSource, /\.botAvatarPreviewThemeToggle/);
  assert.match(cssSource, /\.botAvatarMannequinStage\[data-preview-theme="light"\]/);
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

test("avatar customizer preview uses ordinary avatar-only framing", () => {
  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /min-height:\s*640px\s*;/);
  assert.match(stageRule, /padding:\s*24px\s*;/);
  assert.match(stageRule, /overflow:\s*visible\s*;/);
});

test("avatar customizer preview only talks while hovered", () => {
  assert.match(pageSource, /const \[previewHovered, setPreviewHovered\] = useState\(false\)/);
  assert.match(pageSource, /const previewTalking = previewHovered;/);
  assert.match(pageSource, /blinkWhileTalking/);
  assert.match(pageSource, /if \(!open \|\| !previewTalking\) \{\s*setMouthPhase\(0\);\s*return;\s*\}/);
  assert.match(pageSource, /\}, \[open, previewTalking\]\);/);
  assert.match(pageSource, /data-talking=\{previewTalking \? "true" : undefined\}/);
  assert.match(pageSource, /data-mouth-shape=\{previewTalking \? displayedPreviewMouthShape : undefined\}/);
  assert.match(pageSource, /onPointerEnter=\{\(\) => setPreviewHovered\(true\)\}/);
  assert.match(pageSource, /onPointerLeave=\{\(\) => setPreviewHovered\(false\)\}/);
  assert.match(pageSource, /isTalking=\{previewTalking\}/);
  assert.match(pageSource, /blinkWhileTalking\s+mouthShape=\{displayedPreviewMouthShape\}/);
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
