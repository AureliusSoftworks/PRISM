import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Identity Crisis avatar ink integration", () => {
  it("switches Coffee ink with the copied face, including replay state", () => {
    assert.equal(
      pageSource.match(/resolveBotIdentityMirrorAvatarDetailsV1\(/gu)?.length,
      2,
    );
    const coffeeResolverIndex = pageSource.indexOf("const seatAvatarDetails =");
    const coffeeRenderIndex = pageSource.indexOf(
      "avatarDetails={seatAvatarDetails}",
      coffeeResolverIndex,
    );
    assert.ok(coffeeResolverIndex >= 0 && coffeeRenderIndex > coffeeResolverIndex);
    assert.match(
      pageSource.slice(coffeeResolverIndex, coffeeResolverIndex + 700),
      /resolveBotIdentityMirrorAvatarDetailsV1\(\s*identityMirrorState,\s*resolveBotAvatarDetails\(bot\),\s*identityBorrowTargetFaceVisible,/u,
    );
    assert.match(
      pageSource,
      /resolveBotIdentityMirrorAvatarDetailsV1\(\s*botSummary\.identityMirrorState,\s*resolveBotAvatarDetails\(bot\),\s*Boolean\(botSummary\.identityMirrorTargetFaceActive\),/u,
    );
    assert.match(
      pageSource,
      /botSummary\.identityMirrorState &&\s*botSummary\.identityMirrorTargetFaceActive\s*\?\s*botSummary\.identityMirrorState\.targetFace/u,
    );
  });

  it("describes the saved ink handoff in current mode guidance", () => {
    assert.match(
      tutorialSource,
      /copies the public persona, CRT face, authored Avatar Details ink, and resolved voice/u,
    );
    assert.match(tutorialSource, /saved face-ink-and-voice handoff replays exactly/u);
    assert.match(
      tutorialSource,
      /authored default persona, face, ink, and voice return before the closing sign-off/u,
    );
    assert.match(
      tutorialSource,
      /Shapeshifter sincerely becomes a different Library bot's public form/u,
    );
    assert.match(
      tutorialSource,
      /Marketplace is the fallback when no other Library bots exist/u,
    );
  });
});
