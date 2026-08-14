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
const modeTutorialSource = readFileSync(
  resolve(appDir, "modeTutorials.ts"),
  "utf8",
).replace(/\s+/gu, " ");
const adjustmentPadSource = readFileSync(
  resolve(appDir, "AdjustmentPad.tsx"),
  "utf8",
).replace(/\s+/gu, " ");
const adjustmentPadCssSource = readFileSync(
  resolve(appDir, "AdjustmentPad.module.css"),
  "utf8",
);
const botAvatarSfxSource = readFileSync(
  resolve(appDir, "botAvatarSfx.ts"),
  "utf8",
);
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

test("Avatar Studio keeps a draft-driven mini preview visible with authored eye states", () => {
  const miniPreview = pageSource.match(
    /data-avatar-studio-mini-preview="true"([\s\S]*?)\{foundryCameraEditable \? \(/,
  );
  assert.ok(miniPreview, "Expected the Avatar Studio mini preview block");
  const miniSource = miniPreview[0];

  assert.match(
    pageSource,
    /!foundryRitual \? \(\s*<div[\s\S]{0,100}className=\{styles\.botAvatarStudioMiniPreview\}/,
  );
  assert.match(miniSource, /data-avatar-studio-mini-eye-state=/);
  assert.match(miniSource, /<ChatMiniBotAvatar\s+size="room"/);
  assert.match(miniSource, /color=\{miniAccentColor\}/);
  assert.match(miniSource, /botFrameMetalAlloyColor\(voicePreset\)/);
  assert.match(
    miniSource,
    /forceBlinkPhase=\{previewBlink \? "closed" : "open"\}/,
  );
  assert.match(miniSource, /<BotAvatarMicroRenderer/);
  assert.match(miniSource, /avatarDetails=\{miniAvatarDetails\}/);
  assert.match(
    pageSource,
    /function BotAvatarMicroRenderer[\s\S]{0,3600}<CoffeeSeatPlateEmoji[\s\S]{0,100}\bpixelated\b/u,
  );
  assert.match(miniSource, /motionMode="mini-led"/);
  assert.match(miniSource, /\bhardPixels\b/);
  assert.match(miniSource, /faceEyeMovement="still"/);
  assert.match(
    miniSource,
    /faceEyeRotationDeg=\{\s*faceStyle\.eyeRotationDeg\s*\}/,
  );
  assert.match(
    miniSource,
    /faceBlinkRotationDeg=\{\s*faceStyle\.blinkRotationDeg\s*\}/,
  );
  assert.match(miniSource, /faceStyle=\{faceStyle\}/);
  assert.doesNotMatch(miniSource, /studio-micro-\$\{previewMode\}/);
  assert.match(miniSource, /className=\{styles\.botAvatarStudioMicroPreview\}/);
  assert.match(
    miniSource,
    /className=\{styles\.botAvatarStudioMiniPreviewViewport\}/,
  );
  assert.match(pageSource, /details=\{miniAvatarDetails\}/);
  assert.match(miniSource, /name=\{glyph\}/);
  assert.match(miniSource, /\bpixelated\b/);

  const previewRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarStudioMiniPreview',
  );
  assert.match(previewRule, /position: absolute;/);
  assert.match(previewRule, /left: 22px;/);
  assert.match(previewRule, /top: 20px;/);
  assert.match(previewRule, /z-index: 22;/);
  assert.match(previewRule, /pointer-events: none;/);
  assert.match(previewRule, /width:\s*fit-content;/);
  assert.match(previewRule, /max-width:\s*calc\(100vw - 44px\);/);

  const miniViewportRule = cssRuleBody(
    ".botAvatarStudioMiniPreviewViewport",
  );
  assert.match(miniViewportRule, /width:\s*122px;/);
  assert.match(miniViewportRule, /height:\s*122px;/);

  assert.match(
    cssSource,
    /\.botAvatarStudioMicroPreview\s+\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/u,
  );
  assert.match(
    cssSource,
    /\.botAvatarStudioMicroPreview \.messageMoodMicroFace\s*\{[^}]*font-size:\s*15px;/u,
  );
  assert.match(
    cssSource,
    /\.botAvatarStudioMiniPreviewViewport \.botAvatarStudioMiniAvatar\s*\{[^}]*--chat-mini-bot-lower-screen-nudge-x:\s*1px;[^}]*--chat-mini-bot-lower-screen-nudge-y:\s*0px;/u,
  );
  assert.match(
    cssSource,
    /\.botAvatarStudioMiniPreviewViewport \.emptyStateHeroMiniArt\s*\{[^}]*transform:\s*translateY\(-2px\);/u,
  );
  assert.match(
    cssSource,
    /\.botAvatarStudioMicroPreview\s+\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[^}]*--bot-avatar-micro-screen-scale:\s*1\.12;[^}]*--bot-avatar-micro-face-nudge-x:\s*1px;[^}]*--bot-avatar-micro-face-nudge-y:\s*-1px;/u,
  );
  assert.match(pageSource, /data-bot-avatar-micro-screen="true"/);
  assert.match(
    cssSource,
    /\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[\s\S]{0,600}#05080b[\s\S]{0,400}box-shadow:\s*none/u,
  );
  assert.match(
    cssSource,
    /\.messageMoodMicroFace\s*\{[^}]*font-size:\s*12px;[^}]*color:\s*#ffffff;/u,
  );
  assert.match(
    cssSource,
    /\.themeLight \.messageMoodMicroFace\s*\{[^}]*color:\s*#05080b;/u,
  );
});

test("Avatar Studio requires an Accent pin before named voice casting", () => {
  assert.match(pageSource, /const avatarVoiceAccentReady = Boolean/);
  assert.match(pageSource, /label: "1 Accent"/);
  assert.match(pageSource, /label: "2 Local"/);
  assert.match(pageSource, /label: "3 Premium"/);
  assert.match(pageSource, /Place the accent pin first/);
  assert.match(pageSource, /aria-label="Choose a named voice"/);
  assert.match(pageSource, /PREMIUM · OPTIONAL/);
  assert.match(cssSource, /\.botVoiceAccentGate/);
  assert.match(cssSource, /\.botVoiceNameGrid/);
});

test("Voice stages cannot replace another Avatar Studio module console", () => {
  assert.match(
    pageSource,
    /activeControlTab === "voice" && !avatarVoiceAccentReady/,
  );
  assert.match(
    pageSource,
    /activeControlTab === "voice" && activeAdjustmentTarget === "pronunciation"/,
  );
  assert.match(
    pageSource,
    /activeControlTab === "eyes" && activeAdjustmentTarget === "eyes"/,
  );
  assert.match(
    pageSource,
    /activeControlTab === "eyes" && activeAdjustmentTarget === "blink"/,
  );
  assert.match(
    pageSource,
    /activeControlTab === "mouth" && activeAdjustmentTarget === "mouth"/,
  );
  assert.match(
    pageSource,
    /activeControlTab !== "face" \|\| activeAdjustmentTarget !== "thinking"/,
  );
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
  assert.match(pageSource, /faceEyeAnimation: BotFaceEyeMovement/);
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
  assert.match(pageSource, /faceBlinkRotationDeg: number/);
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
  assert.match(pageSource, /faceBlinkCount=\{newBotFaceBlinkCount\}/);
  assert.match(
    pageSource,
    /faceBlinkRotationDeg=\{newBotFaceBlinkRotationDeg\}/,
  );
  assert.match(pageSource, /faceThinkingFrames=\{newBotFaceThinkingFrames\}/);
  assert.match(pageSource, /handleNewBotFaceEyeCharacterChange\(normalized\);/);
  assert.doesNotMatch(
    pageSource,
    /handleNewBotFaceEyeCountChange[\s\S]{0,500}DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG/,
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
  assert.match(pageSource, /label="Thinking size"/);
  assert.match(pageSource, /label="Thinking position"/);
  assert.match(pageSource, /data-thinking-geometry="true"/);
  assert.match(pageSource, /faceThinkingScale=\{newBotFaceThinkingScale\}/);
  assert.match(cssSource, /--bot-face-thinking-scale,\s*1/);
  assert.match(
    cssSource,
    /\.botAvatarCustomGeometry\[data-thinking-geometry="true"\]\[data-disabled="true"\]/,
  );
  assert.match(cssSource, /\.botAvatarInlineResetButton/);
  assert.match(pageSource, /ariaLabel="Custom eye glyph"/);
  assert.match(pageSource, /ariaLabel="Custom mouth glyph"/);
  assert.match(pageSource, /part="eyes"/);
  assert.match(pageSource, /part="mouth"/);
  assert.match(pageSource, /value=\{faceMouthAnimation\}/);
  assert.match(pageSource, /none:\s*"Default"/);
  assert.match(pageSource, /aria-label="Eyes"/);
  assert.match(pageSource, /aria-label="Mouth"/);
  assert.match(pageSource, /label="Blink"/);
  assert.match(pageSource, /label="Thinking animation"/);
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
  assert.match(pageSource, /label="Eye spacing"/);
  assert.match(
    pageSource,
    /faceEyeSpacing !== DEFAULT_BOT_FACE_STYLE\.eyeSpacing/,
  );
  assert.match(
    pageSource,
    /newBotFaceEyeSpacing !== editPristine\.faceEyeSpacing/,
  );
  assert.match(pageSource, /label="Eye position"/);
  assert.match(pageSource, /label="Blink size"/);
  assert.match(pageSource, /label="Blink position"/);
  assert.match(pageSource, /onBlinkScaleChange/);
  assert.match(pageSource, /onBlinkOffsetXChange/);
  assert.match(pageSource, /onBlinkOffsetYChange/);
  assert.match(pageSource, /label="Mouth size"/);
  assert.match(
    pageSource,
    /faceMouthScale\s*\/\s*DEFAULT_BOT_FACE_MOUTH_SCALE/u,
  );
  assert.match(pageSource, /label="Mouth position"/);
  assert.match(pageSource, /function BotAvatarCoordinateControl\(/);
  assert.match(pageSource, /const visualX = -x;/);
  assert.match(pageSource, /createAdjustmentPadCoordinateAdapter\(/);
  assert.match(
    adjustmentPadSource,
    /onPreview\(nextValue, "pointer"\);[\s\S]*onCommit\(nextValue, "pointer"\);/,
  );
  assert.match(
    adjustmentPadSource,
    /adapter\.nudge\(valueRef\.current, direction, event\.shiftKey \? 3 : 1\)/,
  );
  assert.match(
    adjustmentPadSource,
    /aria-label=\{`\$\{label\}\. \$\{valueText\}\. Use arrow keys to adjust and Home to restore\.`\}/,
  );
  assert.doesNotMatch(pageSource, /\blockX\b|\blockedX\b|data-x-locked/);
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
    undefined,
    "Avatar Studio should not expose the retired face-weight control",
  );
  assert.match(adjustmentPadCssSource, /\.pad\s*\{[\s\S]*cursor:\s*grab;/);
  assert.match(adjustmentPadCssSource, /\.pad::before/);
  assert.match(adjustmentPadCssSource, /\.thumb\s*\{[\s\S]*width:\s*20px;/);
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
  assert.match(
    cssSource,
    /\[data-coffee-plate-emoji-blink-glyph="true"\][\s\S]{0,420}--bot-face-gaze-x:\s*0px;[\s\S]{0,120}--bot-face-gaze-y:\s*0px;/,
  );
  const faceBranchStart = pageSource.indexOf(
    'data-identity-surface="identity-core"',
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
    pageSource.indexOf("function BotPowersEditor", mouthBranchStart),
  );
  assert.doesNotMatch(faceTabSource, /label="Eye size"/);
  assert.doesNotMatch(faceTabSource, /label="Eye position"/);
  assert.doesNotMatch(faceTabSource, /Mouth rotation/);
  assert.doesNotMatch(faceTabSource, /botAvatarEyeScalePresetButton/);
  assert.doesNotMatch(faceTabSource, /enableCustomEye/);
  assert.doesNotMatch(faceTabSource, /enableCustomMouth/);
  assert.match(faceTabSource, /<BotAvatarIdentityControls/);
  assert.match(faceTabSource, /identitySection \?/);
  assert.doesNotMatch(faceTabSource, /<ColorGlyphPicker/);
  assert.match(pageSource, /ariaLabel="Shell color and identity badge"/);
  assert.match(pageSource, /return hslToHex\(hue, 100, currentLightness\)/);
  assert.doesNotMatch(pageSource, /accentBrightness|setAccentBrightness/);
  assert.doesNotMatch(pageSource, /Bot accent brightness/);
  assert.doesNotMatch(pageSource, /handleLightnessChange/);
  assert.doesNotMatch(pageSource, /computePickedColor[\s\S]{0,700}clientY[^;]*\/ rect\.height/);
  assert.match(faceTabSource, /label="Thinking animation"/);
  assert.match(faceTabSource, /aria-label="Custom thinking animation frames"/);
  assert.match(
    pageSource,
    /const shellControls = identitySection \? \([\s\S]*?<ColorGlyphPicker[\s\S]*?\sinline\s[\s\S]*?ariaLabel="Shell color and identity badge"/,
  );
  assert.doesNotMatch(faceTabSource, /label="Stroke weight"/);
  assert.match(eyesTabSource, /ariaLabel="Custom eye glyph"/);
  assert.doesNotMatch(eyesTabSource, /label="Stroke weight"/);
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
  assert.doesNotMatch(eyesTabSource, /disabled=\{!customEyeActive\}/);
  assert.match(eyesTabSource, /BotAvatarEyeMovementControl/);
  assert.match(pageSource, /still: "Still"/);
  assert.match(pageSource, /natural: "Natural"/);
  assert.match(pageSource, /nervous: "Nervous"/);
  assert.match(pageSource, /frantic: "Frantic"/);
  assert.match(pageSource, /paranoid: "Paranoid"/);
  assert.match(eyesTabSource, /value=\{faceEyeAnimation\}/);
  assert.match(eyesTabSource, /botAvatarCustomMotionRowSingle/);
  assert.match(eyesTabSource, /part="eyes"/);
  assert.match(eyesTabSource, /aria-label="Custom eye count"/);
  assert.match(eyesTabSource, /customEyeActive \? \(/);
  assert.match(eyesTabSource, /One eye/);
  assert.match(eyesTabSource, /Two eyes/);
  assert.match(eyesTabSource, /label="Eye size"/);
  assert.doesNotMatch(eyesTabSource, /label="Eye position"/);
  assert.match(eyesTabSource, /label="Blink"/);
  assert.match(eyesTabSource, /botAvatarBlinkBarOptionLabel\(blinkBar\)/);
  assert.match(eyesTabSource, /aria-label="Use a custom blink bar"/);
  assert.match(eyesTabSource, /label="Blink size"/);
  assert.doesNotMatch(eyesTabSource, /label="Blink position"/);
  assert.match(eyesTabSource, /part="blink"/);
  assert.match(eyesTabSource, /value=\{faceBlinkRotationDeg\}/);
  assert.match(pageSource, /label="Eye position" x=\{faceEyeOffsetX\}/);
  assert.match(pageSource, /label="Blink position" x=\{faceBlinkOffsetX\}/);
  assert.match(
    pageSource,
    /const blinkPlacementActive = faceBlinkBar !== "none";/,
  );
  assert.match(
    eyesTabSource,
    /\{blinkPlacementActive \? \( <div className=\{styles\.botAvatarCustomBlinkControls\}> \{customBlinkActive \? \(/,
  );
  assert.ok(
    eyesTabSource.indexOf("<BotAvatarCustomGlyphCapture") <
      eyesTabSource.indexOf("<BotAvatarMouthRotationWheel"),
    "Custom glyph capture should sit left of the eye rotation wheel",
  );
  assert.match(mouthTabSource, /ariaLabel="Custom mouth glyph"/);
  assert.doesNotMatch(mouthTabSource, /label="Stroke weight"/);
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
  assert.match(
    pageSource,
    /faceBlinkRotationDeg:[\s\S]{0,120}face_blink_rotation_deg/,
  );
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
    /Swap the custom mouth to \* and toggle Speech ink while sipping in Coffee mode\./,
  );
  assert.match(pageSource, /role="switch"/);
  assert.match(pageSource, /aria-checked=\{faceMouthCoffeePucker\}/);
  assert.match(pageSource, /data-enabled=\{faceMouthCoffeePucker/);
  assert.match(pageSource, /onMouthCoffeePuckerChange/);
  assert.match(mouthTabSource, /faceMouthAnimation/);
  assert.match(mouthTabSource, /label="Mouth size"/);
  assert.match(mouthTabSource, /<BotAvatarMouthRotationWheel/);
  assert.doesNotMatch(mouthTabSource, /label="Mouth position"/);
  assert.match(pageSource, /label="Mouth position" x=\{faceMouthOffsetX\}/);
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
  assert.doesNotMatch(pageSource, /custom: "Custom Speech"/);
  assert.match(mouthTabSource, /Custom Speech mouth poses/);
  assert.match(mouthTabSource, /\["Rest", "Closed", "Open", "Round"\]/);
  assert.match(mouthTabSource, /faceMouthAnimation === DEFAULT_BOT_FACE_GLYPH_ANIMATION/);
  assert.match(mouthTabSource, /faceMouthSpeechPoses \? "Disable" : "Enable"/);
  assert.match(mouthTabSource, /Reset poses/);
  assert.match(mouthTabSource, /onMouthSpeechPosesChange\(next\)/);
  assert.match(
    cssSource,
    /\.botAvatarCustomSpeechModule\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  );
  assert.match(
    pageSource,
    /JSON\.stringify\(newBotFaceMouthSpeechPoses\)\s*!==\s*JSON\.stringify\(editPristine\.faceMouthSpeechPoses\)/,
  );
  assert.match(
    pageSource,
    /faceMouthAnimation !== DEFAULT_BOT_FACE_STYLE\.mouthAnimation \|\|\s*faceMouthSpeechPoses !== null \|\|/,
  );
  assert.match(
    modeTutorialSource,
    /Default can enable Custom Speech: four compact Rest, Closed, Open, and Round poses follow the live speech timing/,
  );
  assert.match(pageSource, /none: "Default"/);
  assert.match(pageSource, /static: "None"/);
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

test("two custom eyes share adjustable centered spacing across open and blink states", () => {
  assert.match(coffeeFaceSource, /normalizedFaceEyeCount === 2/);
  assert.match(coffeeFaceSource, /displayBlinkPhase !== "closed"/);
  assert.match(coffeeFaceSource, /displayBlinkPhase === "closed"/);
  assert.match(coffeeFaceSource, /renderCustomEyePair \|\| renderCustomBlinkPair/);
  assert.match(coffeeFaceSource, /data-custom-eye-pair="true"/);
  assert.match(coffeeFaceSource, /data-custom-eye-pair-side="left"/);
  assert.match(coffeeFaceSource, /data-custom-eye-pair-side="right"/);
  assert.match(coffeeFaceSource, /--bot-face-eye-spacing/);
  assert.match(
    coffeeFaceSource,
    /const blinkKey = `\$\{blinkEnabled[\s\S]*?:\$\{faceText\}:\$\{scheduleKey\}`/,
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
    /translateX\(calc\(var\(--bot-face-eye-spacing, 0\.36em\) \/ -2\)\) scale\(var\(--bot-face-custom-eye-pair-scale\)\)/,
  );
  assert.match(
    cssSource,
    /translateX\(calc\(var\(--bot-face-eye-spacing, 0\.36em\) \/ 2\)\) scale\(var\(--bot-face-custom-eye-pair-scale\)\)/,
  );
  assert.match(
    pageSource,
    /customEyeActive && faceEyeCount === 2[\s\S]*?label="Eye spacing"/,
  );
  assert.match(pageSource, /onEyeSpacingChange/);
});

test("avatar edits stay local until Save and support multi-step undo", () => {
  assert.doesNotMatch(
    pageSource,
    /queueBotAvatarAutosave|flushBotAvatarAutosaveQueue|queueBotVoiceAutosave|flushBotVoiceAutosaveQueue|queueBotNamePronunciationAutosave/,
  );
  assert.doesNotMatch(
    pageSource,
    /botAvatarAutoSaving|botAvatarAutoSaveQueuedPatchRef|voiceAutosaveTimerRef|voiceAutosavePendingRef|voiceAutosaveInFlightRef/,
  );
  assert.match(
    pageSource,
    /const avatarCustomizerSaving = botAvatarExplicitSaveBusy;/,
  );
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
  assert.doesNotMatch(pageSource, /pushBotAvatarUndoSnapshot\("face-weight"\);/);
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
  assert.match(
    pageSource,
    /voiceRestoreRequestedRef\.current \|\|\s*JSON\.stringify\(newBotAudioVoiceProfile\)/,
  );
  assert.match(
    pageSource,
    /if \(voiceRestoreRequestedRef\.current\) \{\s*patch\.audioVoiceProfileOverride = null;/,
  );
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
  assert.match(
    pageSource,
    /const \[botAvatarExplicitSaveBusy, setBotAvatarExplicitSaveBusy\] =\s*useState\(false\);/,
  );
  assert.match(
    pageSource,
    /const botAvatarExplicitSaveInFlightRef = useRef\(false\);/,
  );
  assert.match(pageSource, /async function runBotAvatarExplicitSave/);
  assert.match(
    pageSource,
    /setBotAvatarExplicitSaveBusy\(true\);[\s\S]*?finally \{[\s\S]*?setBotAvatarExplicitSaveBusy\(false\);/,
  );
  assert.match(
    pageSource,
    /onSave=\{\(\) =>\s*runBotAvatarExplicitSave\(async \(\) =>/,
  );
  assert.doesNotMatch(pageSource, /const avatarCustomizerSaving = busy;/);
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
    cssRuleBody(
      '.botAvatarCustomizer[data-foundry="true"] .botAvatarPanelHeader',
    ),
    /display:\s*none;/,
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
    /bot\s*\? resolveCustomBotGlyph\(bot\.glyph\)\s*:\s*defaultPrismGlyph/,
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
  assert.doesNotMatch(
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
    /faceBlinkRotationDeg: newBotFaceBlinkRotationDeg/,
  );
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
  assert.match(
    defaultBotRouteSource,
    /capabilityId: "default-bot\.fields\.update"/,
  );
  assert.match(defaultBotRouteSource, /prismCapabilityContext\([\s\S]*"ui"/);
  assert.match(defaultBotRouteSource, /actionRun: run/);
  assert.match(apiServerSource, /prismDefaultBotColor: ""/);
  assert.match(apiServerSource, /prismDefaultBotGlyph: ""/);
});

test("avatar customization uses the workspace below the shared navbar as a foundry", () => {
  const backdropRule = cssRuleBody(".botAvatarCustomizerBackdrop");
  const foundryBackdropRule = cssRuleBody(
    '.botAvatarCustomizerBackdrop[data-avatar-foundry="true"]',
  );
  const modalRule = cssRuleBody(
    '.botProfileBuilder.botAvatarCustomizer[data-foundry="true"]',
  );
  const modalBackingRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"]::before',
  );
  const modalRailRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"]::after',
  );
  assert.match(backdropRule, /z-index:\s*3000;/);
  assert.match(backdropRule, /overflow:\s*hidden;/);
  assert.match(
    backdropRule,
    /backdrop-filter:\s*blur\(12px\)\s*saturate\(112%\);/,
  );
  assert.match(
    foundryBackdropRule,
    /inset:\s*var\(--app-shell-top-nav-height, 60px\) 0 0;/,
  );
  assert.match(foundryBackdropRule, /z-index:\s*170;/);
  assert.match(foundryBackdropRule, /backdrop-filter:\s*none;/);
  assert.match(foundryBackdropRule, /-webkit-backdrop-filter:\s*none;/);
  assert.match(modalRule, /position:\s*absolute;/);
  assert.match(modalRule, /inset:\s*0;/);
  assert.match(modalRule, /width:\s*100%;/);
  assert.match(modalRule, /height:\s*100%;/);
  assert.match(modalRule, /border-radius:\s*0;/);
  assert.match(modalRule, /background:\s*#111722;/);
  assert.doesNotMatch(modalRule, /var\(--panel-width/);
  const controlTabsRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlTabs',
  );
  assert.match(controlTabsRule, /position:\s*absolute;/);
  assert.match(
    controlTabsRule,
    /bottom:\s*var\(--avatar-foundry-navigation-bottom, 22px\);/,
  );
  assert.match(controlTabsRule, /z-index:\s*2;/);
  assert.match(modalBackingRule, /background:/);
  assert.match(modalRailRule, /height:\s*2px;/);
  assert.match(pageSource, /data-avatar-foundry="true"/);
  assert.doesNotMatch(
    pageSource,
    /data-foundry="true"[\s\S]{0,140}aria-modal="true"/,
  );
  assert.match(
    pageSource,
    /event\.defaultPrevented \|\|[\s\S]{0,220}data-shared-app-navbar="true"\], \[data-navbar-picker-surface="true"\]/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlPanel\s*\{[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlStack\s*\{[\s\S]*overflow-y:\s*auto;/,
  );
  assert.doesNotMatch(backdropRule, /overflow-y:\s*auto;/);
  assert.match(
    cssRuleBody(
      '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlStack',
    ),
    /overflow:\s*auto;/,
  );
  assert.doesNotMatch(
    cssRuleBody(
      '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlStack',
    ),
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
  assert.match(
    pageSource,
    /const \[pronunciationExpanded, setPronunciationExpanded\] = useState\(false\)/,
  );
  assert.doesNotMatch(pageSource, /nameDetailsExpanded/);
  assert.doesNotMatch(pageSource, /aria-label="Bot spoken name"/);
  assert.doesNotMatch(pageSource, /Leave blank to use the full\s+name\./);
  assert.doesNotMatch(pageSource, /Show spoken name options/);
  assert.match(pageSource, /Show optional pronunciation/);
  assert.match(
    pageSource,
    /Only needed when speech gets the name wrong\. Leave blank unless\s+you type a phonetic spelling\./,
  );
  assert.match(pageSource, /aria-label="Bot name pronunciation"/);
  assert.match(pageSource, /placeholder="Phonetic spelling, if needed"/);
  assert.match(pageSource, /aria-label="Preview bot name pronunciation"/);
  assert.match(pageSource, /My name is \$\{trimmedName\}\./);
  const invalidChatDetailEffect = pageSource.slice(
    pageSource.indexOf('detail.id === "pending"'),
    pageSource.indexOf(
      "useEffect(() =>",
      pageSource.indexOf('detail.id === "pending"'),
    ),
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
  assert.doesNotMatch(pageSource, /className=\{styles\.botAvatarSliderStack\}/);
  assert.doesNotMatch(
    cssSource,
    /\.botAvatarSliderStack|\.botAvatarWeightControl|\.botAvatarWeightEnds/,
  );
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
  assert.match(pageSource, /<BotVoiceLocalStage/);
  assert.match(pageSource, /<BotVoicePremiumStage/);
  assert.match(pageSource, /variant="local"/);
  assert.match(pageSource, /variant="premium"/);
  assert.match(pageSource, /<BotVoiceCharacterEditor/);
  assert.doesNotMatch(
    pageSource,
    /activeControlTab === "voice" \? \(\s*<>\s*\{isDefaultPrismBot/,
  );
  assert.match(pageSource, /<BotAvatarSfxEditor/);
  assert.match(pageSource, /ActionSfxPackMagicButton/);
  assert.match(pageSource, /actionSfxPackBotId=/);
  assert.match(pageSource, /packOwnerId=\{actionSfxPackBotId\}/);
  assert.doesNotMatch(pageSource, /packOwnerId=\{scheduleKey\}/);
  assert.match(pageSource, /Corporality/);
  assert.match(pageSource, /data-tutorial-target="avatar-corporality"/);
  assert.match(pageSource, /Play while talking/);
  assert.match(pageSource, /Play while not talking/);
  assert.match(pageSource, /Play while thinking/);
  assert.match(
    pageSource,
    /Built-in fallback · no uploaded file · thinking only/,
  );
  assert.match(pageSource, /aria-label="Avatar sound mode"/);
  assert.match(pageSource, /data-bot-avatar-sfx-runtime="true"/);
  assert.match(pageSource, /avatarSfxState=\{previewAvatarSfxState\}/);
  assert.match(botAvatarSfxSource, /\/api\/avatar\/sfx\/generate/);
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
  assert.match(
    pageSource,
    /<BotPowerRune power=\{\{ \.\.\.power, sigil \}\} size=\{64\} \/>/u,
  );
  assert.match(pageSource, /data-power-source="locked"/u);
  assert.match(pageSource, /Original prompt/u);
  assert.match(
    pageSource,
    /Locked after creation\. Rerolls always build from this\./u,
  );
  assert.match(pageSource, /onCompile\(next, power\.id\)/u);
  assert.match(pageSource, /onCompile\(powers, power\.id\)/u);
  assert.match(pageSource, /power\.id === powerId &&/u);
  assert.match(pageSource, /powers: drafts/u);
  assert.match(pageSource, /compiledById\.get\(power\.id\) \?\? power/u);
  assert.match(pageSource, /Reroll Power/u);
  assert.match(pageSource, /Reroll rune/u);
  assert.match(pageSource, /Reroll the generated Power name and rune/u);
  assert.match(
    pageSource,
    /randomizeSemanticBotField\(\s*"power\.name",\s*power\.name/u,
  );
  assert.match(
    pageSource,
    /power:\s*\{\s*name:\s*power\.name,\s*prompt:\s*power\.intent/u,
  );
  assert.doesNotMatch(pageSource, /BOT_POWER_SIGIL_GLYPHS/u);
  assert.match(pageSource, /Pop Power\?/u);
  assert.match(pageSource, /\/api\/bot-powers\/compile/);
  assert.match(
    pageSource,
    /data-tutorial-target="avatar-studio-synthesis-routing"/,
  );
  assert.match(
    pageSource,
    /ariaLabel="Model for Avatar Studio synthesis"/,
  );
  assert.match(
    pageSource,
    /preferredProvider,[\s\S]*?responseMode,[\s\S]*?\.\.\.\(modelOverride \? \{ modelOverride \} : \{\}\)/,
  );
  assert.match(cssSource, /\.botAvatarStudioRoutingControls\s*\{/);
  assert.match(pageSource, /seedBotStudioSynthesisModelChoice\(\)/);
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
    /shellActive\s*\? "Shell"\s*: activeTab === "face"\s*\? "Identity core"/,
  );
  assert.match(pageSource, /Presets and thinking/);
  assert.match(pageSource, /Name, presets, and thinking/);
  assert.match(pageSource, /Color and identity badge/);
  assert.doesNotMatch(pageSource, /Built-in style and stroke weight/);
  assert.doesNotMatch(pageSource, /Custom glyph and stroke weight/);
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
  assert.doesNotMatch(pageSource, /const previewWeightSummary =/);
  assert.doesNotMatch(pageSource, /const previewFaceSummary =/);
  assert.doesNotMatch(pageSource, /botAvatarFeaturePositionSummary/);
  assert.match(pageSource, /const BOT_AVATAR_FACE_PRESETS = \[/);
  assert.match(pageSource, /Classic/);
  assert.match(pageSource, /Macondo/);
  assert.match(pageSource, /Bouncy/);
  assert.match(pageSource, /label: "Serif"/);
  assert.doesNotMatch(pageSource, /label: "Math"/);
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
    cssRuleBody(
      '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlTabs',
    ),
    /display:\s*flex;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlGroupHeader\s*\{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\) auto;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarPresetStrip\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    cssRuleBody(
      '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlStack',
    ),
    /overflow:\s*auto;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarOverrideGrid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
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
    /\.botAvatarPreviewModeToggle\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(cssSource, /\.botAvatarSectionResetButton/);
  assert.match(cssSource, /\.botAvatarRangeControl/);
  assert.match(
    cssRuleBody(".colorGlyphInline"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    cssRuleBody(".colorGlyphInline"),
    /grid-template-rows:\s*auto minmax\(0,\s*1fr\);/,
  );
  assert.match(
    cssRuleBody(".colorGlyphInline .colorSquare"),
    /height:\s*28px;/,
  );
  assert.match(
    cssRuleBody(".colorGlyphInline .glyphGridShell"),
    /height:\s*100%;/,
  );
  assert.match(pageSource, /data-color-picker="hue-strip"/);
  assert.match(
    pageSource,
    /aria-label="Bot color hue\. Drag left and right to choose a hue\."/,
  );
  assert.doesNotMatch(pageSource, /accentLightnessMidpoint\(/);
  assert.doesNotMatch(cssSource, /\.colorLightnessControl/);
  assert.doesNotMatch(
    cssSource,
    /--color-square-band-alpha/,
  );
  assert.match(
    cssSource,
    /\.botAvatarFaceControls\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto auto;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarIdentityPicker\s*\{[\s\S]*?height:\s*clamp\(165px,\s*22dvh,\s*260px\);/,
  );
  assert.match(
    cssRuleBody(".botAvatarIdentityPronunciationRow"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/,
  );
  assert.match(
    cssRuleBody(".botAvatarIdentityNameDetails"),
    /border-left:\s*1px solid/,
  );
  assert.match(
    cssRuleBody(".botAvatarIdentityDisclosureButton"),
    /border-radius:\s*999px;/,
  );
  assert.match(
    cssRuleBody(".botAvatarIdentityNameSampleButton"),
    /height:\s*36px;/,
  );
  assert.match(cssRuleBody(".glyphGridScroll"), /overflow-y:\s*auto;/);

  const stageRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarMannequinStage',
  );
  assert.match(stageRule, /position:\s*absolute;/);
  assert.match(stageRule, /inset:\s*0;/);
  assert.match(stageRule, /radial-gradient/);
  assert.match(stageRule, /linear-gradient/);
  assert.match(stageRule, /var\(--editor-bot-color/);
  assert.match(
    cssSource,
    /\.themeLight\.botAvatarStudioThemeScope[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\][\s\S]*?\.botAvatarMannequinStage\s*\{[\s\S]*?#f1f5f8[\s\S]*?#dce6ee/,
  );
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

test("Avatar Studio face controls use Wield Prism instead of shuffle buttons", () => {
  const rangeStart = pageSource.indexOf("function BotAvatarRangeControl(");
  const rangeEnd = pageSource.indexOf(
    "function botAvatarCoordinateLabel",
    rangeStart,
  );
  const coordinateStart = pageSource.indexOf(
    "function BotAvatarCoordinateControl(",
  );
  const coordinateEnd = pageSource.indexOf(
    "function formatVoiceCharacterDb",
    coordinateStart,
  );
  const faceStart = pageSource.indexOf("function BotAvatarFaceControls(");
  const faceEnd = pageSource.indexOf(
    "function BotPowersEditor(",
    faceStart,
  );

  assert.notEqual(rangeStart, -1);
  assert.notEqual(rangeEnd, -1);
  assert.notEqual(coordinateStart, -1);
  assert.notEqual(coordinateEnd, -1);
  assert.notEqual(faceStart, -1);
  assert.notEqual(faceEnd, -1);

  for (const source of [
    pageSource.slice(rangeStart, rangeEnd),
    pageSource.slice(coordinateStart, coordinateEnd),
    pageSource.slice(faceStart, faceEnd),
  ]) {
    assert.match(source, /BotAvatarRefractRandomizer/);
    assert.doesNotMatch(source, /<BotFieldRandomizerButton/);
  }
  assert.match(pageSource, /kind: "magic", label,/);
  assert.match(pageSource, /id: `avatar-studio-randomize-\$\{reactId\}`/);
});

test("avatar preview uses the canonical full-scale identity contract", () => {
  assert.match(
    pageSource,
    /const \[previewTheme, setPreviewTheme\]\s*=\s*useState<"light" \| "dark">\(\s*resolvedTheme\s*,?\s*\)/,
  );
  assert.match(pageSource, /setPreviewTheme\(resolvedTheme\)/);
  assert.match(
    pageSource,
    /function botAvatarFullScaleIdentityStyle\(\s*rawHex: string\s*,\s*resolvedTheme: "light" \| "dark"\s*,\s*options: BotAvatarFullScaleIdentityOptions = \{\}\s*,?\s*\): CSSProperties/,
  );
  assert.match(pageSource, /if \(options\.prismPersona\) return accentStyle;/);
  assert.match(
    pageSource,
    /botAccentStyle\(rawHex, resolvedTheme, options\.privateMode\) \?\? \{\}/,
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
    /botAvatarIdentityMaterialStyle\(\{\s*privateMode: options\.privateMode,\s*voicePreset: options\.voicePreset/,
  );
  assert.match(
    pageSource,
    /\.\.\.botAvatarFullScaleIdentityStyle\(color, previewTheme, \{\s*prismPersona: isDefaultPrismBot,\s*voicePreset,\s*\}\)/,
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
    /const previewVoicePreset = profile\.core\.communicationStyle;/,
  );
  assert.match(pageSource, /voicePreset=\{previewVoicePreset\}/);
  assert.match(
    pageSource,
    /metalAlloyEnabled=\{!isDefaultPrismBot\}/,
    "Default Prism must not receive a Communication Style alloy in Avatar Studio",
  );
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
    /--zen-live-bot-face-phosphor-ink:\s*color-mix\(\s*in srgb,\s*var\(--coffee-bot-color\) 82%,\s*#ffffff 18%\s*\)\s*;/,
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
  const bodyGlyphRule =
    cssSource.match(/^\.zenLiveBotPresenceBotGlyph\s*\{([\s\S]*?)\n\}/m)?.[1] ??
    "";
  assert.match(bodyGlyphRule, /color:\s*#ffffff\s*;/);
  assert.match(
    bodyGlyphRule,
    /--zen-live-bot-glyph-glow-color:\s*var\(--coffee-bot-color\)\s*;/,
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

test("avatar customizer preview uses full-stage foundry framing", () => {
  const stageRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarMannequinStage',
  );
  assert.match(stageRule, /height:\s*100%\s*;/);
  assert.match(stageRule, /padding:\s*0\s*;/);
  assert.match(stageRule, /overflow:\s*hidden\s*;/);
  assert.match(stageRule, /radial-gradient/);
  assert.match(
    cssSource,
    /\.themeLight\.botAvatarStudioThemeScope[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\][\s\S]*?:is\(\.botAvatarMannequinPanel, \.botAvatarControlPanel\)\s*\{[\s\S]*?background:\s*transparent !important;/,
  );
});

test("Avatar Foundry bounds the editor rail and gives light mode a pale-metal hierarchy", () => {
  const foundryRule = cssRuleBody(
    '.botProfileBuilder.botAvatarCustomizer[data-foundry="true"]',
  );
  assert.match(foundryRule, /position:\s*absolute\s*;/);
  assert.match(foundryRule, /inset:\s*0\s*;/);
  assert.match(foundryRule, /height:\s*100%\s*;/);
  assert.match(foundryRule, /min-height:\s*0\s*;/);
  assert.match(foundryRule, /grid-template-rows:\s*auto minmax\(0, 1fr\)\s*;/);
  assert.match(foundryRule, /overflow:\s*hidden\s*;/);

  const foundryBodyRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarCustomizerBody',
  );
  assert.match(foundryBodyRule, /height:\s*100%\s*;/);
  assert.match(foundryBodyRule, /min-height:\s*0\s*;/);
  assert.match(foundryBodyRule, /overflow:\s*hidden\s*;/);

  const editorRailRule = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlStack',
  );
  assert.match(
    editorRailRule,
    /top:\s*var\(--avatar-foundry-inspector-top, 20px\)\s*;/,
  );
  assert.match(
    editorRailRule,
    /bottom:\s*calc\([\s\S]*--avatar-foundry-navigation-bottom[\s\S]*--avatar-foundry-navigation-height[\s\S]*--avatar-foundry-navigation-gap[\s\S]*\)\s*;/,
  );
  assert.match(editorRailRule, /height:\s*auto\s*;/);
  assert.match(editorRailRule, /max-height:\s*none\s*;/);
  assert.match(editorRailRule, /min-height:\s*0\s*;/);
  assert.match(editorRailRule, /box-sizing:\s*border-box\s*;/);
  assert.match(editorRailRule, /overflow:\s*auto\s*;/);
  assert.match(editorRailRule, /scrollbar-gutter:\s*stable\s*;/);

  assert.match(
    cssSource,
    /\.themeLight\.botAvatarStudioThemeScope[\s\S]*?\.botAvatarControlStack\s*\{[\s\S]*?#f5f8fb/,
  );
  assert.match(
    cssSource,
    /\.themeLight\.botAvatarStudioThemeScope[\s\S]*?\.botAvatarVoiceTestDock\s*\{[\s\S]*?#f4f8fb/,
  );
  assert.match(
    cssSource,
    /\.themeLight\.botAvatarStudioThemeScope[\s\S]*?\.botAvatarVoiceTestComposer[\s\S]*?input\s*\{[\s\S]*?background:\s*#ffffff/,
  );
});

test("avatar foundry locks the product preview and reserves camera navigation for Ink", () => {
  assert.doesNotMatch(pageSource, /data-avatar-upgrade-node=\{node\.id\}/);
  assert.doesNotMatch(pageSource, /BOT_AVATAR_FOUNDRY_UPGRADE_NODES\.filter/);
  assert.doesNotMatch(pageSource, /"--foundry-module-color": node\.color/);
  assert.match(pageSource, /botAvatarIdentitySurfaceToggle/);
  assert.match(pageSource, /onIdentitySurfaceChange/);
  assert.match(pageSource, /muteLiveAvatarSfx=\{botAvatarCustomizerOpen\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarFoundryCameraRig\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarFoundryPlatform\}/);
  assert.match(pageSource, /className=\{styles\.botAvatarFoundryBotAssembly\}/);
  assert.match(pageSource, /data-avatar-foundry-platform="true"/);
  assert.match(pageSource, /data-avatar-foundry-bot-assembly="true"/);
  assert.match(pageSource, /Drag to pan · Scroll at cursor to zoom/);
  assert.match(pageSource, /aria-label="Zoom ink camera out"/);
  assert.match(pageSource, /aria-label="Zoom ink camera in"/);
  assert.match(
    pageSource,
    /const foundryCameraEditable =\s*spatialControls && foundryCameraMode === "ink";/,
  );
  assert.match(pageSource, /onWheel=\{\(event\) =>/);
  assert.match(pageSource, /requestAnimationFrame\(\(\) =>/);
  assert.match(pageSource, /stage\.style\.setProperty\("--foundry-pan-x"/);
  assert.match(
    pageSource,
    /zoomBotAvatarFoundryViewportAtAnchor\(\s*foundryViewportRef\.current,\s*event\.deltaY,\s*foundryZoomAnchor\(event\.clientX, event\.clientY\)/,
  );
  assert.match(pageSource, /setFoundryViewport\(viewport\);/);
  assert.match(pageSource, /data-tutorial-target="avatar-foundry-controls"/);
  assert.match(pageSource, /"avatar-foundry-eyes-tab"/);
  assert.match(
    pageSource,
    /previewControlsVisible=\{activeControlTab !== "details"\}/,
  );
  assert.match(
    pageSource,
    /!foundryRitual && previewControlsVisible \? \(/,
  );
  assert.doesNotMatch(pageSource, /BotAvatarFoundryFeatureHandle/);
  assert.doesNotMatch(pageSource, /data-avatar-hotspot/);
  assert.match(
    cssSource,
    /\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarPreviewToolbar\s*\{[\s\S]*aspect-ratio:\s*1;[\s\S]*pointer-events:\s*none;/,
  );
  assert.match(cssSource, /button\[data-preview-orb-index="4"\]/);
  assert.match(cssSource, /\.botAvatarIdentitySurfaceToggle\s*\{/);
  assert.match(
    cssSource,
    /\.botAvatarMannequinStage\[data-foundry-camera-surface="true"\]\s*\{[\s\S]*cursor:\s*grab;/,
  );
  assert.match(cssSource, /will-change:\s*transform;/);
  assert.match(cssSource, /@keyframes botAvatarFoundryHover/);
  assert.match(
    cssSource,
    /data-foundry-camera-active="true"[\s\S]*animation-play-state:\s*paused;/,
  );
  assert.doesNotMatch(cssSource, /transition:\s*transform 80ms linear;/);
});

test("avatar foundry marks populated modules and shares the breathing voice meter", () => {
  assert.match(pageSource, /botAvatarFoundryModulePopulation\(\{/);
  assert.match(
    pageSource,
    /screen:\s*avatarDetailsHasVisuals\(avatarDetailsPreview\)/,
  );
  assert.doesNotMatch(pageSource, /modulePopulation\[node\.id\]/);
  assert.match(pageSource, /frameModulePopulation=\{/);
  assert.match(pageSource, /data-avatar-foundry-frame-module-lights="true"/);
  assert.match(
    pageSource,
    /"--bot-face-frame-led-glow-opacity" as string\]: 0/,
  );
  assert.match(pageSource, /data-populated=\{/);
  assert.match(
    pageSource,
    /<BotAvatarFoundryFrameModuleLights\s+population=\{frameModulePopulation\}\s+\/>/,
  );
  assert.match(
    pageSource,
    /"--foundry-module-color":\s*"var\(--editor-bot-color, var\(--accent(?:, #91a8bd)?\)\)"/,
  );
  assert.match(
    pageSource,
    /activeFoundryModulePopulated \? "Ready" : "Unconfigured"/,
  );
  assert.match(cssSource, /@keyframes botVoiceLightBulbBreath/);
  assert.match(
    cssSource,
    /\.zenLiveBotPresenceBody\[data-avatar-light-mode="alive"\][\s\S]*?\.botAvatarFoundryFrameModuleLamp\[data-populated="true"\]\s*\{[\s\S]*?opacity:\s*calc\(0\.34 \+ var\(--bot-voice-light-level\)/,
  );
  assert.match(
    cssSource,
    /data-avatar-light-mode="off"[\s\S]*?\.botAvatarFoundryFrameModuleLamp[\s\S]*?opacity:\s*0 !important/,
  );
  assert.match(
    cssSource,
    /data-foundry-lamp="eyes"\][\s\S]*?left:\s*7\.65%;[\s\S]*?top:\s*58\.65%;/,
  );
  assert.match(
    cssSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.botAvatarFoundryNodePoint,[\s\S]*?animation:\s*none;/,
  );
});

test("avatar foundry keeps a reusable color-linked adjustment console visible", () => {
  assert.match(pageSource, /botAvatarGlobalAdjustmentConsole/);
  assert.match(pageSource, /activeAdjustmentOptions/);
  assert.match(pageSource, /<AdjustmentPad/);
  assert.match(pageSource, /restoreX=\{DEFAULT_BOT_FACE_STYLE\.eyeOffsetX\}/);
  assert.match(pageSource, /restoreY=\{DEFAULT_BOT_FACE_STYLE\.mouthOffsetY\}/);
  assert.match(pageSource, /activeAdjustmentTarget === "stamp"/);
  assert.match(pageSource, /detailsEditorRef\.current\?\.setEquippedStampPosition/);
  assert.match(adjustmentPadSource, /renderOverlay\?/);
  assert.match(adjustmentPadSource, /onCancel\?/);
  assert.match(
    adjustmentPadSource,
    /aria-roledescription="two-dimensional adjustment pad"/,
  );
  assert.match(
    cssSource,
    /\.botAvatarGlobalAdjustmentConsole\s*\{[\s\S]*position:\s*sticky;/,
  );
  assert.match(
    adjustmentPadCssSource,
    /@media \(prefers-reduced-motion: reduce\)/,
  );
});

test("Identity Core and Shell expose distinct control surfaces", () => {
  assert.match(
    pageSource,
    /botAvatarFoundryIdentitySurfaceForNode\(\s*activeFoundryModule\.id,?\s*\)/,
  );
  assert.match(
    pageSource,
    /activeFoundryIdentitySurface === "identity-core"[\s\S]*?value: "thinking"/,
  );
  assert.match(pageSource, /aria-label="Shell color and identity badge"/);
  assert.match(pageSource, /aria-label="Default Prism factory shell"/);
  assert.match(pageSource, /Default Prism hardware is fixed\./);
  assert.match(pageSource, /data-identity-surface="identity-core"/);
  assert.match(cssSource, /\.botAvatarShellAdjustmentSummary\s*\{/);
  assert.match(cssSource, /\.botAvatarFactoryShellNotice\s*\{/);
});

test("desktop Avatar Foundry uses a wide two-dimensional control workbench", () => {
  assert.match(
    cssSource,
    /@media \(min-width: 1280px\)[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarControlStack\s*\{[\s\S]*?width:\s*min\(760px, calc\(56vw - 36px\)\);/,
  );
  assert.match(
    cssSource,
    /@media \(min-width: 1280px\)[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarFaceControls\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 0\.9fr\) minmax\(0, 1\.1fr\);/,
  );
  assert.match(
    cssSource,
    /@media \(min-width: 1280px\)[\s\S]*?\.botAvatarFaceControls\[data-identity-surface="identity-core"\]\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    cssSource,
    /@media \(min-width: 1280px\)[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarCustomControls\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 0\.58fr\) minmax\(0, 1\.42fr\);/,
  );
  assert.match(
    cssSource,
    /@media \(min-width: 1280px\)[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarThinkingControl\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 0\.9fr\) minmax\(0, 1\.1fr\);/,
  );
  assert.match(
    cssSource,
    /@media \(max-width: 1180px\)[\s\S]*?\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarControlStack\s*\{[\s\S]*?left:\s*12px;[\s\S]*?max-height:\s*43dvh;/,
  );
  assert.match(
    cssSource,
    /\.botAvatarControlGroup\[data-avatar-control-tab="eyes"\][\s\S]*?:is\(\.botAvatarOverrideGrid, \.botAvatarOverrideControl\)\s*\{[\s\S]*?display:\s*contents;/,
  );
  assert.match(
    pageSource,
    /data-eye-geometry="spacing"[\s\S]*?label="Eye spacing"/,
  );
  assert.match(
    pageSource,
    /data-eye-geometry="size"[\s\S]*?label="Eye size"/,
  );
  assert.match(
    cssSource,
    /\.botAvatarCustomGeometry\[data-eye-geometry="spacing"\][\s\S]*?~ \.botAvatarCustomGeometry\[data-eye-geometry="size"\]\s*\{[\s\S]*?grid-row:\s*2;/,
  );
});

test("avatar customizer preview has explicit expression states", () => {
  assert.match(
    pageSource,
    /const \[previewMode, setPreviewMode\] = useState<BotAvatarPreviewMode>\("idle"\)/,
  );
  assert.match(pageSource, /const previewMood: BotMoodKey = "warm";/);
  assert.match(
    pageSource,
    /type BotAvatarPreviewMode = "idle" \| "blink" \| "talking" \| "thinking" \| "sip";/,
  );
  assert.match(pageSource, /const BOT_AVATAR_PREVIEW_ACTIONS = \[/);
  assert.match(pageSource, /value: "sip",[\s\S]*?label: "Sip"/);
  assert.match(pageSource, /value: "talking",[\s\S]*?label: "Talking"/);
  assert.doesNotMatch(pageSource, /value: "fart",[\s\S]*?label: "Fart"/);
  assert.doesNotMatch(pageSource, /const BOT_AVATAR_PREVIEW_MOODS = \[/);
  assert.doesNotMatch(
    pageSource,
    /mode\.value === "talking"[\s\S]*?voiceModeDisplayName\(voiceChoice\)/,
  );
  assert.doesNotMatch(
    pageSource,
    /<BotAvatarPreviewPanel[\s\S]*?voiceChoice=\{voicePlaybackChoice\(/,
  );
  assert.match(
    pageSource,
    /const previewTalking = previewMode === "talking" && !previewSpeechPaused;/,
  );
  assert.match(pageSource, /const previewSipping = previewMode === "sip";/);
  assert.match(
    pageSource,
    /const previewSipMouthTreatmentActive = coffeeSeatSipMouthTreatmentActive\(\{\s*sipActive: previewSipping,\s*coffeePuckerEnabled: faceStyle\.mouthCoffeePucker,\s*\}\);/,
  );
  assert.match(
    pageSource,
    /inkTalking=\{previewTalking \|\| previewSipMouthTreatmentActive\}/,
  );
  assert.match(
    pageSource,
    /Swap the custom mouth to \* and toggle Speech ink while sipping in Coffee mode\./,
  );
  assert.match(
    pageSource,
    /plateFace=\{\s*previewSipMouthTreatmentActive\s*\? COFFEE_SEAT_SIP_PLATE_GLYPH\s*: undefined\s*\}/,
  );
  assert.match(
    pageSource,
    /coffeeCupSipAnimationTiming\(\{\s*seed: `avatar-studio-sip:\$\{scheduleKey\}`/,
  );
  assert.match(
    pageSource,
    /const previewAvatarSfxState: BotAvatarSfxState =\s*previewMode === "sip" \? "idle" : previewMode;/,
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
    /onClick=\{\(\) => onPreviewModeChange\(action\.value\)\}/,
  );
  assert.doesNotMatch(pageSource, /onPreviewFart/);
  assert.doesNotMatch(
    pageSource,
    /mode\.value === "talking"\s*\? onPreviewVoice\(\)/,
  );
  assert.doesNotMatch(pageSource, /const previewAvatarGlobalVoice = async/);
  assert.match(
    pageSource,
    /const playAvatarVoicePreview = async \([\s\S]*?await onVoicePreview\(profile, forcedMode, previewText,[\s\S]*?setPreviewMode\("talking"\)/,
  );
  assert.doesNotMatch(
    pageSource,
    /onPreviewVoice=\{\(\) => void previewAvatarGlobalVoice\(\)\}/,
  );
  assert.match(pageSource, /onPreview=\{playAvatarVoicePreview\}/);
  assert.doesNotMatch(pageSource, /onPreviewMoodCycle=/);
  assert.doesNotMatch(pageSource, /botAvatarMoodPreviewButton/);
  assert.match(pageSource, /className=\{styles\.botAvatarVoiceTestDock\}/);
  assert.match(pageSource, /Nothing is added to chat\./);
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
      if (/\[data-foundry-ritual=/u.test(match[0])) continue;
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
  assert.match(
    cssSource,
    /body:has\(\[data-foundry="true"\]\) \.desktopViewportNotice,[\s\S]*body:has\(\[data-avatar-foundry="true"\]\) \.desktopViewportNotice\s*\{[\s\S]*display:\s*none;/,
  );
  assert.match(
    cssSource,
    /@media \(max-width: 1180px\)[\s\S]*\.botAvatarCustomizer\[data-foundry="true"\] \.botAvatarControlStack\s*\{[\s\S]*left:\s*12px;[\s\S]*max-height:\s*43dvh;/,
  );
});

test("Powers read as an app-wide bot trait across active surfaces", () => {
  assert.match(
    pageSource,
    /Describe the magic or hard rule\. PRISM names it and makes it real\./u,
  );
  assert.doesNotMatch(pageSource, /apply only during Coffee sessions/u);
  assert.doesNotMatch(pageSource, /BotPower(?:Badge|NameplateIndicator)/u);
  assert.match(pageSource, /botPowerCupRateMultiplierForBotV1/u);
  assert.match(
    pageSource,
    /const coffeeCupRefused = coffeeCupPowerRateMultiplier === 0/u,
  );
  assert.match(
    pageSource,
    /coffeeCupRefused \|\|\s*refillSipLocked \|\|\s*coffeeSipTalkGateActive \|\|\s*seatIsThinking/u,
  );
  assert.match(pageSource, /How it plays out/u);
  assert.match(pageSource, /For other bots/u);
  assert.match(pageSource, /Built into PRISM/u);
  assert.match(pageSource, /Expressed in character/u);
  assert.doesNotMatch(pageSource, /deterministic (?:effect|outcome)/u);
  assert.match(cssSource, /\.botPowerBehaviorSummary/u);
  assert.match(cssSource, /\.botPowerBehaviorCard/u);
});

test("Power authoring locks its source, rerolls one artifact, and explains behavior plainly", () => {
  assert.match(pageSource, /data-power-source="locked"/u);
  assert.match(pageSource, /Original prompt/u);
  assert.match(
    pageSource,
    /Locked after creation\. Rerolls always build from this\./u,
  );
  assert.match(pageSource, /onCompile\(next, power\.id\)/u);
  assert.match(pageSource, /onCompile\(powers, power\.id\)/u);
  assert.match(pageSource, /power\.id === powerId &&/u);
  assert.match(pageSource, /powers: drafts/u);
  assert.match(pageSource, /compiledById\.get\(power\.id\) \?\? power/u);
  assert.match(pageSource, /Reroll Power/u);
  assert.match(pageSource, /How it plays out/u);
  assert.match(pageSource, /botPowerRuleLabelForDisplay\(label\)/u);
  assert.match(pageSource, /For other bots/u);
  assert.match(pageSource, /Built into PRISM/u);
  assert.match(pageSource, /Expressed in character/u);
  assert.doesNotMatch(pageSource, /deterministic (?:effect|outcome)/u);
  assert.match(cssSource, /\.botPowerSourcePrompt/u);
  assert.match(cssSource, /\.botPowerBehaviorSummary/u);
  assert.match(cssSource, /\.botPowerBehaviorCard/u);
});

test("Power counters never render beside or below bot avatars", () => {
  assert.doesNotMatch(pageSource, /BotPower(?:Badge|NameplateIndicator)/u);
  assert.doesNotMatch(cssSource, /botPower(?:SurfaceBadge|NameplateIndicator)/u);
});
