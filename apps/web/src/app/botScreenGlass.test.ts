import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_SCREEN_GLASS_PROFILE_COUNT,
  botScreenGlassProfileForSeed,
} from "./botScreenGlass.ts";

test("screen glass selects stable authored profile pairs and quarter turns", () => {
  const first = botScreenGlassProfileForSeed("bot-screen-material:id:iris");
  const repeated = botScreenGlassProfileForSeed("bot-screen-material:id:iris");

  assert.deepEqual(repeated, first);
  assert.ok(first.profileIndex >= 1);
  assert.ok(first.profileIndex <= BOT_SCREEN_GLASS_PROFILE_COUNT);
  assert.match(first.profileId, /^crt-glass\/v1\/profile-\d{2}$/u);
  assert.match(first.residueUrl, /glass-profile-\d{2}-residue\.png\?v=1$/u);
  assert.match(
    first.distortionUrl,
    /glass-profile-\d{2}-distortion\.png\?v=1$/u,
  );
  assert.ok([0, 90, 180, 270].includes(first.rotationDeg));
  assert.equal(first.rotationDeg, first.rotationQuarterTurns * 90);
});

test("screen glass assignment varies independently across identities", () => {
  const resolved = new Set(
    Array.from({ length: 48 }, (_, index) => {
      const profile = botScreenGlassProfileForSeed(
        `bot-screen-material:id:bot-${index}`,
      );
      return `${profile.profileId}:${profile.rotationQuarterTurns}`;
    }),
  );

  assert.ok(resolved.size > BOT_SCREEN_GLASS_PROFILE_COUNT);
});
