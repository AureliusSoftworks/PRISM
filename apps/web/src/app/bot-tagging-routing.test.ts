import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("1:1 bot tagging routes", () => {
  it("keeps @ mentions as references instead of Zen persona switches", () => {
    assert.doesNotMatch(pageSource, /mentionCommitMode\s*[:=][^\n]*select-persona/u);
    assert.doesNotMatch(pageSource, /mentionedZenPersonaBotId/u);
    assert.match(pageSource, /pickerLabel:\s*"You"/u);
  });

  it("keeps the random BOT wildcard out of the selectable wildcard menu", () => {
    assert.match(pageSource, /pickerVisibility\s*!==\s*"hidden"/u);
  });
});
