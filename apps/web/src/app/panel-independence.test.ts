import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8").replace(/\s+/gu, " ");
const css = readFileSync(join(appDir, "page.module.css"), "utf8");

function sourceBlockAfter(needle: string, terminator: string): string {
  const start = pageSource.indexOf(needle);
  assert.notEqual(start, -1, `Missing source needle: ${needle}`);
  const end = pageSource.indexOf(terminator, start);
  assert.notEqual(end, -1, `Missing source terminator after ${needle}: ${terminator}`);
  return pageSource.slice(start, end);
}

test("right panel open does not close the left sidebar state", () => {
  const openRightPanelSource = sourceBlockAfter(
    "const openRightPanel = useCallback",
    "const openSettingsPanel = useCallback"
  );

  assert.doesNotMatch(openRightPanelSource, /setSidebarOpen\(false\)/);
});

test("left sidebar is treated as right-panel background", () => {
  assert.match(
    pageSource,
    /data-right-panel-open=\{panel !== null \? "true" : undefined\}/
  );
  assert.match(
    pageSource,
    /\{sidebarOpen && panel === null && \(\s*<div className=\{styles\.overlay\}/
  );
  assert.match(
    pageSource,
    /aria-hidden=\{\s*panel !== null\s*\|\|\s*\(sidebarDrawerMode && !sidebarOpen\)\s*\?\s*true\s*:\s*undefined\s*\}/
  );
  assert.match(
    pageSource,
    /inert=\{\s*panel !== null\s*\|\|\s*\(sidebarDrawerMode && !sidebarOpen\)\s*\?\s*true\s*:\s*undefined\s*\}/
  );

  assert.match(
    css,
    /\.appLayout\[data-right-panel-open="true"\] > \.sidebar\.sidebarOpen/
  );
  assert.match(css, /z-index:\s*98;/);
});
