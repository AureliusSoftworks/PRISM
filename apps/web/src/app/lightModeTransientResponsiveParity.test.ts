import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const globals = source("./globals.css");
const themeHook = source("./usePrismDocumentTheme.ts");
const warmup = source("./ModelWarmupIntermission.tsx");
const warmupCss = source("./model-warmup-intermission.module.css");
const firstRun = source("./PrismFirstRunLivingLayer.tsx");
const firstRunCss = source("./PrismFirstRunLivingLayer.module.css");
const intro = source("./PrismIntroSequence.tsx");
const introCss = source("./PrismIntroSequence.module.css");
const debate = source("./DebateExperience.tsx");
const mysteryCss = source("./debateMystery.module.css");

describe("Light-mode transient, responsive, and accessibility parity", () => {
  it("resolves portal themes before their first browser paint and follows changes", () => {
    assert.match(
      themeHook,
      /useState<PrismResolvedDocumentTheme>\(\(\) => currentPrismDocumentTheme\(\)\)/u,
    );
    assert.match(themeHook, /attributeFilter: \["data-prism-theme"\]/u);
    assert.match(themeHook, /media\.addEventListener\("change", updateTheme\)/u);
    assert.match(themeHook, /window\.addEventListener\("storage", updateTheme\)/u);

    for (const component of [warmup, firstRun, intro]) {
      assert.match(component, /usePrismDocumentTheme\(\)/u);
      assert.match(component, /data-theme=\{resolvedTheme\}/u);
      assert.match(component, /data-prism-document-theme-surface="true"/u);
    }
  });

  it("gives shared native controls explicit interaction and input states", () => {
    assert.match(globals, /:focus-visible[\s\S]*--prism-document-focus-ring/u);
    assert.match(globals, /\[aria-disabled="true"\][\s\S]*cursor: not-allowed/u);
    assert.match(globals, /\[aria-busy="true"\][\s\S]*cursor: progress/u);
    assert.match(globals, /input\[type="file"\]::file-selector-button/u);
    assert.match(globals, /input\[type="range"\][\s\S]*accent-color/u);
    assert.match(globals, /\[data-drag-over="true"\][\s\S]*--prism-document-drag-ring/u);
    assert.match(globals, /\[data-dragging="true"\][\s\S]*cursor: grabbing/u);
    assert.match(
      globals,
      /\[aria-modal="true"\]\)[\s\S]*:where\(textarea\)[\s\S]*max-block-size: max\(/u,
    );
    assert.match(globals, /@media \(forced-colors: active\)/u);
    assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/u);
  });

  it("authors warmup Light, failure, busy, keyboard, and short-height states", () => {
    assert.match(warmup, /role=\{failed \? "alert" : "status"\}/u);
    assert.match(warmup, /aria-busy=\{!failed && props\.phase !== "releasing"\}/u);
    assert.match(warmup, /element\.setAttribute\("inert", ""\)/u);
    assert.match(warmup, /root\.addEventListener\("keydown", trapTab\)/u);
    assert.match(warmup, /tabIndex=\{-1\}/u);
    assert.match(warmupCss, /\.overlay\[data-theme="light"\]/u);
    assert.match(warmupCss, /color-scheme: light/u);
    assert.match(warmupCss, /\.actions button:focus-visible/u);
    assert.match(warmupCss, /\.actions button:active:not\(:disabled\)/u);
    assert.match(warmupCss, /max-height: calc\(/u);
    assert.match(warmupCss, /@media \(max-height: 560px\)/u);
    assert.match(warmupCss, /@media \(forced-colors: active\)/u);
  });

  it("authors living first-run Light materials without replacing the orb scene", () => {
    assert.match(firstRun, /role="dialog"/u);
    assert.match(firstRun, /aria-modal="true"/u);
    assert.match(firstRun, /root\.addEventListener\("keydown", trapTab\)/u);
    assert.match(firstRunCss, /\.canvas\[data-theme="light"\]/u);
    assert.match(firstRunCss, /\.canvas\[data-theme="light"\] \.darkness/u);
    assert.match(firstRunCss, /\.canvas\[data-theme="light"\] \.choice/u);
    assert.match(firstRunCss, /:is\(\.primary, \.choice\):focus-visible/u);
    assert.match(firstRunCss, /@media \(max-height: 700px\) and \(min-width: 761px\)/u);
    assert.match(firstRunCss, /@media \(max-width: 760px\) and \(max-height: 700px\)/u);
    assert.match(firstRunCss, /env\(safe-area-inset-bottom\)/u);
    assert.match(
      firstRun,
      /className=\{styles\.choiceHeading\}[\s\S]{0,120}aria-live="polite"[\s\S]{0,80}aria-atomic="true"/u,
    );
    assert.match(firstRunCss, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(firstRunCss, /@media \(forced-colors: active\)/u);
    assert.doesNotMatch(firstRunCss, /\.canvas\[data-theme="light"\] \.orbGlass\s*\{/u);
  });

  it("keeps the intro cinematic art while theming its veil, copy, and controls", () => {
    assert.match(intro, /aria-busy=\{isTransitioning\}/u);
    assert.match(intro, /aria-live="polite" aria-atomic="true"/u);
    assert.match(introCss, /\.backdrop\[data-theme="light"\]/u);
    assert.match(introCss, /\.backdrop\[data-theme="light"\] \.imageScrim/u);
    assert.match(introCss, /\.backdrop\[data-theme="light"\] \.copyStage h1/u);
    assert.match(introCss, /\.backdrop\[data-theme="light"\] \.lightTarget/u);
    assert.match(introCss, /\.lightTarget:focus-visible/u);
    assert.match(introCss, /\.lightTarget:disabled/u);
    assert.match(introCss, /@media \(max-height: 660px\) and \(min-width: 761px\)/u);
    assert.match(introCss, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(introCss, /@media \(forced-colors: active\)/u);
    assert.match(
      introCss,
      /@media \(forced-colors: active\)[\s\S]*\.cursorLight\s*\{\s*display: none;/u,
    );
  });

  it("exposes a theme-native active state for portable package drops", () => {
    assert.match(
      debate,
      /data-drop-active=\{[\s\S]{0,120}portablePackageDropTarget === "mansion"/u,
    );
    assert.match(
      debate,
      /data-drop-active=\{[\s\S]{0,120}portablePackageDropTarget === "case"/u,
    );
    assert.match(debate, /onDragEnter=\{\(event\) =>/u);
    assert.match(debate, /onDragLeave=\{\(event\) =>/u);
    assert.match(
      mysteryCss,
      /\.mansionPackageWorkbench\[data-drop-active="true"\]/u,
    );
  });

  it("keeps the document viewport bounded while supporting safe areas and zoom", () => {
    assert.match(globals, /height: 100vh;\s*height: 100dvh;/u);
    assert.match(globals, /--prism-safe-top: env\(safe-area-inset-top, 0px\)/u);
    assert.match(globals, /--prism-type-root: 16px/u);
    assert.match(globals, /text-size-adjust: 100%/u);
    assert.match(globals, /html,\s*body \{[\s\S]*overflow-y: hidden/u);
  });
});
