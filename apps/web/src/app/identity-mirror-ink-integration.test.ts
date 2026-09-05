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
      "avatarDetails: seatAvatarDetails",
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
      /resolveBotIdentityMirrorFaceV1\(\s*identityMirrorState,\s*holderFaceStyle,\s*Boolean\(botSummary\.identityMirrorTargetFaceActive\)/u,
    );
  });

  it("describes the copied-Power mirror and voice-safe shapeshift contracts", () => {
    assert.match(
      tutorialSource,
      /knowingly wears the latest eligible direct addresser’s effective public presentation/u,
    );
    assert.match(
      tutorialSource,
      /It also copies the target’s eligible public Powers and consequences/u,
    );
    assert.match(
      tutorialSource,
      /saved timing replays exactly and resets with the session/u,
    );
    assert.match(
      tutorialSource,
      /Identity Crisis never copies recursively/u,
    );
    assert.match(
      tutorialSource,
      /holder keeps its actual voice identity, provider voice, voice effect, and every non-accent shaping field/u,
    );
    assert.match(
      tutorialSource,
      /target with pronunciation off disables the transformed accent/u,
    );
    assert.match(
      tutorialSource,
      /Shapeshifter sincerely becomes a different Library bot's public persona and complete visual form/u,
    );
    assert.match(
      tutorialSource,
      /Mechanical seat, Powers, and hard speech rules stay with the holder/u,
    );
    assert.match(
      tutorialSource,
      /Marketplace is the fallback when no other Library bots exist/u,
    );
  });
});
