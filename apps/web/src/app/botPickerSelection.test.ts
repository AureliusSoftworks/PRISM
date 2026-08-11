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
      pageSource.match(
        /const clickShouldSelectDirectly =\s*e\.detail === 0 \|\| lastBotPickerPointerTypeRef\.current !== "touch";/g
      )?.length,
      2
    );
    assert.equal(
      pageSource.match(
        /const shouldRelocateHue =\s*!clickShouldSelectDirectly &&\s*!emptyStateSearchActive &&\s*botHasFilterableColor\(b\) &&\s*!hueFilterActive &&\s*pickerUsesHueNavigation\(geom, viewportWidth\);/g
      )?.length,
      2
    );
    assert.doesNotMatch(pageSource, /const isDesktopMousePixelClick/);
  });
});
