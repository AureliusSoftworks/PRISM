import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(appDir, "page.tsx"), "utf8").replace(
  /\s+/gu,
  " ",
);
const cssSource = readFileSync(resolve(appDir, "page.module.css"), "utf8");
const globalCssSource = readFileSync(resolve(appDir, "globals.css"), "utf8");
const apiServerSource = readFileSync(
  resolve(appDir, "../../../api/src/server.ts"),
  "utf8",
);
const coffeeFaceSource = readFileSync(
  resolve(appDir, "CoffeeSeatPlateEmoji.tsx"),
  "utf8",
).replace(/\s+/gu, " ");
const tauriConfig = JSON.parse(
  readFileSync(
    resolve(appDir, "../../../desktop/src-tauri/tauri.conf.json"),
    "utf8",
  ),
) as {
  app?: {
    windows?: Array<{
      fullscreen?: boolean;
      minWidth?: number;
      minHeight?: number;
    }>;
  };
};

function normalizeCssFormatting(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")")
    .trim();
}

const normalizedCssSource = normalizeCssFormatting(cssSource);

function cssRuleBody(selector: string): string {
  const escaped = selector
    .trim()
    .split(/\s+/gu)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\s+");
  const match = cssSource.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Expected CSS rule for ${selector}`);
  return normalizeCssFormatting(match[1] ?? "");
}

function globalCssRuleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "g");
  for (const match of globalCssSource.matchAll(pattern)) {
    const previousMeaningfulChar = globalCssSource
      .slice(0, match.index)
      .trimEnd()
      .at(-1);
    if (previousMeaningfulChar === ",") continue;
    return match[1] ?? "";
  }
  assert.fail(`Expected global CSS rule for ${selector}`);
}

test("avatar customization is a floating modal that reuses the Zen mannequin", () => {
  assert.match(pageSource, /function BotAvatarCustomizerModal\(/);
  assert.doesNotMatch(pageSource, /<BotAvatarBuilder\b/);
  assert.match(pageSource, /data-avatar-customizer-preview="true"/);
  assert.match(pageSource, /function ZenLiveBotMannequin\(/);
  assert.match(cssSource, /\.botAvatarCustomizerBackdrop/);
  assert.match(cssSource, /\.botProfileBuilder\.botAvatarCustomizer/);
});

test("app chrome text is non-selectable outside editable text surfaces", () => {
  const bodyRule = globalCssRuleBody("body");
  assert.match(bodyRule, /-webkit-user-select:\s*none\s*;/);
  assert.match(bodyRule, /user-select:\s*none\s*;/);

  assert.match(globalCssSource, /input,\s*textarea,\s*select,/);
  assert.match(globalCssSource, /\[contenteditable="true"\]/);
  assert.match(globalCssSource, /\[contenteditable="plaintext-only"\]/);
  assert.match(globalCssSource, /\[role="textbox"\]/);
  assert.match(globalCssSource, /\[data-prism-compose-field="true"\]/);
  assert.match(globalCssSource, /\[data-markdown-cm-host="true"\]/);
  assert.match(globalCssSource, /-webkit-user-select:\s*text\s*;/);
  assert.match(globalCssSource, /user-select:\s*text\s*;/);
});

test("avatar customizer supports explicit custom eye, blink, mouth, and thinking controls", () => {
  assert.match(pageSource, /faceEyeCharacter: string \| null/);
  assert.match(pageSource, /faceMouthCharacter: string \| null/);
  assert.match(pageSource, /faceMouthAnimation: BotFaceGlyphAnimation/);
  assert.match(pageSource, /faceMouthCoffeePucker: boolean/);
  assert.match(
    pageSource,
    /useState<boolean>\(DEFAULT_BOT_FACE_STYLE\.mouthCoffeePucker\)/,
  );
  assert.match(pageSource, /faceEyeScale: number/);
  assert.match(pageSource, /faceEyeOffsetX: number/);
  assert.match(pageSource, /faceEyeOffsetY: number/);
  assert.match(pageSource, /faceEyeRotationDeg: number/);
  assert.match(pageSource, /faceEyeCount: BotFaceEyeCount/);
  assert.match(pageSource, /faceMouthScale: number/);
  assert.match(pageSource, /faceMouthOffsetX: number/);
  assert.match(pageSource, /faceMouthOffsetY: number/);
  assert.match(pageSource, /faceMouthRotationDeg: number/);
  assert.match(pageSource, /faceBlinkBar: BotFaceBlinkBar/);
  assert.match(pageSource, /faceThinkingFrames: BotFaceThinkingFrames/);
  assert.match(pageSource, /function BotAvatarCustomGlyphCapture\(/);
  assert.match(
    pageSource,
    /normalize=\{\(raw\) => normalizeBotFaceEyeCharacter\(raw\)\}/,
  );
  assert.match(
    pageSource,
    /normalize=\{\(raw\) => normalizeBotFaceMouthCharacter\(raw\)\}/,
  );
  assert.match(pageSource, /faceEyeCharacter=\{newBotFaceEyeCharacter\}/);
  assert.match(pageSource, /faceMouthCharacter=\{newBotFaceMouthCharacter\}/);
  assert.match(pageSource, /faceMouthAnimation=\{newBotFaceMouthAnimation\}/);
  assert.match(
    pageSource,
    /faceMouthCoffeePucker=\{newBotFaceMouthCoffeePucker\}/,
  );
  assert.match(pageSource, /faceEyeScale=\{newBotFaceEyeScale\}/);
  assert.match(pageSource, /faceEyeOffsetX=\{newBotFaceEyeOffsetX\}/);
  assert.match(pageSource, /faceEyeOffsetY=\{newBotFaceEyeOffsetY\}/);
  assert.match(pageSource, /faceEyeRotationDeg=\{newBotFaceEyeRotationDeg\}/);
  assert.match(pageSource, /faceEyeCount=\{newBotFaceEyeCount\}/);
  assert.match(pageSource, /faceMouthScale=\{newBotFaceMouthScale\}/);
  assert.match(pageSource, /faceMouthOffsetX=\{newBotFaceMouthOffsetX\}/);
  assert.match(pageSource, /faceMouthOffsetY=\{newBotFaceMouthOffsetY\}/);
  assert.match(
    pageSource,
    /faceMouthRotationDeg=\{newBotFaceMouthRotationDeg\}/,
  );
  assert.match(pageSource, /faceBlinkBar=\{newBotFaceBlinkBar\}/);
  assert.match(pageSource, /faceThinkingFrames=\{newBotFaceThinkingFrames\}/);
  assert.match(pageSource, /handleNewBotFaceEyeCharacterChange\(normalized\);/);
  assert.match(
    pageSource,
    /next === 2[\s\S]{0,180}DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceMouthCharacterChange\(normalized\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceEyeScaleChange\(normalizedScale\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceEyeOffsetXChange\(normalizedOffsetX\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceEyeOffsetYChange\(normalizedOffsetY\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceMouthScaleChange\(normalizedScale\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceMouthOffsetXChange\(normalizedOffsetX\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceMouthOffsetYChange\(normalizedOffsetY\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceMouthRotationDegChange\(\s*normalizedRotationDeg\s*,?\s*\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceBlinkBarChange\(normalizedBlinkBar\);/,
  );
  assert.match(
    pageSource,
    /handleNewBotFaceThinkingFramesChange\(\s*normalizedFrames\s*,?\s*\);/,
  );
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
  assert.match(
    pageSource,
    /if \(blinkBar === DEFAULT_BOT_FACE_BLINK_BAR\) return "Default";/,
  );
  assert.match(pageSource, /botAvatarBlinkBarInputValue\(faceBlinkBar\)/);
  assert.match(pageSource, /botAvatarThinkingFramesFromPaste/);
  assert.match(cssSource, /\.botAvatarOverrideControl/);
  assert.match(cssSource, /\.botAvatarCustomOptionInput/);
  assert.match(cssSource, /\.botAvatarGlyphAnimationControl/);
  assert.match(
    cssSource,
    /\.botAvatarGlyphAnimationControl > div\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(pageSource, /pulsate:\s*"Pulse"/);
  assert.match(cssSource, /\.botAvatarIdentitySection/);
  assert.match(cssSource, /\.botAvatarCustomMotionRow/);
  assert.match(cssSource, /\.botAvatarGlyphRotationField/);
  assert.match(
    cssSource,
    /\.botAvatarGlyphRotationField\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(118px, 0\.82fr\)/,
  );
  assert.match(
    cssSource,
    /\.botAvatarGlyphRotationField \.botAvatarMouthRotationControl\s*\{[\s\S]*?border-left:/,
  );
  assert.match(
    cssSource,
    /\.botAvatarGlyphAnimationControl > div\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarGlyphAnimationControl > div > button:first-child/,
  );
  assert.match(pageSource, /label = "Animation"/);
  assert.doesNotMatch(cssSource, /\.botAvatarMouthAnimationRow/);
  assert.match(cssSource, /\.botAvatarThinkingControl/);
  assert.match(cssSource, /\.botAvatarInlineResetButton/);
  assert.match(pageSource, /ariaLabel="Custom eye glyph"/);
  assert.match(pageSource, /ariaLabel="Custom mouth glyph"/);
  assert.match(pageSource, /part="eyes"/);
  assert.match(pageSource, /part="mouth"/);
  assert.match(pageSource, /value=\{faceMouthAnimation\}/);
  assert.match(pageSource, /none:\s*"Default"/);
  assert.match(pageSource, /aria-label="Eyes"/);
  assert.match(pageSource, /aria-label="Mouth"/);
  assert.match(pageSource, /label="blink glyph"/);
  assert.match(pageSource, /label="thinking animation"/);
  assert.match(pageSource, /aria-label="Custom blink bar"/);
  assert.match(
    pageSource,
    /aria-label=\{`Custom thinking frame \$\{index \+ 1\}`\}/,
  );
  assert.match(pageSource, /BOT_AVATAR_CUSTOM_EYE_START/);
  assert.match(pageSource, /BOT_AVATAR_CUSTOM_MOUTH_START/);
  assert.match(pageSource, /BOT_AVATAR_CUSTOM_THINKING_FRAMES/);
  assert.match(pageSource, /label: "Disabled"/);
  assert.match(pageSource, /frames: DISABLED_BOT_FACE_THINKING_FRAMES/);
  assert.match(
    pageSource,
    /Keep the normal face and animations while thinking/,
  );
  assert.match(pageSource, /BOT_AVATAR_RANDOM_CUSTOM_BLINK_GLYPHS/);
  assert.match(pageSource, /BOT_AVATAR_RANDOM_CUSTOM_THINKING_FRAME_SETS/);
  assert.match(pageSource, /function botAvatarRandomIndex/);
  assert.match(pageSource, /cryptoApi\?\.getRandomValues/);
  assert.match(
    pageSource,
    /const normalizedEyeGlyph = faceEyeCharacter \?\? BOT_AVATAR_CUSTOM_EYE_START/,
  );
  assert.match(
    pageSource,
    /const normalizedMouthGlyph = faceMouthCharacter \?\? BOT_AVATAR_CUSTOM_MOUTH_START/,
  );
  assert.doesNotMatch(pageSource, /pendingGlyphFocusRef/);
  assert.doesNotMatch(pageSource, /randomBotAvatarCustomEyeGlyph/);
  assert.doesNotMatch(pageSource, /randomBotAvatarCustomMouthGlyph/);
  assert.match(pageSource, /: randomBotAvatarCustomBlinkGlyph\(\)/);
  assert.match(pageSource, /: randomBotAvatarCustomThinkingFrames\(\)/);
  assert.match(pageSource, /label="Eye size"/);
  assert.match(pageSource, /label="Eye position"/);
  assert.match(pageSource, /label="Blink size"/);
  assert.match(pageSource, /label="Blink position"/);
  assert.match(pageSource, /onBlinkScaleChange/);
  assert.match(pageSource, /onBlinkOffsetXChange/);
  assert.match(pageSource, /onBlinkOffsetYChange/);
  assert.match(pageSource, /label="Mouth size"/);
  assert.match(pageSource, /label="Mouth position"/);
  assert.match(pageSource, /function BotAvatarCoordinateControl\(/);
  assert.match(pageSource, /const visualX = -displayX;/);
  assert.match(
    pageSource,
    /const xRatio = \(maxX - displayX\) \/ \(maxX - minX\);/,
  );
  assert.match(
    pageSource,
    /maxX - Math\.max\(0, Math\.min\(1, rawX\)\) \* \(maxX - minX\)/,
  );
  assert.match(
    pageSource,
    /event\.key === "ArrowLeft"[\s\S]*displayX \+ xStep[\s\S]*event\.key === "ArrowRight"[\s\S]*displayX - xStep/,
  );
  assert.match(
    pageSource,
    /aria-valuetext=\{botAvatarCoordinateLabel\(visualX, y\)\}/,
  );
  assert.match(pageSource, /function BotAvatarMouthRotationWheel\(/);
  assert.match(pageSource, /const commitRotation = /);
  assert.match(pageSource, /if \(snapped === normalizedValue\) return;/);
  assert.match(pageSource, /aria-label=\{`\$\{partLabel\} rotation`\}/);
  assert.doesNotMatch(pageSource, /aria-label="Mouth rotation degrees"/);
  assert.match(
    pageSource,
    /className=\{styles\.botAvatarMouthRotationGlyphText\}/,
  );
  assert.match(pageSource, /normalizeBotFaceMouthRotationDeg/);
  assert.match(pageSource, /normalizeBotFaceEyeRotationDeg/);
  assert.equal(
    pageSource.match(/label="Stroke weight"/gu)?.length,
    2,
    "Eyes and Mouth should each expose the shared stroke-weight slider",
  );
  assert.match(cssRuleBody(".botAvatarCoordinatePad"), /cursor:\s*grab;/);
  assert.match(cssSource, /\.botAvatarCoordinatePad::before/);
  assert.match(cssRuleBody(".botAvatarCoordinateThumb"), /width:\s*20px;/);
  assert.match(
    cssSource,
    /--bot-face-eye-scale:\s*var\(--bot-face-blink-scale, 1\)/,
  );
  assert.match(
    cssSource,
    /--bot-face-eye-offset-x:\s*var\(--bot-face-blink-offset-x, 0em\)/,
  );
  assert.match(
    cssSource,
    /--bot-face-eye-offset-y:\s*var\(--bot-face-blink-offset-y, 0em\)/,
  );
  const faceBranchStart = pageSource.indexOf(
    '{activeTab === "face" ? ( <div className={styles.botAvatarFaceControls}>',
  );
  const eyesBranchStart = pageSource.indexOf(
    ') : activeTab === "eyes" ? (',
    faceBranchStart,
  );
  const mouthBranchStart = pageSource.indexOf(
    ') : activeTab === "mouth" ? (',
    eyesBranchStart,
  );
  assert.notEqual(faceBranchStart, -1);
  assert.notEqual(eyesBranchStart, -1);
  assert.notEqual(mouthBranchStart, -1);
  const faceTabSource = pageSource.slice(faceBranchStart, eyesBranchStart);
  const eyesTabSource = pageSource.slice(eyesBranchStart, mouthBranchStart);
  const mouthTabSource = pageSource.slice(
    mouthBranchStart,
    pageSource.indexOf("function BotPowerNameplateIndicator", mouthBranchStart),
  );
  assert.doesNotMatch(faceTabSource, /label="Eye size"/);
  assert.doesNotMatch(faceTabSource, /label="Eye position"/);
  assert.doesNotMatch(faceTabSource, /Mouth rotation/);
  assert.doesNotMatch(faceTabSource, /botAvatarEyeScalePresetButton/);
  assert.doesNotMatch(faceTabSource, /enableCustomEye/);
  assert.doesNotMatch(faceTabSource, /enableCustomMouth/);
  assert.match(faceTabSource, /<BotAvatarIdentityControls/);
  assert.match(faceTabSource, /identitySection \?/);
  assert.match(faceTabSource, /<ColorGlyphPicker/);
  assert.match(faceTabSource, /label="thinking animation"/);
  assert.match(faceTabSource, /aria-label="Custom thinking animation frames"/);
  assert.match(faceTabSource, /\sinline\s/);
  assert.doesNotMatch(faceTabSource, /label="Stroke weight"/);
  assert.match(eyesTabSource, /ariaLabel="Custom eye glyph"/);
  assert.match(eyesTabSource, /label="Stroke weight"/);
  assert.match(eyesTabSource, /value=\{faceFontWeight\}/);
  assert.match(eyesTabSource, /onChange=\{onWeightChange\}/);
  assert.match(eyesTabSource, /<BotAvatarCustomGlyphCapture/);
  assert.match(eyesTabSource, /handleEyeCharacterChange/);
  assert.match(eyesTabSource, /selected=\{faceEyesFont === fontId\}/);
  assert.match(eyesTabSource, /onClick=\{\(\) => selectEyeFont\(fontId\)\}/);
  assert.doesNotMatch(
    eyesTabSource,
    /className=\{styles\.botAvatarCustomOptionInput\}/,
  );
  assert.doesNotMatch(
    eyesTabSource,
    /botAvatarFontOption\} \$\{styles\.botAvatarCustomOption\}/,
  );
  assert.match(eyesTabSource, /botAvatarSingleGlyphInput/);
  assert.match(eyesTabSource, /disabled=\{!customEyeActive\}/);
  assert.match(eyesTabSource, /label="Eye animation"/);
  assert.match(eyesTabSource, /value=\{faceEyeAnimation\}/);
  assert.match(eyesTabSource, /botAvatarCustomMotionRowSingle/);
  assert.match(eyesTabSource, /part="eyes"/);
  assert.match(eyesTabSource, /aria-label="Custom eye count"/);
  assert.match(eyesTabSource, /customEyeActive \? \(/);
  assert.match(eyesTabSource, /One eye/);
  assert.match(eyesTabSource, /Two eyes/);
  assert.match(eyesTabSource, /label="Eye size"/);
  assert.match(eyesTabSource, /label="Eye position"/);
  assert.match(eyesTabSource, /label="blink glyph"/);
  assert.match(eyesTabSource, /botAvatarBlinkBarOptionLabel\(blinkBar\)/);
  assert.match(eyesTabSource, /aria-label="Use a custom blink bar"/);
  assert.match(eyesTabSource, /label="Blink size"/);
  assert.match(eyesTabSource, /label="Blink position"/);
  assert.match(eyesTabSource, /lockX=\{!customEyeActive\}/);
  assert.match(eyesTabSource, /lockedX=\{DEFAULT_BOT_FACE_STYLE\.eyeOffsetX\}/);
  assert.ok(
    eyesTabSource.indexOf("<BotAvatarCustomGlyphCapture") <
      eyesTabSource.indexOf("<BotAvatarMouthRotationWheel"),
    "Custom glyph capture should sit left of the eye rotation wheel",
  );
  assert.match(mouthTabSource, /ariaLabel="Custom mouth glyph"/);
  assert.match(mouthTabSource, /label="Stroke weight"/);
  assert.match(mouthTabSource, /value=\{faceFontWeight\}/);
  assert.match(mouthTabSource, /onChange=\{onWeightChange\}/);
  assert.match(mouthTabSource, /<BotAvatarCustomGlyphCapture/);
  assert.match(mouthTabSource, /handleMouthCharacterChange/);
  assert.match(mouthTabSource, /selected=\{faceMouthFont === fontId\}/);
  assert.match(mouthTabSource, /onClick=\{\(\) => selectMouthFont\(fontId\)\}/);
  assert.doesNotMatch(
    mouthTabSource,
    /className=\{styles\.botAvatarCustomOptionInput\}/,
  );
  assert.doesNotMatch(mouthTabSource, /botAvatarSingleGlyphInput/);
  assert.match(cssSource, /\.botAvatarCustomGlyphCapture/);
  assert.match(pageSource, /faceEyeRotationDeg: bot\?\.face_eye_rotation_deg/);
  assert.match(pageSource, /faceEyeCount: bot\?\.face_eye_count/);
  assert.match(
    mouthTabSource,
    /data-custom-active=\{customMouthActive \? "true" : undefined\}/,
  );
  assert.match(mouthTabSource, /disabled=\{!customMouthActive\}/);
  assert.doesNotMatch(mouthTabSource, /botAvatarCoffeePuckerToggle/);
  assert.match(pageSource, /botAvatarControlGroupActions/);
  assert.match(pageSource, /activeTab === "mouth" && customMouthActive/);
  assert.match(pageSource, /Coffee \*/);
  assert.match(
    pageSource,
    /Swap the custom mouth to \* while sipping in Coffee mode\./,
  );
  assert.match(pageSource, /role="switch"/);
  assert.match(pageSource, /aria-checked=\{faceMouthCoffeePucker\}/);
  assert.match(pageSource, /data-enabled=\{faceMouthCoffeePucker/);
  assert.match(pageSource, /onMouthCoffeePuckerChange/);
  assert.match(mouthTabSource, /faceMouthAnimation/);
  assert.match(mouthTabSource, /label="Mouth size"/);
  assert.match(mouthTabSource, /<BotAvatarMouthRotationWheel/);
  assert.match(mouthTabSource, /label="Mouth position"/);
  assert.match(mouthTabSource, /lockX=\{!customMouthActive\}/);
  assert.match(
    mouthTabSource,
    /lockedX=\{DEFAULT_BOT_FACE_STYLE\.mouthOffsetX\}/,
  );
  assert.doesNotMatch(mouthTabSource, /botAvatarCustomMotionRowSingle/);
  assert.doesNotMatch(mouthTabSource, /botAvatarMouthAnimationRow/);
  assert.doesNotMatch(mouthTabSource, /botAvatarCustomMotionRowCombined/);
  assert.match(mouthTabSource, /botAvatarGlyphRotationField/);
  assert.match(
    cssSource,
    /\.botAvatarGlyphRotationField\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  );
  assert.match(mouthTabSource, /<BotAvatarGlyphAnimationControl/);
  assert.match(mouthTabSource, /label="Mouth animation"/);
  assert.match(mouthTabSource, /value=\{faceMouthAnimation\}/);
  assert.match(mouthTabSource, /onChange=\{onMouthAnimationChange\}/);
  assert.ok(
    mouthTabSource.indexOf("<BotAvatarCustomGlyphCapture") <
      mouthTabSource.indexOf("<BotAvatarMouthRotationWheel"),
    "Custom glyph capture should sit left of mouth rotation in their shared field",
  );
  assert.ok(
    mouthTabSource.indexOf("<BotAvatarMouthRotationWheel") <
      mouthTabSource.indexOf('label="Mouth size"'),
    "Mouth rotation should sit with the custom glyph controls above mouth size",
  );
  const eyeFontHandlerStart = pageSource.indexOf("const selectEyeFont");
  const mouthFontHandlerStart = pageSource.indexOf("const selectMouthFont");
  const fontHandlerEnd = pageSource.indexOf(
    "const enableCustomBlink",
    mouthFontHandlerStart,
  );
  assert.notEqual(eyeFontHandlerStart, -1);
  assert.notEqual(mouthFontHandlerStart, -1);
  assert.notEqual(fontHandlerEnd, -1);
  const eyeFontHandlerSource = pageSource.slice(
    eyeFontHandlerStart,
    mouthFontHandlerStart,
  );
  const mouthFontHandlerSource = pageSource.slice(
    mouthFontHandlerStart,
    fontHandlerEnd,
  );
  assert.match(eyeFontHandlerSource, /onEyesFontChange\(fontId\);/);
  assert.doesNotMatch(eyeFontHandlerSource, /onEyeCharacterChange/);
  assert.doesNotMatch(eyeFontHandlerSource, /onEyeOffsetXChange/);
  assert.doesNotMatch(eyeFontHandlerSource, /onEyeRotationDegChange/);
  assert.match(mouthFontHandlerSource, /onMouthFontChange\(fontId\);/);
  assert.doesNotMatch(
    mouthFontHandlerSource,
    /onMouthCharacterChange\(DEFAULT/,
  );
  assert.doesNotMatch(mouthFontHandlerSource, /onMouthOffsetXChange/);
  assert.doesNotMatch(mouthFontHandlerSource, /onMouthRotationDegChange/);
  assert.match(mouthFontHandlerSource, /handleEyeCharacterChange/);
  assert.match(mouthFontHandlerSource, /enablingCustom/);
  assert.match(
    mouthFontHandlerSource,
    /onEyeRotationDegChange\(DEFAULT_BOT_FACE_STYLE\.eyeRotationDeg\)/,
  );
  assert.match(mouthFontHandlerSource, /handleMouthCharacterChange/);
  assert.doesNotMatch(mouthFontHandlerSource, /onMouthScaleChange/);
  assert.doesNotMatch(mouthFontHandlerSource, /onMouthOffsetYChange/);
  assert.match(cssSource, /\.botAvatarMouthRotationControl/);
  assert.match(
    cssSource,
    /\.botAvatarMouthRotationWheel \{[\s\S]*?transparent 2deg 5deg/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthRotationGlyph"),
    /transform:\s*none\s*;/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthRotationGlyphText"),
    /transform:\s*rotate\(var\(--bot-avatar-mouth-rotation,\s*0deg\)\)\s*;/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthRotationGlyphText"),
    /transform-origin:\s*center center\s*;/,
  );
  assert.doesNotMatch(pageSource, />\s*Inflation\s*</);
  assert.doesNotMatch(pageSource, />\s*Eye height\s*</);
});

test("two custom eyes duplicate only the open-eye glyph and leave blink behavior unchanged", () => {
  assert.match(coffeeFaceSource, /normalizedFaceEyeCount === 2/);
  assert.match(coffeeFaceSource, /displayBlinkPhase !== "closed"/);
  assert.match(coffeeFaceSource, /data-custom-eye-pair="true"/);
  assert.match(coffeeFaceSource, /data-custom-eye-pair-side="left"/);
  assert.match(coffeeFaceSource, /data-custom-eye-pair-side="right"/);
  assert.match(coffeeFaceSource, /pairedEye: renderCustomEyePair/);
  assert.match(
    coffeeFaceSource,
    /const blinkKey = `\$\{enabled[\s\S]*?:\$\{faceText\}:\$\{scheduleKey\}`/,
  );
  assert.doesNotMatch(coffeeFaceSource, /const blinkKey = [^;]*faceEyeCount/);
  assert.match(cssSource, /\[data-custom-eye-pair-side="left"\]/);
  assert.match(cssSource, /\[data-custom-eye-pair-side="right"\]/);
  assert.match(
    cssSource,
    /\[data-custom-eye-pair="true"\][\s\S]*transform:\s*rotate\(var\(--bot-face-eye-rotation/,
  );
  assert.match(cssSource, /--bot-face-custom-eye-pair-scale:\s*0\.42\s*;/);
  assert.match(
    cssSource,
    /translateX\(-0\.18em\) scale\(var\(--bot-face-custom-eye-pair-scale\)\)/,
  );
  assert.match(
    cssSource,
    /translateX\(0\.18em\) scale\(var\(--bot-face-custom-eye-pair-scale\)\)/,
  );
});

test("avatar edits stay local until Save and support multi-step undo", () => {
  assert.doesNotMatch(
    pageSource,
    /queueBotAvatarAutosave|flushBotAvatarAutosaveQueue/,
  );
  assert.doesNotMatch(
    pageSource,
    /botAvatarAutoSaving|botAvatarAutoSaveQueuedPatchRef/,
  );
  assert.match(pageSource, /const avatarCustomizerSaving = busy;/);
  assert.match(pageSource, /const BOT_AVATAR_UNDO_HISTORY_LIMIT = 100;/);
  assert.match(pageSource, /const BOT_AVATAR_UNDO_STATIONARY_MS = 450;/);
  assert.match(pageSource, /type BotAvatarDraftSnapshot = Pick</);
  assert.match(
    pageSource,
    /const botAvatarUndoHistoryRef = useRef<BotAvatarDraftSnapshot\[]>\(\[]\);/,
  );
  assert.match(pageSource, /const pushBotAvatarUndoSnapshot = useCallback/);
  assert.match(pageSource, /const undoBotAvatarDraft = useCallback/);
  assert.match(pageSource, /const redoBotAvatarDraft = useCallback/);
  assert.match(pageSource, /applyBotAvatarDraftSnapshot\(snapshot\);/);
  assert.match(pageSource, /botAvatarRedoHistoryRef/);
  assert.match(
    pageSource,
    /pushBotAvatarUndoSnapshot\("color"\);[\s\S]*handleNewBotColorChange\(next\);/,
  );
  assert.match(
    pageSource,
    /pushBotAvatarUndoSnapshot\(\);[\s\S]*handleNewBotGlyphChange\(next\);/,
  );
  assert.match(
    pageSource,
    /pushBotAvatarUndoSnapshot\(\);[\s\S]*handleNewBotFaceEyesFontChange\(next\);/,
  );
  assert.match(pageSource, /pushBotAvatarUndoSnapshot\("face-weight"\);/);
  assert.match(pageSource, /pushBotAvatarUndoSnapshot\("eye-position"\);/);
  assert.match(pageSource, /pushBotAvatarUndoSnapshot\("mouth-position"\);/);
  assert.match(
    pageSource,
    /now - activeInteraction\.lastChangedAt < BOT_AVATAR_UNDO_STATIONARY_MS/,
  );
  assert.match(pageSource, /canUndo=\{botAvatarUndoDepth > 0\}/);
  assert.match(pageSource, /canRedo=\{botAvatarRedoDepth > 0\}/);
  assert.match(pageSource, /onUndo=\{undoBotAvatarDraft\}/);
  assert.match(pageSource, /onRedo=\{redoBotAvatarDraft\}/);
  assert.match(
    pageSource,
    /className=\{styles\.botAvatarCustomizerUndoButton\}/,
  );
  assert.match(pageSource, /Undo last edit \(Ctrl\/Cmd\+Z\)/);
  assert.match(pageSource, /Redo last edit \(Shift\+Ctrl\/Cmd\+Z\)/);
  assert.match(
    pageSource,
    /window\.addEventListener\("keydown", handleUndoKeyDown\);/,
  );
  assert.match(pageSource, /event\.metaKey && !event\.ctrlKey/);
  assert.match(pageSource, /event\.preventDefault\(\);/);
  assert.match(pageSource, /const redoRequested = event\.shiftKey/);
  assert.match(
    pageSource,
    /target\.closest\([\s\S]*input, textarea, \[contenteditable="true"\]/,
  );
  assert.match(
    pageSource,
    /async function saveBot\(id: string\): Promise<boolean>/,
  );
  assert.match(pageSource, /const patch = buildBotCustomizerSavePatch/);
});

test("avatar save state is scoped and bounded so prompts cannot stay stuck", () => {
  assert.match(pageSource, /const BOT_AVATAR_SAVE_TIMEOUT_MS = 15000;/);
  assert.match(pageSource, /async function withBotAvatarSaveTimeout<T>/);
  assert.match(pageSource, /controller\.abort\(\);/);
  assert.match(pageSource, /Avatar save took too long\. Please try again\./);
  assert.match(
    pageSource,
    /withBotAvatarSaveTimeout\(\(signal\) =>\s*api<\{ defaultBot\?: Record<string, unknown> \}>/,
  );
  assert.match(
    pageSource,
    /withBotAvatarSaveTimeout\(\(signal\) =>\s*api<\{ bot\?: Bot \}>/,
  );
  assert.match(pageSource, /const avatarCustomizerSaving = busy;/);
  assert.match(
    pageSource,
    /if \(dismissOuterSavePrompt\) onCancelSavePrompt\(\);[\s\S]*?void onSave\(\);/,
  );
  assert.match(
    pageSource,
    /onRequestClose=\{\(\) => \{\s*if \(avatarCustomizerSaving\) \{\s*closeBotAvatarStudioFlow\(\);\s*return;/,
  );
});

test("avatar and bot saves recover cleanly when the edit target no longer exists", () => {
  assert.match(
    pageSource,
    /function isBotNotFoundError\(err: unknown\): boolean/,
  );
  assert.match(
    pageSource,
    /async function recoverMissingBotEditTarget\(id: string\)/,
  );
  assert.match(
    pageSource,
    /setPanelError\(\s*"That bot is no longer available\. I refreshed the bot library\."\s*,?\s*\);/,
  );
  assert.match(
    pageSource,
    /if \(!bots\.some\(\(bot\) => bot\.id === id\)\) \{[\s\S]*await recoverMissingBotEditTarget\(id\);[\s\S]*return false;/,
  );
  assert.match(
    pageSource,
    /if \(isBotNotFoundError\(err\)\) \{[\s\S]*await recoverMissingBotEditTarget\(id\);/,
  );
});

test("avatar customizer keeps explicit save and dirty prompts for broader edits", () => {
  assert.match(pageSource, /hasUnsavedChanges: boolean;/);
  assert.match(pageSource, /draftMode\?: boolean;/);
  assert.match(pageSource, /canSave\?: boolean;/);
  assert.match(pageSource, /draftMode = false/);
  assert.match(pageSource, /savePromptOpen: boolean;/);
  assert.match(
    pageSource,
    /className=\{styles\.botAvatarCustomizerSaveButton\}/,
  );
  assert.match(pageSource, /Do you want to save your changes\?/);
  assert.match(pageSource, /setBotAvatarSavePromptOpen\(true\);/);
  assert.match(pageSource, /const saved = await saveBot\(editingBotId\);/);
  assert.match(pageSource, /restoreBotAvatarDraftFromPristine/);
  assert.match(pageSource, /discardBotAvatarCustomizerChanges/);
  assert.match(
    pageSource,
    /async function saveBot\(id: string\): Promise<boolean>/,
  );
  assert.doesNotMatch(pageSource, /flushBotAvatarLiveSave/);
  assert.doesNotMatch(pageSource, /BotAvatarLiveSavePatch/);
  assert.match(
    pageSource,
    /const saveButtonVisible = draftMode \|\| saving \|\| hasUnsavedChanges \|\| detailsEditorDirty;/,
  );
  assert.match(pageSource, /\{saveButtonVisible \? \(/);
  assert.match(pageSource, /draftMode\s*\?\s*"Draft"\s*:\s*"Saved"/);
  assert.match(
    pageSource,
    /draftMode=\{\s*botPanelCreateMode\s*&&\s*!editingBotId\s*&&\s*!editingDefaultBot\s*\}/,
  );
  assert.match(pageSource, /draftMode \? "Create bot" : "Save"/);
  assert.match(pageSource, /const created = await createBot\(\);/);

  const saveButtonRule = cssRuleBody(
    ".botProfileBuilderHeader .botAvatarCustomizerSaveButton",
  );
  assert.match(saveButtonRule, /min-width:\s*92px;/);
  assert.match(saveButtonRule, /display:\s*inline-flex;/);
  assert.match(saveButtonRule, /background:\s*[\s\S]*linear-gradient/);
  assert.match(
    saveButtonRule,
    /color:\s*var\(--editor-bot-contrast,\s*var\(--editor-bot-ink,\s*#ffffff\)\);/,
  );
  assert.match(
    pageSource,
    /\["--editor-bot-contrast" as string\]: pickReadableText\(accentNormalized\)/,
  );
  assert.match(
    cssRuleBody(".botProfileBuilderHeader .botAvatarCustomizerUndoButton"),
    /display:\s*inline-flex;/,
  );
  assert.match(cssRuleBody(".botAvatarSaveStatus"), /border-radius:\s*999px;/);

  const promptBackdropRule = cssRuleBody(".botAvatarSavePromptBackdrop");
  assert.match(promptBackdropRule, /z-index:\s*3010;/);
  assert.match(promptBackdropRule, /place-items:\s*center;/);
  assert.match(
    cssRuleBody(".botAvatarPanelHeader"),
    /justify-content:\s*space-between;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarPreviewToolbar\s*\{[\s\S]*display:\s*grid;/,
  );
});

test("avatar summary card previews identity, eyes, and mouth", () => {
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryGlyphSocket\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryFaceParts\}/);
  assert.match(
    pageSource,
    /aria-label="Open Avatar Studio to edit bot avatar"/,
  );
  assert.match(pageSource, /className=\{styles\.botAvatarSummaryEditHint\}/);
  assert.match(pageSource, />\s*Open Avatar Studio\s*</);
  assert.match(pageSource, /data-part="eyes"/);
  assert.match(pageSource, /data-face-font=\{newBotFaceEyesFont\}/);
  assert.match(pageSource, /data-part="mouth"/);
  assert.match(pageSource, /data-face-font=\{newBotFaceMouthFont\}/);
  assert.match(
    pageSource,
    /const botAvatarSummaryEyeGlyph = newBotFaceEyeCharacter \?\? "••";/,
  );
  assert.match(
    pageSource,
    /const botAvatarSummaryEyeLabel = newBotFaceEyeCharacter/,
  );
  assert.match(pageSource, /`Eye glyph \$\{newBotFaceEyeCharacter\}`/);
  assert.match(
    pageSource,
    /const botAvatarSummaryMouthLabel = newBotFaceMouthCharacter/,
  );
  assert.match(pageSource, /`Mouth glyph \$\{newBotFaceMouthCharacter\}`/);
  assert.match(pageSource, /botAvatarSummaryMouthRotationLabel/);
  assert.match(
    pageSource,
    /\{botAvatarSummaryEyeLabel\}\s*·\s*(?:\{" "\}\s*)?\{botAvatarSummaryMouthLabel\}/,
  );

  const summaryFaceStart = pageSource.indexOf(
    "className={styles.botAvatarSummaryFace}",
  );
  assert.notEqual(summaryFaceStart, -1);
  const summaryButtonEnd = pageSource.indexOf("</button>", summaryFaceStart);
  assert.notEqual(summaryButtonEnd, -1);
  const summaryFaceMarkup = pageSource.slice(
    summaryFaceStart,
    summaryButtonEnd,
  );
  assert.doesNotMatch(summaryFaceMarkup, /<BotFaceFrame/);
  assert.doesNotMatch(summaryFaceMarkup, /<CoffeeSeatPlateEmoji/);
  assert.doesNotMatch(summaryFaceMarkup, /botAvatarFacePlate/);

  assert.match(
    cssRuleBody(".botAvatarSummaryFace"),
    /grid-template-columns:\s*auto auto minmax\(0,\s*1fr\) auto;/,
  );
  assert.match(cssSource, /\.botAvatarSummaryEditHint/);
  assert.match(
    cssRuleBody(".botAvatarSummaryFaceParts"),
    /grid-template-rows:\s*repeat\(2,\s*28px\);/,
  );
  assert.match(
    cssRuleBody(".botAvatarSummaryFacePart"),
    /place-items:\s*center;/,
  );
  assert.match(
    cssRuleBody(".botAvatarSummaryFacePartGlyph"),
    /font-size:\s*18px;/,
  );
});

test("default Prism bot card opens an avatar-only customizer path", () => {
  assert.match(pageSource, /\| "defaultCustomize"/);
  assert.match(
    pageSource,
    /const DEFAULT_PRISM_BOT_GLYPH: BotGlyphName = "triangle";/,
  );
  assert.match(
    pageSource,
    /const zenDefaultPrismGlyph = DEFAULT_PRISM_BOT_GLYPH;/,
  );
  assert.doesNotMatch(
    pageSource,
    /const zenDefaultPrismGlyph = useMemo<BotGlyphName>/,
  );
  assert.match(
    pageSource,
    /const zenDefaultPrismFaceStyle = useMemo<BotFaceStyle>/,
  );
  assert.match(pageSource, /defaultPrismGlyph\?: BotGlyphName;/);
  assert.match(pageSource, /defaultPrismFaceStyle\?: BotFaceStyle;/);
  assert.match(pageSource, /defaultPrismGlyph = DEFAULT_PRISM_BOT_GLYPH/);
  assert.match(
    pageSource,
    /bot && isBotGlyphName\(bot\.glyph\) \? bot\.glyph : defaultPrismGlyph/,
  );
  assert.match(pageSource, /defaultPrismFaceStyle \?\? DEFAULT_BOT_FACE_STYLE/);
  assert.match(pageSource, /userActionVisible \? "attentive" : "warm"/);
  assert.match(pageSource, /defaultPrismGlyph=\{zenDefaultPrismGlyph\}/);
  assert.match(
    pageSource,
    /defaultPrismFaceStyle=\{zenDefaultPrismFaceStyle\}/,
  );
  assert.match(pageSource, /function openDefaultBotCustomizer\(\): void/);
  assert.match(
    pageSource,
    /async function saveDefaultBot\(\): Promise<boolean>/,
  );
  assert.match(pageSource, /"\/api\/default-bot"/);
  assert.match(pageSource, /const seededName = "Default";/);
  assert.match(pageSource, /const rawStoredPrompt = "";/);
  assert.match(
    pageSource,
    /const seededColor = DEFAULT_PRISM_BOT_CUSTOMIZER_COLOR;/,
  );
  assert.match(pageSource, /const seededGlyph = DEFAULT_PRISM_BOT_GLYPH;/);
  assert.match(pageSource, /const hasDefaultBotAvatarChanges = editPristine/);
  assert.match(pageSource, /\? hasDefaultBotAvatarChanges/);
  assert.match(pageSource, /identityControlsVisible\?: boolean;/);
  assert.match(pageSource, /identityControlsVisible = true/);
  assert.match(pageSource, /identityControlsVisible=\{!editingDefaultBot\}/);
  assert.match(
    pageSource,
    /Default Prism identity is fixed; customize its face\./,
  );
  assert.match(
    pageSource,
    /faceControlTab === "face" && identityControlsVisible/,
  );
  assert.match(pageSource, /identitySection=\{/);
  assert.match(
    pageSource,
    /const defaultBotCardGlyph = DEFAULT_PRISM_BOT_GLYPH;/,
  );
  assert.match(pageSource, /const defaultBotCardStyle = undefined;/);
  assert.match(
    pageSource,
    /botPanelAdvancedEditorAvailable =\s*botPanelView === "create";/,
  );
  assert.match(pageSource, /!editingDefaultBot \? \(/);
  assert.match(pageSource, /onDoubleClick=\{openDefaultBotCustomizer\}/);
  assert.match(
    pageSource,
    /aria-label="Preview Prism; double-click to customize"/,
  );
  assert.match(
    pageSource,
    /<button type="button" onClick=\{openDefaultBotCustomizer\}>\s*Customize Prism\s*<\/button>/,
  );

  const openDefaultStart = pageSource.indexOf(
    "function openDefaultBotCustomizer(): void",
  );
  assert.notEqual(openDefaultStart, -1);
  const openDefaultEnd = pageSource.indexOf(
    "function openBotMarketplace(): void",
    openDefaultStart,
  );
  assert.notEqual(openDefaultEnd, -1);
  const openDefaultSource = pageSource.slice(openDefaultStart, openDefaultEnd);
  assert.doesNotMatch(openDefaultSource, /settings\.prismDefaultBotColor/);
  assert.doesNotMatch(openDefaultSource, /settings\.prismDefaultBotGlyph/);
  assert.match(openDefaultSource, /setBotAvatarCustomizerOpen\(true\);/);

  const avatarSummaryCardStart = pageSource.indexOf(
    "className={`${styles.botParameterCard} ${styles.botAvatarSummaryCard}`",
  );
  assert.notEqual(avatarSummaryCardStart, -1);
  const avatarSummaryGuardStart = pageSource.lastIndexOf(
    "{!editingDefaultBot ? (",
    avatarSummaryCardStart,
  );
  assert.notEqual(avatarSummaryGuardStart, -1);
  assert.ok(
    avatarSummaryCardStart - avatarSummaryGuardStart < 160,
    "Default Prism should skip the avatar summary card",
  );
  const avatarSummarySectionEnd = pageSource.indexOf(
    "</section>",
    avatarSummaryCardStart,
  );
  const avatarCustomizerMount = pageSource.indexOf(
    "<BotAvatarCustomizerModal",
    avatarSummaryCardStart,
  );
  assert.notEqual(avatarSummarySectionEnd, -1);
  assert.notEqual(avatarCustomizerMount, -1);
  assert.ok(
    avatarSummarySectionEnd < avatarCustomizerMount,
    "Avatar Studio mount should not live inside the summary card",
  );
  const avatarCustomizerMountSource = pageSource.slice(
    avatarCustomizerMount,
    avatarCustomizerMount + 2400,
  );
  assert.doesNotMatch(
    avatarCustomizerMountSource,
    /if \(editingDefaultBot\) closePanel\(\);/,
  );
  assert.doesNotMatch(avatarCustomizerMountSource, /closePanel\(\);/);

  const saveDefaultStart = pageSource.indexOf(
    "async function saveDefaultBot(): Promise<boolean>",
  );
  assert.notEqual(saveDefaultStart, -1);
  const saveDefaultEnd = pageSource.indexOf(
    "async function recoverMissingBotEditTarget",
    saveDefaultStart,
  );
  assert.notEqual(saveDefaultEnd, -1);
  const saveDefaultSource = pageSource.slice(saveDefaultStart, saveDefaultEnd);
  assert.doesNotMatch(saveDefaultSource, /color:\s*newBotColor/);
  assert.doesNotMatch(saveDefaultSource, /glyph:\s*newBotGlyph/);
  assert.match(saveDefaultSource, /faceEyesFont: newBotFaceEyesFont/);
  assert.match(
    saveDefaultSource,
    /faceMouthCharacter: newBotFaceMouthCharacter/,
  );
  assert.match(
    saveDefaultSource,
    /faceMouthRotationDeg: newBotFaceMouthRotationDeg/,
  );
  assert.match(
    saveDefaultSource,
    /faceMouthCoffeePucker: newBotFaceMouthCoffeePucker/,
  );
  assert.match(saveDefaultSource, /faceBlinkBar: newBotFaceBlinkBar/);
  assert.match(
    saveDefaultSource,
    /faceThinkingFrames: newBotFaceThinkingFrames/,
  );
  assert.match(saveDefaultSource, /prismDefaultBotColor: ""/);
  assert.match(saveDefaultSource, /prismDefaultBotGlyph: ""/);

  const defaultDirtyStart = pageSource.indexOf(
    "const hasDefaultBotAvatarChanges = editPristine",
  );
  assert.notEqual(defaultDirtyStart, -1);
  const defaultDirtyEnd = pageSource.indexOf(
    "const hasEditChanges = editPristine",
    defaultDirtyStart,
  );
  assert.notEqual(defaultDirtyEnd, -1);
  const defaultDirtySource = pageSource.slice(
    defaultDirtyStart,
    defaultDirtyEnd,
  );
  assert.doesNotMatch(defaultDirtySource, /newBotColor/);
  assert.doesNotMatch(defaultDirtySource, /newBotGlyph/);
  assert.match(defaultDirtySource, /newBotFaceMouthCharacter/);
  assert.match(defaultDirtySource, /newBotFaceMouthRotationDeg/);
  assert.match(defaultDirtySource, /newBotFaceMouthCoffeePucker/);

  const defaultBotRouteStart = apiServerSource.indexOf(
    'route("PATCH", "/api/default-bot"',
  );
  assert.notEqual(defaultBotRouteStart, -1);
  const defaultBotRouteEnd = apiServerSource.indexOf(
    'route("PATCH", "/api/settings"',
    defaultBotRouteStart,
  );
  assert.notEqual(defaultBotRouteEnd, -1);
  const defaultBotRouteSource = apiServerSource.slice(
    defaultBotRouteStart,
    defaultBotRouteEnd,
  );
  assert.doesNotMatch(defaultBotRouteSource, /body\.color/);
  assert.doesNotMatch(defaultBotRouteSource, /body\.glyph/);
  assert.match(defaultBotRouteSource, /prism_default_bot_color = NULL/);
  assert.match(defaultBotRouteSource, /prism_default_bot_glyph = NULL/);
  assert.match(
    defaultBotRouteSource,
    /prism_default_bot_face_mouth_character = \?/,
  );
  assert.match(
    defaultBotRouteSource,
    /prism_default_bot_face_mouth_rotation_deg = \?/,
  );
  assert.match(
    defaultBotRouteSource,
    /prism_default_bot_face_thinking_frames = \?/,
  );
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
  assert.match(
    backdropRule,
    /backdrop-filter:\s*blur\(12px\)\s*saturate\(112%\);/,
  );
  assert.match(modalRule, /position:\s*fixed;/);
  assert.match(
    modalRule,
    /left:\s*max\(var\(--bot-avatar-studio-inline-margin\),\s*calc\(\(100vw - 1480px\) \/ 2\)\)/,
  );
  assert.match(
    modalRule,
    /right:\s*max\(var\(--bot-avatar-studio-inline-margin\),\s*calc\(\(100vw - 1480px\) \/ 2\)\)/,
  );
  assert.match(modalRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(modalRule, /overflow:\s*hidden;/);
  assert.match(modalRule, /background:\s*#0d1017;/);
  assert.doesNotMatch(modalRule, /var\(--panel-width/);
  assert.match(modalBackingRule, /position:\s*absolute;/);
  assert.match(modalBackingRule, /inset:\s*0;/);
  assert.match(modalBackingRule, /background:/);
  assert.match(modalRailRule, /width:\s*3px;/);
  assert.match(
    cssSource,
    /\.botAvatarControlPanel\s*\{[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlStack\s*\{[\s\S]*overflow-y:\s*auto;/,
  );
  assert.doesNotMatch(backdropRule, /overflow-y:\s*auto;/);
  assert.match(cssRuleBody(".botAvatarControlStack"), /overflow-y:\s*auto;/);
  assert.doesNotMatch(
    cssRuleBody(".botAvatarControlStack"),
    /overflow:\s*hidden;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarCustomizer\s*>\s*\.botProfileBuilderHeader,\s*\.botAvatarCustomizerBody\s*\{[\s\S]*z-index:\s*1;/,
  );
});

test("avatar customizer uses a studio preview and grouped editor controls", () => {
  assert.match(pageSource, /<span>Avatar Studio<\/span>/);
  assert.match(pageSource, /function BotAvatarPreviewPanel\(/);
  assert.match(pageSource, /function BotAvatarIdentityControls\(/);
  assert.match(pageSource, /<span>Pronunciation[\s\S]*?onRandomizeNamePronunciation[\s\S]*?<\/span>/);
  assert.match(pageSource, /aria-label="Bot name pronunciation"/);
  assert.match(pageSource, /placeholder="How bots should say this name"/);
  assert.match(pageSource, /<span>Self-referral[\s\S]*?onRandomizeSelfReferral[\s\S]*?<\/span>/);
  assert.match(pageSource, /aria-label="Bot self-referral"/);
  assert.match(pageSource, /placeholder="How this bot refers to itself"/);
  assert.match(pageSource, /aria-label="Preview bot name pronunciation"/);
  assert.match(pageSource, /My name is \$\{trimmedName\}\./);
  const invalidChatDetailEffect = pageSource.slice(
    pageSource.indexOf('detail.id === "pending"'),
    pageSource.indexOf("useEffect(() =>", pageSource.indexOf('detail.id === "pending"')),
  );
  assert.doesNotMatch(
    invalidChatDetailEffect,
    /setNewBotNamePronunciation\(""\)/,
  );
  assert.match(
    pageSource,
    /onVoicePreview\(\s*audioVoiceProfile,\s*"english",\s*previewText/,
  );
  assert.match(pageSource, /function BotAvatarFaceControls\(/);
  assert.match(pageSource, /function BotAvatarSavePrompt\(/);
  assert.match(pageSource, /className=\{styles\.botAvatarPanelHeader\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarPreviewToolbar\}/);
  assert.doesNotMatch(pageSource, /className=\{styles\.botAvatarPreviewMeta\}/);
  assert.doesNotMatch(pageSource, /previewSummaryItems/);
  assert.match(pageSource, /className=\{styles\.botAvatarControlTabs\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarControlStack\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarCustomControls\}/);
  assert.doesNotMatch(pageSource, /botAvatarMotionControls/);
  assert.match(pageSource, /className=\{styles\.botAvatarPresetStrip\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarExpressionRow\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarFontOptions\}/);
  assert.match(
    pageSource,
    /className=\{`\$\{styles\.botAvatarCustomMotionRow\} \$\{styles\.botAvatarCustomMotionRowSingle\}`\}/,
  );
  assert.match(pageSource, /className=\{styles\.botAvatarSliderStack\}/);
  assert.doesNotMatch(
    pageSource,
    /className=\{styles\.botAvatarEyeScalePresetStrip\}/,
  );
  assert.match(pageSource, /className=\{styles\.botAvatarThinkingTiles\}/);
  assert.match(pageSource, /const BOT_AVATAR_THINKING_PRESETS = \[/);
  assert.match(
    pageSource,
    /id: "spark", label: "Spark", frames: \["◰", "◳", "◲", "◱"\]/,
  );
  assert.match(
    pageSource,
    /id: "mood", label: "Mood", frames: \["▖", "▘", "▝", "▗"\]/,
  );
  assert.doesNotMatch(pageSource, /Random thinking preset/);
  assert.doesNotMatch(pageSource, /randomThinkingPreset/);
  assert.match(
    pageSource,
    /role="tablist"[\s\S]*aria-label="Avatar control sections"/,
  );
  assert.match(
    pageSource,
    /const BOT_AVATAR_CUSTOMIZER_TABS = \[\s*\{ value: "face", label: "Identity" \},\s*\{ value: "profile", label: "Profile" \},\s*\{ value: "powers", label: "Powers" \},\s*\{ value: "eyes", label: "Eyes" \},\s*\{ value: "mouth", label: "Mouth" \},\s*\{ value: "voice", label: "Voice" \},\s*\{ value: "sfx", label: "SFX" \},\s*\{ value: "settings", label: "Settings" \},\s*\{ value: "details", label: "Details" \}/,
  );
  assert.match(
    pageSource,
    /activeControlTab === "profile" && identityControlsVisible/,
  );
  assert.match(pageSource, /aria-label="Bot profile editor mode"/);
  assert.match(pageSource, /onProfilePageOpen\(category\)/);
  assert.match(
    pageSource,
    /profileEditorLayer=\{\s*!editingDefaultBot\s*\?\s*\(/,
  );
  assert.match(
    pageSource,
    /data-avatar-studio-layer=\{studioLayer \? "true" : undefined\}/,
  );
  assert.match(cssSource, /\.botAvatarProfilePanel/);
  assert.match(
    cssSource,
    /\.botProfileBuilderBackdrop\[data-avatar-studio-layer="true"\]/,
  );
  assert.match(pageSource, /activeControlTab === "voice"/);
  assert.match(pageSource, /activeControlTab === "sfx"/);
  assert.match(pageSource, /<BotVoiceCharacterEditor/);
  assert.match(pageSource, /<BotAvatarSfxEditor/);
  assert.match(pageSource, /Play while talking/);
  assert.match(pageSource, /Play while not talking/);
  assert.match(pageSource, /Play while thinking/);
  assert.match(pageSource, /data-bot-avatar-sfx-runtime="true"/);
  assert.match(pageSource, /avatarSfxState=\{previewMode\}/);
  assert.match(pageSource, /\/api\/avatar\/sfx\/generate/);
  assert.match(pageSource, /data-tab-count=\{visibleAvatarTabs\.length\}/);
  assert.doesNotMatch(cssSource, /data-tab-count="10"/);
  assert.match(
    pageSource,
    /activeControlTab === "settings" && identityControlsVisible/,
  );
  assert.match(
    pageSource,
    /activeControlTab === "powers" && identityControlsVisible/,
  );
  assert.match(
    pageSource,
    /<BotPowersEditor[\s\S]*?powers=\{newBotPowers\}[\s\S]*?onCompile=\{compileBotPowersForEditor\}/,
  );
  assert.match(pageSource, /What makes this bot special\?/u);
  assert.match(pageSource, /Create Power/u);
  assert.match(pageSource, /Reroll sigil/u);
  assert.match(pageSource, /Pop Power\?/u);
  assert.match(pageSource, /\/api\/bot-powers\/compile/);
  assert.match(cssSource, /\.botPowersPanel/);
  assert.match(
    cssSource,
    /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.doesNotMatch(pageSource, /Generation Lens|Browse Lenses|LensTile/);
  assert.match(
    pageSource,
    /resetLabel=\{\s*isDefaultPrismBot\s*\?\s*"Reset voice"\s*:\s*"Restore original voice"\s*\}/,
  );
  assert.match(pageSource, /setPreviewMode\("talking"\)/);
  assert.match(pageSource, /const avatarControlTabsVisible = true;/);
  assert.match(pageSource, /visibleAvatarTabs\.map\(\(tab\) =>/);
  assert.match(pageSource, /BOT_AVATAR_FACE_CONTROL_TABS\.includes\(/);
  assert.match(pageSource, /const BOT_AVATAR_FACE_CONTROL_TABS = \[/);
  assert.match(
    pageSource,
    /\? "Face"\s*: activeTab === "eyes"\s*\? "Eyes"\s*: "Mouth"/,
  );
  assert.match(pageSource, /Presets and thinking/);
  assert.match(pageSource, /Name, badge, presets, and thinking/);
  assert.match(pageSource, /Built-in style and stroke weight/);
  assert.match(pageSource, /Custom glyph and stroke weight/);
  assert.doesNotMatch(pageSource, /Blink, mouth, and thinking animation/);
  assert.match(pageSource, /type BotAvatarCustomizerTab =/);
  assert.match(pageSource, /\| "profile"/);
  assert.match(pageSource, /\| "powers"/);
  assert.match(pageSource, /\| "settings"/);
  assert.match(pageSource, /\| "details"/);
  assert.match(pageSource, /useState<BotAvatarCustomizerTab>\(initialTab\)/);
  assert.match(pageSource, /setActiveControlTab\(initialTab\)/);
  assert.match(pageSource, /ref=\{controlStackRef\}/);
  assert.match(
    pageSource,
    /useLayoutEffect\(\(\) => \{\s*if \(!open \|\| !controlStackRef\.current\) return;\s*controlStackRef\.current\.scrollTop = 0;\s*\}, \[activeControlTab, open\]\);/,
  );
  assert.match(pageSource, /aria-label=\{controlLabel\}/);
  assert.match(pageSource, /<Sparkles size=\{16\}/);
  assert.doesNotMatch(pageSource, /<Timer size=\{16\}/);
  assert.match(pageSource, /const previewWeightSummary =/);
  assert.doesNotMatch(pageSource, /const previewFaceSummary =/);
  assert.doesNotMatch(pageSource, /botAvatarFeaturePositionSummary/);
  assert.match(pageSource, /const BOT_AVATAR_FACE_PRESETS = \[/);
  assert.match(pageSource, /Classic/);
  assert.match(pageSource, /Doto/);
  assert.match(pageSource, /Bouncy/);
  assert.match(pageSource, /Reset face/);
  assert.doesNotMatch(pageSource, /BOT_AVATAR_SCREEN_MASK_BLEND_MODES/);
  assert.doesNotMatch(pageSource, /Screen mask blend mode/);

  assert.match(
    cssSource,
    /\.botAvatarControlGroup\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(cssSource, /\.botAvatarControlGroup::before\s*\{/);
  assert.match(
    cssSource,
    /\.botAvatarControlGroup\[data-avatar-control-tab="eyes"\]/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlGroup\[data-avatar-control-tab="mouth"\]/,
  );
  assert.match(cssSource, /\.botAvatarControlTabs\s*\{/);
  assert.match(
    cssRuleBody(".botAvatarControlTabs"),
    /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlGroupHeader\s*\{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\) auto;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarPresetStrip\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(cssRuleBody(".botAvatarControlStack"), /overflow-y:\s*auto;/);
  assert.match(
    cssRuleBody(".botAvatarOverrideGrid"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthCustomRow"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(132px,\s*148px\);/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthRotationBody"),
    /place-items:\s*center;/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthRotationGlyphText"),
    /inline-size:\s*max-content;/,
  );
  assert.match(
    cssRuleBody(".botAvatarMouthRotationGlyphText"),
    /min-inline-size:\s*1em;/,
  );
  assert.doesNotMatch(cssSource, /\.botAvatarMouthRotationBody input/);
  assert.match(cssRuleBody(".botAvatarControlGroup::before"), /width:\s*3px;/);
  assert.doesNotMatch(cssSource, /\.botAvatarPreviewMeta/);
  assert.match(
    cssSource,
    /\.botAvatarThinkingPresetStrip\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(54px,\s*1fr\)\);/,
  );
  assert.match(
    cssSource,
    /\.botAvatarPreviewModeToggle\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(cssSource, /\.botAvatarSectionResetButton/);
  assert.match(cssSource, /\.botAvatarRangeControl/);
  assert.match(
    cssRuleBody(".colorGlyphInline"),
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    cssRuleBody(
      ".colorGlyphInline .colorSquare,\n.colorGlyphInline .glyphGridShell",
    ),
    /height:\s*100%;/,
  );
  assert.match(
    cssRuleBody(
      ".colorGlyphInline .colorSquare,\n.colorGlyphInline .glyphGridShell",
    ),
    /min-height:\s*150px;/,
  );
  assert.match(
    cssRuleBody(".botAvatarFaceControls"),
    /grid-template-rows:\s*auto auto auto auto;/,
  );
  assert.match(
    cssRuleBody(".botAvatarIdentityPicker"),
    /height:\s*clamp\(165px,\s*22dvh,\s*260px\);/,
  );
  assert.match(
    cssRuleBody(".botAvatarIdentityPronunciationRow"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/,
  );
  assert.match(cssRuleBody(".botAvatarIdentityNameSampleButton"), /height:\s*36px;/);
  assert.match(cssRuleBody(".glyphGridScroll"), /overflow-y:\s*auto;/);

  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /background-size:\s*34px 34px,\s*34px 34px,\s*auto;/);
  assert.doesNotMatch(stageRule, /radial-gradient/);
});

test("bot creation, customization, and settings open directly in Avatar Studio", () => {
  const createStart = pageSource.indexOf("function openNewBotCreator(): void");
  const createEnd = pageSource.indexOf(
    "function openFreshBotCustomizer",
    createStart,
  );
  assert.notEqual(createStart, -1);
  assert.notEqual(createEnd, -1);
  const createSource = pageSource.slice(createStart, createEnd);
  assert.match(createSource, /resetBotForm\(\);/);
  assert.match(createSource, /setBotAvatarCustomizerOpen\(true\);/);
  assert.match(
    pageSource,
    /botProfileCompletionCount\(botProfile\) === 0\s*\? ""\s*:\s*serializeStoredBotPrompt\(botProfile, createdBotName\)/,
  );

  const openStart = pageSource.indexOf("function openBotCustomizer(");
  const openEnd = pageSource.indexOf(
    "function openBotSettings(bot: Bot)",
    openStart,
  );
  assert.notEqual(openStart, -1);
  assert.notEqual(openEnd, -1);
  const openSource = pageSource.slice(openStart, openEnd);
  assert.match(openSource, /startEditBot\(bot\);/);
  assert.match(openSource, /setBotPanelView\("botHub"\);/);
  assert.match(openSource, /setBotAvatarCustomizerInitialTab\(initialTab\);/);
  assert.match(openSource, /setBotAvatarCustomizerOpen\(true\);/);

  const settingsStart = pageSource.indexOf(
    "function openBotSettings(bot: Bot)",
  );
  const settingsEnd = pageSource.indexOf(
    "function exitBotEditorToLibrary",
    settingsStart,
  );
  assert.notEqual(settingsStart, -1);
  assert.notEqual(settingsEnd, -1);
  const settingsSource = pageSource.slice(settingsStart, settingsEnd);
  assert.match(settingsSource, /openBotCustomizer\(bot, "settings"\);/);
  assert.doesNotMatch(settingsSource, /setBotPanelView\(/);

  assert.doesNotMatch(pageSource, /\| "customize"/);
  assert.doesNotMatch(pageSource, /\| "settings";/);
  assert.match(pageSource, /initialTab=\{botAvatarCustomizerInitialTab\}/);

  const closeStart = pageSource.indexOf(
    "function closeBotAvatarStudioFlow(): void",
  );
  const closeEnd = pageSource.indexOf(
    "function openBotCustomizerFacts",
    closeStart,
  );
  assert.notEqual(closeStart, -1);
  assert.notEqual(closeEnd, -1);
  const closeSource = pageSource.slice(closeStart, closeEnd);
  assert.match(closeSource, /closeBotAvatarCustomizer\(\);/);
  assert.match(
    closeSource,
    /if \(editingBotId\) \{[\s\S]*?exitBotEditorToLibrary\(\);/,
  );
  assert.match(
    closeSource,
    /if \(botPanelView === "defaultCustomize"\) \{[\s\S]*?setBotPanelView\("home"\);/,
  );
  assert.match(
    closeSource,
    /if \(botPanelView === "create"\) \{[\s\S]*?resetBotForm\(\);[\s\S]*?setBotPanelView\("home"\);/,
  );

  assert.match(pageSource, /<strong>Avatar Studio<\/strong>/);
  assert.match(
    pageSource,
    /\{botPanelCreateMode && !botAvatarCustomizerOpen \? \(/,
  );
});

test("personality randomization is scoped away from identity and settings", () => {
  const start = pageSource.indexOf("function applyRandomBotPersonalityDraft()");
  const end = pageSource.indexOf("const resetBotForm", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const helperSource = pageSource.slice(start, end);
  assert.match(helperSource, /setBotProfile\(\(current\) => \(\{/);
  assert.match(helperSource, /\.\.\.current,\s*core: profile\.core,/);
  assert.doesNotMatch(helperSource, /setNewBotName/);
  assert.doesNotMatch(helperSource, /setNewBotColor/);
  assert.doesNotMatch(helperSource, /setNewBotAudioVoiceProfile/);
  assert.doesNotMatch(helperSource, /setNewBotOnlineEnabled/);
  assert.doesNotMatch(helperSource, /setNewBotLocalModel/);
  assert.match(pageSource, /aria-label="Randomize personality"/);
});

test("avatar preview theme keeps persona ink on normalized color without Prism rainbow aura", () => {
  assert.match(
    pageSource,
    /const \[previewTheme, setPreviewTheme\]\s*=\s*useState<"light" \| "dark">\(\s*resolvedTheme\s*,?\s*\)/,
  );
  assert.match(pageSource, /setPreviewTheme\(resolvedTheme\)/);
  assert.match(
    pageSource,
    /function botAvatarPreviewIdentityStyle\(\s*rawHex: string\s*,\s*prismPersona = false\s*,?\s*\): CSSProperties/,
  );
  assert.match(pageSource, /if \(prismPersona\) return \{\};/);
  assert.match(
    pageSource,
    /const accentStyle = botAccentStyle\(rawHex, "dark"\) \?\? \{\};/,
  );
  assert.match(
    pageSource,
    /const BOT_AVATAR_CUSTOMIZER_BODY_PLACEMENT: ZenLiveBotBodyPlacement = \{\s*xPct: 50,\s*yPct: 50,\s*\};/,
  );
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_AVATAR_SIZE_PX = 330;/);
  assert.match(pageSource, /const BOT_AVATAR_CUSTOMIZER_BODY_SIZE_PX = 300;/);
  assert.doesNotMatch(pageSource, /BOT_AVATAR_CUSTOMIZER_FACE_GLYPH_SIZE_REM/);
  assert.match(
    pageSource,
    /\["--zen-live-bot-face-phosphor-ink" as string\]: "#ffffff"/,
  );
  assert.match(
    pageSource,
    /\["--zen-live-bot-face-ink" as string\]: "var\(--coffee-bot-color\)"/,
  );
  assert.match(
    pageSource,
    /\["--zen-live-bot-glyph-ink" as string\]: "var\(--zen-live-bot-face-phosphor-ink\)"/,
  );
  assert.match(
    pageSource,
    /\.\.\.botAvatarPreviewIdentityStyle\(color, isDefaultPrismBot\)/,
  );
  assert.doesNotMatch(
    pageSource,
    /\.\.\.botAccentStyle\(color, previewTheme\)/,
  );
  assert.match(pageSource, /isDefaultPrismBot\?: boolean;/);
  assert.match(pageSource, /isDefaultPrismBot = false/);
  assert.match(pageSource, /isDefaultPrismBot=\{editingDefaultBot\}/);
  assert.match(
    pageSource,
    /data-source=\{isDefaultPrismBot \? "prism" : "persona"\}/,
  );
  assert.match(
    pageSource,
    /data-prism-persona=\{isDefaultPrismBot \? "true" : undefined\}/,
  );
  assert.match(pageSource, /data-preview-theme=\{previewTheme\}/);
  assert.match(pageSource, /data-avatar-preview-theme=\{previewTheme\}/);
  assert.match(pageSource, /data-theme=\{previewTheme\}/);
  assert.match(
    pageSource,
    /"--bot-face-crt-screen-texture-blend-mode":\s*previewTheme === "light" \? "overlay" : "luminosity"/,
  );
  assert.match(pageSource, /resolvedTheme=\{resolvedTheme\}/);
  assert.match(pageSource, /onPreviewThemeChange\("light"\)/);
  assert.match(pageSource, /onPreviewThemeChange\("dark"\)/);
  assert.match(cssSource, /\.botAvatarPreviewThemeToggle/);
  assert.match(
    cssSource,
    /\.botAvatarMannequinStage\[data-preview-theme="light"\]/,
  );
  assert.match(cssRuleBody(".botFaceCrtNoiseLayer"), /180px 180px/);
  assert.doesNotMatch(
    cssRuleBody(".botFaceCrtNoiseLayer"),
    /118px 92px|148px 112px/,
  );
  assert.match(
    pageSource,
    /"--zen-live-bot-avatar-size": `\$\{BOT_AVATAR_CUSTOMIZER_AVATAR_SIZE_PX\}px`/,
  );
  assert.doesNotMatch(pageSource, /"--zen-live-bot-avatar-face-glyph-size":/);
  const livePlateRule = cssRuleBody(".zenLiveBotPresencePlate");
  assert.match(
    livePlateRule,
    /--zen-live-bot-face-phosphor-ink:\s*#ffffff\s*;/,
  );
  assert.match(
    livePlateRule,
    /--zen-live-bot-face-ink:\s*var\(--coffee-bot-color\)\s*;/,
  );
  assert.match(
    livePlateRule,
    /--zen-live-bot-glyph-ink:\s*var\(--zen-live-bot-face-phosphor-ink\)\s*;/,
  );
  assert.match(
    livePlateRule,
    /--zen-presence-face-ink:\s*var\(--coffee-bot-color\)\s*;/,
  );
  const prismPlateRule = cssRuleBody(
    '.zenLiveBotPresencePlate[data-prism-persona="true"]',
  );
  assert.match(
    prismPlateRule,
    /--zen-live-bot-face-phosphor-ink:\s*#ffffff\s*;/,
  );
  assert.match(
    prismPlateRule,
    /--zen-live-bot-face-crt-border-color:\s*#ffffff\s*;/,
  );
  assert.match(prismPlateRule, /--zen-live-bot-face-ink:\s*#ffffff\s*;/);
  assert.match(prismPlateRule, /--zen-live-bot-glyph-ink:\s*#ffffff\s*;/);
  assert.match(prismPlateRule, /--zen-presence-face-ink:\s*#ffffff\s*;/);
  assert.match(
    cssRuleBody(".themeLight.coffeeShell .coffeeSeatPlateEmoji"),
    /color:\s*var\(--coffee-bot-color\)\s*;/,
  );
  assert.match(
    cssRuleBody(
      ".themeLight.coffeeShell .coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph",
    ),
    /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\)\s*;/,
  );
  const faceGlyphRule =
    cssSource.match(
      /^\.zenLiveBotPresenceFaceGlyph\s*\{([\s\S]*?)\n\}/m,
    )?.[1] ?? "";
  assert.match(
    faceGlyphRule,
    /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\);/,
  );
  const coffeeFaceColorIndex = cssSource.indexOf(
    ".coffeeSeatPlateEmoji {\n  --coffee-face-eye-track",
  );
  assert.notEqual(coffeeFaceColorIndex, -1);
  const zenFaceOverrideIndex = cssSource.lastIndexOf(
    ".coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph",
  );
  assert.ok(zenFaceOverrideIndex > coffeeFaceColorIndex);
  assert.match(
    cssSource.slice(zenFaceOverrideIndex, zenFaceOverrideIndex + 180),
    /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\)\s*;/,
  );
  assert.match(
    cssRuleBody(".zenLiveBotPresenceBotGlyph"),
    /--zen-live-bot-glyph-ink/,
  );
  const previewFaceRule = cssRuleBody(
    '.zenLiveBotPresencePlate[data-avatar-customizer-preview="true"] .zenLiveBotPresenceFaceGlyph',
  );
  assert.match(previewFaceRule, /text-shadow:/);
  assert.doesNotMatch(previewFaceRule, /var\(--coffee-bot-color\)/);
  assert.doesNotMatch(
    cssSource,
    /\.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s+\.zenLiveBotPresenceFaceGlyph::before/,
  );
  const previewPlateRule = cssRuleBody(
    '.botAvatarMannequinStage .zenLiveBotPresencePlate[data-avatar-customizer-preview="true"]',
  );
  assert.match(previewPlateRule, /transform:\s*scale\(1\)\s*;/);
  assert.match(
    normalizedCssSource,
    /\.botAvatarMannequinStage \.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s*\{[\s\S]*transform:\s*translateY\(-8px\) scale\(1\.16\);/,
  );
  assert.doesNotMatch(previewPlateRule, /scale\(1\.28\)/);
  const previewBodyRule = cssRuleBody(
    ".botAvatarMannequinStage .zenLiveBotPresenceBody",
  );
  assert.match(previewBodyRule, /pointer-events:\s*auto\s*;/);
  assert.match(
    previewBodyRule,
    /--zen-live-bot-avatar-buckle-glyph-size:\s*clamp\(18px,\s*calc\(var\(--zen-live-bot-body-frame-size\) \* 0\.145\),\s*48px\)\s*;/,
  );
  assert.match(
    previewBodyRule,
    /--zen-live-bot-body-glyph-size:\s*var\(--zen-live-bot-avatar-buckle-glyph-size\)\s*;/,
  );
  assert.doesNotMatch(previewBodyRule, /--zen-live-bot-body-glyph-height/);
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarMannequinStage\s+\.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s+\.zenLiveBotPresenceBody\s*\{[\s\S]*--zen-live-bot-avatar-face-glyph-size/,
  );
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarMannequinStage\s+\.zenLiveBotPresencePlate\[data-avatar-customizer-preview="true"\]\s+\.zenLiveBotPresenceBotGlyph\s*\{[\s\S]*height:\s*var\(--zen-live-bot-body-glyph-size\)/,
  );
  const previewTorsoGlyphRule = cssRuleBody(
    ".botAvatarMannequinStage .zenLiveBotPresenceBotGlyph",
  );
  assert.match(
    previewTorsoGlyphRule,
    /width:\s*var\(--zen-live-bot-body-glyph-render-size\)\s*;/,
  );
  assert.match(
    previewTorsoGlyphRule,
    /height:\s*var\(--zen-live-bot-body-glyph-render-size\)\s*;/,
  );
});

test("avatar customizer preview uses tightened studio framing", () => {
  const stageRule = cssRuleBody(".botAvatarMannequinStage");
  assert.match(stageRule, /min-height:\s*0\s*;/);
  assert.match(stageRule, /height:\s*100%\s*;/);
  assert.match(stageRule, /padding:\s*24px\s*;/);
  assert.match(stageRule, /overflow:\s*visible\s*;/);
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarMannequinStage\s*\{[\s\S]*min-height:\s*clamp\(500px,\s*calc\(100dvh - 318px\),\s*620px\);/,
  );
  assert.match(
    cssSource,
    /\.botAvatarMannequinStage\s*\{[\s\S]*padding:\s*18px;/,
  );
});

test("avatar customizer preview has explicit expression states", () => {
  assert.match(
    pageSource,
    /const \[previewMode, setPreviewMode\] = useState<BotAvatarPreviewMode>\("idle"\)/,
  );
  assert.match(
    pageSource,
    /const \[previewMoodIndex, setPreviewMoodIndex\] = useState\(0\);/,
  );
  assert.match(
    pageSource,
    /type BotAvatarPreviewMode = "idle" \| "blink" \| "talking" \| "thinking";/,
  );
  assert.match(pageSource, /const BOT_AVATAR_PREVIEW_MODES = \[/);
  assert.match(pageSource, /const BOT_AVATAR_PREVIEW_MOODS = \[/);
  assert.match(
    pageSource,
    /mode\.value === "talking"[\s\S]*?voiceModeDisplayName\(voiceChoice\)[\s\S]*?: mode\.label/,
  );
  assert.match(
    pageSource,
    /<BotAvatarPreviewPanel[\s\S]*?voiceChoice=\{voicePlaybackChoice\([\s\S]*?voiceMode[\s\S]*?englishVoiceEngine/,
  );
  assert.match(
    pageSource,
    /const previewTalking = previewMode === "talking" && !previewSpeechPaused;/,
  );
  assert.match(pageSource, /buildSpeechActivityWindows\(/);
  assert.match(pageSource, /setPreviewSpeechPaused\(/);
  assert.match(pageSource, /const previewBlink = previewMode === "blink";/);
  assert.doesNotMatch(pageSource, /previewHovered/);
  assert.doesNotMatch(pageSource, /onPreviewHoveredChange/);
  assert.match(pageSource, /blinkWhileTalking/);
  assert.match(
    pageSource,
    /if \(!open \|\| !previewTalking\) \{\s*setMouthPhase\(0\);\s*return;\s*\}/,
  );
  assert.match(pageSource, /\}, \[open, previewTalking\]\);/);
  assert.match(
    pageSource,
    /data-talking=\{previewTalking \? "true" : undefined\}/,
  );
  assert.match(pageSource, /data-mood=\{previewMoodHint\}/);
  assert.match(pageSource, /data-prism-mood=\{previewMood\}/);
  assert.match(pageSource, /data-avatar-preview-mood=\{previewMood\}/);
  assert.match(
    pageSource,
    /data-mouth-shape=\{\s*previewTalking\s*\?\s*displayedPreviewMouthShape\s*:\s*undefined\s*\}/,
  );
  assert.match(pageSource, /data-avatar-preview-mode=\{previewMode\}/);
  assert.match(pageSource, /onPreviewModeChange=\{setPreviewMode\}/);
  assert.match(
    pageSource,
    /mode\.value === "talking"\s*\? onPreviewVoice\(\)\s*: onPreviewModeChange\(mode\.value\)/,
  );
  assert.match(
    pageSource,
    /const previewAvatarGlobalVoice = async \(\): Promise<void> => \{[\s\S]*?resolveVoicePreviewText\(\)[\s\S]*?playAvatarVoicePreview\(audioVoiceProfile, voiceMode, previewText/,
  );
  assert.match(
    pageSource,
    /const playAvatarVoicePreview = async \([\s\S]*?await onVoicePreview\(profile, forcedMode, previewText,[\s\S]*?setPreviewMode\("talking"\)/,
  );
  assert.match(
    pageSource,
    /onPreviewVoice=\{\(\) => void previewAvatarGlobalVoice\(\)\}/,
  );
  assert.match(pageSource, /onPreview=\{playAvatarVoicePreview\}/);
  assert.match(pageSource, /onPreviewMoodCycle=\{\(\) =>/);
  assert.match(
    pageSource,
    /setPreviewMoodIndex\(\s*\(current\) => \(current \+ 1\) % BOT_AVATAR_PREVIEW_MOODS\.length\s*,?\s*\)/,
  );
  assert.match(pageSource, /className=\{styles\.botAvatarMoodPreviewButton\}/);
  assert.match(pageSource, /isTalking=\{previewTalking\}/);
  assert.match(
    pageSource,
    /blinkWhileTalking\s+mouthShape=\{displayedPreviewMouthShape\}/,
  );
  assert.match(
    pageSource,
    /forceBlinkPhase=\{previewBlink \? "closed" : undefined\}/,
  );
  assert.match(
    pageSource,
    /const previewThinkingSpinnerActive =\s+previewThinking &&\s+!botFaceThinkingSpinnerDisabled\(faceStyle\.thinkingFrames\);/,
  );
  assert.match(
    pageSource,
    /motionActive=\{!previewTalking && !previewThinkingSpinnerActive\}/,
  );
  assert.match(
    pageSource,
    /showThinkingSpinner=\{previewThinkingSpinnerActive\}/,
  );
  assert.doesNotMatch(
    cssSource,
    /\[data-avatar-preview-mode="blink"\][\s\S]{0,240}--eye-blink-scale-y:/,
  );
  assert.doesNotMatch(pageSource, /data-talking="true"/);
  assert.doesNotMatch(
    pageSource,
    /\s+isTalking\s+mouthShape=\{previewMouthShape\}/,
  );
});

test("identity color/glyph popover is never trapped by studio panel chrome", () => {
  // The ColorGlyphPicker popover positions itself with viewport-space
  // `position: fixed` coordinates (see popoverAnchor in page.tsx). Per the
  // CSS Filter Effects spec, ANY ancestor with `filter`/`backdrop-filter`
  // (and per css-transforms, `transform`/`perspective`/`will-change`)
  // becomes the containing block for fixed descendants — which re-anchors
  // those viewport coordinates to the ancestor and lets the control
  // panel's `overflow: hidden` swallow the popover entirely. This is the
  // bug where the Identity tab's glyph/color options were invisible.
  // Every class below is in the popover's ancestor chain inside the
  // studio; none of their rules may declare a containing-block trap.
  const popoverAncestorChain = [
    ".botAvatarControlPanel",
    ".botAvatarMannequinPanel", // shares panel chrome rules with the control panel
    ".botAvatarControlStack",
    ".botAvatarControlGroup",
    ".botAvatarIdentityPicker",
    ".colorPickerWrapper",
  ];
  const containingBlockTrap =
    /backdrop-filter|(?<![-\w])filter\s*:|(?<![-\w])transform\s*:|will-change|perspective\s*:/;
  for (const selector of popoverAncestorChain) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    // Match any rule whose selector list mentions the class exactly
    // (not as a prefix of a longer class name, e.g. ControlGroupHeader).
    const rulePattern = new RegExp(
      `[^{}]*${escaped}(?![\\w-])[^{}]*\\{[^}]*\\}`,
      "g",
    );
    let seen = 0;
    for (const match of cssSource.matchAll(rulePattern)) {
      seen += 1;
      // Comments may (and do) mention the banned properties by name to
      // document this very constraint — only declarations count.
      const withoutComments = match[0].replace(/\/\*[\s\S]*?\*\//g, "");
      assert.doesNotMatch(
        withoutComments,
        containingBlockTrap,
        `${selector} rule creates a containing block that traps the fixed-position color/glyph popover`,
      );
    }
    assert.ok(
      seen > 0,
      `Expected at least one CSS rule mentioning ${selector}`,
    );
  }
  // The popover itself must stay viewport-fixed so the JS anchor math holds.
  const popoverRule =
    cssSource.match(/^\.colorGlyphPopover\s*\{([\s\S]*?)\n\}/m)?.[1] ?? "";
  assert.match(popoverRule, /position:\s*fixed;/);
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
  assert.match(
    cssSource,
    /@media\s*\(max-width:\s*1279px\)[\s\S]*\.desktopViewportNotice\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    cssSource,
    /@media\s*\(max-width:\s*1279px\)[\s\S]*\.desktopViewportNotice\s*\{[\s\S]*inset:\s*0;/,
  );
});

test("Powers read as an app-wide bot trait across active surfaces", () => {
  assert.match(pageSource, /Describe the magic or hard rule\. PRISM names it and makes it real\./u);
  assert.doesNotMatch(pageSource, /apply only during Coffee sessions/u);
  assert.match(
    pageSource,
    /<BotPowerNameplateIndicator powers=\{selectedBot\.powers\} \/>/u,
  );
  assert.match(
    pageSource,
    /<BotPowerNameplateIndicator[\s\S]{0,120}powers=\{bot\.powers\}[\s\S]{0,120}resolved=\{coffeePowerPlan\?\.bots\[bot\.id\] \?\? null\}/u,
  );
  assert.doesNotMatch(pageSource, /<BotPowerBadge/u);
  assert.match(pageSource, /botPowerCupRateMultiplierForBotV1/u);
  assert.match(
    pageSource,
    /const coffeeCupRefused = coffeeCupPowerRateMultiplier === 0/u,
  );
  assert.match(
    pageSource,
    /coffeeCupRefused \|\| refillSipLocked \|\| seatIsThinking/u,
  );
  assert.match(pageSource, /<strong>Holder:<\/strong>/u);
  assert.match(pageSource, /<strong>Others:<\/strong>/u);
});

test("Power indicators stay unboxed inside glyph-bearing nameplates", () => {
  assert.equal(
    [...pageSource.matchAll(/<BotPowerNameplateIndicator\b/gu)].length,
    2,
  );
  assert.match(
    pageSource,
    /styles\.composeBotTriggerGlyph[\s\S]{0,240}<BotPowerNameplateIndicator powers=\{selectedBot\.powers\}/u,
  );
  assert.match(
    pageSource,
    /className=\{styles\.coffeeSeatGlowPill\}[\s\S]{0,180}<BotPowerNameplateIndicator[\s\S]{0,180}<span className=\{styles\.coffeeSeatGlowGlyph\}/u,
  );
  assert.doesNotMatch(
    pageSource,
    /styles\.botMarketplaceCardGlyph[\s\S]{0,180}<BotPowerNameplateIndicator/u,
  );
  assert.doesNotMatch(
    pageSource,
    /className=\{styles\.storyBotGlyph\}[\s\S]{0,120}<BotPowerNameplateIndicator/u,
  );
  assert.doesNotMatch(
    pageSource,
    /className=\{styles\.coffeeMessageBotLabel\}[\s\S]{0,180}<BotPowerNameplateIndicator/u,
  );
  assert.doesNotMatch(pageSource, /powerCount=|botPowerSurfaceBadge/u);
  assert.doesNotMatch(cssSource, /botPowerSurfaceBadge|botPowerSurfacePopover/u);
  assert.match(
    cssSource,
    /\.botPowerNameplateIndicator\s*\{[\s\S]{0,220}opacity:\s*0\.68/u,
  );
  assert.match(
    cssSource,
    /\.coffeeSeatGlowPill:has\(> \.botPowerNameplateIndicator\)[\s\S]{0,180}grid-template-columns/u,
  );
  assert.doesNotMatch(
    cssSource,
    /\.coffeeSeatGlowPill > \.botPowerNameplateIndicator\s*\{[^}]*position:\s*absolute/u,
  );
});
