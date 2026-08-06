import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRISM_JOURNALED_SETTING_KEYS,
  prismSettingsPatchIsJournalable,
  validatePrismSettingsPatch,
} from "../prism-settings-mutations.ts";

describe("prism settings journal allowlist", () => {
  it("keeps onlineAutoProviderBias on the journaled save path", () => {
    assert.equal(
      PRISM_JOURNALED_SETTING_KEYS.has("onlineAutoProviderBias"),
      true,
    );
    const patch = {
      theme: "dark",
      onlineAutoProviderBias: 0.75,
    };
    assert.equal(prismSettingsPatchIsJournalable(patch), true);
    const filtered = validatePrismSettingsPatch(patch);
    assert.equal(filtered.onlineAutoProviderBias, 0.75);
  });
});
