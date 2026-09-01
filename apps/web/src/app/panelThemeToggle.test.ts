import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("global navbar theme toggle", () => {
  it("keeps one accessible Theme control in the navbar instead of panel duplicates", () => {
    assert.doesNotMatch(pageSource, /const renderPanelThemeToggle/);
    assert.doesNotMatch(pageSource, /data-prism-panel-theme-toggle="true"/);
    assert.match(pageSource, /aria-label=\{actionTooltip\("theme", themeAriaLabel\)\}/);
    assert.match(pageSource, /<ThemeGlyph mode=\{effectiveThemeMode\} \/>/);
    assert.match(
      pageSource,
      /const actionDisabled = \(action: UniversalNavbarAction\): boolean =>\s*action === "theme" \? false/u,
    );
  });

  it("keeps the navbar interactive above open panels", () => {
    assert.match(pageSource, /const gearHidden = false/u);
    assert.doesNotMatch(cssSource, /\.panelHeaderThemeButton/);
    assert.match(
      cssSource,
      /\.appLayout\[data-right-panel-open="true"\] \[data-shared-app-navbar="true"\][\s\S]{0,180}z-index:\s*200;[\s\S]{0,80}pointer-events:\s*auto/u,
    );
  });
});
