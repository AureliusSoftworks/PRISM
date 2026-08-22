import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8"
);

describe("bot picker selection", () => {
  it("keeps mouse and keyboard bot-card activation as direct selection", () => {
    assert.equal(
      pageSource.match(/const isDesktopMousePixelClick/g)?.length,
      2,
    );
    assert.equal(
      pageSource.match(
        /if \(isDesktopMousePixelClick\) \{[\s\S]{0,100}focusHueLensOnBot\(b\);[\s\S]{0,80}\}\s*commitEmptyStateBotSelection\(b\.id(?:,\s*e\.currentTarget)?\);/g,
      )?.length,
      2,
    );
    assert.equal(
      pageSource.match(/setCanvasSelectedBotIds\(\s*canvasBotSelectionAfterPlainActivation\(\),?\s*\);/g)?.length,
      2,
    );
  });
});
