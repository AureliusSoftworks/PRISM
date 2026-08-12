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
      /resolveBotIdentityMirrorAvatarDetailsV1\(\s*identityMirrorState,\s*resolveBotAvatarDetails\(bot\),\s*identityBorrowTargetActive,/u,
    );
    assert.match(
      pageSource,
      /resolveBotIdentityMirrorAvatarDetailsV1\(\s*identityMirrorState,\s*resolveBotAvatarDetails\(bot\),\s*Boolean\(\s*botSummary\.identityMirrorTargetFaceActive,?\s*\),/u,
    );
    assert.match(
      pageSource,
      /presentationIdentity &&\s*botSummary\.identityMirrorTargetFaceActive\s*\? presentationIdentity\.targetFace/u,
    );
  });

  it("describes the saved ink handoff in current mode guidance", () => {
    assert.match(
      tutorialSource,
      /borrows the latest direct bot addresser's public diegetic identity/u,
    );
    assert.match(
      tutorialSource,
      /keeps its own saturated color, client-side voice effect, communication-style chassis, and frame finish/u,
    );
    assert.match(tutorialSource, /saved handoff and its timing replay exactly/u);
    assert.match(
      tutorialSource,
      /authored default identity returns before the closing sign-off/u,
    );
    assert.match(
      tutorialSource,
      /Shapeshifter sincerely becomes a different Library bot's complete public form/u,
    );
    assert.match(
      tutorialSource,
      /Marketplace is the fallback when no other Library bots exist/u,
    );
  });
});
