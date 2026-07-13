import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("panel theme toggle", () => {
  it("reuses one accessible theme control in every shared panel header", () => {
    assert.match(pageSource, /const renderPanelThemeToggle = \(\): React\.JSX\.Element =>/);
    assert.match(pageSource, /data-prism-panel-theme-toggle="true"/);
    assert.match(pageSource, /aria-label=\{themeAriaLabel\}/);
    assert.match(pageSource, /<ThemeGlyph mode=\{effectiveThemeMode\} \/>/);
    assert.equal(pageSource.match(/\{renderPanelThemeToggle\(\)\}/g)?.length, 6);
  });

  it("keeps the control visually aligned with panel header actions", () => {
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.panelHeaderIconButton\} \$\{styles\.panelHeaderThemeButton\}`\}/
    );
    assert.match(cssSource, /\.panelHeaderThemeButton:focus-visible/);
    assert.doesNotMatch(cssSource, /\.settingsHeaderThemeButton/);
  });
});
