import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const coffeeSource = readFileSync(
  new URL("./CoffeeAtmosphereScene.tsx", import.meta.url),
  "utf8",
);
const hostSource = readFileSync(
  new URL("./PrismSceneHost.ts", import.meta.url),
  "utf8",
);
const globalCssSource = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const backupSource = readFileSync(
  new URL("../../../api/src/backup.ts", import.meta.url),
  "utf8",
);

describe("graphics quality integration", () => {
  it("connects the accessible selector to persisted settings", () => {
    assert.match(settingsPanelSource, /scope: "appearance"[\s\S]*title: "Appearance"/u);
    assert.match(pageSource, /data-graphics-quality-selector="true"/u);
    assert.match(pageSource, /name="graphicsQuality"/u);
    assert.match(pageSource, /\.\.\.settings,[\s\S]*\/api\/settings/u);
    assert.match(serverSource, /graphicsQuality: normalizeGraphicsQuality\(user\.graphics_quality\)/u);
    assert.match(serverSource, /graphics_quality = \?/u);
    assert.match(backupSource, /graphicsQuality: normalizeGraphicsQuality\(user\.graphics_quality\)/u);
    assert.match(backupSource, /graphics_quality = \?/u);
  });

  it("applies the persisted value to the document and Coffee scene ceiling", () => {
    assert.match(pageSource, /applyGraphicsQualityToDocument\(document, graphicsQuality\)/u);
    assert.match(pageSource, /const graphicsQuality = committedGraphicsQuality/u);
    assert.match(pageSource, /setCommittedGraphicsQuality\(savedGraphicsQuality\)/u);
    assert.match(pageSource, /<CoffeeAtmosphereScene[\s\S]*graphicsQuality=\{graphicsQuality\}/u);
    assert.match(coffeeSource, /qualityCeiling: prismSceneQualityCeilingForGraphicsQuality/u);
    assert.match(coffeeSource, /setQualityCeiling/u);
    assert.match(hostSource, /new PrismAdaptiveQualityController\([\s\S]*options\.qualityCeiling/u);
    assert.match(globalCssSource, /html\[data-prism-graphics-quality="low"\][\s\S]*animation: none !important/u);
  });
});
