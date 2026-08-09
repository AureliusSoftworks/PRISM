import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const faceSource = readFileSync(
  new URL("./CoffeeSeatPlateEmoji.tsx", import.meta.url),
  "utf8",
);
const inkEditorSource = readFileSync(
  new URL("./AvatarDetailsEditor.tsx", import.meta.url),
  "utf8",
);
const sharedAvatarSource = readFileSync(
  new URL("../../../../packages/shared/src/botAvatar.ts", import.meta.url),
  "utf8",
);

test("Avatar Studio renders one platform and keeps its voice player mounted", () => {
  assert.equal(
    pageSource.match(/data-avatar-foundry-platform="true"/g)?.length,
    1,
  );
  assert.match(
    pageSource,
    /data-foundry-platform-present=\{spatialControls \? "true" : undefined\}/,
  );
  assert.match(
    cssSource,
    /\.botAvatarMannequinStage:is\([\s\S]*?\[data-foundry-platform-present="true"\][\s\S]*?\)::after\s*\{\s*display:\s*none;/,
  );
  assert.match(
    pageSource,
    /voiceTestDock=\{\s*<BotAvatarVoiceTestDock[\s\S]*?\/>\s*\}/,
  );
  assert.doesNotMatch(
    pageSource,
    /voiceTestDock=\{\s*activeControlTab === "voice"/,
  );
});

test("all live mouth glyphs share stable geometry and their measured ink center", () => {
  assert.match(faceSource, /const renderedMouthGlyphForMotion =/);
  assert.match(faceSource, /ref=\{part === "mouth" \? customMouthGlyphRef/);
  assert.match(faceSource, /const textStartX =/);
  assert.match(faceSource, /element\.clientWidth/);
  assert.match(faceSource, /metrics\.width/);
  assert.match(faceSource, /"--bot-face-mouth-origin-x"/);
  assert.match(faceSource, /"--bot-face-mouth-origin-y"/);
  assert.match(
    cssSource,
    /\[data-coffee-plate-emoji-part="mouth"\][\s\S]*?> \[data-crt-glyph-layer="true"\][\s\S]*?min-inline-size:\s*100%;[\s\S]*?transform-origin:\s*var\(--bot-face-mouth-origin-x,\s*50%\)\s*var\(--bot-face-mouth-origin-y,\s*50%\);/,
  );
  assert.match(
    cssSource,
    /data-face-mouth-animation="wobble"[\s\S]*?--bot-face-mouth-wobble-origin-x,[\s\S]*?--bot-face-mouth-origin-x/,
  );
  assert.match(
    cssSource,
    /data-face-mouth-animation="spin"[\s\S]*?--bot-face-mouth-spin-origin-x,[\s\S]*?--bot-face-mouth-origin-x/,
  );
});

test("face placement is wide and blink geometry links to eyes by default", () => {
  for (const constant of [
    "BOT_FACE_EYE_OFFSET_X_MIN = -1.2",
    "BOT_FACE_EYE_OFFSET_X_MAX = 1.2",
    "BOT_FACE_EYE_OFFSET_Y_MIN = -1.2",
    "BOT_FACE_EYE_OFFSET_Y_MAX = 1.2",
    "BOT_FACE_MOUTH_OFFSET_X_MIN = -1.2",
    "BOT_FACE_MOUTH_OFFSET_X_MAX = 1.2",
    "BOT_FACE_MOUTH_OFFSET_Y_MIN = -1.2",
    "BOT_FACE_MOUTH_OFFSET_Y_MAX = 1.2",
  ]) {
    assert.ok(sharedAvatarSource.includes(constant), `missing ${constant}`);
  }
  assert.match(pageSource, /function botAvatarBlinkGeometryTracksEyes/);
  assert.match(pageSource, /data-blink-eye-link="true"/);
  assert.match(pageSource, /aria-label="Link blink geometry to eyes"/);
  assert.match(
    pageSource,
    /if \(blinkGeometryLinked\) \{\s*onBlinkOffsetXChange\(next\.x\);\s*onBlinkOffsetYChange\(next\.y\);/,
  );
  assert.match(
    pageSource,
    /blinkGeometryLinkOverrideRef\.current = "independent"/,
  );
});

test("Ink can temporarily reveal the animated avatar without unmounting its canvas", () => {
  assert.match(inkEditorSource, /data-avatar-details-live-preview="true"/);
  assert.match(inkEditorSource, /Preview live/);
  assert.match(pageSource, /setInkLivePreview\(true\);\s*setPreviewMode\("talking"\);/);
  assert.match(
    pageSource,
    /screenMode=\{\s*activeControlTab === "details" && !inkLivePreview/,
  );
  assert.match(
    pageSource,
    /\{screenOverlay \? \([\s\S]*?data-screen-overlay-visible=/,
  );
  assert.match(
    cssSource,
    /\.botAvatarFoundryScreenOverlay:not\(\[data-screen-overlay-visible="true"\]\)[\s\S]*?visibility:\s*hidden;/,
  );
});
