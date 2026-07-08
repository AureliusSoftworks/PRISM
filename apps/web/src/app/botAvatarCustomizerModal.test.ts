import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(resolve(appDir, "page.module.css"), "utf8");
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
  assert.match(pageSource, /<ZenLiveBotMannequin[\s\S]*accessoryEditorOverlay/);
  assert.match(cssSource, /\.botAvatarCustomizerBackdrop/);
  assert.match(cssSource, /\.botProfileBuilder\.botAvatarCustomizer/);
});

test("avatar customizer supports one-character eye overrides", () => {
  assert.match(pageSource, /faceEyeCharacter: string \| null/);
  assert.match(pageSource, /normalizeBotFaceEyeCharacter\(event\.currentTarget\.value\)/);
  assert.match(pageSource, /faceEyeCharacter=\{newBotFaceEyeCharacter\}/);
  assert.match(pageSource, /handleNewBotFaceEyeCharacterChange\(normalized\);/);
  assert.match(pageSource, /eyeCharacter: faceEyeCharacter/);
  assert.match(cssSource, /\.botAvatarEyeCharacterControl/);
});

test("avatar face and placement edits autosave immediately to saved bots", () => {
  assert.match(pageSource, /const \[botAvatarAutoSaving, setBotAvatarAutoSaving\] = useState\(false\);/);
  assert.match(pageSource, /function queueBotAvatarAutosave\(id: string \| null, patch: BotCustomizerSavePatch\): void/);
  assert.match(pageSource, /async function flushBotAvatarAutosaveQueue\(id: string\): Promise<boolean>/);
  assert.match(pageSource, /botAvatarAutoSaveQueuedPatchRef\.current = mergeBotAvatarAutosavePatch/);
  assert.match(pageSource, /applyBotAvatarAutosavePatchToSnapshot/);
  assert.match(pageSource, /saving=\{busy \|\| botAvatarAutoSaving\}/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ color: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ glyph: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyesFont: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceEyeCharacter: normalized \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceMouthFont: next \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ faceFontWeight: normalizedWeight \}\);/);
  assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{ accessoryPlacement: normalized \}\);/);
});

test("avatar accessory placement uses direct manipulation controls", () => {
  assert.doesNotMatch(pageSource, /BOT_ACCESSORY_PLACEMENT_X_PCT_MIN/);
  assert.doesNotMatch(pageSource, /BOT_ACCESSORY_PLACEMENT_Y_PCT_MIN/);
  assert.doesNotMatch(pageSource, /BOT_ACCESSORY_PLACEMENT_SIZE_PCT_MIN/);
  assert.doesNotMatch(pageSource, />\s*Horizontal\s*<strong>\{Math\.round\(normalizedPlacement\.xPct\)\}%/);
  assert.doesNotMatch(pageSource, />\s*Vertical\s*<strong>\{Math\.round\(normalizedPlacement\.yPct\)\}%/);
  assert.doesNotMatch(pageSource, />\s*Size\s*<strong>\{Math\.round\(normalizedPlacement\.sizePct\)\}%/);
  assert.match(pageSource, /className=\{styles\.botAvatarAccessoryEditHandle\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarAccessoryResizeHandle\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarAccessoryCancelButton\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarAccessoryLockButton\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarAccessoryLayerToggle\}/);
  assert.match(pageSource, /aria-label="Accessory layer"/);
  assert.match(pageSource, /commitAccessoryLayer\("front"\)/);
  assert.match(pageSource, /commitAccessoryLayer\("back"\)/);
  assert.match(pageSource, /aria-label="Remove accessory"/);
  assert.match(pageSource, /const \[accessoryLocked, setAccessoryLocked\] = useState\(false\);/);
  assert.match(pageSource, /const placementDragDisabled = placementDisabled \|\| accessoryPlacementLocked;/);
  assert.match(pageSource, /if \(placementDragDisabled\) \{/);
  assert.match(pageSource, /const accessoryEditorOverlay = accessoryUrl && !accessoryPlacementLocked \? \(/);
  assert.match(pageSource, /aria-label="Lock accessory placement"/);
  assert.match(pageSource, /onAccessoryPlacementCommit\(normalizedPlacement\);\s*setAccessoryLocked\(true\);/);
  assert.match(pageSource, /setAccessoryLocked\(true\);/);
  assert.match(pageSource, /onAccessoryPlacementCommit\(normalizedPlacement\);/);
  assert.doesNotMatch(pageSource, /aria-pressed=\{accessoryPlacementLocked\}/);
  assert.doesNotMatch(pageSource, /Unlock accessory placement/);
  assert.match(pageSource, /<X size=\{16\} strokeWidth=\{2\.8\} aria-hidden="true" \/>/);
  assert.match(pageSource, /<X size=\{14\} strokeWidth=\{2\.6\} aria-hidden="true" \/>[\s\S]*Remove/);
  assert.match(pageSource, /<Lock size=\{15\} strokeWidth=\{2\.8\} aria-hidden="true" \/>/);
  assert.doesNotMatch(pageSource, /<Unlock size=\{15\} strokeWidth=\{2\.8\} aria-hidden="true" \/>/);
  assert.match(pageSource, /<MoveDiagonal2 size=\{17\} strokeWidth=\{2\.8\} aria-hidden="true" \/>/);
  assert.match(pageSource, /const deltaSizePct =/);
});

test("avatar accessory layer toggle persists front/back placement", () => {
  assert.match(pageSource, /const accessoryLayerLabel = normalizedPlacement\.layer === "back" \? "Behind" : "Front";/);
  assert.match(pageSource, /const accessorySummary = accessoryUrl \? accessoryLayerLabel : "None";/);
  assert.match(pageSource, /const commitAccessoryLayer = useCallback/);
  assert.match(pageSource, /\.\.\.normalizedPlacement,\s*layer,/);
  assert.match(pageSource, /onAccessoryPlacementChange\(nextPlacement\);/);
  assert.match(pageSource, /onAccessoryPlacementCommit\(nextPlacement\);/);
  assert.match(pageSource, /data-active=\{normalizedPlacement\.layer === "front" \? "true" : undefined\}/);
  assert.match(pageSource, /data-active=\{normalizedPlacement\.layer === "back" \? "true" : undefined\}/);
  assert.match(cssSource, /\.botAvatarAccessoryLayerToggle/);
  assert.match(cssRuleBody(".botAvatarAccessoryLayerToggle"), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
});

test("avatar accessory editor controls use high-contrast white chrome", () => {
  const editHandleRule = cssRuleBody(".botAvatarAccessoryEditHandle");
  assert.match(editHandleRule, /border:\s*2px solid rgba\(255, 255, 255, 0\.92\);/);
  assert.match(editHandleRule, /0 0 0 1px rgba\(0, 0, 0, 0\.72\)/);

  const cancelButtonRule = cssRuleBody(".botAvatarAccessoryCancelButton");
  assert.match(cancelButtonRule, /width:\s*28px;/);
  assert.match(cancelButtonRule, /height:\s*28px;/);
  assert.match(cancelButtonRule, /border:\s*1px solid rgba\(255, 255, 255, 0\.88\);/);
  assert.match(cancelButtonRule, /color:\s*#ffffff;/);

  const lockButtonRule = cssRuleBody(".botAvatarAccessoryLockButton");
  assert.match(lockButtonRule, /right:\s*-14px;/);
  assert.match(lockButtonRule, /top:\s*-14px;/);
  assert.match(lockButtonRule, /width:\s*28px;/);
  assert.match(lockButtonRule, /height:\s*28px;/);
  assert.match(lockButtonRule, /border:\s*1px solid rgba\(255, 255, 255, 0\.9\);/);
  assert.match(lockButtonRule, /color:\s*#ffffff;/);
  assert.match(cssRuleBody(".botAvatarAccessoryLockButton svg"), /color:\s*#ffffff;/);
  assert.doesNotMatch(cssSource, /\.botAvatarAccessoryEditHandle\[data-locked="true"\]/);

  const resizeHandleRule = cssSource.match(
    /^\.botAvatarAccessoryResizeHandle\s*\{([\s\S]*?)\n\}/m
  )?.[1] ?? "";
  assert.notEqual(resizeHandleRule, "");
  assert.match(resizeHandleRule, /right:\s*-14px;/);
  assert.match(resizeHandleRule, /bottom:\s*-14px;/);
  assert.match(resizeHandleRule, /width:\s*28px;/);
  assert.match(resizeHandleRule, /height:\s*28px;/);
  assert.match(resizeHandleRule, /display:\s*grid;/);
  assert.match(resizeHandleRule, /place-items:\s*center;/);
  assert.match(resizeHandleRule, /border:\s*2px solid rgba\(255, 255, 255, 0\.95\);/);
  assert.match(cssRuleBody(".botAvatarAccessoryResizeHandle svg"), /color:\s*#ffffff;/);
});

test("avatar accessory removal clears preview state without avatar auto-save", () => {
  assert.match(pageSource, /function clearBotAccessoryFields\(bot: Bot\): Bot/);
  assert.match(pageSource, /setNewBotAccessoryImageId\(null\);/);
  assert.match(pageSource, /setNewBotAccessoryPlacement\(DEFAULT_BOT_ACCESSORY_PLACEMENT\);/);
  assert.match(pageSource, /clearBotAccessoryFields\(result\.bot as Bot\)/);
  assert.doesNotMatch(pageSource, /queueBotAvatarLiveSave/);
  assert.doesNotMatch(pageSource, /botAvatarLiveSave/);
  assert.doesNotMatch(pageSource, /botAccessoryClearedBotIdsRef/);
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
  const summaryAccessoryStart = pageSource.indexOf(
    "className={styles.botAvatarSummaryAccessory}",
    summaryFaceStart
  );
  assert.notEqual(summaryAccessoryStart, -1);
  const summaryFaceMarkup = pageSource.slice(summaryFaceStart, summaryAccessoryStart);
  assert.doesNotMatch(summaryFaceMarkup, /<BotFaceFrame/);
  assert.doesNotMatch(summaryFaceMarkup, /<CoffeeSeatPlateEmoji/);
  assert.doesNotMatch(summaryFaceMarkup, /botAvatarFacePlate/);

  assert.match(
    cssRuleBody(".botAvatarSummaryFace"),
    /grid-template-columns:\s*auto auto minmax\(0,\s*1fr\);/
  );
  assert.match(cssRuleBody(".botAvatarSummaryFaceParts"), /grid-template-rows:\s*repeat\(2,\s*28px\);/);
  assert.match(cssRuleBody(".botAvatarSummaryFacePart"), /place-items:\s*center;/);
  assert.match(cssRuleBody(".botAvatarSummaryFacePartGlyph"), /font-size:\s*18px;/);
});

test("default Prism bot card opens an avatar-only customizer path", () => {
  assert.match(pageSource, /\| "defaultCustomize"/);
  assert.match(pageSource, /function openDefaultBotCustomizer\(\): void/);
  assert.match(pageSource, /async function saveDefaultBot\(\): Promise<boolean>/);
  assert.match(pageSource, /"\/api\/default-bot"/);
  assert.match(pageSource, /const seededName = "Default";/);
  assert.match(pageSource, /const rawStoredPrompt = "";/);
  assert.match(pageSource, /const hasDefaultBotAvatarChanges = editPristine/);
  assert.match(pageSource, /\? hasDefaultBotAvatarChanges/);
  assert.match(pageSource, /botPanelAdvancedEditorAvailable =\s*botPanelView === "create" \|\| botPanelView === "customize";/);
  assert.match(pageSource, /!editingDefaultBot \? \(/);
  assert.match(pageSource, /className=\{styles\.botCardDefaultCustomizeButton\}/);
  assert.match(pageSource, /aria-label="Customize Default Prism bot"/);
  assert.match(pageSource, /onClick=\{openDefaultBotCustomizer\}/);
  assert.match(cssSource, /\.botCardDefaultCustomizeButton/);
});

test("avatar accessory editor is anchored to the rendered face layer", () => {
  assert.match(pageSource, /accessoryLayerRef = useRef<HTMLSpanElement \| null>\(null\)/);
  assert.match(pageSource, /const node = accessoryLayerRef\.current/);
  assert.match(pageSource, /className=\{styles\.zenLiveBotPresenceAccessoryLayer\}/);
  assert.match(pageSource, /className=\{styles\.zenLiveBotPresenceAccessoryEditLayer\}/);
  assert.match(pageSource, /className=\{styles\.zenLiveBotPresenceAccessoryRaster\}/);
  assert.match(pageSource, /accessoryLayerRef=\{accessoryLayerRef\}/);
  assert.match(pageSource, /data-accessory-layer=\{normalizedAccessoryPlacement\.layer\}/);
  assert.match(pageSource, /ref=\{accessoryEditorOverlay \? undefined : accessoryLayerRef\}/);

  const accessoryLayerRule = cssRuleBody(".zenLiveBotPresenceAccessoryLayer");
  assert.match(accessoryLayerRule, /left:\s*var\(--zen-live-bot-face-x,\s*50%\);/);
  assert.match(accessoryLayerRule, /top:\s*var\(--zen-live-bot-face-y,\s*50%\);/);
  assert.match(accessoryLayerRule, /width:\s*var\(--zen-live-bot-body-frame-size\);/);
  assert.match(accessoryLayerRule, /height:\s*var\(--zen-live-bot-body-frame-size\);/);
  assert.match(accessoryLayerRule, /scaleX\(var\(--coffee-plate-emoji-face-scale-y,\s*1\)\)/);
  assert.match(accessoryLayerRule, /overflow:\s*visible\s*;/);
  assert.match(cssRuleBody('.zenLiveBotPresenceAccessoryLayer[data-accessory-layer="back"]'), /z-index:\s*2;/);
  const accessoryEditLayerRule = cssRuleBody(".zenLiveBotPresenceAccessoryEditLayer");
  assert.match(accessoryEditLayerRule, /z-index:\s*7;/);
  assert.match(accessoryEditLayerRule, /scaleX\(var\(--coffee-plate-emoji-face-scale-y,\s*1\)\)/);
  assert.match(pageSource, /getPropertyValue\("--coffee-plate-emoji-face-scale-y"\)/);
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
  assert.match(pageSource, /className=\{styles\.botAvatarPreviewMeta\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarControlStack\}/);
  assert.match(pageSource, /aria-label="Identity"[\s\S]*<Brush size=\{16\}/);
  assert.match(pageSource, /aria-label="Face"[\s\S]*<Sparkles size=\{16\}/);
  assert.match(pageSource, /aria-label="Accessories"[\s\S]*<ImageGlyph size=\{16\}/);
  assert.match(pageSource, /const previewFaceSummary =/);
  assert.match(pageSource, /const previewWeightSummary =/);
  assert.match(pageSource, /const accessorySummary =/);

  const controlGroupRule = cssRuleBody(".botAvatarControlGroup");
  assert.match(controlGroupRule, /border-radius:\s*13px;/);
  assert.match(controlGroupRule, /background:\s*[\s\S]*linear-gradient/);
  assert.match(cssRuleBody(".botAvatarControlGroupHeader"), /grid-template-columns:\s*34px minmax\(0,\s*1fr\);/);
  assert.match(cssRuleBody(".botAvatarControlGroupIcon"), /place-items:\s*center;/);
  assert.match(cssRuleBody(".botAvatarIdentityPicker .colorSwatchButton"), /width:\s*72px;/);

  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /background-size:\s*34px 34px,\s*34px 34px,\s*auto;/);
  assert.doesNotMatch(stageRule, /radial-gradient/);
});

test("avatar preview theme keeps persona ink on normalized color without Prism rainbow aura", () => {
  assert.match(pageSource, /const \[previewTheme, setPreviewTheme\] = useState<"light" \| "dark">\(resolvedTheme\)/);
  assert.match(pageSource, /setPreviewTheme\(resolvedTheme\)/);
  assert.match(pageSource, /function botAvatarPreviewIdentityStyle\(rawHex: string\): CSSProperties/);
  assert.match(pageSource, /const accentStyle = botAccentStyle\(rawHex, "dark"\) \?\? \{\};/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_BODY_PLACEMENT: ZenLiveBotBodyPlacement = \{\s*xPct: 50,\s*yPct: 50,\s*\};/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_AVATAR_SIZE_PX = 330;/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_BODY_SIZE_PX = 300;/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_FACE_GLYPH_SIZE_REM = 3\.8;/);
  assert.match(pageSource, /\["--zen-live-bot-face-ink" as string\]: "var\(--coffee-bot-color\)"/);
  assert.match(pageSource, /\["--zen-live-bot-glyph-ink" as string\]: "var\(--coffee-bot-color\)"/);
  assert.match(pageSource, /\.\.\.botAvatarPreviewIdentityStyle\(color\)/);
  assert.doesNotMatch(pageSource, /\.\.\.botAccentStyle\(color, previewTheme\)/);
  assert.match(pageSource, /data-preview-theme=\{previewTheme\}/);
  assert.match(pageSource, /data-avatar-preview-theme=\{previewTheme\}/);
  assert.match(pageSource, /data-theme=\{previewTheme\}/);
  assert.match(pageSource, /resolvedTheme=\{resolvedTheme\}/);
  assert.match(pageSource, /setPreviewTheme\("light"\)/);
  assert.match(pageSource, /setPreviewTheme\("dark"\)/);
  assert.match(cssSource, /\.botAvatarPreviewThemeToggle/);
  assert.match(cssSource, /\.botAvatarMannequinStage\[data-preview-theme="light"\]/);
  assert.match(pageSource, /"--zen-live-bot-avatar-size": `\$\{BOT_AVATAR_CUSTOMIZER_AVATAR_SIZE_PX\}px`/);
  assert.match(pageSource, /"--zen-live-bot-avatar-face-glyph-size": `\$\{BOT_AVATAR_CUSTOMIZER_FACE_GLYPH_SIZE_REM\}rem`/);
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
});

test("avatar customizer preview uses in-game accessory placement math", () => {
  assert.match(pageSource, /const BOT_ACCESSORY_RENDER_FIELD_SCALE = 4\.4;/);
  assert.match(pageSource, /"--bot-accessory-field-x-pct"/);
  assert.match(pageSource, /"--bot-accessory-field-y-pct"/);
  assert.match(pageSource, /"--bot-accessory-field-size-pct"/);

  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /--bot-avatar-preview-accessory-bleed:\s*180px\s*;/);
  assert.match(stageRule, /min-height:\s*640px\s*;/);
  assert.match(stageRule, /padding:\s*var\(--bot-avatar-preview-accessory-bleed\)\s*;/);
  assert.match(stageRule, /overflow:\s*visible\s*;/);

  const accessoryLayerRule = cssRuleBody(".botAvatarMannequinStage .zenLiveBotPresenceAccessoryLayer");
  assert.match(accessoryLayerRule, /overflow:\s*visible\s*;/);

  assert.doesNotMatch(cssSource, /\.botAvatarMannequinStage\s+\.zenLiveBotPresenceBodyRaster\s*\{/);
  const accessoryRasterRule = cssRuleBody(".zenLiveBotPresenceAccessoryRaster");
  assert.match(accessoryRasterRule, /inset:\s*var\(--bot-accessory-field-inset-pct,\s*-170%\);/);
  assert.match(accessoryRasterRule, /overflow:\s*visible\s*;/);
  assert.match(accessoryRasterRule, /background-position:\s*[\s\S]*calc\(50% \+ var\(--bot-accessory-field-x-pct,\s*0%\)\)[\s\S]*calc\(50% \+ var\(--bot-accessory-field-y-pct,\s*0%\)\)/);
  assert.match(accessoryRasterRule, /background-size:\s*var\(--bot-accessory-field-size-pct,\s*22\.727%\) auto;/);
  assert.doesNotMatch(accessoryRasterRule, /width:\s*100%;/);
  assert.doesNotMatch(accessoryRasterRule, /height:\s*100%;/);
  assert.doesNotMatch(accessoryRasterRule, /mask-image:/);
  assert.doesNotMatch(accessoryRasterRule, /clip-path:/);
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
