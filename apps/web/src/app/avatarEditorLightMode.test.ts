import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio } from "@localai/shared";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(resolve(appDir, "page.module.css"), "utf8");
const detailsCssSource = readFileSync(
  resolve(appDir, "avatar-details-editor.module.css"),
  "utf8",
);

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Expected section start: ${start}`);
  assert.notEqual(endIndex, -1, `Expected section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Avatar Studio carries the resolved app theme through its portal", () => {
  assert.match(
    pageSource,
    /const themeScopeClass =\s*resolvedTheme === "light" \? styles\.themeLight : styles\.themeDark;/,
  );
  assert.match(
    pageSource,
    /className=\{`\$\{styles\.botAvatarStudioThemeScope\} \$\{themeScopeClass\}`\}/,
  );
  assert.match(
    pageSource,
    /data-avatar-studio-theme=\{resolvedTheme\}/,
  );
  assert.equal(
    [...pageSource.matchAll(/function BotAvatarCustomizerModal\(/gu)].length,
    1,
  );
});

test("Avatar Studio Light Mode is a shared-token palette, not a duplicated component", () => {
  const scope = sourceSection(
    cssSource,
    ".botAvatarStudioThemeScope {",
    ".botAvatarCustomizerBackdrop {",
  );
  assert.match(scope, /color:\s*var\(--fg\)/);
  assert.match(scope, /--panel:\s*var\(--bg-surface\)/);
  assert.match(scope, /--border:\s*var\(--line\)/);
  assert.match(scope, /--muted:\s*var\(--fg-muted\)/);
  assert.match(scope, /\.themeDark\.botAvatarStudioThemeScope[\s\S]*color-scheme:\s*dark/);
  assert.match(scope, /\.themeLight\.botAvatarStudioThemeScope/);
  assert.match(scope, /color-scheme:\s*light/);
  assert.match(scope, /--avatar-studio-surface:\s*var\(--bg-surface\)/);
  assert.match(scope, /--avatar-studio-panel:[\s\S]*var\(--bg-elevated\)/);
  assert.match(scope, /--avatar-studio-control:[\s\S]*var\(--bg\)/);
  assert.match(scope, /--avatar-studio-border:[\s\S]*var\(--line-strong\)/);
});

test("Light Mode covers studio chrome, panels, controls, fields, and dialogs", () => {
  const lightMode = sourceSection(
    cssSource,
    "/* Avatar Studio Light Mode",
    "/* Wide-screen affordance",
  );
  for (const selector of [
    ".botAvatarCustomizerBackdrop",
    ".botAvatarCustomizer::before",
    ".botProfileBuilderHeader",
    ".botAvatarCustomizerBody",
    ".botAvatarMannequinPanel",
    ".botAvatarControlPanel",
    ".botAvatarControlGroup",
    ".botAvatarProfilePanel",
    ".botAvatarPreviewThemeToggle",
    ".botAvatarControlTabs",
    ".botAvatarSavePromptPanel",
    ".botPowerSurfacePopover",
  ]) {
    assert.match(lightMode, new RegExp(selector.replaceAll(".", "\\.")));
  }
  assert.match(lightMode, /input:not\(\[type="range"\]\)/);
  assert.match(lightMode, /textarea,/);
  assert.match(lightMode, /select/);
  assert.match(lightMode, /background:\s*var\(--bg-elevated\)/);
  assert.match(lightMode, /color:\s*var\(--fg\)/);
  assert.match(lightMode, /color:\s*var\(--danger\)/);
});

test("Light Mode preserves clear interactive states", () => {
  const lightMode = sourceSection(
    cssSource,
    "/* Avatar Studio Light Mode",
    "/* Wide-screen affordance",
  );
  assert.match(lightMode, /button\[data-active="true"\]/);
  assert.match(lightMode, /button\[data-selected="true"\]/);
  assert.match(lightMode, /:hover:not\(:disabled\)/);
  assert.match(lightMode, /:focus-visible/);
  assert.match(lightMode, /:disabled/);
  assert.match(lightMode, /--avatar-studio-selected/);
  assert.match(lightMode, /--avatar-studio-hover/);
  assert.match(lightMode, /color:\s*var\(--fg-subtle\)/);
});

test("Light Mode text, muted copy, errors, and warnings meet readable contrast", () => {
  const lightSurface = "#fffdf8";
  assert.ok(contrastRatio("#161514", lightSurface) >= 7);
  assert.ok(contrastRatio("#5f5b55", lightSurface) >= 4.5);
  assert.ok(contrastRatio("#dc2626", lightSurface) >= 4.5);
  assert.ok(contrastRatio("#92400e", lightSurface) >= 4.5);
});

test("the avatar details editor inherits theme tokens while keeping its CRT canvas", () => {
  assert.match(detailsCssSource, /color:\s*var\(--danger\)/);
  assert.match(
    detailsCssSource,
    /color:\s*var\(--avatar-editor-warning,\s*#ffb27d\)/,
  );
  assert.match(detailsCssSource, /button:not\(\.applyButton\)[\s\S]*:hover/);
  assert.match(detailsCssSource, /var\(--bg-hover\)/);
  assert.match(detailsCssSource, /\.canvasFrame[\s\S]*background-color:\s*#050608/);
  assert.match(
    cssSource,
    /\.botAvatarMannequinStage\[data-preview-theme="light"\]/,
  );
});
