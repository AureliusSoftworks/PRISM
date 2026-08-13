import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
).replace(/\s+/gu, " ");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Zen live avatar sizing contract", () => {
  it("uses explicit persisted size controls instead of y-position depth", () => {
    assert.match(pageSource, /function resizeZenLiveBotAvatarSizePx\(/);
    assert.match(pageSource, /const \[zenLiveBotAvatarSizePx,/);
    assert.match(pageSource, /label: "Grow"/);
    assert.match(pageSource, /label: "Shrink"/);
    assert.match(pageSource, /label: "Reset size"/);
    assert.match(pageSource, /data-user-avatar-scale="true"/);
    assert.doesNotMatch(pageSource, /resolveZenLiveAvatarDepth\(/);
    assert.doesNotMatch(pageSource, /data-depth-scaled="true"/);
  });

  it("restores the authored full-size default and mini/full handoff", () => {
    assert.match(pageSource, /const ZEN_LIVE_BOT_AVATAR_DEFAULT_SIZE_PX = 480;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_AVATAR_MAX_SIZE_PX = 480;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_AVATAR_MINI_MAX_SIZE_PX = 184;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_AVATAR_FULL_MIN_SIZE_PX = 240;/);
    assert.match(pageSource, /avatarSizePx=\{zenLiveBotAvatarSizePx\}/);
    assert.match(
      cssSource,
      /\.zenLiveBotPresencePlate\[data-user-avatar-scale="true"\]\[data-avatar-render-mode="full"\]/,
    );
  });

  it("turns before horizontal travel and keeps the face-and-Ink plane instantaneous", () => {
    assert.match(pageSource, /orientAvatarForHorizontalTravel\(/);
    assert.match(pageSource, /snapZenLiveAvatarPositionForPresentation\(/);
    assert.match(pageSource, /facing=\{avatarFacing\}/);
    assert.match(
      cssSource,
      /\.zenLiveBotPresencePlate \.zenLiveBotPresenceScreenContentRig\s*\{\s*transition:\s*none;/,
    );
  });

  it("drives chassis light rotation and glass glare for autonomous presentation frames", () => {
    assert.match(pageSource, /"--bot-face-metal-light-rotation"/);
    assert.match(pageSource, /"--bot-face-screen-glare-x"/);
    assert.match(pageSource, /"--bot-face-screen-glare-y"/);
    assert.match(pageSource, /"--bot-face-screen-glare-angle"/);
  });
});
