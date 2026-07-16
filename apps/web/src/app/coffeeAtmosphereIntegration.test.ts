import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const sceneSource = readFileSync(
  join(appDir, "CoffeeAtmosphereScene.tsx"),
  "utf8",
);
const controllerSource = readFileSync(
  join(appDir, "CoffeeAtmosphereController.ts"),
  "utf8",
);

describe("Coffee atmosphere integration", () => {
  it("mounts first under the DOM table with no pointer or accessibility surface", () => {
    assert.match(
      pageSource,
      /<CoffeeAtmosphereScene[\s\S]*?<div className=\{styles\.coffeeTableGlow\}/,
    );
    assert.match(sceneSource, /data-coffee-atmosphere="true"/);
    assert.match(sceneSource, /aria-hidden="true"/);
    assert.match(
      css,
      /\.coffeeAtmosphereScene \{[\s\S]*z-index: 0;[\s\S]*pointer-events: none;/,
    );
    assert.match(css, /\.coffeeTableDisk \{[\s\S]*z-index: 1;/);
  });

  it("keeps the CSS glow until WebGL is ready and restores it on loss/failure", () => {
    assert.match(
      css,
      /\.coffeeAtmosphereScene\[data-renderer-status="webgl"\] \+ \.coffeeTableGlow \{[\s\S]*opacity: 0 !important;[\s\S]*visibility: hidden !important;/,
    );
    assert.match(sceneSource, /onContextLost: \(\) => updateRendererStatus\("context-lost"\)/);
    assert.match(sceneSource, /onFallback: \(\) => updateRendererStatus\("fallback"\)/);
    assert.match(sceneSource, /__PRISM_FORCE_WEBGL_FAILURE__/);
    assert.doesNotMatch(sceneSource, /role="alert"|aria-live/);
  });

  it("routes only semantic atmosphere inputs and normalized speaker color", () => {
    assert.match(
      sceneSource,
      /interface CoffeeAtmosphereSceneProps \{[\s\S]*phase:[\s\S]*theme:[\s\S]*seed:[\s\S]*activeSpeakerColor:[\s\S]*replayActive:/,
    );
    assert.doesNotMatch(
      sceneSource,
      /messageText|prompt|memor(?:y|ies)|credential|providerState/,
    );
    assert.match(
      pageSource,
      /activeTableSpeakerColor = activeTableSpeakerBotId[\s\S]*normalizeAccentForTheme\(/,
    );
    assert.match(
      pageSource,
      /seed=\{coffeeSessionVisualSeed\}[\s\S]*activeSpeakerColor=\{activeTableSpeakerColor\}/,
    );
  });

  it("uses cached additive textures without per-frame blur filters or network access", () => {
    assert.match(controllerSource, /this\.glowTexture = this\.createGlowTexture\(\)/);
    assert.match(controllerSource, /blendMode: "add"/);
    assert.match(controllerSource, /generateTexture\(/);
    assert.doesNotMatch(controllerSource, /BlurFilter|\.filters\s*=|fetch\(/);
    assert.doesNotMatch(sceneSource, /fetch\(/);
  });
});
