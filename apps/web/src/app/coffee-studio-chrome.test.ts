import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const lightStudioStart = css.indexOf(
  '.themeLight.coffeeShell[data-chrome-language="studio"] {',
);
const lightStudioEnd = css.indexOf(
  "@media (prefers-reduced-motion: reduce)",
  lightStudioStart,
);
const lightStudioCss = css.slice(lightStudioStart, lightStudioEnd);

test("Coffee opts into the studio chrome without replacing the table surface", () => {
  assert.match(pageSource, /data-chrome-language="studio"/u);
  assert.match(pageSource, /data-coffee-table-scene="true"/u);
  assert.match(pageSource, /className=\{styles\.coffeeTableAsset\}/u);
});

test("Coffee studio chrome defines the spectrum chassis and compact panels", () => {
  assert.match(
    css,
    /\.coffeeShell\[data-chrome-language="studio"\]::before[\s\S]*linear-gradient\([\s\S]*#f04586[\s\S]*#48dbe5[\s\S]*#8d6dff/u,
  );
  assert.match(css, /--coffee-panel-radius:\s*8px/u);
  assert.match(
    css,
    /\.coffeeShell\[data-chrome-language="studio"\] \.coffeeStage\s*\{[\s\S]*border:\s*1px solid var\(--coffee-studio-line\)/u,
  );
});

test("Coffee studio chrome has a purpose-built light material theme", () => {
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\]\s*\{[\s\S]*--coffee-studio-bg:\s*#eaf3fb[\s\S]*--coffee-studio-ink:\s*#172638/u,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\] \.coffeeStage\s*\{[\s\S]*rgba\(235, 245, 253, 0\.72\)/u,
  );
  assert.doesNotMatch(
    lightStudioCss,
    /#ece9e2|#fffdf8|rgba\(246, 242, 235|rgba\(72, 62, 50/u,
  );
  assert.match(
    lightStudioCss,
    /\.coffeeTableAsset\s*\{[\s\S]*grayscale\(1\)[\s\S]*rgba\(31, 74, 112, 0\.2\)/u,
  );
  assert.match(
    lightStudioCss,
    /\.coffeeCenterMessage\s*\{[\s\S]*rgba\(235, 245, 253, 0\.97\)/u,
  );
});

test("Coffee studio chrome keeps selected bots inside each theme palette", () => {
  assert.match(
    css,
    /\.coffeeShell\[data-chrome-language="studio"\][\s\S]*\.coffeeCanvasBotTile\.chatBotTileSelected[\s\S]*var\(--coffee-studio-surface-raised\)/u,
  );
  assert.match(
    css,
    /\.coffeeCanvasBotTile\.chatBotTileSelected[\s\S]*\.chatBotTileBotGlyph > svg[\s\S]*var\(--coffee-bot-color\) 72%, #ffffff\) !important/u,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\][\s\S]*\.coffeeCanvasBotTile\.chatBotTileSelected[\s\S]*#ffffff/u,
  );
});

test("Coffee studio chrome keeps Light group cards on light material", () => {
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\] \.coffeeGroupButton\s*\{[\s\S]*rgba\(255, 255, 255, 0\.94\)[\s\S]*var\(--coffee-group-gradient\)/u,
  );
});

test("Coffee review actions use theme-owned studio materials", () => {
  assert.match(
    css,
    /\.coffeeShell\[data-chrome-language="studio"\][\s\S]*:where\(\.coffeeJoinSessionButton, \.coffeeReplayIconButton\)[\s\S]*var\(--coffee-studio-control\)/u,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\][\s\S]*:where\(\.coffeeJoinSessionButton, \.coffeeReplayIconButton\)[\s\S]*var\(--coffee-studio-surface-raised\)/u,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\]:has\([\s\S]*data-phase="finished"[\s\S]*\.coffeeFinishedRecapControls[\s\S]*var\(--coffee-studio-surface-raised\)/u,
  );
});
