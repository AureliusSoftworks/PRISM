import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("auxiliary model residency", () => {
  it("warms the server-resolved auxiliary model before settings unlock the app", () => {
    const refreshSettingsStart = pageSource.indexOf(
      "async function refreshSettings()",
    );
    const refreshSettingsEnd = pageSource.indexOf(
      "async function persistPreferredImageModel",
      refreshSettingsStart,
    );
    const refreshSettingsSource = pageSource.slice(
      refreshSettingsStart,
      refreshSettingsEnd,
    );
    const warmIndex = refreshSettingsSource.indexOf(
      '"/api/models/auxiliary/keep-warm"',
    );
    const publishIndex = refreshSettingsSource.indexOf("setSettings({");

    assert.notEqual(refreshSettingsStart, -1);
    assert.notEqual(warmIndex, -1);
    assert.notEqual(publishIndex, -1);
    assert.ok(warmIndex < publishIndex);
  });

  it("refreshes the lease while an authenticated PRISM client is active", () => {
    assert.match(
      pageSource,
      /const AUXILIARY_MODEL_KEEP_WARM_INTERVAL_MS = 30_000;/u,
    );
    assert.match(
      pageSource,
      /if \(!user\?\.id \|\| backendUnavailable\) return;[\s\S]*\/api\/models\/auxiliary\/keep-warm[\s\S]*AUXILIARY_MODEL_KEEP_WARM_INTERVAL_MS/u,
    );
    assert.match(
      pageSource,
      /document\.addEventListener\("visibilitychange", refreshKeepWarm\)/u,
    );
    assert.match(
      pageSource,
      /window\.addEventListener\("online", refreshKeepWarm\)/u,
    );
  });
});
