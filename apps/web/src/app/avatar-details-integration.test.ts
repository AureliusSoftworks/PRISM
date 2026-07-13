import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
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
  it("shows Details only for custom bots on development branches", () => {
    assert.match(pageSource, /\{ value: "details", label: "Details" \}/);
    assert.match(
      pageSource,
      /detailsEditorVisible=\{\s*AVATAR_DETAILS_PANE_ENABLED && !editingDefaultBot\s*\}/,
    );
    assert.match(
      pageSource,
      /const AVATAR_DETAILS_PANE_ENABLED = prismAvatarDetailsPaneEnabled/,
    );
    assert.match(
      pageSource,
      /detailsEditorVisible \|\| tab\.value !== "details"/,
    );
    assert.match(pageSource, /isDefaultPrismBot \? null : avatarDetails/);
    assert.doesNotMatch(
      pageSource,
      /detailsEditorVisible=\{Boolean\(editingBotId\)/,
    );
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

  it("coalesces live preview updates and flushes the completed stroke", () => {
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
  it("places persistent phosphor canvases under glyphs and glass", () => {
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
    assert.match(maskCss, /z-index: 4/);
    assert.match(maskSource, /data-avatar-details-emission="halo"/);
    assert.match(maskSource, /data-avatar-details-emission="bloom"/);
    assert.match(maskSource, /data-avatar-details-emission="core"/);
    assert.match(maskCss, /\.halo[\s\S]*mix-blend-mode: plus-lighter/);
    assert.match(maskCss, /\.bloom[\s\S]*drop-shadow/);
    assert.match(maskSource, /avatarDetailsPhosphorCoreRgba\(pixels\)/);
    assert.match(maskCss, /\.core[\s\S]*opacity:\s*1[\s\S]*drop-shadow/);
  });

  it("passes normalized details through Studio, Zen, and Coffee without mirroring screen art", () => {
    assert.match(pageSource, /avatarDetails=\{avatarDetailsPreview\}/);
    assert.match(
      pageSource,
      /avatarDetails=\{bot \? resolveBotAvatarDetails\(bot\) : null\}/,
    );
    assert.match(
      pageSource,
      /avatarDetails=\{resolveBotAvatarDetails\(bot\)\}/,
    );
    assert.match(maskCss, /scaleX\(var\(--avatar-details-scale-x, 1\)\)/);
    assert.doesNotMatch(maskCss, /--coffee-plate-emoji-face-scale-y/);
    assert.match(pageSource, /avatarDetailsColor=\{normalizeAccentForTheme\(/);
  });
});
