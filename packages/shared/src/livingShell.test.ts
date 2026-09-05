import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PRISM_STARTUP_PREFERENCE,
  PRISM_STARTUP_PREFERENCES,
  normalizePrismStartupPreference,
} from "./livingShell.ts";

describe("living shell startup preference", () => {
  it("limits startup to Home, Slate, or the last workspace", () => {
    assert.deepEqual(PRISM_STARTUP_PREFERENCES, [
      "home",
      "slate",
      "last_workspace",
    ]);
    assert.equal(DEFAULT_PRISM_STARTUP_PREFERENCE, "home");
  });

  it("falls back safely for invalid or future values", () => {
    assert.equal(normalizePrismStartupPreference("slate"), "slate");
    assert.equal(
      normalizePrismStartupPreference("last_workspace"),
      "last_workspace",
    );
    assert.equal(normalizePrismStartupPreference("coffee"), "home");
    assert.equal(normalizePrismStartupPreference(null, "slate"), "slate");
  });
});
