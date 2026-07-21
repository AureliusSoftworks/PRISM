import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const textMenuSource = readFileSync(
  new URL("./TextFieldContextMenu.tsx", import.meta.url),
  "utf8",
);
const slateSource = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const menuSource = readFileSync(new URL("./PrismMenu.tsx", import.meta.url), "utf8");
const menuCss = readFileSync(new URL("./PrismMenu.module.css", import.meta.url), "utf8");

test("root layout owns a single PRISM menu provider", () => {
  assert.match(layoutSource, /<PrismMenuProvider>/u);
  assert.match(layoutSource, /<TextFieldContextMenu\s*\/>/u);
});

test("all custom web menu render paths use the shared system", () => {
  assert.doesNotMatch(pageSource, /<[^>]+role="menu"/u);
  assert.doesNotMatch(pageSource, /CONTEXT_MENU_ESTIMATED/u);
  assert.match(pageSource, /PrismMenuSurface/u);
  assert.match(textMenuSource, /usePrismMenu/u);
  assert.match(slateSource, /usePrismMenu/u);
  assert.match(slateSource, /label: "Open project"/u);
  assert.match(slateSource, /label: "Delete project"/u);
});

test("menu interaction contract includes keyboard, submenu, and focus restoration", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft", "Escape", "Tab"]) {
    assert.match(menuSource, new RegExp(`event\\.key === "${key}"`, "u"));
  }
  assert.match(menuSource, /prismMenuTypeaheadMatch/u);
  assert.match(menuSource, /focusRestoreTarget/u);
  assert.match(menuSource, /event\.key === "Tab"[\s\S]*?restoreFocus: false/u);
  assert.match(
    menuSource,
    /event\.key === "ArrowRight" && activeEntry\?\.kind === "submenu"/u,
  );
  assert.match(menuSource, /preferredPlacement: "right-start"/u);
  assert.match(menuSource, /claimSurface/u);
});

test("outside pointer presses dismiss menus before canvas handlers can trap them", () => {
  assert.match(
    menuSource,
    /window\.addEventListener\("pointerdown", dismissForPointer, true\)/u,
  );
  assert.match(
    menuSource,
    /window\.removeEventListener\("pointerdown", dismissForPointer, true\)/u,
  );
  assert.doesNotMatch(
    menuSource,
    /document\.addEventListener\("pointerdown", dismissForPointer/u,
  );
});

test("visual shell follows the PRISM instrument-glass contract", () => {
  assert.match(menuCss, /border-radius: 12px/u);
  assert.match(menuCss, /\.filament/u);
  assert.match(menuCss, /@media \(pointer: coarse\)/u);
  assert.match(menuCss, /prefers-reduced-motion/u);
  assert.match(
    menuCss,
    /\.menu\[data-theme="light"\] \.item\[data-tone="danger"\]/u,
  );
  assert.doesNotMatch(menuCss, /dashed/u);
});

test("approved control changes are pinned", () => {
  assert.match(pageSource, /label: "Remove selected from current group"/u);
  assert.match(pageSource, /label: "Reset size"/u);
  assert.match(pageSource, /label: "Import bots"/u);
  assert.match(pageSource, /label: "Group actions"|<span>Group actions<\/span>/u);
  assert.match(pageSource, /setConversationGroupDeleteConfirm\(group\)/u);
  const conversationGroupMenuSource = pageSource.slice(
    pageSource.indexOf("function renderConversationGroupContextMenu"),
    pageSource.indexOf("// ── First-launch welcome"),
  );
  assert.doesNotMatch(conversationGroupMenuSource, /window\.confirm/u);
  assert.match(pageSource, /data-tutorial-target="chat-group-atmosphere"/u);
});
