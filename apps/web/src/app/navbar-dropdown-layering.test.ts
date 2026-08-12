import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const prismMenuSource = readFileSync(
  new URL("./PrismMenu.tsx", import.meta.url),
  "utf8",
);
const prismMenuCss = readFileSync(
  new URL("./PrismMenu.module.css", import.meta.url),
  "utf8",
);
const globalsCss = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

test("navbar dropdown pickers disable arrow-key list selection", () => {
  assert.match(
    pageSource,
    /Navbar pickers stay pointer\/wheel driven[\s\S]{0,160}if \(navbarPicker\) return;/u,
  );
  assert.match(
    prismMenuSource,
    /Top-navbar menus are pointer\/wheel driven[\s\S]{0,160}if \(!navbarPicker\) \{\s*if \(event\.key === "ArrowDown"/u,
  );
});

test("navbar dropdown pickers share one global open owner", () => {
  assert.match(
    prismMenuSource,
    /PRISM_NAVBAR_PICKER_OPEN_EVENT = "prism:navbar-picker-open"/u,
  );
  assert.match(
    prismMenuSource,
    /window\.addEventListener\(PRISM_NAVBAR_PICKER_OPEN_EVENT, closeForNavbarPicker\)/u,
  );
  assert.doesNotMatch(
    prismMenuSource,
    /announcePrismNavbarPickerOpen\(request\.id\)/u,
  );
  assert.match(pageSource, /announcePrismNavbarPickerOpen\(pickerId\)/u);
  assert.match(pageSource, /closeForOtherPicker/u);
  assert.match(pageSource, /voiceModeSelectorPickerId = useId\(\)/u);
});

test("open navbar pickers freeze background scrolling but keep their own overflow native", () => {
  assert.match(
    prismMenuSource,
    /PRISM_NAVBAR_PICKER_SURFACE_SELECTOR\s*=\s*\n?\s*'\[data-navbar-picker-surface="true"\]'/u,
  );
  assert.match(
    prismMenuSource,
    /window\.addEventListener\("wheel", blockBackgroundScroll, \{\s*capture: true,\s*passive: false/u,
  );
  assert.match(
    prismMenuSource,
    /window\.addEventListener\("touchmove", blockBackgroundScroll, \{\s*capture: true,\s*passive: false/u,
  );
  assert.match(
    prismMenuSource,
    /eventStartedInsideNavbarPicker\(event\)[\s\S]{0,80}return;[\s\S]{0,80}event\.preventDefault\(\)/u,
  );
  assert.match(
    prismMenuSource,
    /window\.addEventListener\("keydown", blockBackgroundKeyboardScroll, true\)/u,
  );
  assert.match(
    prismMenuSource,
    /window\.removeEventListener\("wheel", blockBackgroundScroll, true\)[\s\S]{0,220}window\.removeEventListener\("keydown", blockBackgroundKeyboardScroll, true\)/u,
  );
  assert.match(
    prismMenuCss,
    /\.menu\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/u,
  );
});

test("Speech Type stays compact and its hotkey closes an already-open menu", () => {
  const voiceSelector = sourceBetween(
    "const renderVoiceModeSelector",
    "const renderHeaderModelPicker",
  );
  assert.match(voiceSelector, /maxHeight:\s*224/u);
  assert.match(
    prismMenuSource,
    /maxHeight: Math\.min\(position\.maxHeight, request\.maxHeight \?\? Infinity\)/u,
  );
  assert.match(
    pageSource,
    /\[data-prism-speech-type-trigger="true"\]\[aria-expanded="true"\]/u,
  );
});

test("navbar dropdowns escape header stacking contexts through body portals", () => {
  const voiceSelector = sourceBetween(
    "const renderVoiceModeSelector",
    "const renderHeaderModelPicker",
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

test("navbar picker layers sit exactly one level below their header controls", () => {
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

  assert.equal(navbarLayer - botLayer, 1);
  assert.equal(navbarLayer - modelLayer, 1);
  assert.match(
    prismMenuCss,
    /\.menu\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*2147483000;/u,
  );
  assert.match(
    prismMenuCss,
    /\.menu\[data-navbar-picker-surface="true"\]\s*\{[\s\S]*z-index:\s*179;[\s\S]*padding-top:\s*12px;/u,
  );
});

test("navbar bot trigger matches its responsive picker menu floor", () => {
  assert.match(
    pageSource,
    /data-navbar-picker=\{navbarPicker \? "true" : undefined\}/u,
  );
  assert.match(
    readFileSync(new URL("./page.module.css", import.meta.url), "utf8"),
    /\.composeBotControl\[data-navbar-picker="true"\]\s*\{[\s\S]*?width:\s*min\(260px, calc\(100vw - 24px\)\);[\s\S]*?flex:\s*0 0 min\(260px, calc\(100vw - 24px\)\);/u,
  );
  assert.match(
    pageSource,
    /const COMPOSE_MENU_BOT_MIN_WIDTH_PX = 260;/u,
  );
  assert.match(
    pageSource,
    /navbarPicker && menuPortalStyle[\s\S]{0,120}width: menuPortalStyle\.minWidth/u,
  );
});

test("navbar picker surfaces share the cool ambient readability shadow", () => {
  const modelPicker = sourceBetween(
    "function ComposerModelPicker",
    "// ── Hue lens",
  );
  const botPicker = sourceBetween(
    "function ComposerBotPicker",
    "function ComposerModelPicker",
  );
  const voiceSelector = sourceBetween(
    "const renderVoiceModeSelector",
    "const renderHeaderModelPicker",
  );
  const headerPicker = sourceBetween(
    "const renderHeaderModelPicker",
    "const renderImagesPanelModelPicker",
  );
  const appSwitcher = sourceBetween(
    "const renderAppSwitcher",
    "const renderUniversalNavbarButtons",
  );
  const headerTools = sourceBetween(
    "const renderChatOverflowGear",
    "function renderZenLiveBotContextMenu",
  );

  assert.match(
    globalsCss,
    /\[data-navbar-picker-surface="true"\]\s*\{[^}]*box-shadow:[^}]*#64cfff[^}]*#7367ff/iu,
  );
  assert.match(
    globalsCss,
    /body\[data-prism-theme="light"\]\s+\[data-navbar-picker-surface="true"\]\s*\{[^}]*box-shadow:[^}]*#269bd8[^}]*#5856d6/iu,
  );
  assert.match(
    modelPicker,
    /data-compose-model-menu="true"[\s\S]{0,120}data-navbar-picker-surface=/u,
  );
  assert.match(
    modelPicker,
    /data-compose-model-effort-menu="true"[\s\S]{0,120}data-navbar-picker-surface=/u,
  );
  assert.match(botPicker, /data-navbar-picker-surface=/u);
  assert.match(prismMenuSource, /navbarPicker = false/u);
  assert.match(
    prismMenuSource,
    /data-navbar-picker-surface=\{navbarPicker \? "true" : undefined\}/u,
  );
  assert.match(
    prismMenuSource,
    /ownerId=\{rootOwnerId\}[\s\S]{0,80}navbarPicker=\{navbarPicker\}/u,
  );

  for (const navbarCaller of [
    voiceSelector,
    headerPicker,
    appSwitcher,
    headerTools,
  ]) {
    assert.match(navbarCaller, /navbarPicker/u);
  }
});

test("navbar and compose pickers hold Zen auto-hide while menus are open", () => {
  assert.match(pageSource, /holdAppNavbarForDropdown/u);
  assert.match(
    pageSource,
    /if \(!appSwitcherOpen\) return;[\s\S]{0,120}return holdAppNavbarForDropdown\(\);/u,
  );
  assert.match(
    pageSource,
    /if \(!voiceModeSelectorOpen\) return;[\s\S]{0,120}return holdAppNavbarForDropdown\(\);/u,
  );
  assert.match(
    pageSource,
    /if \(!chatOverflowMenuOpen\) return;[\s\S]{0,120}return holdAppNavbarForDropdown\(\);/u,
  );
  const modelPicker = sourceBetween(
    "function ComposerModelPicker",
    "// ── Hue lens",
  );
  assert.match(
    modelPicker,
    /if \(!menuOpen && !effortMenuOpen\) return;[\s\S]{0,120}return holdAppNavbarForDropdown\(\);/u,
  );
  const botPicker = sourceBetween(
    "function ComposerBotPicker",
    "function ComposerModelPicker",
  );
  assert.match(
    botPicker,
    /if \(!menuOpen\) return;[\s\S]{0,120}return holdAppNavbarForDropdown\(\);/u,
  );
});

test("model effort and bot pickers dismiss on outside pointer like PrismMenu", () => {
  assert.match(
    pageSource,
    /effortMenuRef\.current\?\.contains\(target\)[\s\S]{0,900}window\.addEventListener\("pointerdown", handler, true\)/u,
  );
  assert.match(
    pageSource,
    /function ComposerBotPicker[\s\S]{0,6200}?menuRef\.current\?\.contains\(target\)[\s\S]{0,200}window\.addEventListener\("pointerdown", handler, true\)/u,
  );
  assert.match(
    pageSource,
    /function ComposerModelPicker[\s\S]{0,24000}?window\.addEventListener\("pointerdown", handler, true\)[\s\S]{0,400}window\.removeEventListener\("pointerdown", handler, true\)/u,
  );
});
