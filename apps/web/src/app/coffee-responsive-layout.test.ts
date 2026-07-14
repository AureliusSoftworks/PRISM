import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8")
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")");

test("first-person Coffee fills the stage with a bottom-anchored table and narrow prose", () => {
  assert.match(css, /--coffee-table-asset-width:\s*min\(104cqw,\s*1490px\)/);
  assert.match(css, /bottom:\s*clamp\(-92px,\s*-7vh,\s*-36px\)/);
  assert.match(css, /width:\s*min\(48cqw,\s*620px\)/);
  assert.match(css, /min-height:\s*clamp\(620px,\s*82dvh,\s*920px\)/);
  assert.match(css, /--coffee-canvas-y:\s*clamp\(-70px,\s*-6vh,\s*-42px\)/);
});

test("three-seat first-person Coffee keeps its head avatar below the stage edge", () => {
  assert.match(
    css,
    /\.coffeeStage\[data-coffee-perspective="first-person"\]:is\(\[data-phase="arriving"\],\s*\[data-phase="live"\]\):not\(\[data-compact="true"\]\)[\s\S]*?:is\(\.coffeeSeat,\s*\.coffeeSeatActionAnchor\)\[data-seat-count="3"\]\[data-layout-seat="0"\]\s*\{[\s\S]*?left:\s*50%;[\s\S]*?top:\s*max\(\s*calc\(38% - var\(--coffee-experimental-seat-lift\)\),\s*calc\(clamp\(74px,\s*6\.3cqw,\s*98px\) - var\(--coffee-canvas-y\) \+ 10px\)\s*\);/,
  );
  assert.match(
    css,
    /\[data-seat-count="5"\]\[data-layout-seat="0"\]\s*\{\s*left:\s*50%;\s*top:\s*calc\(45% - var\(--coffee-experimental-seat-lift\)\);/,
    "the established five-seat head position should remain unchanged",
  );
});

test("light first-person Coffee uses a readable light prose surface", () => {
  assert.match(
    css,
    /\.themeLight\.coffeeShell[\s\S]*\.coffeeStage\[data-coffee-perspective="first-person"\][\s\S]*\.coffeeCenterMessage\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(255,\s*253,\s*248,\s*0\.94\),\s*rgba\(246,\s*239,\s*229,\s*0\.96\)\)/,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell\s+:where\([\s\S]*\.coffeeCenterFeedLine[\s\S]*\)\s*\{\s*color:\s*var\(--fg\)/,
  );
});

test("Coffee action text repositions inward from container-relative seat sides", () => {
  assert.match(pageSource, /data-seat-horizontal-side=\{display\.seatHorizontalSide\}/);
  assert.match(css, /data-seat-horizontal-side="left"[\s\S]*--coffee-action-quote-x:\s*-20%/);
  assert.match(css, /data-seat-horizontal-side="right"[\s\S]*--coffee-action-quote-x:\s*-80%/);
  assert.match(css, /width:\s*min\(260px,\s*28cqw,\s*calc\(100cqw - 32px\)\)/);
  assert.match(css, /font-size:\s*clamp\(0\.78rem,\s*1\.15cqw,\s*0\.96rem\)/);
  assert.match(css, /@container\s*\(max-width:\s*980px\)/);
});
