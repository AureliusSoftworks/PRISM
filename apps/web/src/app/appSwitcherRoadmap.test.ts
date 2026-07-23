import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("living-shell location strip", () => {
  it("replaces visible flat applet switching with location-aware navigation", () => {
    assert.match(pageSource, /const renderLocationStrip =/u);
    assert.match(pageSource, /aria-label="Current PRISM location"/u);
    assert.match(pageSource, /aria-label="Open All Bots Home"/u);
    assert.match(pageSource, /aria-label="Session status"/u);
    assert.equal(pageSource.match(/renderAppSwitcher\(/gu)?.length ?? 0, 0);
    assert.ok((pageSource.match(/renderLocationStrip\(/gu)?.length ?? 0) > 1);
  });

  it("stays compact and hides secondary status on narrow viewports", () => {
    assert.match(cssSource, /\.locationStrip\s*\{/u);
    assert.match(cssSource, /\.locationStripStatus\s*\{/u);
    assert.match(
      cssSource,
      /@media \(max-width: 720px\)[\s\S]*\.locationStripStatus\s*\{[\s\S]*display: none/u,
    );
  });
});
