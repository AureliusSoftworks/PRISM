import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("text model display-name UI contract", () => {
  it("applies account aliases to text pickers while keeping image rows unrenameable", () => {
    assert.match(pageSource, /function textModelOptionsForProvider/u);
    assert.match(pageSource, /resolveTextModelDisplayName\(/u);
    assert.match(pageSource, /textModelDisplayNames: normalizeTextModelDisplayNames/u);
    assert.match(pageSource, /aria-label=\{`Rename \$\{model\.label\}`\}/u);
    assert.match(pageSource, /event\.key === "Enter"/u);
    assert.match(pageSource, /event\.key === "Escape"/u);
    assert.match(pageSource, /isAllowedOpenAiImageModelId\(/u);
    assert.match(pageSource, /catalogEntriesMatchingLocalImageHeuristic\(\[/u);
  });
});
