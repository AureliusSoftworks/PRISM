import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const menuCss = readFileSync(new URL("./PrismMenu.module.css", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("./PrismMenu.tsx", import.meta.url), "utf8");
const textFieldSource = readFileSync(new URL("./TextFieldContextMenu.tsx", import.meta.url), "utf8");

test("message, bot, canvas, and click-open menus share an opaque light shell", () => {
  assert.match(pageSource, /theme: resolvedTheme/);
  assert.match(menuSource, /data-theme=\{request\.theme \?\? "dark"\}/);
  assert.match(menuCss, /\.menu\[data-theme="light"\][\s\S]*--prism-menu-bg: #f8fbfe/);
  assert.match(menuCss, /\.menu\[data-theme="light"\][\s\S]*backdrop-filter: none/);
  assert.match(menuCss, /--prism-menu-muted: #637386/);
});

test("text-field menus disable blur in light mode while preserving dark blur", () => {
  assert.match(textFieldSource, /style\.colorScheme\.split\(" "\)\.includes\("light"\) \|\| cssColorIsLight\(bg\)/);
  assert.match(textFieldSource, /usePrismMenu\(\)/);
  assert.match(textFieldSource, /theme: themeForTarget\(target\)/);
  assert.match(menuCss, /backdrop-filter: blur\(18px\) saturate\(1\.16\)/);
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
