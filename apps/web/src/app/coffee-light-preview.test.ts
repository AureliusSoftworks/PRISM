import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("Coffee group roster previews share light-aware glyph orbs", () => {
  assert.match(pageSource, /data-roster-preview=\{rosterPreviewSeat \? "true" : undefined\}/);
  assert.match(pageSource, /rosterPreviewSeat[\s\S]*<BotFaceScreenFill \/>[\s\S]*coffeeSeatPlateGlyph/);
  assert.match(
    css,
    /\.themeLight\.coffeeShell[\s\S]*\.coffeeSeat\[data-roster-preview="true"\][\s\S]*\.botFaceScreenFill\s*\{[\s\S]*--bot-face-screen-background:[\s\S]*#f8fbff[\s\S]*--bot-face-screen-border:/,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell[\s\S]*\.coffeeSeat\[data-roster-preview="true"\][\s\S]*\.coffeeSeatPlateGlyph\s*\{[\s\S]*#2b2118/,
  );
});
