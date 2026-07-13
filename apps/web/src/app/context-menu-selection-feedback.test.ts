import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("all custom context-menu items trigger shared selection feedback", () => {
  assert.match(pageSource, /target\.closest<HTMLElement>\('\[role="menuitem"\]'\)/u);
  assert.match(pageSource, /menuItem\.closest\(`\.\$\{styles\.messageContextMenu\}`\)/u);
  assert.match(pageSource, /document\.addEventListener\("click", handleClick, true\)/u);
  assert.match(pageSource, /className=\{styles\.contextMenuSelectionFeedback\}/u);
  assert.match(pageSource, /<strong>\{contextMenuSelectionFeedback\.label\}<\/strong>/u);
  assert.match(pageSource, /role="status"\s*aria-live="polite"/u);
  assert.match(pageSource, /function renderContextMenuPortal\(content: React\.ReactNode\)/u);
  assert.match(pageSource, /renderContextMenuPortal\(renderBotContextMenu\(\)\)/u);
  assert.match(stylesSource, /\.messageContextMenu button\s*\{[\s\S]*?cursor:\s*pointer/u);
  assert.match(stylesSource, /\.botPanelHubAvatarPlate \.zenLiveBotPresenceHitTarget\s*\{\s*cursor:\s*default/u);
});

test("selection feedback remains visible briefly after the menu closes", () => {
  assert.match(pageSource, /\}, 640\);/u);
  assert.match(stylesSource, /\.contextMenuSelectionFeedback\s*\{/u);
  assert.match(stylesSource, /pointer-events:\s*none/u);
  assert.match(stylesSource, /animation:\s*contextMenuSelectionConfirm 640ms/u);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/u);
});
