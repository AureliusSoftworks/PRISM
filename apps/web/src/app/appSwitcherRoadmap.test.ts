import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { prismPlannedRoadmapApplets } from "./appletVersions.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./PrismMenu.module.css", import.meta.url),
  "utf8",
);

describe("app switcher roadmap", () => {
  it("exposes every planned applet through the shared menu roadmap section", () => {
    assert.ok(prismPlannedRoadmapApplets().length > 0);
    assert.match(pageSource, /const roadmapApplets = prismPlannedRoadmapApplets\(\)/u);
    assert.match(pageSource, /id: "roadmap-label"/u);
    assert.match(pageSource, /label: "Roadmap"/u);
    assert.match(pageSource, /roadmapApplets\.map\(\(applet\): PrismMenuEntry =>/u);
    assert.match(pageSource, /disabledReason: "This applet is on the PRISM roadmap\."/u);
    assert.match(pageSource, /<PrismMenuSurface/u);
  });

  it("inherits the compact responsive shared-menu contract", () => {
    assert.match(cssSource, /max-width: min\(320px, calc\(100vw - 16px\)\)/u);
    assert.match(cssSource, /min-height: 36px/u);
    assert.match(cssSource, /@media \(pointer: coarse\)/u);
    assert.match(cssSource, /min-height: 44px/u);
  });
});
