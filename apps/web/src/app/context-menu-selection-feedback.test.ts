import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("./PrismMenu.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./PrismMenu.module.css", import.meta.url), "utf8");

test("only otherwise invisible actions opt into shared selection feedback", () => {
  assert.match(pageSource, /id: "copy"[\s\S]*?feedback: "Copied"/u);
  assert.doesNotMatch(pageSource, /contextMenuSelectionFeedback/u);
  assert.match(menuSource, /entry\.kind === "action" && entry\.feedback/u);
  assert.match(menuSource, /role="status"/u);
  assert.match(menuSource, /aria-live="polite"/u);
  assert.match(pageSource, /function renderContextMenuPortal\(content: React\.ReactNode\)/u);
  assert.match(pageSource, /renderContextMenuPortal\(renderBotContextMenu\(\)\)/u);
  assert.match(stylesSource, /\.feedback\s*\{/u);
});

test("selection feedback remains visible briefly after the menu closes", () => {
  assert.match(menuSource, /window\.setTimeout\(\(\) => onClose\(\), 520\)/u);
  assert.match(stylesSource, /\.feedback\s*\{/u);
  assert.match(stylesSource, /pointer-events:\s*none/u);
  assert.match(stylesSource, /animation:\s*prismMenuFeedback 760ms/u);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/u);
});
