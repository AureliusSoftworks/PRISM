import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const settingsPanelSource = readFileSync(
  join(appDir, "SettingsPanel.tsx"),
  "utf8",
);

test("right-panel inert pass exempts shared navbar chrome", () => {
  assert.match(pageSource, /function collectRightPanelInertTargets\(/u);
  assert.match(pageSource, /function rightPanelFocusableElements\(/u);
  assert.match(
    pageSource,
    /\[data-shared-app-navbar="true"\], \[data-app-shell-header="true"\]/u,
  );
  assert.match(
    pageSource,
    /collectRightPanelInertTargets\(panelNode\)/u,
  );
  assert.match(
    pageSource,
    /rightPanelFocusableElements\(panelNode\)/u,
  );
  assert.match(pageSource, /isInsideRightPanelChrome\(activeElement\)/u);
});

test("model picker outside-dismiss keeps portaled fallback menus selectable", () => {
  assert.match(pageSource, /data-compose-model-menu="true"/u);
  assert.match(pageSource, /data-compose-model-effort-menu="true"/u);
  assert.match(
    pageSource,
    /target\.closest\(\s*[\s\S]*?data-compose-model-menu="true"[\s\S]*?data-compose-model-effort-menu="true"/u,
  );
  assert.ok(
    pageSource.includes("key={encodeAutoFallbackPickerValue(fallback)}"),
    "fallback picker rows should use a stable provider:model key",
  );
  assert.match(pageSource, /available:\s*autoFallbackRefs/u);
});

test("right-panel overlay and drawer clear the shared top navbar", () => {
  assert.match(
    css,
    /\.panelOverlay\s*\{[\s\S]*?top:\s*var\(\s*--app-shell-top-nav-height/u,
  );
  assert.match(
    css,
    /\.panel\s*\{[\s\S]*?top:\s*var\(\s*--app-shell-top-nav-height/u,
  );
  assert.match(
    css,
    /\.botPanelHubShowcase\s*\{[\s\S]*?top:\s*var\(\s*--app-shell-top-nav-height/u,
  );
  assert.match(
    css,
    /\.appLayout\[data-right-panel-open="true"\]\s*\[data-shared-app-navbar="true"\]/u,
  );
  assert.match(
    css,
    /\.appLayout\[data-right-panel-open="true"\][\s\S]*?z-index:\s*200;/u,
  );
  assert.match(
    pageSource,
    /if \(panel === null\) return;[\s\S]{0,80}return holdAppNavbarForDropdown\(\);/u,
  );
});

test("right panels expose the shared navbar as non-modal chrome", () => {
  for (const panelName of [
    "usage",
    "memories",
    "command-center",
    "bots",
    "images",
  ]) {
    assert.match(
      pageSource,
      new RegExp(
        `data-prism-panel="${panelName}"[\\s\\S]{0,3200}?aria-modal="false"`,
        "u",
      ),
    );
  }
  assert.match(
    settingsPanelSource,
    /data-prism-panel="settings"[\s\S]{0,500}?aria-modal="false"/u,
  );
});

test("measured top-nav height is published for fixed panel layers", () => {
  assert.match(
    pageSource,
    /document\.documentElement\.style\.setProperty\(\s*"--app-shell-top-nav-height"/u,
  );
  assert.match(
    pageSource,
    /document\.documentElement\.style\.removeProperty\(\s*"--app-shell-top-nav-height"/u,
  );
});
