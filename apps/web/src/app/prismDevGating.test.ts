import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePrismMarketplaceBranchLock,
  prismAvatarDetailsPaneEnabled,
  prismBranchIsDev,
  prismMarketplaceBranchLockAllows,
} from "./prismDevGating.ts";

test("avatar details stay locked on release branches without an override", () => {
  for (const branch of ["release", "release/0.8.0", "release-candidate"]) {
    assert.equal(
      prismAvatarDetailsPaneEnabled({
        NEXT_PUBLIC_PRISM_BRANCH: branch,
        NEXT_PUBLIC_AVATAR_DETAILS: "1",
      }),
      false,
    );
  }
});

test("avatar details can be parked on dev without affecting other dev tools", () => {
  assert.equal(
    prismAvatarDetailsPaneEnabled({
      NEXT_PUBLIC_PRISM_BRANCH: "dev",
      NEXT_PUBLIC_AVATAR_DETAILS: "0",
    }),
    false,
  );
});

test("marketplace branch locks require an exact branch match", () => {
  assert.equal(prismBranchIsDev("dev"), true);
  assert.equal(prismBranchIsDev("DEV"), true);
  assert.equal(prismBranchIsDev("feature/dev"), false);
  assert.equal(prismBranchIsDev(undefined), false);
  assert.equal(normalizePrismMarketplaceBranchLock("dev"), "dev");
  assert.equal(normalizePrismMarketplaceBranchLock("DEV"), "dev");
  assert.equal(normalizePrismMarketplaceBranchLock("main"), null);
  assert.equal(normalizePrismMarketplaceBranchLock("feature/foo"), null);
  assert.equal(prismMarketplaceBranchLockAllows(null, "main"), true);
  assert.equal(prismMarketplaceBranchLockAllows("dev", "dev"), true);
  assert.equal(prismMarketplaceBranchLockAllows("dev", "DEV"), true);
  assert.equal(prismMarketplaceBranchLockAllows("dev", "main"), false);
  assert.equal(prismMarketplaceBranchLockAllows("dev", "feature/dev"), false);
  assert.equal(prismMarketplaceBranchLockAllows("dev", undefined), false);
  assert.equal(prismMarketplaceBranchLockAllows("dev", "unknown"), false);
});
