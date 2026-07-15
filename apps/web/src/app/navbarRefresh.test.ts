import assert from "node:assert/strict";
import test from "node:test";

import { reloadPrismPage } from "./navbarRefresh.ts";

test("navbar refresh performs exactly one hard page reload", () => {
  let reloadCount = 0;

  const refreshed = reloadPrismPage({
    reload() {
      reloadCount += 1;
    },
  });

  assert.equal(refreshed, true);
  assert.equal(reloadCount, 1);
});

test("navbar refresh remains safe while rendering without a window", () => {
  assert.equal(reloadPrismPage(null), false);
});
