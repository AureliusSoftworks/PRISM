import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const globalCss = readFileSync(join(appDir, "globals.css"), "utf8");
const hostSource = readFileSync(join(appDir, "PrismSceneHost.ts"), "utf8");
const webPackage = JSON.parse(
  readFileSync(join(appDir, "../../package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

describe("PRISM GPU scene foundation integration", () => {
  it("pins Pixi v8 and loads it only from the scene host's async initializer", () => {
    assert.equal(webPackage.dependencies?.["pixi.js"], "^8.19.0");
    assert.match(hostSource, /\(\) => import\("pixi\.js"\)/);
    assert.match(hostSource, /preference: \["webgl"\]/);
    assert.doesNotMatch(hostSource, /preference:\s*["']webgpu["']/);
    assert.doesNotMatch(pageSource, /from ["']pixi\.js["']/);
  });

  it("mounts the shared lifecycle and isolated Observe diagnostics card", () => {
    assert.match(pageSource, /<PrismVisualLifecycleBridge \/>/);
    assert.match(pageSource, /case "observe":[\s\S]*<PrismRenderingDiagnosticsCard \/>/);
    assert.match(
      pageSource,
      /subscribePrismVisualLifecycle\([\s\S]*lifecycle === "suspended"[\s\S]*hideCursor\(\)/,
    );
    assert.match(pageSource, /if \(next\.settled\) \{[\s\S]*animationFrameId = null/);
  });

  it("pauses only elements explicitly marked as decorative", () => {
    assert.match(
      globalCss,
      /html\[data-prism-visual-lifecycle="suspended"\][\s\S]*\[data-prism-decorative-motion="true"\][\s\S]*animation-play-state: paused !important/,
    );
    assert.ok(
      (pageSource.match(/data-prism-decorative-motion="true"/g) ?? []).length >=
        6,
    );
    assert.match(pageSource, /botFaceCrtNoiseLayer[\s\S]*data-prism-decorative-motion/);
    assert.match(pageSource, /coffeeSeatUnderglow[\s\S]*data-prism-decorative-motion/);
    assert.match(pageSource, /coffeeCupSteam[\s\S]*data-prism-decorative-motion/);
    assert.match(
      pageSource,
      /zenPersonaStartupAtmosphere[\s\S]*data-prism-decorative-motion/,
    );
  });
});
