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
const avatarDetailsSource = readFileSync(
  new URL("./avatar-details.ts", import.meta.url),
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

  it("commits completed ink gestures into the Studio draft without a nested Apply boundary", () => {
    assert.match(editorSource, /const \[working, setWorking\]/);
    assert.match(editorSource, /if \(autoCommit\)/);
    assert.match(editorSource, /onApply\(cloneAvatarDetails\(next\)\)/);
    assert.match(editorSource, /beforeunload/);
    assert.match(pageSource, /layout="foundry"/);
    assert.match(pageSource, /autoCommit/);
    assert.match(editorSource, /layout === "panel" \? <footer/);
    assert.doesNotMatch(pageSource, /Apply avatar details\?/);
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

  it("equips searchable user-authored stamps that flatten into editable ink", () => {
    assert.match(editorSource, /<strong>Screen editor<\/strong>/);
    assert.match(editorSource, /Shell-scaled preview/);
    assert.match(editorSource, /<strong>Stamps<\/strong>/);
    assert.match(editorSource, /aria-label="Search stamps"/);
    assert.match(editorSource, /filterAvatarDetailInkTemplates\(/);
    assert.match(editorSource, /No stamps match/);
    assert.match(editorSource, /aria-label="Save current ink as a stamp"/);
    assert.match(editorSource, /createAvatarDetailInkTemplate\(/);
    assert.match(editorSource, /applyAvatarDetailInkTemplate\(/);
    assert.match(editorSource, /saveAvatarDetailInkTemplates\(/);
    assert.match(editorSource, /data-avatar-details-stamp-preview="true"/);
    assert.match(editorSource, /data-stamp-equipped="true"/);
    assert.match(editorSource, /aria-label="Make stamp smaller"/);
    assert.match(editorSource, /aria-label="Make stamp larger"/);
    assert.match(editorSource, /handleCanvasWheel/);
    assert.match(editorSource, /event\.key === "Enter"/);
    assert.match(editorSource, /event\.key === "Escape"/);
    assert.match(editorSource, /Use Move if you want to reposition it/);
    assert.match(editorSource, /setEquippedStampPosition/);
    assert.match(editorSource, /commitEquippedStamp/);
    assert.match(editorSource, /cancelEquippedStamp/);
    assert.match(editorSource, /Convert to ink/);
    assert.doesNotMatch(editorSource, /AVATAR_DETAIL_STAMP_DEFINITIONS/);
    assert.doesNotMatch(editorSource, /toggleAvatarDetailStamp\(/);
    assert.doesNotMatch(editorSource, /removeAvatarDetailStamp\(/);
    assert.doesNotMatch(editorSource, /Round glasses/);
    assert.doesNotMatch(editorSource, /Handlebar/);
    assert.doesNotMatch(editorSource, /Reset details/);
    assert.match(editorSource, /avatarDetailsWithPaintColorMap\(/);
    assert.match(editorSource, /aria-label="Randomize ink recipe"/);
    assert.match(pageSource, /templateOwnerId=\{avatarInkTemplateOwnerId\}/);
    assert.match(pageSource, /avatarInkTemplateOwnerId=\{user\?\.id \?\? "local"\}/);
    assert.match(pageSource, /label=\{`\$\{equippedInkStamp\.name\} position`\}/);
    assert.match(pageSource, /onEquippedStampChange=\{\(stamp\) =>/);
  });

  it("uses compact icon tools without losing labels or selected state", () => {
    for (const [label, tooltip] of [
      ["Brush tool", "Brush"],
      ["Paint bucket tool", "Paint bucket"],
      ["Line tool", "Line"],
      ["Circle tool", "Circle"],
      ["Vertical symmetry tool", "Vertical symmetry"],
      ["Move ink tool", "Move ink"],
    ]) {
      assert.match(
        editorSource,
        new RegExp(
          `aria-label="${label}"[\\s\\S]{0,180}data-glyph-tooltip="${tooltip}"`,
        ),
      );
    }
    assert.doesNotMatch(editorSource, /aria-label="Eraser tool"/);
    assert.doesNotMatch(editorSource, /setPaintMode\("eraser"\)/);
    assert.match(editorSource, /aria-pressed=\{paintMode === "brush"\}/u);
    assert.match(
      editorCss,
      /\.segmentedControl\s*\{[\s\S]*grid-template-columns:\s*repeat\(6, minmax\(32px, 1fr\)\)/,
    );
    assert.match(editorSource, /<Brush size=\{15\} aria-hidden="true" \/>\s*<\/button>/);
    assert.doesNotMatch(editorSource, /<Brush[^>]+\/>\s*Brush/u);
  });

  it("mirrors drawing tools across a visible vertical center guide", () => {
    assert.match(
      editorSource,
      /const \[symmetryEnabled, setSymmetryEnabled\] = useState\(false\)/,
    );
    assert.match(editorSource, /aria-label="Vertical symmetry tool"/);
    assert.match(editorSource, /aria-pressed=\{symmetryEnabled\}/);
    assert.match(editorSource, /setSymmetryEnabled\(\(enabled\) => !enabled\)/);
    assert.match(
      editorSource,
      /symmetrizeAvatarDetailsGridPoints\(points, symmetryAxisX\)/,
    );
    assert.match(
      editorSource,
      /symmetrizeAvatarDetailsGridPoints\(\[point\], symmetryAxisX\)/,
    );
    assert.match(editorSource, /data-visible=\{symmetryEnabled \? "true" : "false"\}/);
    assert.match(editorSource, /Vertical symmetry is on at column/);
    assert.match(editorSource, /role="slider"/);
    assert.match(editorSource, /aria-label="Vertical symmetry axis"/);
    assert.match(editorSource, /onPointerDown=\{beginSymmetryAxisDrag\}/);
    assert.match(editorSource, /onKeyDown=\{handleSymmetryAxisKeyDown\}/);
    assert.match(editorSource, /styles\.symmetryHandleTop/);
    assert.match(editorSource, /styles\.symmetryHandleBottom/);
    assert.match(
      editorCss,
      /\.symmetryGuide\s*\{[\s\S]*left:\s*var\(--avatar-details-symmetry-axis-left, 50%\)/,
    );
    assert.match(editorCss, /\.symmetryHandleTop\s*\{[^}]*top:\s*7px/);
    assert.match(editorCss, /\.symmetryHandleBottom\s*\{[^}]*bottom:\s*7px/);
    assert.match(
      editorCss,
      /\.symmetryGuide\[data-visible="true"\]\s*\{[^}]*opacity:\s*0\.72/,
    );
  });

  it("adds white Erase beside the three semantic ink roles", () => {
    assert.doesNotMatch(editorSource, /type="checkbox"/);
    assert.doesNotMatch(editorSource, /Hide ink while/);
    assert.match(editorSource, /label: "Blink ink"/);
    assert.match(editorSource, /label: "Speech ink"/);
    assert.match(editorSource, /label: "Effect ink"/);
    assert.match(editorSource, /role: "erase"/);
    assert.match(editorSource, /label: "Erase"/);
    assert.match(editorSource, /Removes ink with any drawing tool\./);
    assert.match(
      editorSource,
      /Uses its own animation below; Default hides while talking or sipping\./,
    );
    assert.match(editorSource, /role="radiogroup"/);
    assert.match(editorSource, /role="radio"/);
    assert.match(
      editorSource,
      /option\.role === "erase"[\s\S]*\? "#ffffff"[\s\S]*AVATAR_DETAILS_INK_ROLE_COLORS\[option\.role\]/,
    );
    assert.match(
      editorSource,
      /Painted ink becomes the bot color\. Erase writes transparency\./,
    );
    assert.match(editorCss, /\.inkRoleOptions/);
    assert.match(editorCss, /\.runtimeColorNote/);
  });

  it("turns the Move palette into multi-select layers with Auto hit-testing", () => {
    assert.match(
      editorSource,
      /moveAvatarDetailsPaintColorMap\([\s\S]*stroke\.moveSelection/,
    );
    assert.match(
      editorSource,
      /const \[moveInkTarget, setMoveInkTarget\][\s\S]*useState<AvatarDetailsMoveTarget>\("auto"\)/,
    );
    assert.match(
      editorSource,
      /avatarDetailsMoveSelectionAt\(beforeColorMap, point\)/,
    );
    assert.match(
      editorSource,
      /selectedMoveInkRoles\.includes\(option\.role\)/,
    );
    assert.match(editorSource, /toggleMoveInkRole\(option\.role\)/);
    assert.match(editorSource, /aria-pressed=/);
    assert.match(editorSource, /isMoveAuto \? "Auto" : option\.label/);
    assert.match(
      editorSource,
      /Moves whichever ink layer the drag begins on\./,
    );
    assert.match(
      editorSource,
      /Select one or more layers, or let Auto pick what you grab\./,
    );
    assert.match(
      editorSource,
      /Selected layers move together\. Auto moves the layer under your pointer\./,
    );
    assert.doesNotMatch(editorSource, /Moves every ink type together\./);
    assert.doesNotMatch(editorSource, /Choose one ink layer, or All\./);
    assert.match(
      editorCss,
      /\.inkRoleOptions\[data-move-selection="true"\][\s\S]*button\[data-ink-role="auto"\][\s\S]*\.inkRoleSwatch[\s\S]*conic-gradient/,
    );
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
    assert.match(
      editorSource,
      /\.\.\.BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE/,
    );
    assert.match(
      pageSource,
      /"--coffee-plate-emoji-face-scale-y": BOT_AVATAR_CANONICAL_FACE_SCALE_Y/,
    );
    assert.match(pageSource, /"--avatar-details-facing-scale-x": "1"/);
    assert.doesNotMatch(pageSource, /"--avatar-details-scale-x"/);
    assert.match(editorSource, /data-avatar-details-writable-guide="true"/);
    assert.match(editorSource, /avatarDetailsWritablePixel\(x, y\)/);
    assert.match(editorSource, /rasterizeAvatarDetailsSemanticRgba\(/);
    assert.match(editorSource, /className=\{styles\.canvasViewport\}/);
    assert.match(
      editorSource,
      /className=\{styles\.canvasViewport\}\s+style=\{inkApertureStyle\}/,
    );
    assert.match(editorCss, /\.canvasViewport[\s\S]*transform:\s*scale\(1\.36\)/);
    assert.match(
      editorCss,
      /\.canvasViewport\s*\{[\s\S]*--zen-live-bot-body-frame-size:\s*100cqw/,
    );
    const faceGuideIndex = editorSource.indexOf(
      "data-avatar-details-face-guide=\"true\"",
    );
    const zoomedCanvasIndex = editorSource.indexOf(
      "className={styles.canvasViewport}",
    );
    assert.ok(faceGuideIndex > 0);
    assert.ok(zoomedCanvasIndex > 0);
    assert.ok(faceGuideIndex > zoomedCanvasIndex);
    assert.doesNotMatch(editorSource, /zoomedFaceYPct/);
    assert.match(
      editorSource,
      /"--coffee-plate-emoji-nudge-y": "clamp\(-5px, -2\.6%, -2px\)"/,
    );
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

  it("uses Preview's exact quantized glyph silhouette in the face guide", () => {
    assert.match(
      editorSource,
      /<CoffeeSeatPlateEmoji[\s\S]*?enabled=\{false\}[\s\S]*?pixelated/,
    );
    assert.match(editorCss, /data-crt-pixel-mask-ready="true"/);
    assert.match(
      editorCss,
      /-webkit-mask-image:\s*var\(--crt-phosphor-pixel-mask\)/,
    );
    assert.match(editorCss, /filter:\s*none\s*!important/);
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
      /\.botAvatarCustomizerBody[^{]*data-active-control-tab[^}]*\.botAvatarControlStack\s*\{[^}]*overflow-y:\s*hidden/,
    );
    assert.match(
      editorSource,
      /ref=\{canvasRef\}[\s\S]*?width=\{PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX\}[\s\S]*?height=\{PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX\}/,
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

  it("mounts the lightweight canvas directly inside the canonical CRT", () => {
    assert.match(
      pageSource,
      /screenMode=\{\s*activeControlTab === "details" && !inkLivePreview\s*\? "editing"\s*: "live"\s*\}/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.botAvatarFoundryInkMount\}/,
    );
    assert.match(editorSource, /createPortal\(canvasEditor, canvasPortalTarget\)/);
    assert.match(editorSource, /data-foundry-canvas=/);
    assert.match(editorSource, /data-avatar-details-pixel-grid="true"/);
    assert.match(
      pageSource,
      /data-avatar-details-grid-visible=\{[\s\S]*?foundryCameraEditable &&[\s\S]*?botAvatarFoundryPixelGridVisible\(foundryViewport\.zoom\)/,
    );
    assert.match(
      pageSource,
      /botAvatarFoundryPixelGridVisible\(normalized\.zoom\)[\s\S]*?stage\.setAttribute\("data-avatar-details-grid-visible", "true"\)[\s\S]*?stage\.removeAttribute\("data-avatar-details-grid-visible"\)/,
    );
    assert.match(
      editorCss,
      /\.pixelGrid\s*\{[\s\S]*?background-size:[\s\S]*?var\(--avatar-details-cell-size\)[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none/,
    );
    assert.match(
      editorCss,
      /\[data-avatar-details-grid-visible="true"\] \.pixelGrid\s*\{[\s\S]*?opacity:\s*0\.42/,
    );
    assert.match(
      editorCss,
      /\[data-avatar-details-grid-visible="true"\] \.canvas[\s\S]*?filter:\s*none !important/,
    );
    assert.match(editorSource, /resamplePhosphorRgbaForPresentation\(/);
    assert.match(editorSource, /inkResampleMode/);
    assert.match(
      editorSource,
      /data-avatar-details-grid-visible="true"/,
    );
    assert.match(maskSource, /pixelPerfectInk/);
    assert.match(maskSource, /resamplePhosphorRgbaForPresentation\(/);
    assert.match(
      maskCss,
      /\.core\[data-avatar-details-pixel-perfect="true"\][\s\S]*?filter:\s*none/,
    );
    assert.match(
      pageCss,
      /data-avatar-details-grid-visible="true"\][\s\S]*?\[data-avatar-details-emission\][\s\S]*?filter:\s*none !important/,
    );
    assert.match(
      pageSource,
      /pixelPerfectInk=\{botAvatarFoundryPixelGridVisible\(\s*foundryViewport\.zoom,\s*\)\}/,
    );
    assert.match(
      editorCss,
      /\.canvasFrame\[data-foundry-canvas="true"\] \.canvasViewport\s*\{[\s\S]*?transform:\s*none;[\s\S]*?transform-origin:\s*center;/,
    );
    assert.match(pageSource, /runtimeEffectsEnabled=\{screenMode === "live"\}/);
    assert.match(
      pageCss,
      /\.botAvatarCustomizerBody\[data-camera-mode="ink"\][\s\S]*?\.botAvatarFoundryCameraRig\[data-spatial-camera-rig="true"\]\s*\{[\s\S]*?transform:\s*translate3d\([\s\S]*?calc\(-11vw \+ var\(--foundry-pan-x, 0px\)\),[\s\S]*?calc\(10dvh \+ var\(--foundry-pan-y, 0px\)\),[\s\S]*?0[\s\S]*?\)\s*scale\(1\.78\) scale\(var\(--foundry-user-zoom, 1\)\)/,
    );
    assert.doesNotMatch(pageSource, /Render current avatar/);
  });

  it("keeps foundry ink interactive and synchronized with Studio history", () => {
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate \.botAvatarFoundryInkMount,[\s\S]*?\.zenLiveBotPresencePlate \.botAvatarFoundryInkMount \*[\s\S]*?pointer-events:\s*auto/,
    );
    assert.match(
      pageCss,
      /\.botAvatarCustomizerBody\[data-camera-mode="ink"\][\s\S]*?\.botAvatarFoundryNode\s*\{[\s\S]*?pointer-events:\s*none/,
    );
    assert.match(
      editorSource,
      /!autoCommit \|\|[\s\S]*?pointerStrokeRef\.current \|\|[\s\S]*?avatarDetailsEqual\(workingRef\.current, normalizedSource\)[\s\S]*?resetHistory\(\);[\s\S]*?updateWorking\(cloneAvatarDetails\(normalizedSource\)\)/,
    );
    assert.match(
      editorSource,
      /onPointerUp=\{finishPointerStroke\}[\s\S]*?onPointerCancel=\{finishPointerStroke\}/,
    );
    assert.doesNotMatch(
      editorSource,
      /onPointerCancel=\{\(event\) => \{[\s\S]*?updateWorking\(stroke\.before\)/,
    );
    assert.match(
      pageSource,
      /onAvatarDetailsApply=\{\(next\) => \{[\s\S]*?pushBotAvatarUndoSnapshot\(\);[\s\S]*?setNewBotAvatarDetails\(normalized\);/,
    );
    assert.doesNotMatch(
      pageSource,
      /pushBotAvatarUndoSnapshot\("avatar-details"\)/,
    );
  });

  it("offers bucket recoloring, shapes, and semantic-layer dragging without hotkeys", () => {
    assert.match(editorSource, /aria-label="Paint bucket tool"/u);
    assert.match(editorSource, /aria-label="Line tool"/u);
    assert.match(editorSource, /aria-label="Circle tool"/u);
    assert.match(editorSource, /aria-label="Move ink tool"/u);
    assert.match(
      editorSource,
      /interpolateAvatarDetailsGridLine\(stroke\.startPoint, edge\)/,
    );
    assert.match(editorSource, /avatarDetailsCirclePoints\(/);
    assert.match(editorSource, /recolorAvatarDetailsPaintColorRegion\(/);
    assert.match(editorSource, /inkRole === "erase"/);
    assert.match(editorSource, /moveAvatarDetailsPaintColorMap\(/);
    assert.match(editorSource, /setPaintMode\("bucket"\)/);
    assert.match(editorSource, /setPaintMode\("circle"\)/);
    assert.match(editorSource, /setPaintMode\("move"\)/);
    assert.match(
      editorSource,
      /data-tool=\{(?:equippedTemplate \? "stamp" : )?paintMode\}/,
    );
    assert.match(
      editorCss,
      /\.inputSurface\[data-tool="move"\][\s\S]*cursor:\s*grab/,
    );
    assert.doesNotMatch(editorSource, /Keyboard: B\/E\/C\/M/);
    assert.doesNotMatch(editorCss, /\.keyboardHelp|\.keyboardCursor/);
  });

  it("persists ink only through the top-level Studio save", () => {
    assert.match(
      pageSource,
      /className=\{styles\.botAvatarCustomizerSaveButton\}[\s\S]*onClick=\{\(\) => requestStudioSave\(\)\}/,
    );
    assert.match(pageSource, /const requestStudioSave =/);
    assert.match(pageSource, /void onSave\(\);/);
    assert.doesNotMatch(pageSource, /openDetailsLeavePrompt/);
    assert.doesNotMatch(pageSource, /pendingDetailsSaveKey/);
    assert.doesNotMatch(pageSource, /Apply avatar details before saving\?/);
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
      /pushBotAvatarUndoSnapshot\(\);[\s\S]*setNewBotAvatarDetails\(normalized\);/,
    );
    assert.doesNotMatch(pageSource, /persistBotAvatarDetails/);
    assert.match(
      pageSource,
      /async function saveBot\([\s\S]*avatarDetails: newBotAvatarDetails/,
    );
    assert.match(
      pageSource,
      /async function createBot\([\s\S]*avatarDetails: newBotAvatarDetails/,
    );

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
    assert.match(maskSource, /resamplePhosphorRgbaCoverage\(/);
    assert.match(
      maskSource,
      /data-avatar-details-rendering=\{[\s\S]*?rasterSize === AVATAR_DETAILS_CANVAS_SIZE[\s\S]*?"nearest-neighbor"[\s\S]*?: "coverage-sampled"/,
    );
    assert.match(maskCss, /image-rendering: pixelated/);
    assert.match(maskCss, /\.behindFace\s*\{[\s\S]*z-index:\s*5/);
    assert.match(maskCss, /\.aboveFace\s*\{[\s\S]*z-index:\s*7/);
    assert.match(
      maskSource,
      /detailLevel === "full" \? \([\s\S]*data-avatar-details-emission="halo"/,
    );
    assert.match(
      maskSource,
      /detailLevel === "full" &&[\s\S]*talking &&[\s\S]*speechMotionActive/,
    );
    assert.match(
      maskCss,
      /\.layer\[data-avatar-details-render-detail="reduced"\]\s*\{[^}]*animation:\s*none !important/u,
    );
    assert.match(
      maskCss,
      /\.bloom\[data-avatar-details-render-detail="reduced"\]\s*\{[^}]*opacity:[^}]*0\.28/u,
    );
    assert.match(maskSource, /"data-avatar-details-depth": depth/);
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
    assert.match(
      maskCss,
      /\.halo\s*\{[^}]*--avatar-details-emission-opacity:\s*0\.14[^}]*--zen-live-bot-crt-shared-flicker-opacity/,
    );
    assert.match(
      maskCss,
      /\.halo\s*\{[^}]*0 0 4px[^}]*0 0 8px[^}]*0 0 12px/,
    );
    assert.doesNotMatch(maskCss, /\.halo\s*\{[^}]*0 0 21px/);
    assert.match(
      maskCss,
      /\.bloom\s*\{[^}]*--avatar-details-emission-opacity:\s*1[^}]*--zen-live-bot-crt-shared-flicker-opacity/,
    );
    assert.match(
      maskCss,
      /\.bloom\s*\{[^}]*0 0 0\.72px[^}]*0 0 1\.5px[^}]*0 0 3px[^}]*82%[^}]*0 0 6px[^}]*58%[^}]*0 0 12px[^}]*36%[^}]*0 0 21px[^}]*22%/,
    );
    assert.match(maskSource, /avatarDetailsPhosphorCoreRgba\(pixels\)/);
    assert.match(maskSource, /coreColor = "phosphor"/);
    assert.match(
      maskSource,
      /coreColor === "ink" \? pixels : avatarDetailsPhosphorCoreRgba\(pixels\)/,
    );
    assert.match(
      maskCss,
      /\.core[\s\S]*--avatar-details-emission-opacity:\s*1[\s\S]*--zen-live-bot-crt-shared-flicker-opacity[\s\S]*drop-shadow/,
    );
    assert.match(
      maskCss,
      /\.core\s*\{[\s\S]*--zen-live-bot-crt-flicker-base-filter:\s*blur\(\s*var\(--crt-beam-softness,\s*0\.45px\)\s*\)[\s\S]*drop-shadow/,
    );
    assert.match(
      maskCss,
      /\.halo[\s\S]*--zen-live-bot-crt-flicker-base-filter:[\s\S]*--zen-live-bot-crt-shared-flicker-brightness-scale[\s\S]*var\(--zen-live-bot-crt-flicker-base-filter\)/,
    );
    assert.match(
      maskCss,
      /\.bloom[\s\S]*--zen-live-bot-crt-flicker-base-filter:[\s\S]*--zen-live-bot-crt-shared-flicker-brightness-scale[\s\S]*var\(--zen-live-bot-crt-flicker-base-filter\)/,
    );
    assert.match(
      maskCss,
      /\.core[\s\S]*mix-blend-mode:\s*normal[\s\S]*--zen-live-bot-crt-flicker-base-filter:[\s\S]*--zen-live-bot-crt-shared-flicker-brightness-scale[\s\S]*var\(--zen-live-bot-crt-flicker-base-filter\)/,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresenceBody\[data-render-detail="full"\][\s\S]*> \.zenLiveBotPresenceFaceEmissionMask[\s\S]*animation:\s*zenLiveBotCrtFaceFlicker 11\.7s linear infinite/,
    );
    assert.match(
      pageCss,
      /@keyframes zenLiveBotCrtFaceFlicker[\s\S]*--zen-live-bot-crt-shared-flicker-opacity:[\s\S]*--zen-live-bot-crt-shared-flicker-brightness-scale:[\s\S]*--zen-live-bot-crt-shared-flicker-contrast-scale:/,
    );
    assert.match(
      pageCss,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.zenLiveBotPresenceBody\[data-render-detail="full"\][\s\S]*> \.zenLiveBotPresenceFaceEmissionMask[\s\S]*animation:\s*none !important/,
    );
    assert.doesNotMatch(
      pageCss,
      /\.zenLiveBotPresenceFaceEmissionMask \[data-avatar-details-emission\][^{]*\{[^}]*zenLiveBotCrtFaceFlicker/,
    );
  });

  it("keeps authored screen coordinates canonical and yields to full-screen face effects", () => {
    assert.match(pageSource, /avatarDetails=\{avatarDetailsPreview\}/);
    assert.match(
      pageSource,
      /avatarDetails=\{bot \? resolveBotAvatarDetails\(bot\) : null\}/,
    );
    assert.match(
      pageSource,
      /avatarDetails=\{\s*playerJudgePrism \? null : botSnapshot\.avatarDetails\s*\}/,
    );
    assert.match(
      maskCss,
      /transform:[\s\S]*scaleX\(var\(--avatar-details-facing-scale-x, 1\)\)/,
    );
    assert.doesNotMatch(
      maskCss,
      /--avatar-details-(?:offset|scale-x|facing-offset)|--zen-live-bot-(?:ink-offset|face-thumbnail)/,
    );
    assert.match(
      editorCss,
      /\.screenBoundary,\s*\.canvas,\s*\.stampPreview,\s*\.pixelGrid,\s*\.symmetryGuide,\s*\.inputSurface\s*\{[\s\S]*transform:\s*scale\(var\(--avatar-details-ink-aperture-scale, 1\)\);[\s\S]*transform-origin:\s*center;/,
    );
    assert.doesNotMatch(pageCss, /--coffee-speaker-gaze-face-shift-x/);
    assert.doesNotMatch(
      pageCss,
      /\.coffeeSeat \.zenLiveBotPresenceFaceRig/,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*--avatar-details-facing-scale-x:\s*1;[^}]*--zen-live-bot-face-layer-scale-x:\s*1;[^}]*transform:\s*scaleX\(var\(--zen-live-bot-screen-facing-scale-x, 1\)\)/,
    );
    const screenContentRigRule = pageCss.match(
      /\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*\}/,
    )?.[0];
    assert.ok(screenContentRigRule);
    assert.doesNotMatch(
      screenContentRigRule,
      /--avatar-details-facing-offset-y\s*:/,
      "the shared rig may mirror Ink but must never translate it",
    );
    assert.match(
      pageSource,
      /const screenFacingScaleX = showQuestionMark\s*\? "1"\s*:\s*botAvatarDetailsFacingScaleX\(faceScaleY\)/,
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /className=\{styles\.zenLiveBotPresenceScreenContentRig\}[\s\S]{0,280}\["--zen-live-bot-screen-facing-scale-x" as string\]:\s*screenFacingScaleX/g,
        ),
      ].length,
      2,
      "both full and optimized screens must resolve facing on the shared face-and-ink rig",
    );
    assert.match(
      pageSource,
      /data-zen-live-bot-screen-content-rig="true"[\s\S]{0,900}depth="behind-face"[\s\S]*data-zen-live-bot-face-rig="true"[\s\S]*depth="above-face"/,
    );
    assert.match(pageSource, /faceScaleY\?:\s*string \| number/);
    assert.match(
      pageSource,
      /faceScaleY = BOT_AVATAR_CANONICAL_FACE_SCALE_Y[\s\S]*const presenceBodyStyle = \{[\s\S]{0,180}\.\.\.botAvatarFaceFacingStyle\(faceScaleY\)/,
    );
    const mannequinCalls = [
      ...pageSource.matchAll(/<ZenLiveBotMannequin\b[\s\S]*?\/>/gu),
    ];
    assert.ok(mannequinCalls.length > 0);
    for (const [mannequinCall] of mannequinCalls) {
      assert.match(
        mannequinCall,
        /\bfaceScaleY=\{/,
        "every full-avatar surface must pass its orientation into the shared face-and-ink rig",
      );
    }
    assert.equal(
      [...pageSource.matchAll(/data-avatar-face-coordinate-source="studio"/g)]
        .length,
      2,
    );
    assert.match(
      pageSource,
      /data-avatar-face-coordinate-source="studio"[\s\S]*?<CoffeeSeatPlateEmoji[\s\S]{0,220}\bpixelated\b/,
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /data-avatar-canonical-screen-size=\{[\s\S]{0,80}?PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX[\s\S]{0,20}?\}/g,
        ),
      ].length,
      2,
      "both full-size mannequin branches must rasterize on the shared dense phosphor plane",
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /rasterSize=\{PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX\}/g,
        ),
      ].length,
      4,
      "both Ink depth planes in both mannequin branches must use the shared dense phosphor plane",
    );
    assert.match(
      editorSource,
      /className=\{styles\.canvasViewport\}[\s\S]{0,180}data-avatar-canonical-screen-size=\{[\s\S]{0,80}?PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX[\s\S]{0,20}?\}/,
    );
    assert.match(
      editorSource,
      /resamplePhosphorRgbaCoverage\([\s\S]{0,260}?PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX/,
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
    assert.doesNotMatch(pageSource, /--avatar-details-facing-offset-y/);
    assert.match(
      avatarDetailsSource,
      /pixelRole[\s\S]{0,520}depth !== "behind-face"/,
    );
    assert.match(
      pageSource,
      /const hasAvatarDetailsVisuals = avatarDetailsHasVisuals\(avatarDetails\);[\s\S]*hasAvatarDetailsVisuals[\s\S]*BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.zenLiveBotPresenceBody\}[\s\S]{0,320}data-avatar-face-coordinate-source="studio"[\s\S]{0,80}style=\{presenceBodyStyle\}/,
    );
    assert.match(
      pageSource,
      /data-avatar-details-visuals=\{[\s\S]{0,100}hasAvatarDetailsVisuals \? "true" : undefined/,
    );
    assert.match(
      pageSource,
      /<AvatarDetailsMask[\s\S]{0,180}detailLevel=\{avatarDetailsDetailLevel\}/,
    );
    assert.doesNotMatch(
      pageSource,
      /ZEN_LIVE_BOT_FACE_INK_OFFSET_Y|\binkOffsetY=/,
      "live Zen must not nudge the Studio-authored face and ink coordinate space",
    );
    assert.match(
      pageSource,
      /\{directionIndependentThinkingScreen \?\? \([\s\S]*?data-zen-live-bot-screen-content-rig="true"/,
    );
  });

  it("keeps Default Speech ink hidden and animates it independently from Mouth", () => {
    assert.match(pageSource, /blinkPhase=\{avatarDetailsBlinkPhase\}/);
    assert.match(pageSource, /talking=\{inkTalking \?\? isTalking\}/);
    assert.match(pageSource, /speechMotionActive=\{isTalking\}/);
    assert.match(pageSource, /mouthShape=\{displayedMouthShape\}/);
    assert.doesNotMatch(maskSource, /mouthAnimation/);
    assert.match(
      editorSource,
      /<strong>Speech ink animation<\/strong>[\s\S]*Independent from Mouth animation\./,
    );
    assert.match(
      editorSource,
      /value=\{working\.screen\.speechInkAnimation \?\? "none"\}/,
    );
    assert.match(editorSource, /avatarDetailsWithSpeechInkAnimation\(/);
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
    assert.match(
      maskSource,
      /normalizedDetails\.screen\.speechInkAnimation \?\? "none"/,
    );
    assert.match(
      maskSource,
      /detailLevel === "full" &&[\s\S]*talking &&[\s\S]*speechMotionActive &&[\s\S]*speechInkAnimation !== "none"/,
    );
    assert.match(
      maskSource,
      /rasterizeAvatarDetailsRgba\([\s\S]*?"talking",[\s\S]*?depth/,
    );
    assert.match(maskSource, /data-avatar-details-ink-role/);
    assert.match(maskSource, /data-avatar-details-ink-motion/);
    assert.match(maskCss, /\.speechMotion\[data-avatar-details-ink-motion="pulsate"\]/);
    assert.match(maskCss, /--bot-face-mouth-pulse-scale-x/);
    assert.match(maskCss, /\.speechMotion\[data-avatar-details-ink-motion="flicker"\]/);
    assert.match(maskCss, /--bot-face-mouth-speech-opacity/);
    assert.match(maskCss, /\.speechMotion\[data-avatar-details-ink-motion="wobble"\]/);
    assert.match(maskSource, /avatarDetailsSpeechMotionOrigin\(/);
    assert.match(
      maskSource,
      /avatarDetailsSpeechMotionOrigin\(completeSpeechPixels\)/,
    );
    assert.match(
      maskSource,
      /completeSpeechPixels[\s\S]*?"talking",[\s\S]*?"all"/,
    );
    assert.match(
      maskCss,
      /translateX\(calc\(var\(--avatar-details-speech-origin-x, 50%\) - 50%\)\)/,
    );
    assert.match(
      maskCss,
      /translateY\(calc\(50% - var\(--avatar-details-speech-origin-y, 50%\)\)\)/,
    );
    assert.match(maskCss, /--bot-face-mouth-speech-wobble/);
    assert.match(
      pageCss,
      /\[data-avatar-details-emission\]\[data-avatar-details-ink-motion="spin"\][\s\S]*avatarDetailsSpeechInkSpin/,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresenceFaceEmissionMask[\s\S]*\)\[data-talking="true"\][\s\S]*--bot-face-mouth-pulse-scale-x/,
    );
    assert.match(
      pageSource,
      /inkTalking=\{[\s\S]*?seatMouthActive \|\|[\s\S]*?seatSipMouthTreatmentActive \|\|[\s\S]*?emptyCupAttemptFrowning[\s\S]*?\}/,
    );
    assert.match(
      pageSource,
      /inkTalking=\{avatarState\.talking \|\| sipMouthTreatmentActive\}/,
    );
  });
});
