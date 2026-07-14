import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const textFieldSource = readFileSync(new URL("./TextFieldContextMenu.tsx", import.meta.url), "utf8");
const textFieldCss = readFileSync(new URL("./TextFieldContextMenu.module.css", import.meta.url), "utf8");

test("ported message, bot, and canvas menus retain a light theme scope", () => {
  assert.match(pageSource, /contextMenuThemeScope\} \$\{themeClass\}/);
  assert.match(pageCss, /\.themeLight \.messageContextMenu\s*\{[\s\S]*background:\s*#fffdf8/);
  assert.match(pageCss, /\.themeLight \.messageContextMenu\s*\{[\s\S]*backdrop-filter:\s*none/);
  assert.match(pageCss, /\.themeLight \.messageContextMenu button:disabled\s*\{[\s\S]*color:\s*#8b8175/);
  assert.match(pageCss, /\.canvasToolsContextMenu\s*\{/);
});

test("text-field menus disable blur in light mode while preserving dark blur", () => {
  assert.match(textFieldSource, /style\.colorScheme\.split\(" "\)\.includes\("light"\) \|\| cssColorIsLight\(bg\)/);
  assert.match(textFieldSource, /lightTheme\s*\?\s*"none"\s*:\s*"blur\(16px\) saturate\(1\.2\)"/);
  assert.match(textFieldCss, /--text-field-menu-backdrop-filter/);
  assert.match(textFieldCss, /blur\(16px\) saturate\(1\.2\)/);
});

test("global canvas-tools menu follows dismiss patterns", () => {
  assert.match(
    pageSource,
    /const handleAppContextMenu\s*=\s*useCallback\([\s\S]*?setZenLiveBotContextMenu\(null\);[\s\S]*?closeCanvasToolsContextMenu\(\);/,
  );

  assert.match(
    pageSource,
    /const handleMessagesFrameContextMenu\s*=\s*useCallback\([\s\S]*?if \(canvasToolsContextMenu\) \{[\s\S]*?closeCanvasToolsContextMenu\(\);[\s\S]*?return;/,
  );

  assert.match(
    pageSource,
    /useEffect\(\(\) => \{\s*if \(!canvasToolsContextMenu\) return;[\s\S]*?if \(event\.key === "Escape"\)[\s\S]*?closeCanvasToolsContextMenu\(\);/,
  );

  assert.match(
    pageSource,
    /if \(isContextMenuPointerGesture\(event\)\) return;[\s\S]*?if \(!isPrimaryPointerDismissal\(event\)\) return;[\s\S]*?closeCanvasToolsContextMenu\(\);/,
  );

  assert.match(
    pageSource,
    /document\.addEventListener\("pointerdown", handlePointerDown, true\);[\s\S]*?document\.removeEventListener\("pointerdown", handlePointerDown, true\);/,
  );
});
