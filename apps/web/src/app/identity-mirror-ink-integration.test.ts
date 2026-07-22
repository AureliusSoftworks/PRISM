import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Identity Crisis avatar ink integration", () => {
  it("switches Coffee and Signal ink with the copied face, including replay state", () => {
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
      pageSource.slice(coffeeResolverIndex, coffeeResolverIndex + 500),
      /resolveBotIdentityMirrorAvatarDetailsV1\(\s*identityMirrorState,\s*resolveBotAvatarDetails\(bot\),\s*identityMirrorTargetFaceVisible,/u,
    );

    const signalResolverIndex = pageSource.indexOf(
      "const avatarDetails = resolveBotIdentityMirrorAvatarDetailsV1(",
      coffeeResolverIndex + 1,
    );
    const signalRenderIndex = pageSource.indexOf(
      "avatarDetails={avatarDetails}",
      signalResolverIndex,
    );
    assert.ok(signalResolverIndex >= 0 && signalRenderIndex > signalResolverIndex);
    assert.match(
      pageSource.slice(signalResolverIndex, signalResolverIndex + 500),
      /botSummary\.identityMirrorState,\s*resolveBotAvatarDetails\(bot\),\s*botSummary\.identityMirrorTargetFaceActive,/u,
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
  });
});
