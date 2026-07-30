import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const prismMenuCss = readFileSync(
  new URL("./PrismMenu.module.css", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

test("navbar dropdowns escape header stacking contexts through body portals", () => {
  const voiceSelector = sourceBetween(
    "const renderVoiceModeSelector",
    "const renderCoffeeHeaderModelChrome",
  );
  const appSwitcher = sourceBetween(
    "const renderAppSwitcher",
    "const renderUniversalNavbarButtons",
  );
  const headerTools = sourceBetween(
    "const renderChatOverflowGear",
    "function renderZenLiveBotContextMenu",
  );
  const modelPicker = sourceBetween(
    "function ComposerModelPicker",
    "// ── Hue lens",
  );

  for (const source of [voiceSelector, appSwitcher, headerTools, modelPicker]) {
    assert.match(source, /createPortal\(/u);
    assert.match(source, /document\.body/u);
  }
  for (const source of [voiceSelector, appSwitcher, headerTools]) {
    assert.match(source, /<PrismMenuSurface/u);
  }
  assert.match(appSwitcher, /data-prism-menu-owner=\{menuId\}/u);
  assert.doesNotMatch(
    pageSource,
    /if \(!appSwitcherOpen\) return;[\s\S]{0,800}document\.addEventListener\("pointerdown"/u,
  );
});

test("portaled picker layers stay above the shared navbar", () => {
  const botLayer = Number(
    pageSource.match(
      /const COMPOSE_MENU_PORTAL_Z_INDEX_BOT = ([\d_]+);/u,
    )?.[1]?.replaceAll("_", ""),
  );
  const modelLayer = Number(
    pageSource.match(
      /const COMPOSE_MENU_PORTAL_Z_INDEX_MODEL = ([\d_]+);/u,
    )?.[1]?.replaceAll("_", ""),
  );
  const navbarLayer = Number(
    readFileSync(new URL("./page.module.css", import.meta.url), "utf8").match(
      /\.chatHeader\s*\{[\s\S]*?z-index:\s*(\d+);/u,
    )?.[1],
  );

  assert.ok(botLayer > navbarLayer);
  assert.ok(modelLayer > navbarLayer);
  assert.match(
    prismMenuCss,
    /\.menu\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*2147483000;/u,
  );
});
