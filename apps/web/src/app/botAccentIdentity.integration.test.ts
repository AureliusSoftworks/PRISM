import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const docsSource = readFileSync(
  new URL("../../../../docs/bot-color-system.md", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("bot Atmosphere accent UI and leakage guardrails", () => {
  it("offers a subordinate accessible Auto or explicit hue control", () => {
    assert.match(pageSource, /<legend>Atmosphere accent<\/legend>/u);
    assert.match(pageSource, /aria-pressed=\{accentColor === null\}/u);
    assert.match(pageSource, /aria-label="Atmosphere accent hue"/u);
    assert.match(pageSource, /type="range"[\s\S]{0,220}min=\{0\}[\s\S]{0,120}max=\{359\}/u);
    assert.match(
      pageSource,
      /className=\{styles\.botAtmosphereAccentControl\}[\s\S]{0,260}"--bot-accent-color": resolvedAccent/u,
    );
    assert.match(pageSource, /primaryColor=\{identitySection\.color\}/u);
    assert.match(pageSource, /identityControlsVisible=\{!editingDefaultBot\}/u);
  });

  it("preserves explicit-save and every supported creation path", () => {
    assert.match(pageSource, /accentColor: newBotAccentColor/u);
    assert.match(pageSource, /setNewBotAccentColor\(bot\.accentColor \?\? null\)/u);
    const cloneStart = pageSource.indexOf("async function cloneBot(bot: Bot)");
    const cloneEnd = pageSource.indexOf("async function duplicateCurrentBotDraft", cloneStart);
    assert.ok(cloneStart >= 0 && cloneEnd > cloneStart);
    assert.match(
      pageSource.slice(cloneStart, cloneEnd),
      /accentColor: bot\.accentColor \?\? null/u,
    );
    assert.match(pageSource, /accentColor: parsedBot\.accentColor \?\? null/u);
    assert.match(pageSource, /setNewBotAccentColor\(draft\.accentColor\)/u);
  });

  it("keeps persona color out of private presentation and replay bot snapshots", () => {
    assert.match(
      pageSource,
      /const selectedBotGradientActive = Boolean\([\s\S]{0,180}!appWidePrivateMode/u,
    );
    assert.match(pageSource, /if \(!bot\?\.color \|\| appWidePrivateMode\) return null/u);
    const replayStart = pageSource.indexOf("const coffeeReplayBotSnapshots");
    const replayEnd = pageSource.indexOf("return buildCoffeeReplayManifestV2", replayStart);
    assert.ok(replayStart >= 0 && replayEnd > replayStart);
    assert.doesNotMatch(
      pageSource.slice(replayStart, replayEnd),
      /accentColor:\s*bot\.accentColor/u,
    );
  });

  it("uses semantic tokens only for bot-specific atmosphere and its editor preview", () => {
    assert.match(cssSource, /@property --bot-primary-color/u);
    assert.match(cssSource, /@property --bot-accent-color/u);
    assert.match(
      cssSource,
      /\.zenAtmosphereBackdrop\[data-persona-color="true"\]::before[\s\S]*--bot-accent-color/u,
    );
    assert.match(cssSource, /\.botAtmosphereAccentPreview[\s\S]*--bot-primary-color[\s\S]*--bot-accent-color/u);
    assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.botAtmosphereAccentControl/u);
    assert.match(docsSource, /Accent must not recolor avatars/u);
    assert.match(docsSource, /suppresses persona color entirely/u);
    assert.match(
      tutorialSource,
      /subordinate Atmosphere accent[\s\S]*Accent Auto chooses a stable analogous environmental hue/u,
    );
  });

  it("replaces the former full-field monochromatic wash instead of stacking over it", () => {
    const wallpaperFieldStart = cssSource.indexOf(
      '.zenAtmosphereBackdrop[data-persona-color="true"]::before',
    );
    const wallpaperFieldEnd = cssSource.indexOf(
      '.themeLight .zenAtmosphereBackdrop[data-persona-color="true"]::before',
      wallpaperFieldStart,
    );
    const startupFieldStart = cssSource.indexOf(
      ".zenPersonaStartupAtmosphere::after",
    );
    const startupFieldEnd = cssSource.indexOf(
      ".themeLight .zenPersonaStartupAtmosphere::after",
      startupFieldStart,
    );
    const continuityFieldStart = cssSource.indexOf(
      ".zenPersonaContinuityWash {",
    );
    const continuityFieldEnd = cssSource.indexOf(
      '.appLayout[data-zen-surface="true"] .zenPersonaContinuityWash',
      continuityFieldStart,
    );

    for (const [start, end] of [
      [wallpaperFieldStart, wallpaperFieldEnd],
      [startupFieldStart, startupFieldEnd],
      [continuityFieldStart, continuityFieldEnd],
    ]) {
      assert.ok(start >= 0 && end > start);
      const field = cssSource.slice(start, end);
      assert.match(field, /--bot-primary-color/u);
      assert.match(field, /--bot-accent-color/u);
      assert.doesNotMatch(field, /linear-gradient\(/u);
    }

    assert.match(
      pageSource,
      /const zenPersonaFallbackAtmosphereVisible =[\s\S]{0,260}!selectedBotGradientActive/u,
    );
    assert.match(
      cssSource,
      /Live wallpaper already receives the semantic primary\/accent edge-light field[\s\S]{0,360}background: transparent;/u,
    );
  });
});
