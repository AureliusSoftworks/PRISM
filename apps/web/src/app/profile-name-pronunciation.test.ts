import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("profile-name pronunciation", () => {
  it("edits the private pronunciation atomically with the visible profile name", () => {
    assert.match(pageSource, /playerNamePronunciation: nextPlayerNamePronunciation/u);
    assert.match(
      pageSource,
      /playerNamePronunciation: savedPlayerNamePronunciation/u,
    );
    assert.match(
      pageSource,
      /settings\?\.playerNamePronunciation\s*\?\?[\s\S]*user\?\.playerNamePronunciation/u,
    );
    assert.match(pageSource, /aria-label="Profile name pronunciation"/u);
    assert.match(
      pageSource,
      /leave\s+blank to use your profile name normally/u,
    );
  });
});
