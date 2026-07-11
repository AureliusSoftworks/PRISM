import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(
  new URL("./AvatarDetailsEditor.tsx", import.meta.url),
  "utf8"
);
const maskSource = readFileSync(
  new URL("./AvatarDetailsMask.tsx", import.meta.url),
  "utf8"
);
const maskCss = readFileSync(
  new URL("./avatar-details-mask.module.css", import.meta.url),
  "utf8"
);

describe("Avatar Details Studio integration", () => {
  it("shows Details for custom drafts and edits, but excludes Default Prism", () => {
    assert.match(pageSource, /\{ value: "details", label: "Details" \}/);
    assert.match(pageSource, /detailsEditorVisible=\{!editingDefaultBot\}/);
    assert.match(
      pageSource,
      /\(detailsEditorVisible \|\| tab\.value !== "details"\)/
    );
    assert.match(
      pageSource,
      /isDefaultPrismBot \? null : avatarDetails/
    );
    assert.doesNotMatch(
      pageSource,
      /detailsEditorVisible=\{Boolean\(editingBotId\)/
    );
  });

  it("keeps the recipe local until Apply and guards dirty tab or close navigation", () => {
    assert.match(editorSource, /const \[working, setWorking\]/);
    assert.match(editorSource, /onApply\(next\)/);
    assert.match(editorSource, /beforeunload/);
    assert.match(pageSource, /detailsEditorRef\.current\?\.hasDirtyChanges\(\)/);
    assert.match(pageSource, /Apply avatar details\?/);
  });

  it("guards Studio saves and waits for applied Details state before persisting", () => {
    assert.match(
      pageSource,
      /className=\{styles\.botAvatarCustomizerSaveButton\}[\s\S]*onClick=\{\(\) => requestStudioSave\(\)\}/
    );
    assert.match(
      pageSource,
      /openDetailsLeavePrompt\(\{ kind: "save" \}\)/
    );
    assert.match(
      pageSource,
      /await detailsEditorRef\.current\?\.apply\(\)/
    );
    assert.match(
      pageSource,
      /if \(!applied\)[\s\S]*setDetailsLeaveRequest\(null\)[\s\S]*continueDetailsNavigation\(request\)/
    );
    assert.match(pageSource, /await flushBotAvatarAutosaveQueue\(editingBotId\)/);
    assert.match(pageSource, /Apply avatar details before saving\?/);
    assert.doesNotMatch(
      pageSource,
      /className=\{styles\.botAvatarCustomizerSaveButton\}[\s\S]{0,240}onClick=\{\(\) => void onSave\(\)\}/
    );
  });

  it("keeps draft, create, clone, edit, and save state wired", () => {
    assert.match(pageSource, /useState<BotAvatarDetailsV1 \| null>\(null\)/);
    assert.match(pageSource, /avatarDetails: newBotAvatarDetails/);
    assert.match(pageSource, /avatarDetails: resolveBotAvatarDetails\(bot\)/);
    assert.match(pageSource, /const seededAvatarDetails = resolveBotAvatarDetails\(bot\)/);
    assert.match(pageSource, /queueBotAvatarAutosave\(editingBotId, \{[\s\S]*avatarDetails: normalized/);
  });
});

describe("Avatar Details shared mannequin rendering", () => {
  it("places one shared nearest-neighbor mask under glyphs and glass", () => {
    const maskIndex = pageSource.indexOf("<AvatarDetailsMask");
    const faceRigIndex = pageSource.indexOf(
      "className={styles.zenLiveBotPresenceFaceRig}",
      maskIndex
    );
    const glassIndex = pageSource.indexOf(
      "className={styles.zenLiveBotPresenceScreenGlassOverlay}",
      faceRigIndex
    );
    assert.ok(maskIndex > 0);
    assert.ok(faceRigIndex > maskIndex);
    assert.ok(glassIndex > faceRigIndex);
    assert.match(maskSource, /data-avatar-details-rendering="nearest-neighbor"/);
    assert.match(maskCss, /image-rendering: pixelated/);
    assert.match(maskCss, /z-index: 4/);
  });

  it("passes normalized details through Studio, Zen, and Coffee with mirror parity", () => {
    assert.match(pageSource, /avatarDetails=\{avatarDetailsPreview\}/);
    assert.match(pageSource, /avatarDetails=\{bot \? resolveBotAvatarDetails\(bot\) : null\}/);
    assert.match(pageSource, /avatarDetails=\{resolveBotAvatarDetails\(bot\)\}/);
    assert.match(
      maskCss,
      /scaleX\(var\(--coffee-plate-emoji-face-scale-y, 1\)\)/
    );
    assert.match(pageSource, /avatarDetailsColor=\{normalizeAccentForTheme\(/);
  });
});
