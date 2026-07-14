import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Brave Search settings", () => {
  it("wires the dedicated secret field through both connection surfaces", () => {
    assert.match(
      pageSource,
      /const SETTINGS_BRAVE_SEARCH_KEY_FIELD = "braveSearchApiKey";/,
    );
    assert.equal(
      pageSource.match(/name=\{SETTINGS_BRAVE_SEARCH_KEY_FIELD\}/g)?.length,
      2,
    );
    assert.match(
      pageSource,
      /type="password"[\s\S]{0,180}name=\{SETTINGS_BRAVE_SEARCH_KEY_FIELD\}/,
    );
    assert.match(
      pageSource,
      /scheduleApiKeyDraftValidation\("brave", braveSearchKey\)/,
    );
  });

  it("shows only saved/source state and a clear unavailable explanation", () => {
    assert.match(pageSource, /hasBraveSearchApiKey: boolean;/);
    assert.match(pageSource, /braveSearchApiKeySource: ApiKeySource;/);
    assert.match(
      pageSource,
      /WebSearch is unavailable until this key is configured\. Searches run only in ONLINE mode\./,
    );
    assert.match(pageSource, /void clearSavedKey\("brave"\)/);
  });
});
