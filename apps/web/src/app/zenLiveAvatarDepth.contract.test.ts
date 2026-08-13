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

describe("Zen live avatar depth contract", () => {
  it("derives scale from y-position and leaves no manual resize path", () => {
    assert.match(pageSource, /resolveZenLiveAvatarDepth\(/);
    assert.match(pageSource, /updateAvatarDepthForPosition\(clamped\)/);
    assert.match(pageSource, /data-avatar-render-mode=\{avatarRenderMode\}/);
    assert.doesNotMatch(pageSource, /resizeZenLiveBotAvatar/);
    assert.doesNotMatch(pageSource, /zenLiveBotAvatarSizePx/);
    assert.doesNotMatch(pageSource, /label: "Grow"/);
    assert.doesNotMatch(pageSource, /label: "Shrink"/);
    assert.match(pageSource, /data-depth-scaled="true"/);
    assert.doesNotMatch(pageSource, /data-user-avatar-scale/);
  });

  it("turns before horizontal travel and keeps the shared face-and-Ink plane instantaneous", () => {
    assert.match(pageSource, /orientAvatarForHorizontalTravel\(/);
    assert.match(pageSource, /snapZenLiveAvatarPositionForPresentation\(/);
    assert.match(pageSource, /facing=\{avatarFacing\}/);
    assert.match(
      cssSource,
      /\.zenLiveBotPresencePlate \.zenLiveBotPresenceScreenContentRig\s*\{\s*transition:\s*none;/,
    );
  });

  it("drives chassis light rotation and glass glare for autonomous presentation frames", () => {
    assert.match(
      pageSource,
      /style\.setProperty\( "--bot-face-metal-light-rotation", `\$\{nextRotation\.toFixed\(2\)\}deg`, \)/,
    );
    assert.match(pageSource, /"--bot-face-screen-glare-x"/);
    assert.match(pageSource, /"--bot-face-screen-glare-y"/);
    assert.match(pageSource, /"--bot-face-screen-glare-angle"/);
    assert.match(
      pageSource,
      /setAvatarPositionClamped\( \{ x: nextMotion\.physics\.x, y: nextMotion\.physics\.y \}, false, true, \)/,
    );
  });
});
