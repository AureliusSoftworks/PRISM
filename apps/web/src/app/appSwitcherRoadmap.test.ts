import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const prismMenuSource = readFileSync(
  new URL("./PrismMenu.tsx", import.meta.url),
  "utf8",
);
const prismMenuCss = readFileSync(
  new URL("./PrismMenu.module.css", import.meta.url),
  "utf8",
);

describe("living-shell applet navigation", () => {
  it("keeps the applet switcher beside wordmark-owned Home navigation", () => {
    assert.doesNotMatch(pageSource, /const renderLocationStrip =/u);
    assert.doesNotMatch(pageSource, /aria-label="Current PRISM location"/u);
    assert.doesNotMatch(pageSource, /aria-label="Session status"/u);
    assert.match(pageSource, /data-shared-applet-brand=\{appletId\}/u);
    assert.match(pageSource, /onClick=\{openLivingShellHome\}/u);
    assert.match(pageSource, /aria-label="Open All Bots Home"/u);
    assert.match(pageSource, /const renderAppSwitcher =/u);
    assert.match(pageSource, /label: "Switch Prism app"/u);
    assert.match(
      pageSource,
      /prismTopLevelSwitcherApplets\(\)\.filter\([\s\S]*applet\.id !== "chat" && applet\.id !== "zen"[\s\S]*\)/u,
    );
    assert.match(
      pageSource,
      /aria-label=\{`Switch Prism app\. Current app: \$\{PRISM_APPLETS\[currentAppletId\]\.name\}`\}/u,
    );
    assert.match(
      pageSource,
      /: chatPresentation === "zen"\s*\? "zen"\s*: "chat";/u,
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

  it("keeps applet identity glyphs prominent without hiding the selected state", () => {
    assert.match(
      pageSource,
      /kind: "radio",[\s\S]*icon: appletGlyph\(applet\.id\),[\s\S]*iconPresentation: "identity",/u,
    );
    assert.match(
      prismMenuSource,
      /entry\.iconPresentation === "identity" && Boolean\(entry\.icon\)/u,
    );
    assert.match(
      prismMenuSource,
      /preservesIdentityIcon && entry\.kind === "radio" && checked/u,
    );
    assert.match(
      prismMenuCss,
      /\.item\[data-icon-presentation="identity"\][\s\S]*min-height: 48px/u,
    );
    assert.match(
      prismMenuCss,
      /\.identityIcon svg[\s\S]*width: 25px;[\s\S]*height: 25px;/u,
    );
  });

  it("collapses planned applets behind an accessible Roadmap submenu", () => {
    assert.match(
      pageSource,
      /id: "roadmap",[\s\S]*kind: "submenu",[\s\S]*description: `\$\{roadmapApplets\.length\} planned applets`,[\s\S]*entries: \[/u,
    );
    assert.match(
      pageSource,
      /\.\.\.roadmapApplets\.map\(\(applet\): PrismMenuEntry => \(\{/u,
    );
    assert.match(
      prismMenuSource,
      /aria-haspopup=\{entry\.kind === "submenu" \? "menu" : undefined\}/u,
    );
    assert.match(
      prismMenuSource,
      /aria-expanded=\{entry\.kind === "submenu" \? openSubmenuId === entry\.id : undefined\}/u,
    );
  });

  it("disarms Private chat at every sibling applet boundary", () => {
    const navigationStart = pageSource.indexOf(
      "const navigateToView = useCallback(",
    );
    const navigationEnd = pageSource.indexOf(
      "useEffect(() => {\n    debateVoiceSurfaceActiveRef.current",
      navigationStart,
    );
    const navigationSource = pageSource.slice(navigationStart, navigationEnd);
    assert.match(
      navigationSource,
      /disarmPrivateModeForAppletSwitchRef\.current\(next\)/u,
    );
    assert.match(
      pageSource,
      /disarmPrivateModeForAppletSwitchRef\.current = \(next\) => \{[\s\S]*next === "chat" \|\| next === "sandbox" \|\| !appWidePrivateMode[\s\S]*setAppWidePrivateMode\(false\)/u,
    );
  });

  it("uses a round glyph-only app switcher trigger at every viewport", () => {
    assert.doesNotMatch(cssSource, /\.locationStrip(?:Home|Copy|Status)?\b/u);
    const switcherSource = pageSource.slice(
      pageSource.indexOf("const renderAppSwitcher ="),
      pageSource.indexOf("const renderUniversalNavbarButtons ="),
    );
    assert.match(
      cssSource,
      /\.appSwitcherButton\s*\{[\s\S]*width:\s*32px;[\s\S]*min-width:\s*32px;[\s\S]*height:\s*32px;[\s\S]*place-items:\s*center;[\s\S]*border-radius:\s*50%/u,
    );
    assert.match(switcherSource, /className=\{styles\.appSwitcherGlyph\}/u);
    assert.doesNotMatch(switcherSource, /styles\.appSwitcherName/u);
    assert.doesNotMatch(switcherSource, /styles\.appSwitcherChevron/u);
    assert.match(
      switcherSource,
      /aria-label=\{`Switch Prism app\. Current app: \$\{PRISM_APPLETS\[currentAppletId\]\.name\}`\}/u,
    );
    assert.match(switcherSource, /<PrismMenuSurface/u);
  });
});
