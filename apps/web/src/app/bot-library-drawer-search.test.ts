import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8"
);

const libraryDrawerSource = pageSource.slice(
  pageSource.indexOf('id="bot-library-drawer-content"'),
  pageSource.indexOf("{botGeneratorOpen &&")
);

describe("bot library drawer search", () => {
  it("filters the current library view by name or purpose and offers clear feedback", () => {
    assert.match(pageSource, /filterBotsByLibrarySearch\(/);
    assert.match(libraryDrawerSource, /placeholder="Search bots"/);
    assert.match(
      libraryDrawerSource,
      /aria-label="Search bots by name or purpose"/
    );
    assert.match(libraryDrawerSource, /aria-label="Clear bot search"/);
    assert.match(libraryDrawerSource, /No bots match/);
    assert.match(cssSource, /\.botLibrarySearchField\s*\{/);
  });

  it("omits deprecated batch selection and quick-delete controls", () => {
    assert.doesNotMatch(libraryDrawerSource, /botCardSelectButton/);
    assert.doesNotMatch(libraryDrawerSource, /renderBotDeleteButton/);
    assert.doesNotMatch(pageSource, /openBotBatchEditorForSelected/);
    assert.doesNotMatch(cssSource, /\.botBatchEditPanel\s*\{/);
    assert.doesNotMatch(cssSource, /\.botCardSelectButton\s*\{/);
    assert.doesNotMatch(cssSource, /\.botCardDelete\s*\{/);
  });
});
