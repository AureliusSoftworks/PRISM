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

  it("describes the exact visual and quoted-name handoff in current mode guidance", () => {
    assert.match(
      tutorialSource,
      /visually borrows the latest eligible direct addresser’s exact eyes and blink package, complete resting and speaking mouth package including glyph style and Custom Speech poses, authored Avatar Details Ink, lower glyph, and a literally double-quoted copy of the target’s public name/u,
    );
    assert.match(
      tutorialSource,
      /Its color, complete authored voice and Accent Map location, pronunciation, Speechprint, provider voice identity, chassis\/frame, Powers and consequences, thinking spinner, bot ID, seat, role, private perception, safety, provider, and every other speech or mechanical field remain its own/u,
    );
    assert.match(
      tutorialSource,
      /saved handoff and timing replay exactly and reset with the session/u,
    );
    assert.match(
      tutorialSource,
      /latest eligible direct addresser by taking their exact eyes and blink package, complete resting and speaking mouth package including glyph style and Custom Speech poses, Avatar Details Ink, lower glyph, and literally double-quoted public name/u,
    );
    assert.match(
      tutorialSource,
      /holder’s color, complete voice and Accent Map location, pronunciation, Speechprint, provider voice identity, chassis\/frame, Powers, thinking spinner, and every other speech or mechanical field remain unchanged/u,
    );
    assert.match(
      tutorialSource,
      /holder defensively treats the original as the suspicious imitator, with mild concern rather than panic or constant repetition/u,
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
