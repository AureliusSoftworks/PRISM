import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("living-shell location and applet navigation", () => {
  it("keeps location context beside the global applet switcher", () => {
    assert.match(pageSource, /const renderLocationStrip =/u);
    assert.match(pageSource, /aria-label="Current PRISM location"/u);
    assert.match(pageSource, /aria-label="Open All Bots Home"/u);
    assert.match(pageSource, /aria-label="Session status"/u);
    assert.match(pageSource, /const renderAppSwitcher =/u);
    assert.match(pageSource, /label: "Switch Prism app"/u);
    assert.match(
      pageSource,
      /prismTopLevelSwitcherApplets\(\)\.filter\(\s*\(applet\) => applet\.id !== "chat",?\s*\)/u,
    );
    assert.match(
      pageSource,
      /aria-label=\{`Switch Prism app\. Current app: \$\{PRISM_APPLETS\[currentAppletId\]\.name\}`\}/u,
    );
    assert.ok((pageSource.match(/renderAppSwitcher\(/gu)?.length ?? 0) > 1);
    assert.ok((pageSource.match(/renderLocationStrip\(/gu)?.length ?? 0) > 1);
  });

  it("keeps the dormant Story implementation behind the release gate", () => {
    assert.match(
      pageSource,
      /const applets = prismTopLevelSwitcherApplets\(\)/u,
    );
    assert.match(
      pageSource,
      /const roadmapApplets = prismPlannedRoadmapApplets\(\)/u,
    );
  });

  it("stays compact and hides secondary status on narrow viewports", () => {
    assert.match(cssSource, /\.locationStrip\s*\{/u);
    assert.match(cssSource, /\.locationStripStatus\s*\{/u);
    assert.match(
      cssSource,
      /@media \(max-width: 720px\)[\s\S]*\.locationStripStatus\s*\{[\s\S]*display: none/u,
    );
    assert.match(
      cssSource,
      /@media \(max-width: 720px\)[\s\S]*\.appSwitcherButton\s*\{[\s\S]*min-width: 0/u,
    );
    assert.match(
      cssSource,
      /@media \(max-width: 720px\)[\s\S]*\.appSwitcherName\s*\{[\s\S]*display: none/u,
    );
  });
});
