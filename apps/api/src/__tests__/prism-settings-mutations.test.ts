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

  it("keeps global text model selections on the journaled save path", () => {
    const patch = {
      preferredProvider: "openai",
      preferredLocalModel: "qwen3:8b",
      preferredOnlineModel: "gpt-5.6-terra",
    };
    assert.equal(prismSettingsPatchIsJournalable(patch), true);
    assert.deepEqual(validatePrismSettingsPatch(patch), patch);
  });

  it("keeps typography scale on the persisted journal path", () => {
    const patch = { typographyScale: "extra-large" };
    assert.equal(PRISM_JOURNALED_SETTING_KEYS.has("typographyScale"), true);
    assert.equal(prismSettingsPatchIsJournalable(patch), true);
    assert.deepEqual(validatePrismSettingsPatch(patch), patch);
  });

  it("keeps CRT focus on the persisted journal path", () => {
    const patch = { crtFocus: 75 };
    assert.equal(PRISM_JOURNALED_SETTING_KEYS.has("crtFocus"), true);
    assert.equal(prismSettingsPatchIsJournalable(patch), true);
    assert.deepEqual(validatePrismSettingsPatch(patch), patch);
  });

  it("keeps Whodunnit exhibit reuse on the persisted journal path", () => {
    const patch = { debateWhodunnitReuseSynthesizedExhibits: true };
    assert.equal(
      PRISM_JOURNALED_SETTING_KEYS.has(
        "debateWhodunnitReuseSynthesizedExhibits",
      ),
      true,
    );
    assert.equal(prismSettingsPatchIsJournalable(patch), true);
    assert.deepEqual(validatePrismSettingsPatch(patch), patch);
  });
});
