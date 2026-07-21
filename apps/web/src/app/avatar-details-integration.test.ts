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

  it("routes Studio undo and redo to Ink before falling back to the avatar draft", () => {
    assert.match(editorSource, /undo\(\): boolean/);
    assert.match(editorSource, /redo\(\): boolean/);
    assert.match(editorSource, /undo,[\s\S]*redo,[\s\S]*hasDirtyChanges/);
    assert.match(
      pageSource,
      /activeControlTab === "details"[\s\S]*detailsEditorRef\.current\?\.redo\(\)[\s\S]*detailsEditorRef\.current\?\.undo\(\)/,
    );
    assert.match(pageSource, /const redoRequested = event\.shiftKey/);
    assert.match(pageSource, /if \(redoRequested\) onRedo\(\);[\s\S]*else onUndo\(\);/);
    assert.match(
      pageSource,
      /target\.closest\([\s\S]*input, textarea, \[contenteditable="true"\]/,
    );
  });

  it("keeps Details focused on screen ink without accessory preset controls", () => {
    assert.match(editorSource, /<strong>Screen editor<\/strong>/);
    assert.doesNotMatch(editorSource, /AVATAR_DETAIL_STAMP_DEFINITIONS/);
    assert.doesNotMatch(editorSource, /AvatarStampAdjustments/);
    assert.doesNotMatch(editorSource, /Round glasses|Facial hair|Marking/);
    assert.doesNotMatch(editorSource, /Reset details/);
    assert.match(editorSource, /avatarDetailsWithPaintColorMap\(/);
  });

  it("uses compact icon tools without losing labels or selected state", () => {
    for (const [label, tooltip] of [
      ["Brush tool", "Brush"],
      ["Eraser tool", "Eraser"],
      ["Line tool", "Line"],
      ["Circle tool", "Circle"],
      ["Move ink tool", "Move ink"],
    ]) {
      assert.match(
        editorSource,
        new RegExp(
          `aria-label="${label}"[\\s\\S]{0,180}data-glyph-tooltip="${tooltip}"`,
        ),
      );
    }
    assert.match(editorSource, /aria-pressed=\{paintMode === "brush"\}/u);
    assert.match(
      editorCss,
      /\.segmentedControl\s*\{[\s\S]*grid-template-columns:\s*repeat\(5, minmax\(32px, 1fr\)\)/,
    );
    assert.match(editorSource, /<Brush size=\{15\} aria-hidden="true" \/>\s*<\/button>/);
    assert.doesNotMatch(editorSource, /<Brush[^>]+\/>\s*Brush/u);
  });

  it("uses red, blue, and green ink roles instead of visibility toggles", () => {
    assert.doesNotMatch(editorSource, /type="checkbox"/);
    assert.doesNotMatch(editorSource, /Hide ink while/);
    assert.match(editorSource, /label: "Blink ink"/);
    assert.match(editorSource, /label: "Speech ink"/);
    assert.match(editorSource, /label: "Effect ink"/);
    assert.match(editorSource, /Hides while talking or sipping\./);
    assert.match(editorSource, /role="radiogroup"/);
    assert.match(editorSource, /role="radio"/);
    assert.match(
      editorSource,
      /AVATAR_DETAILS_INK_ROLE_COLORS\[option\.role\]/,
    );
    assert.match(
      editorSource,
      /every ink color becomes its normalized bot color/,
    );
    assert.match(editorCss, /\.inkRoleOptions/);
    assert.match(editorCss, /\.runtimeColorNote/);
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
      /\.faceGuide\[data-visible="true"\][\s\S]*opacity:\s*0\.82/,
    );
    assert.match(
      editorSource,
      /const guideInk = theme === "light" \? "#050608" : "#ffffff"/,
    );
    assert.match(
      editorCss,
      /\.editor\[data-editor-theme="light"\] \.canvasFrame\s*\{[\s\S]*?background-color:\s*#ffffff/,
    );
    assert.match(editorSource, /BOT_AVATAR_DETAILS_FACE_PLACEMENT\.yPct/);
    assert.match(
      pageSource,
      /"--coffee-plate-emoji-face-scale-y": BOT_AVATAR_CANONICAL_FACE_SCALE_Y/,
    );
    assert.match(pageSource, /"--avatar-details-scale-x": "1"/);
    assert.match(editorSource, /data-avatar-details-writable-guide="true"/);
    assert.match(editorSource, /avatarDetailsWritablePixel\(x, y\)/);
    assert.match(editorSource, /rasterizeAvatarDetailsSemanticRgba\(/);
    assert.match(editorSource, /className=\{styles\.canvasViewport\}/);
    assert.match(editorCss, /\.canvasViewport[\s\S]*transform:\s*scale\(1\.36\)/);
    assert.match(editorSource, /const AVATAR_DETAILS_EDITOR_ZOOM = 1\.36/);
    assert.match(
      editorSource,
      /BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO \* AVATAR_DETAILS_EDITOR_ZOOM \* 100/,
    );
    const faceGuideIndex = editorSource.indexOf(
      "data-avatar-details-face-guide=\"true\"",
    );
    const zoomedCanvasIndex = editorSource.indexOf(
      "<div className={styles.canvasViewport}>",
    );
    assert.ok(faceGuideIndex > 0);
    assert.ok(zoomedCanvasIndex > faceGuideIndex);
  });

  it("keeps the editable face guide crisp instead of compositing the live CRT glow", () => {
    assert.match(
      editorCss,
      /\.canvasFrame\s*\{[\s\S]*contain:\s*layout paint;[\s\S]*isolation:\s*isolate;[\s\S]*box-shadow:\s*none;/,
    );
    assert.match(
      editorCss,
      /\.faceGuideGlyph \[data-crt-glyph-layer="true"\]\s*\{[\s\S]*filter:\s*none !important;[\s\S]*mix-blend-mode:\s*normal !important;[\s\S]*text-shadow:\s*none !important;/,
    );
    assert.match(
      editorCss,
      /\.faceGuideGlyph \[data-crt-glyph-layer="true"\]::before,[\s\S]*::after\s*\{[\s\S]*content:\s*none !important;[\s\S]*display:\s*none !important;/,
    );
  });

  it("gives Details a larger canvas and a dedicated wide Studio layout", () => {
    assert.match(editorCss, /--avatar-details-editor-canvas-size:\s*640px/);
    assert.match(
      editorCss,
      /@container \(min-width: 720px\)[\s\S]*grid-template-columns:\s*minmax\(440px, 1fr\) minmax\(220px, 250px\)[\s\S]*"canvas tools"[\s\S]*"canvas palette"[\s\S]*"canvas coverage"/,
    );
    assert.match(pageSource, /data-active-control-tab=\{activeControlTab\}/);
    assert.match(pageSource, /data-avatar-control-stack="true"/);
    assert.match(
      pageCss,
      /\.botAvatarCustomizerBody\s*\{[\s\S]*grid-template-columns:\s*minmax\(560px, 1fr\) minmax\(390px, 460px\)/,
    );
    assert.match(
      pageCss,
      /\.botAvatarCustomizerBody\[data-active-control-tab="details"\][\s\S]*grid-template-columns:\s*minmax\(320px, 0\.55fr\) minmax\(680px, 1\.45fr\)/,
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

  it("keeps the editor live while deferring the large avatar preview until stroke end", () => {
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
      /const updateWorking = useCallback\([\s\S]*publishPreview = true, deferRender = false[\s\S]*if \(deferRender\)[\s\S]*drawWorkingCanvas\(normalized\)[\s\S]*if \(publishPreview\) queuePreviewRef\.current\(normalized\)/,
    );
    assert.match(
      editorSource,
      /avatarDetailsWithPaintColorMap\(current, result\.colorMap\),\s*\{ publishPreview: false, deferRender: true \}/,
    );
    assert.match(
      editorSource,
      /const sampledPoints = samples\.map[\s\S]*const paintPath: AvatarDetailsGridPoint\[\] = \[\][\s\S]*paintPoints\(paintPath\)/,
    );
    assert.match(
      editorSource,
      /window\.cancelAnimationFrame\(previewFrameRef\.current\)/,
    );
    assert.match(
      editorSource,
      /commitAvatarDetailsHistory\([\s\S]*workingRef\.current,[\s\S]*\),\s*false,[\s\S]*flushPreview\(workingRef\.current\)/,
    );
    assert.match(editorSource, /flushPreview\(workingRef\.current\)/);
  });

  it("unmounts the large avatar throughout Details editing until explicitly rendered", () => {
    assert.match(
      pageSource,
      /const \[detailsAvatarPreviewVisible, setDetailsAvatarPreviewVisible\] =\s*useState\(false\)/,
    );
    assert.match(
      pageSource,
      /activeControlTab === "details" &&\s*!detailsAvatarPreviewVisible[\s\S]*<BotAvatarDeferredPreviewPanel/,
    );
    assert.match(pageSource, />\s*Render current avatar\s*<\/button>/);
    assert.match(pageSource, /data-avatar-preview-deferred="true"/);
    assert.match(
      pageSource,
      /onEditStart=\{\(\) => setDetailsAvatarPreviewVisible\(false\)\}/,
    );
    assert.match(editorSource, /onEditStart\?\.\(\);[\s\S]*pointerGridPoint/);
    assert.match(pageCss, /\.botAvatarDeferredPreviewPrompt/);
  });

  it("offers straight lines, circles, and whole-illustration dragging without hotkeys", () => {
    assert.match(editorSource, /aria-label="Line tool"/u);
    assert.match(editorSource, /aria-label="Circle tool"/u);
    assert.match(editorSource, /aria-label="Move ink tool"/u);
    assert.match(
      editorSource,
      /interpolateAvatarDetailsGridLine\(stroke\.startPoint, edge\)/,
    );
    assert.match(editorSource, /avatarDetailsCirclePoints\(/);
    assert.match(editorSource, /moveAvatarDetailsPaintColorMap\(/);
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
    assert.match(
      pageSource,
      /if \(editingBotId\) \{[\s\S]*await persistBotAvatarDetails\([\s\S]*editingBotId,[\s\S]*normalized/,
    );
    const persistenceSource = pageSource.slice(
      pageSource.indexOf("async function persistBotAvatarDetails("),
      pageSource.indexOf("async function flushBotVoiceAutosaveQueue("),
    );
    assert.match(persistenceSource, /method: "PATCH"/);
    assert.match(persistenceSource, /JSON\.stringify\(\{ avatarDetails: details \}\)/);
    assert.match(persistenceSource, /avatarDetails: details/);
    assert.match(persistenceSource, /replaceBotRowById/);

    const cloneSource = pageSource.slice(
      pageSource.indexOf("async function cloneBot("),
      pageSource.indexOf("async function duplicateCurrentBotDraft("),
    );
    assert.match(cloneSource, /cloneSourceBotId: bot\.id/);
    const duplicateSource = pageSource.slice(
      pageSource.indexOf("async function duplicateCurrentBotDraft("),
      pageSource.indexOf("function createDefaultBotGroupName("),
    );
    assert.match(duplicateSource, /cloneSourceBotId: editingBotId/);
  });
});

describe("Avatar Details shared mannequin rendering", () => {
  it("composites beard ink below the face and upper detail above it beneath glass", () => {
    const behindMaskIndex = pageSource.indexOf("<AvatarDetailsMask");
    const faceRigIndex = pageSource.indexOf(
      "className={styles.zenLiveBotPresenceFaceRig}",
      behindMaskIndex,
    );
    const aboveMaskIndex = pageSource.indexOf(
      "<AvatarDetailsMask",
      faceRigIndex,
    );
    const glassIndex = pageSource.indexOf(
      "className={styles.zenLiveBotPresenceScreenGlassOverlay}",
      aboveMaskIndex,
    );
    assert.ok(behindMaskIndex > 0);
    assert.ok(faceRigIndex > behindMaskIndex);
    assert.ok(aboveMaskIndex > faceRigIndex);
    assert.ok(glassIndex > aboveMaskIndex);
    assert.match(
      pageSource.slice(behindMaskIndex, faceRigIndex),
      /depth="behind-face"/,
    );
    assert.match(
      pageSource.slice(aboveMaskIndex, glassIndex),
      /depth="above-face"/,
    );
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
    assert.match(maskCss, /\.behindFace\s*\{[\s\S]*z-index:\s*5/);
    assert.match(maskCss, /\.aboveFace\s*\{[\s\S]*z-index:\s*7/);
    assert.match(maskSource, /data-avatar-details-depth=\{depth\}/);
    assert.doesNotMatch(maskSource, /className=\{styles\.group\}/);
    assert.match(
      pageCss,
      /\.zenLiveBotPresenceFaceRig[\s\S]*z-index: 6/,
    );
    assert.match(pageCss, /\.botFaceCrtGrimeLayer[\s\S]*z-index: 8/);
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
    assert.match(maskSource, /avatarDetailsPhosphorCoreRgba\(pixels\)/);
    assert.match(maskCss, /\.core[\s\S]*opacity:\s*1[\s\S]*drop-shadow/);
  });

  it("mirrors authored screen ink and yields to full-screen face effects", () => {
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
    assert.match(
      pageCss,
      /\.zenLiveBotPresenceFaceRig[\s\S]*scaleX\(var\(--zen-live-bot-face-layer-scale-x, 1\)\)/,
    );
    assert.match(
      pageSource,
      /\["--coffee-plate-emoji-face-scale-y" as string\]:\s*BOT_AVATAR_CANONICAL_FACE_SCALE_Y[\s\S]*\["--zen-live-bot-face-layer-scale-x" as string\]:\s*showQuestionMark\s*\? "1"\s*:\s*"var\(--avatar-details-facing-scale-x, 1\)"/,
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
      /avatarDetailsHasVisuals\(\s*avatarDetails,\s*\)[\s\S]*BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.zenLiveBotPresenceBody\}[\s\S]{0,220}style=\{avatarDetailsFaceRegistrationStyle\}/,
    );
    assert.match(
      pageSource,
      /!thinkingSpinnerActive && !showQuestionMark \? \([\s\S]*?<AvatarDetailsMask[\s\S]*?\) : null/,
    );
    assert.match(pageSource, /avatarDetailsColor=\{normalizeAccentForTheme\(/);
  });

  it("hides only the matching semantic ink for blink, talking, and sipping", () => {
    assert.match(pageSource, /blinkPhase=\{avatarDetailsBlinkPhase\}/);
    assert.match(pageSource, /talking=\{inkTalking \?\? isTalking\}/);
    assert.match(
      pageSource,
      /onBlinkPhaseChange=\{handleAvatarDetailsBlinkPhaseChange\}/,
    );
    assert.match(
      maskSource,
      /rasterizeVisibleAvatarDetailsRgba\(/,
    );
    assert.match(
      maskSource,
      /blinking: blinkPhase === "closed"/,
    );
    assert.match(maskSource, /talking,\s*\},\s*depth,\s*\),/);
    assert.doesNotMatch(maskSource, /AvatarDetailsRoleLayer/);
    assert.doesNotMatch(maskSource, /data-avatar-details-ink-role/);
    assert.match(
      pageSource,
      /inkTalking=\{[\s\S]*?isTableTypingThisSeat \|\|[\s\S]*?seatSipPresentation\.active[\s\S]*?\}/,
    );
    assert.match(
      pageSource,
      /inkTalking=\{avatarState\.talking \|\| sipPresentation\.active\}/,
    );
  });
});
