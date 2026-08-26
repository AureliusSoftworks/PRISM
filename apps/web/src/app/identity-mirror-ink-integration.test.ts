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

  it("describes the exact four-field visual handoff in current mode guidance", () => {
    assert.match(
      tutorialSource,
      /visually borrows exactly four things from the latest bot that directly addresses it: eyes, the complete resting and speaking mouth package, authored Avatar Details Ink, and the lower glyph/u,
    );
    assert.match(
      tutorialSource,
      /name, persona, dialogue behavior, complete authored voice and Accent Map, color, chassis\/frame, Powers and consequences, thinking spinner, bot ID, seat, role, private perception, safety, provider, and every other field remain its own/u,
    );
    assert.match(
      tutorialSource,
      /saved handoff and timing replay exactly and reset with the session/u,
    );
    assert.match(
      tutorialSource,
      /latest direct addresser’s eyes, complete resting and speaking mouth package, Avatar Details Ink, and lower glyph/u,
    );
    assert.match(
      tutorialSource,
      /holder’s name, persona, dialogue, voice and Accent Map, color, chassis\/frame, Powers and consequences, thinking spinner, and every other field remain unchanged/u,
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
