import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("./AvatarDetailsEditor.tsx", import.meta.url),
  "utf8",
);
const maskSource = readFileSync(
  new URL("./AvatarDetailsMask.tsx", import.meta.url),
  "utf8",
);
const maskCss = readFileSync(
  new URL("./avatar-details-mask.module.css", import.meta.url),
  "utf8",
);
const editorCss = readFileSync(
  new URL("./avatar-details-editor.module.css", import.meta.url),
  "utf8",
);

describe("Avatar Details Studio integration", () => {
  it("shows Details for every custom bot in development and release builds", () => {
    assert.match(pageSource, /\{ value: "details", label: "Details" \}/);
    assert.match(pageSource, /detailsEditorVisible=\{!editingDefaultBot\}/);
    assert.match(
      pageSource,
      /detailsEditorVisible \|\| tab\.value !== "details"/,
    );
    assert.match(pageSource, /isDefaultPrismBot \? null : avatarDetails/);
    assert.doesNotMatch(
      pageSource,
      /detailsEditorVisible=\{Boolean\(editingBotId\)/,
    );
    assert.doesNotMatch(pageSource, /prismAvatarDetailsPaneEnabled/);
  });

  it("keeps the recipe local until Apply and guards dirty tab or close navigation", () => {
    assert.match(editorSource, /const \[working, setWorking\]/);
    assert.match(editorSource, /onApply\(next\)/);
    assert.match(editorSource, /beforeunload/);
    assert.match(
      pageSource,
      /detailsEditorRef\.current\?\.hasDirtyChanges\(\)/,
    );
    assert.match(pageSource, /Apply avatar details\?/);
  });

  it("keeps Details focused on screen ink without accessory preset controls", () => {
    assert.match(editorSource, /<strong>Screen editor<\/strong>/);
    assert.doesNotMatch(editorSource, /AVATAR_DETAIL_STAMP_DEFINITIONS/);
    assert.doesNotMatch(editorSource, /AvatarStampAdjustments/);
    assert.doesNotMatch(editorSource, /Round glasses|Facial hair|Marking/);
    assert.doesNotMatch(editorSource, /Reset details/);
    assert.match(
      editorSource,
      /screen: \{ \.\.\.workingRef\.current\.screen, paintMaskBase64: null \}/,
    );
  });

  it("offers an opt-in blink ink control and keeps it in the Details working copy", () => {
    assert.match(editorSource, /type="checkbox"/);
    assert.match(editorSource, /Hide ink while blinking/);
    assert.match(
      editorSource,
      /checked=\{working\.screen\.hideInkDuringBlink === true\}/,
    );
    assert.match(editorSource, /setAvatarDetailsHideInkDuringBlink\(/);
    assert.match(editorCss, /\.blinkInkControl/);
  });

  it("renders a frozen, toggleable face guide beneath the canonical editor canvas", () => {
    assert.match(editorSource, /data-avatar-details-face-guide="true"/);
    assert.match(
      editorSource,
      /const \[faceGuideVisible, setFaceGuideVisible\] = useState\(true\)/,
    );
    assert.match(editorSource, /enabled=\{false\}/);
    assert.match(editorSource, /forceBlinkPhase="open"/);
    assert.match(editorSource, /faceStyle:\s*BotFaceStyle/);
    assert.match(
      editorCss,
      /\.faceGuide\[data-visible="true"\][\s\S]*opacity:\s*0\.34/,
    );
    assert.match(editorSource, /BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT\.yPct/);
    assert.match(
      editorSource,
      /BOT_AVATAR_SCREEN_EDITOR_FACE_GLYPH_FRAME_RATIO \* 100/,
    );
    assert.match(
      pageSource,
      /"--coffee-plate-emoji-face-scale-y": BOT_AVATAR_CANONICAL_FACE_SCALE_Y/,
    );
    assert.match(pageSource, /"--avatar-details-scale-x": "1"/);
    assert.match(editorSource, /data-avatar-details-writable-guide="true"/);
    assert.match(editorSource, /avatarDetailsWritablePixel\(x, y\)/);
    assert.match(editorSource, /data-avatar-details-editor-emission="halo"/);
    assert.match(editorSource, /data-avatar-details-editor-emission="bloom"/);
    assert.match(editorCss, /\.paintCore[\s\S]*mix-blend-mode: screen/);
  });

  it("keeps a 3x3 tab grid and scrollable drawing controls", () => {
    assert.match(editorCss, /--avatar-details-editor-canvas-size:\s*512px/);
    assert.match(
      editorCss,
      /@media \(min-width: 900px\) and \(min-height: 850px\)[\s\S]*grid-template-areas:[\s\S]*"tools tools"[\s\S]*"canvas canvas"[\s\S]*"blink coverage"/,
    );
    assert.match(
      editorCss,
      /clamp\(\s*220px,\s*calc\(100dvh - 490px\),\s*var\(--avatar-details-editor-canvas-size\)/,
    );
    assert.match(pageSource, /data-active-control-tab=\{activeControlTab\}/);
    assert.match(pageSource, /data-avatar-control-stack="true"/);
    assert.match(
      pageCss,
      /\.botAvatarCustomizerBody\s*\{[\s\S]*grid-template-columns:\s*minmax\(560px, 1fr\) minmax\(390px, 460px\)/,
    );
    assert.match(
      pageCss,
      /\.botAvatarControlTabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    assert.doesNotMatch(pageCss, /grid-template-columns:\s*repeat\(9,/);
    assert.match(
      pageCss,
      /\.botAvatarControlStack\s*\{[\s\S]*overflow-y:\s*auto/,
    );
    assert.doesNotMatch(
      pageCss,
      /\.botAvatarCustomizerBody[^{]*data-active-control-tab[^}]*\.botAvatarControlStack\s*\{[\s\S]*overflow-y:\s*hidden/,
    );
    assert.match(
      editorSource,
      /ref=\{canvasRef\}[\s\S]*?width=\{AVATAR_DETAILS_CANVAS_SIZE\}[\s\S]*?height=\{AVATAR_DETAILS_CANVAS_SIZE\}/,
    );
  });

  it("coalesces live preview updates and flushes the completed stroke", () => {
    assert.match(editorSource, /data-avatar-details-editor-core="true"/);
    assert.match(editorSource, /className=\{styles\.inputSurface\}/);
    assert.match(editorCss, /\.canvas\s*\{[\s\S]*pointer-events:\s*none/);
    assert.match(editorCss, /\.inputSurface\s*\{[\s\S]*z-index:\s*4/);
    assert.match(
      editorSource,
      /Safari standalone web apps can reject pointer capture/,
    );
    assert.match(
      editorSource,
      /window\.requestAnimationFrame\(\s*publishPendingPreview/,
    );
    assert.match(
      editorSource,
      /window\.cancelAnimationFrame\(previewFrameRef\.current\)/,
    );
    assert.match(editorSource, /flushPreview\(workingRef\.current\)/);
  });

  it("offers straight lines, circles, and whole-illustration dragging without hotkeys", () => {
    assert.match(editorSource, />\s*Line\s*<\/button>/);
    assert.match(editorSource, />\s*Circle\s*<\/button>/);
    assert.match(editorSource, />\s*Drag\s*<\/button>/);
    assert.match(
      editorSource,
      /interpolateAvatarDetailsGridLine\(stroke\.startPoint, edge\)/,
    );
    assert.match(editorSource, /avatarDetailsCirclePoints\(/);
    assert.match(editorSource, /moveAvatarDetailsPaintMask\(/);
    assert.match(editorSource, /setPaintMode\("circle"\)/);
    assert.match(editorSource, /setPaintMode\("move"\)/);
    assert.match(editorSource, /data-tool=\{paintMode\}/);
    assert.match(
      editorCss,
      /\.inputSurface\[data-tool="move"\][\s\S]*cursor:\s*grab/,
    );
    assert.doesNotMatch(editorSource, /onKeyDown=\{handleCanvasKeyDown\}/);
    assert.doesNotMatch(editorSource, /Keyboard: B\/E\/C\/M/);
    assert.doesNotMatch(editorCss, /\.keyboardHelp|\.keyboardCursor/);
  });

  it("guards Studio saves and waits for applied Details state before persisting", () => {
    assert.match(
      pageSource,
      /className=\{styles\.botAvatarCustomizerSaveButton\}[\s\S]*onClick=\{\(\) => requestStudioSave\(\)\}/,
    );
    assert.match(pageSource, /openDetailsLeavePrompt\(\{ kind: "save" \}\)/);
    assert.match(pageSource, /await detailsEditorRef\.current\?\.apply\(\)/);
    assert.match(
      pageSource,
      /if \(!applied\)[\s\S]*setDetailsLeaveRequest\(null\)[\s\S]*continueDetailsNavigation\(request\)/,
    );
    assert.match(
      pageSource,
      /setPendingDetailsSaveKey\(avatarDetailsKey\(avatarDetailsPreview\)\)/,
    );
    assert.match(
      pageSource,
      /avatarDetailsKey\(avatarDetails\) !== pendingDetailsSaveKey/,
    );
    assert.match(pageSource, /Apply avatar details before saving\?/);
    assert.doesNotMatch(
      pageSource,
      /className=\{styles\.botAvatarCustomizerSaveButton\}[\s\S]{0,240}onClick=\{\(\) => void onSave\(\)\}/,
    );
  });

  it("keeps draft, create, clone, edit, and save state wired", () => {
    assert.match(pageSource, /useState<BotAvatarDetailsV1 \| null>\(null\)/);
    assert.match(pageSource, /avatarDetails: newBotAvatarDetails/);
    assert.match(pageSource, /avatarDetails: resolveBotAvatarDetails\(bot\)/);
    assert.match(
      pageSource,
      /const seededAvatarDetails = resolveBotAvatarDetails\(bot\)/,
    );
    assert.match(
      pageSource,
      /pushBotAvatarUndoSnapshot\("avatar-details"\);[\s\S]*setNewBotAvatarDetails\(normalized\);/,
    );
  });
});

describe("Avatar Details shared mannequin rendering", () => {
  it("composites persistent phosphor canvases with glyphs beneath glass", () => {
    const maskIndex = pageSource.indexOf("<AvatarDetailsMask");
    const faceRigIndex = pageSource.indexOf(
      "className={styles.zenLiveBotPresenceFaceRig}",
      maskIndex,
    );
    const glassIndex = pageSource.indexOf(
      "className={styles.zenLiveBotPresenceScreenGlassOverlay}",
      faceRigIndex,
    );
    assert.ok(maskIndex > 0);
    assert.ok(faceRigIndex > maskIndex);
    assert.ok(glassIndex > faceRigIndex);
    assert.match(maskSource, /<canvas/);
    assert.match(maskSource, /useLayoutEffect/);
    assert.match(maskSource, /context\.putImageData\(glowImageData, 0, 0\)/);
    assert.match(
      maskSource,
      /coreContext\.putImageData\(coreImageData, 0, 0\)/,
    );
    assert.doesNotMatch(maskSource, /toBlob|createObjectURL|maskState/);
    assert.match(
      maskSource,
      /data-avatar-details-rendering="nearest-neighbor"/,
    );
    assert.match(maskCss, /image-rendering: pixelated/);
    assert.match(maskCss, /z-index: 7/);
    assert.match(maskSource, /data-avatar-details-emission="halo"/);
    assert.match(maskSource, /data-avatar-details-emission="bloom"/);
    assert.match(maskSource, /data-avatar-details-emission="core"/);
    assert.match(
      maskCss,
      /--avatar-details-phosphor-glow-color:\s*var\(\s*--crt-face-edge-color,\s*currentColor\s*\)/,
    );
    assert.match(
      maskSource,
      /\["--avatar-details-phosphor-glow-color" as string\]: normalizedColor/,
    );
    assert.match(maskCss, /\.halo[\s\S]*mix-blend-mode: screen/);
    assert.match(maskCss, /\.halo[\s\S]*opacity:\s*1/);
    assert.match(
      maskCss,
      /\.halo[\s\S]*0 0 6px[\s\S]*0 0 12px[\s\S]*0 0 21px/,
    );
    assert.match(maskCss, /\.bloom[\s\S]*opacity:\s*1/);
    assert.match(
      maskCss,
      /\.bloom[\s\S]*0 0 0\.72px[\s\S]*0 0 1\.5px[\s\S]*0 0 3px[\s\S]*0 0 6px[\s\S]*0 0 12px[\s\S]*0 0 21px/,
    );
    assert.match(
      editorCss,
      /\.paintEmission[\s\S]*--avatar-details-phosphor-glow-color/,
    );
    assert.match(editorCss, /\.paintHalo[\s\S]*mix-blend-mode: screen/);
    assert.match(editorCss, /\.paintHalo[\s\S]*opacity:\s*1/);
    assert.match(editorCss, /\.paintBloom[\s\S]*opacity:\s*1/);
    assert.match(
      editorCss,
      /\.paintBloom[\s\S]*0 0 0\.6px[\s\S]*0 0 1\.2px[\s\S]*0 0 2\.4px[\s\S]*0 0 4\.8px[\s\S]*0 0 9\.6px[\s\S]*0 0 16\.8px/,
    );
    assert.match(maskSource, /avatarDetailsPhosphorCoreRgba\(pixels\)/);
    assert.match(maskCss, /\.core[\s\S]*opacity:\s*1[\s\S]*drop-shadow/);
  });

  it("mirrors authored screen ink with the face and hides it behind the thinking spinner", () => {
    assert.match(pageSource, /avatarDetails=\{avatarDetailsPreview\}/);
    assert.match(
      pageSource,
      /avatarDetails=\{bot \? resolveBotAvatarDetails\(bot\) : null\}/,
    );
    assert.match(
      pageSource,
      /avatarDetails=\{resolveBotAvatarDetails\(bot\)\}/,
    );
    assert.match(
      maskCss,
      /scaleX\(var\(--avatar-details-scale-x, 1\)\)[\s\S]*scaleX\(var\(--avatar-details-facing-scale-x, 1\)\)/,
    );
    assert.doesNotMatch(maskCss, /--coffee-plate-emoji-face-scale-y/);
    assert.match(
      pageSource,
      /"--avatar-details-facing-scale-x": botAvatarDetailsFacingScaleX\(faceScaleY\)/,
    );
    assert.match(
      pageSource,
      /\["--avatar-details-facing-scale-x" as string\]:\s*botAvatarDetailsFacingScaleX\(coffeePlateFaceScaleY\)/,
    );
    assert.match(pageSource, /"--avatar-details-facing-scale-x": "1"/);
    assert.match(
      pageSource,
      /!showThinkingSpinner \? \([\s\S]*?<AvatarDetailsMask[\s\S]*?\) : null/,
    );
    assert.match(pageSource, /avatarDetailsColor=\{normalizeAccentForTheme\(/);
  });

  it("hides opted-in ink only for the shared mannequin's closed blink phase", () => {
    assert.match(
      pageSource,
      /avatarDetailsInkHiddenForBlink\([\s\S]*?avatarDetails,[\s\S]*?avatarDetailsBlinkPhase/,
    );
    assert.match(pageSource, /hiddenForBlink=\{hideAvatarDetailsForBlink\}/);
    assert.match(
      pageSource,
      /onBlinkPhaseChange=\{handleAvatarDetailsBlinkPhaseChange\}/,
    );
    assert.match(maskSource, /data-avatar-details-hidden-for-blink/);
    assert.match(
      maskCss,
      /\[data-avatar-details-hidden-for-blink="true"\][\s\S]*visibility:\s*hidden/,
    );
  });
});
