import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { prismPlannedRoadmapApplets } from "./appletVersions.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("app switcher roadmap", () => {
  it("exposes every planned applet through a collapsible roadmap", () => {
    assert.ok(prismPlannedRoadmapApplets().length > 0);
    assert.match(pageSource, /const roadmapApplets = prismPlannedRoadmapApplets\(\)/u);
    assert.match(pageSource, /aria-controls=\{appSwitcherRoadmapId\}/u);
    assert.match(pageSource, /aria-label="Upcoming applets"/u);
    assert.match(pageSource, /roadmapApplets\.map\(\(applet\) =>/u);
    assert.match(pageSource, /<small>Planned<\/small>/u);
  });

  it("keeps roadmap items compact and responsive like the former Hub pills", () => {
    assert.match(cssSource, /\.appSwitcherRoadmapList\s*\{/u);
    assert.match(cssSource, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
    assert.match(cssSource, /@media \(max-width: 380px\)/u);
    assert.match(cssSource, /max-height:\s*min\(620px, calc\(100vh - 72px\)\)/u);
  });
});
