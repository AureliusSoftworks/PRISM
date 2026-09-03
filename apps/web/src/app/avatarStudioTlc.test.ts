import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const page = read("./page.tsx");
const css = read("./page.module.css");
const atlasCss = read("./PronunciationAtlas.module.css");

test("changing Studio theme does not reset the active section or draft state", () => {
  assert.match(page, /setPreviewTheme\(resolvedTheme\);\s*\}, \[open, resolvedTheme\]\)/);
  const initialization = page.slice(
    page.indexOf("avatarVoicePreviewRunRef.current += 1;"),
    page.indexOf("if (!open) blinkGeometryLinkOverrideRef.current = null;"),
  );
  assert.match(initialization, /setActiveControlTab\(initialTab\)/);
  assert.match(initialization, /\[identityControlsVisible, initialTab, open\]/);
  assert.doesNotMatch(initialization, /resolvedTheme/);
});

test("Studio tabs provide roving focus, keyboard travel, and a labelled panel", () => {
  const navigation = page.slice(
    page.indexOf('data-avatar-foundry-region="navigation"'),
    page.indexOf('data-avatar-foundry-region="inspector-scrollport"'),
  );
  for (const key of ["Home", "End", "ArrowRight", "ArrowLeft"]) {
    assert.ok(navigation.includes(`event.key === "${key}"`), key);
  }
  assert.match(navigation, /tabIndex=\{activeControlTab === tab.value \? 0 : -1\}/);
  assert.match(navigation, /aria-controls="avatar-studio-active-panel"/);
  assert.match(navigation, /role="tabpanel"/);
  assert.match(navigation, /aria-labelledby=\{`avatar-studio-tab-\$\{activeControlTab\}`\}/);
  assert.match(navigation, /requestControlTab\(nextTab.value\)/);
  assert.match(navigation, /\?\.focus\(\)/);
  assert.match(css, /\.botAvatarControlTabs button:focus-visible\s*\{\s*outline: 2px solid var\(--fg\)/);
});

test("compact preview fits its selected size without shrinking the renderer", () => {
  assert.match(page, /"--avatar-studio-scale-preview-size": `\$\{compactPreviewRenderSize\}px`/);
  assert.match(css, /width: max\(160px, var\(--avatar-studio-scale-preview-size, 122px\)\)/);
  assert.match(css, /height: max\(110px, var\(--avatar-studio-scale-preview-size, 122px\)\)/);
  assert.match(page, /renderSize=\{compactPreviewRenderSize\}/);
});

test("desktop Voice and audition regions do not compete for the same horizontal space", () => {
  assert.match(css, /width: min\(650px, calc\(44vw - 70px\)\)/);
  assert.match(css, /width: min\(920px, calc\(56vw - 36px\)\)/);
  for (const width of [1280, 1440, 1728, 1920]) {
    const voiceRight = width * 0.24 + Math.min(650, width * 0.44 - 70) / 2;
    const inspectorLeft = width - 22 - Math.min(920, width * 0.56 - 36);
    assert.ok(inspectorLeft - voiceRight >= 20 - 0.01, `${width}px has room between docks`);
  }
  assert.match(css, /@media \(min-width: 1280px\) and \(max-height: 950px\)/);
  assert.match(css, /translate3d\(-26vw, -4dvh, 0\) scale\(1.06\)/);
});

test("Accent map has theme-aware land contrast and its expanded list stays in flow", () => {
  assert.match(atlasCss, /aspect-ratio: 2 \/ 1/);
  assert.match(atlasCss, /var\(--fg-muted, #8e9bab\) 58%/);
  assert.match(atlasCss, /\.listFallback > div\s*\{\s*position: relative/);
  assert.match(atlasCss, /\.listFallback\[open\]\s*\{\s*flex-basis: 100%/);
  assert.match(read("./PronunciationAtlas.tsx"), /Continue to TTS/);
});

test("Avatar tutorial describes keyboard navigation and stable theme switching", () => {
  const tutorial = MODE_TUTORIALS.avatar.steps[1]!.body;
  assert.match(tutorial, /1 Accent, 2 TTS, 3 Premium/);
  assert.match(tutorial, /Left\/Right arrows and Home\/End/);
  assert.match(tutorial, /Switching Light\/Dark keeps your current section and draft/);
  assert.match(tutorial, /All accents expands inside the scrolling inspector/);
});
