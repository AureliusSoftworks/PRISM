import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("living-shell applet navigation", () => {
  it("keeps the applet switcher beside wordmark-owned Home navigation", () => {
    assert.doesNotMatch(pageSource, /const renderLocationStrip =/u);
    assert.doesNotMatch(pageSource, /aria-label="Current PRISM location"/u);
    assert.doesNotMatch(pageSource, /aria-label="Session status"/u);
    assert.match(pageSource, /data-home-affordance="wordmark"/u);
    assert.match(pageSource, /onClick=\{openLivingShellHome\}/u);
    assert.match(pageSource, /aria-label="Open All Bots Home"/u);
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

  it("keeps the app switcher compact on narrow viewports", () => {
    assert.doesNotMatch(cssSource, /\.locationStrip(?:Home|Copy|Status)?\b/u);
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
