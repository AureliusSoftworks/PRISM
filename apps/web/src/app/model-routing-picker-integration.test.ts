import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const turboFireWebp = readFileSync(
  new URL("../../public/ui/turbo-fire-loop.webp", import.meta.url),
);
const turboFireGif = readFileSync(
  new URL("../../public/ui/turbo-fire-loop.gif", import.meta.url),
);
const turboFireStillPng = readFileSync(
  new URL("../../public/ui/turbo-fire-still.png", import.meta.url),
);
const maxElectricWebp = readFileSync(
  new URL("../../public/ui/max-electric-loop.webp", import.meta.url),
);
const maxElectricGif = readFileSync(
  new URL("../../public/ui/max-electric-loop.gif", import.meta.url),
);
const maxElectricStillPng = readFileSync(
  new URL("../../public/ui/max-electric-still.png", import.meta.url),
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const reasoningEffortSource = readFileSync(
  new URL("../../../../packages/shared/src/reasoningEffort.ts", import.meta.url),
  "utf8",
);

function animatedWebpFrameDurations(source: Buffer): number[] {
  const durations: number[] = [];
  let offset = 12;
  while (offset + 8 <= source.length) {
    const chunkType = source.toString("ascii", offset, offset + 4);
    const chunkSize = source.readUInt32LE(offset + 4);
    if (chunkType === "ANMF" && chunkSize >= 16) {
      durations.push(source.readUIntLE(offset + 20, 3));
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return durations;
}

function animatedWebpCanvasSize(source: Buffer): [number, number] {
  let offset = 12;
  while (offset + 18 <= source.length) {
    const chunkType = source.toString("ascii", offset, offset + 4);
    const chunkSize = source.readUInt32LE(offset + 4);
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return [
        source.readUIntLE(offset + 12, 3) + 1,
        source.readUIntLE(offset + 15, 3) + 1,
      ];
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error("Turbo fire WebP is missing its VP8X canvas metadata");
}

function gifCanvasSize(source: Buffer): [number, number] {
  return [source.readUInt16LE(6), source.readUInt16LE(8)];
}

function pngCanvasSize(source: Buffer): [number, number] {
  return [source.readUInt32BE(16), source.readUInt32BE(20)];
}

function effortGlyphColors(level: string): string[] {
  const block = cssSource.match(
    new RegExp(
      `(?:^|\\n)\\.modelEffortIcon\\[data-effort-level="${level}"\\] \\{([^}]+)\\}`,
      "u",
    ),
  )?.[1];
  assert.ok(block, `missing ${level} effort color rule`);
  return [...new Set(block.match(/#[0-9a-f]{6}/giu) ?? [])];
}

function lightEffortGlyphColors(level: string): string[] {
  const selector = `.modelEffortIcon[data-effort-level="${level}"]`;
  const selectorIndex = cssSource.indexOf(
    selector,
    cssSource.indexOf("Light surfaces"),
  );
  assert.notEqual(
    selectorIndex,
    -1,
    `missing light ${level} effort color rule`,
  );
  const blockEnd = cssSource.indexOf("}", selectorIndex);
  const block = cssSource.slice(selectorIndex, blockEnd);
  return [...new Set(block.match(/#[0-9a-f]{6}/giu) ?? [])];
}

function backgroundColors(block: string): string[] {
  const background = block.match(/background:\s*([\s\S]*?);/u)?.[1] ?? "";
  return [...new Set(background.match(/#[0-9a-f]{6}/giu) ?? [])];
}

function cssRuleBlock(selector: string): string {
  const selectorIndex = cssSource.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `missing ${selector} rule`);
  const blockEnd = cssSource.indexOf("}", selectorIndex);
  assert.notEqual(blockEnd, -1, `unclosed ${selector} rule`);
  return cssSource.slice(selectorIndex, blockEnd + 1);
}

function effortSliderColors(level: string): string[] {
  const block = cssSource.match(
    new RegExp(
      `\\.composeModelEffortSliderFill\\[data-effort-level="${level}"\\] \\{([^}]+)\\}`,
      "u",
    ),
  )?.[1];
  assert.ok(block, `missing ${level} effort slider color rule`);
  return backgroundColors(block);
}

function lightEffortSliderColors(level: string): string[] {
  const selector = `.composeModelEffortSliderFill[data-effort-level="${level}"]`;
  const selectorIndex = cssSource.indexOf(
    selector,
    cssSource.indexOf("Light surfaces mirror the glyph spectrum"),
  );
  assert.notEqual(
    selectorIndex,
    -1,
    `missing light ${level} effort slider color rule`,
  );
  const blockEnd = cssSource.indexOf("}", selectorIndex);
  const block = cssSource.slice(selectorIndex, blockEnd);
  return backgroundColors(block);
}

describe("shared routing model picker integration", () => {
  it("keeps response routing binary and makes Auto a model choice", () => {
    assert.match(pageSource, /const autoSelected = normalizedValue === autoOptionValue/u);
    assert.match(pageSource, /\(\["local", "online"\] as const\)\.map/u);
    assert.doesNotMatch(pageSource, /\["local", "auto", "online"\]/u);
  });

  it("never renders or emits the legacy Disabled model sentinel", () => {
    assert.match(pageSource, /isDisabledModelChoice\(value\)[\s\S]{0,80}autoOptionValue/u);
    assert.match(pageSource, /if \(isDisabledModelChoice\(nextValue\)\) return/u);
    assert.doesNotMatch(pageSource, /showDisabledOption|disabledOptionLabel/u);
  });

  it("uses the upright triangle for Auto Turbo actions", () => {
    assert.match(pageSource, /function AutoEffortIcon/u);
    assert.match(
      pageSource,
      /function AutoEffortIcon\(\): React\.JSX\.Element \{[\s\S]{0,420}d="M9 2\.75 15\.25 14H2\.75L9 2\.75Z"/u,
    );
    assert.match(
      pageSource,
      /const effortInteractionDisabled =[\s\S]{0,100}autoSelected/u,
    );
    assert.match(
      pageSource,
      /const autoTurboButtonInteractive =[\s\S]{0,120}autoSelected[\s\S]{0,100}!interactionDisabled/u,
    );
    assert.match(
      pageSource,
      /const autoOnlineTurboToggleAvailable =[\s\S]{0,100}provider === "online"/u,
    );
    assert.match(
      pageSource,
      /const autoLocalTurboPreviewAvailable =[\s\S]{0,100}provider === "local"/u,
    );
    assert.match(
      pageSource,
      /const effortTriggerDisabled =[\s\S]{0,100}!effortDirectActionAvailable/u,
    );
    assert.match(pageSource, /Effort chosen automatically/u);
    assert.match(pageSource, /<AutoEffortIcon \/>/u);
    assert.match(
      pageSource,
      /data-auto-turbo-toggle=\{[\s\S]{0,80}autoOnlineTurboToggleAvailable/u,
    );
    assert.match(
      pageSource,
      /if \(autoLocalTurboPreviewAvailable\)[\s\S]{0,220}playSpatialUiSfx\("turbo-on"[\s\S]{0,180}setTurboSmokeBurstId/u,
    );
    assert.doesNotMatch(
      pageSource.match(
        /if \(autoLocalTurboPreviewAvailable\)[\s\S]*?\n\s*\}\n\s*if \(onlineTurboToggleAvailable\)/u,
      )?.[0] ?? "",
      /onTurboChange|persistGlobalModelSelection|TURBO_TOGGLE_QUICK_EVENT/u,
    );
    assert.match(
      pageSource,
      /new Event\(TURBO_TOGGLE_QUICK_EVENT, \{ bubbles: true \}\)/u,
    );
    assert.match(
      pageSource,
      /aria-pressed=\{[\s\S]{0,100}effortControl\.turboEnabled/u,
    );
    assert.match(
      pageSource,
      /toggleTurboFromEffortTrigger\(effortTrigger\)/u,
    );
    assert.match(
      tutorialSource,
      /In ONLINE Auto, clicking the upright Effort triangle invokes that same Turbo toggle/u,
    );
    assert.match(
      pageSource,
      /if \(!autoSelected\) \{[\s\S]{0,120}persistGlobalModelSelection\(/u,
    );
    assert.match(
      pageSource,
      /else \{[\s\S]{0,520}\[turboCandidate\.provider\]: AUTO_MODEL_CHOICE/u,
    );
  });

  it("shares the full mode-aware catalog with Chat, Coffee, Signal, and Debate", () => {
    assert.match(pageSource, /modeAwareModelOptions\(\{/u);
    assert.match(pageSource, /signalNavbarModelOptions/u);
    assert.match(pageSource, /debateNavbarResponseMode/u);
    assert.ok(
      (pageSource.match(/selectedProvider=\{/gu) ?? []).length >= 5,
      "expected the shared account, Chat, Coffee, Signal, and Debate pickers to tint from their selected provider",
    );
  });

  it("marks model rows by provider and gives each lane a distinct accent", () => {
    assert.match(pageSource, /data-model-provider=\{model\.provider\}/u);
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="local"\][\s\S]{0,120}var\(--provider-accent-local\)/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="openai"\][\s\S]{0,120}var\(--provider-accent-openai\)/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="anthropic"\][\s\S]{0,120}var\(--provider-accent-anthropic\)/u,
    );
    assert.match(cssSource, /--provider-accent-openai:\s*#57b9d9/u);
    assert.match(cssSource, /--provider-accent-anthropic:\s*#d97757/u);
    // Portaled menus sit on document.body — copy provider accents from the
    // themed trigger or the tinted rails wash out.
    assert.match(
      pageSource,
      /COMPOSE_MENU_PORTAL_THEME_VARS = \[[\s\S]*?"--provider-accent-openai"[\s\S]*?"--provider-accent-anthropic"[\s\S]*?"--provider-accent-local"/u,
    );
  });

  it("presents Auto as a premium spectrum choice with a triangle glyph", () => {
    assert.match(pageSource, /function AutoModelChoiceGlyph/u);
    assert.match(pageSource, /data-model-choice="auto"/u);
    assert.match(pageSource, /composeModelOptionAuto/u);
    assert.match(pageSource, /<AutoModelChoiceGlyph \/>/u);
    assert.match(
      pageSource,
      /AUTO_MODEL_SETTINGS_SUBTEXT = "Picks model & effort"/u,
    );
    assert.match(
      cssSource,
      /\.composeModelOptionAuto[\s\S]{0,500}--compose-model-auto-spectrum/u,
    );
    assert.match(
      cssSource,
      /compose-model-auto-spectrum:[\s\S]{0,220}provider-accent-local[\s\S]{0,120}provider-accent-openai[\s\S]{0,120}provider-accent-anthropic/u,
    );
    assert.match(cssSource, /\.composeModelOptionAutoGlyph/u);
  });

  it("persists effort per concrete model and exposes the split control everywhere", () => {
    assert.match(pageSource, /modelEffortPreferences/u);
    assert.match(pageSource, /\/api\/model-effort-preferences/u);
    assert.match(pageSource, /data-tutorial-target="model-effort"/u);
    assert.ok(
      (pageSource.match(/effortControl=\{/gu) ?? []).length >= 6,
      "expected the six visible picker placements to cover Chat/Zen, Sandbox, Coffee, Story, Debate, and Signal",
    );
  });

  it("offers applet-scoped Turbo with an organic effort-control flame", () => {
    assert.match(pageSource, /modelSupportsTurboMode/u);
    assert.match(pageSource, /\/api\/model-turbo-preferences/u);
    assert.match(pageSource, /Faster priority processing · premium rates/u);
    assert.match(
      pageSource,
      /const turboVisuallyActive =\s*effortControl\?\.turboEnabled === true &&\s*\(!autoSelected \|\| autoOnlineTurboToggleAvailable\)/u,
    );
    assert.ok(
      (pageSource.match(/data-turbo=\{turboVisuallyActive/gu) ?? []).length >= 3,
      "expected Turbo state on the combined picker, effort wrapper, and effort trigger",
    );
    assert.match(
      cssSource,
      /composeModelControl\[data-turbo="true"\]::after\s*\{[^}]*pointer-events:\s*none[^}]*animation:\s*turboPickerEmberPulse 1840ms/u,
    );
    assert.match(cssSource, /@keyframes turboPickerEmberPulse/u);
    assert.match(
      cssSource,
      /@keyframes turboPickerEmberPulse\s*\{[\s\S]*?36%\s*\{[\s\S]*?68%\s*\{/u,
    );
    assert.match(cssSource, /composeModelEffortTriggerWrap\[data-turbo="true"\]::before/u);
    assert.match(
      pageSource,
      /data-turbo-capable=\{[\s\S]{0,100}effortControl\.turboSupported/u,
    );
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo-capable="true"\]::after/u,
    );
    assert.match(cssSource, /turbo-fire-loop\.webp/u);
    assert.match(cssSource, /turbo-fire-loop\.gif/u);
    assert.match(cssSource, /turbo-fire-still\.png/u);
    assert.match(cssSource, /background-image:\s*image-set/u);
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo-capable="true"\]::after\s*\{[^}]*image-rendering:\s*auto[^}]*opacity:\s*0/u,
    );
    assert.match(cssSource, /inset:\s*-20px -7px -5px -6px/u);
    assert.match(cssSource, /background-size:\s*100% 89%/u);
    assert.match(cssSource, /background-position:\s*left bottom/u);
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo-capable="true"\]::after\s*\{[^}]*transform:\s*translate3d\(0, -2px, 0\)/u,
    );
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo-capable="true"\]::after\s*\{[^}]*z-index:\s*3/u,
    );
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo="true"\]::after\s*\{[^}]*opacity:\s*1/u,
    );
    assert.match(cssSource, /@keyframes turboSmolderGlow/u);
    assert.match(cssSource, /@keyframes turboEffortHeatPulse/u);
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo="true"\][\s\S]{0,120}\.composeModelEffortTrigger\s*\{[^}]*animation:\s*turboEffortHeatPulse 1840ms/u,
    );
    assert.match(cssSource, /@keyframes turboSmolderGlowLight/u);
    assert.match(cssSource, /@keyframes turboPickerEmberPulseLight/u);
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo-capable="true"\]::after\s*\{[^}]*mix-blend-mode:\s*screen/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelEffortTriggerWrap\[data-turbo="true"\]::after\s*\{[^}]*invert\(1\)[^}]*mix-blend-mode:\s*multiply[^}]*opacity:\s*0\.86/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelControl\[data-turbo="true"\]::after\s*\{[^}]*#38bdf8/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelTurboBurnAtmosphere::before\s*\{[^}]*hue-rotate\(180deg\)/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelTurboBurnAtmosphere > span\s*\{[^}]*hue-rotate\(180deg\)/u,
    );
    assert.match(cssSource, /@keyframes turboEffortHeatPulseLightBlue/u);
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelEffortTriggerWrap\[data-turbo="true"\][\s\S]{0,100}\.composeModelEffortTrigger\s*\{[^}]*animation-name:\s*turboEffortHeatPulseLightBlue/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelEffortTriggerWrap\[data-turbo="true"\][\s\S]{0,100}\.composeModelEffortTrigger\s*\{[^}]*background:\s*linear-gradient\(/u,
    );
    assert.doesNotMatch(cssSource, /background:\s*linear-gradient\(180deg, #3a2118/u);
    assert.match(
      cssSource,
      /\.botGroupDashboard\s*\{[\s\S]{0,1800}transform:\s*translateZ\(0\)/u,
    );
    assert.match(cssSource, /@keyframes turboSmokePuff/u);
    assert.match(pageSource, /composeModelTurboSmokeBurst/u);
    assert.match(pageSource, /composeModelTurboBurnAtmosphere/u);
    assert.match(cssSource, /@keyframes turboAmbientRedFlicker/u);
    assert.match(cssSource, /@keyframes turboCinderFall/u);
    assert.doesNotMatch(cssSource, /turbo-cinder-rise/u);
    assert.match(cssSource, /ellipse at 34% 58%/u);
    assert.match(cssSource, /--turbo-cinder-fall:\s*48px/u);
    assert.match(cssSource, /width:\s*3\.5px;\s*height:\s*5px/u);
    assert.match(
      cssSource,
      /composeModelTurboBurnAtmosphere::before\s*\{[^}]*mix-blend-mode:\s*screen[^}]*animation:\s*turboAmbientRedFlicker 2630ms/u,
    );
    assert.match(
      cssSource,
      /composeModelTurboBurnAtmosphere > span\s*\{[^}]*z-index|composeModelTurboBurnAtmosphere\s*\{[^}]*z-index:\s*1/u,
    );
    assert.match(
      pageSource,
      /const previouslyActive = previousTurboVisuallyActiveRef\.current;[\s\S]{0,260}if \(!previouslyActive \|\| turboVisuallyActive\) return;[\s\S]{0,180}setTurboSmokeBurstId/u,
    );
    assert.doesNotMatch(
      pageSource,
      /const nextTurboEnabled = !effortControl\.turboEnabled;[\s\S]{0,180}setTurboSmokeBurstId/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?data-turbo="true"\]::before\s*\{[^}]*animation:\s*none/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?composeModelControl\[data-turbo="true"\]::after\s*\{[^}]*animation:\s*none/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?composeModelEffortTriggerWrap\[data-turbo="true"\][\s\S]{0,100}\.composeModelEffortTrigger\s*\{[^}]*animation:\s*none/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?composeModelTurboSmokeBurst\s*\{[^}]*display:\s*none/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?composeModelTurboBurnAtmosphere > span\s*\{[^}]*display:\s*none/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?composeModelTurboBurnAtmosphere::before\s*\{[^}]*animation:\s*none/u,
    );
    const turboFireWebpSize = statSync(
      new URL("../../public/ui/turbo-fire-loop.webp", import.meta.url),
    ).size;
    assert.ok(turboFireWebpSize > 100_000 && turboFireWebpSize < 650_000);
    assert.deepEqual(animatedWebpCanvasSize(turboFireWebp), [200, 140]);
    const turboFireFrameDurations = animatedWebpFrameDurations(turboFireWebp);
    assert.equal(turboFireFrameDurations.length, 80);
    assert.ok(
      turboFireFrameDurations.every((duration) => duration === 16),
      "expected the primary Turbo fire loop to run at 62.5 fps",
    );
    assert.ok(
      statSync(
        new URL("../../public/ui/turbo-fire-loop.gif", import.meta.url),
      ).size > 50_000,
    );
    assert.deepEqual(gifCanvasSize(turboFireGif), [200, 140]);
    assert.deepEqual(pngCanvasSize(turboFireStillPng), [200, 140]);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
    assert.match(pageSource, /resetAllModelTurboPreferences/u);
    assert.match(pageSource, /disableTurboForSafetyTransitionRef/u);
    assert.match(pageSource, /syncTurboAppletSessionContext/u);
    assert.match(pageSource, /turboAppletContextRef/u);
    assert.match(
      signalSource,
      /episode\?\.id \?\? \(watchBakeActive \? "baking" : null\)/u,
    );
    assert.match(
      debateSource,
      /activeSession\?\.id \?\? \(view === "baking" \? "baking" : null\)/u,
    );
    assert.match(
      pageSource,
      /"\/api\/model-turbo-preferences", \{ method: "DELETE" \}/u,
    );
    assert.match(
      tutorialSource,
      /Turbo remains active across screens and browser refreshes while you stay in the current applet[\s\S]{0,220}consciously re-enabled/u,
    );
  });

  it("wraps Max around the full picker while preserving additive Turbo", () => {
    assert.match(pageSource, /data-max-effort=\{maxEffortActive \? "true"/u);
    assert.match(
      pageSource,
      /maxEffortActive \? \([\s\S]{0,180}composeModelMaxElectricity/u,
    );
    assert.match(pageSource, /data-turbo=\{turboVisuallyActive \? "true"/u);
    assert.match(cssSource, /max-electric-loop\.webp/u);
    assert.match(cssSource, /max-electric-loop\.gif/u);
    assert.match(cssSource, /max-electric-still\.png/u);
    assert.match(
      cssSource,
      /\.composeModelMaxElectricity\s*\{[^}]*pointer-events:\s*none[^}]*z-index:\s*5[^}]*image-rendering:\s*auto/u,
    );
    assert.match(
      cssSource,
      /\.composeModelMaxElectricity\s*\{[^}]*background-size:\s*calc\(100% \+ 20px\) calc\(100% \+ 8px\)/u,
    );
    assert.doesNotMatch(
      cssSource,
      /\.composeModelMaxElectricity\s*\{[^}]*drop-shadow/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,120}\.composeModelMaxElectricity\s*\{[^}]*mix-blend-mode:\s*multiply/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]*?\.composeModelMaxElectricity\s*\{[^}]*max-electric-still\.png/u,
    );
    assert.deepEqual(animatedWebpCanvasSize(maxElectricWebp), [1024, 96]);
    const maxElectricFrameDurations =
      animatedWebpFrameDurations(maxElectricWebp);
    assert.equal(maxElectricFrameDurations.length, 8);
    assert.ok(
      maxElectricFrameDurations.every((duration) => duration === 80),
      "expected the Zeus loop to run at 12.5 fps",
    );
    assert.deepEqual(gifCanvasSize(maxElectricGif), [1024, 96]);
    assert.deepEqual(pngCanvasSize(maxElectricStillPng), [1024, 96]);
    assert.ok(
      statSync(
        new URL("../../public/ui/max-electric-loop.webp", import.meta.url),
      ).size < 300_000,
    );
  });

  it("switches the complete Turbo burn palette with the body theme", () => {
    assert.match(
      pageSource,
      /document\.body\.dataset\.prismTheme = resolvedTheme;[\s\S]{0,180}\}, \[resolvedTheme\]\);/u,
    );
    assert.match(
      pageSource,
      /key=\{renderTheme\}[\s\S]{0,120}data-render-theme=\{renderTheme\}/u,
      "theme changes should remount the filtered animated flame layer",
    );
    assert.equal(
      pageSource.match(/renderTheme=\{resolvedTheme\}/gu)?.length,
      6,
      "every text-model picker with an Effort control should receive the active theme",
    );
    assert.match(
      cssSource,
      /composeModelEffortTriggerWrap\[data-turbo-capable="true"\]::after\s*\{[^}]*#ff6200[^}]*mix-blend-mode:\s*screen/u,
      "dark mode should retain the original warm flame treatment",
    );
    assert.match(
      cssSource,
      /composeModelControl\[data-turbo="true"\]::after\s*\{[^}]*#ffad42/u,
      "dark mode should retain its warm outer pulse",
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelEffortTriggerWrap\[data-turbo="true"\]::after\s*\{[^}]*invert\(1\)[^}]*#38bdf8/u,
      "light mode should own the white-blending blue flame override",
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelControl\[data-turbo="true"\]\s*\{[^}]*border-color:[^}]*#0284c7[^}]*box-shadow:/u,
      "light mode should give the complete Turbo picker a stronger blue perimeter",
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelControl\[data-turbo="true"\]::after\s*\{[^}]*#38bdf8/u,
      "light mode should own the blue outer pulse override",
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,180}composeModelEffortTriggerWrap\[data-turbo="true"\][\s\S]{0,100}\.composeModelEffortTrigger\s*\{[^}]*animation-name:\s*turboEffortHeatPulseLightBlue/u,
      "light mode should own the blue heat animation override",
    );
  });

  it("keeps model and effort global across applets", () => {
    assert.match(pageSource, /globalModelChoiceByProvider/u);
    assert.match(pageSource, /persistGlobalModelSelection/u);
    assert.match(pageSource, /preferredLocalModel,\s*preferredOnlineModel/u);
    assert.match(pageSource, /modelChoice=\{[\s\S]{0,140}signalGlobalModelChoice/u);
    assert.match(signalSource, /modelChoice\?: string/u);
    assert.match(signalSource, /onModelChoiceChange\?: \(value: string\) => void/u);
    assert.match(
      signalSource,
      /const episodeModelDraft = modelChoice \?\? internalEpisodeModelDraft/u,
    );
    assert.doesNotMatch(pageSource, /conversationModelScopeKey/u);
    assert.doesNotMatch(pageSource, /coffeeModelScopeKey/u);
    assert.match(
      tutorialSource,
      /Model and Effort are global across applets/u,
    );
  });

  it("explains simulated Effort and the deep experimental ladder", () => {
    assert.match(pageSource, /data-glyph-tooltip=\{effortMenuOpen \? undefined : effortTriggerTooltip\}/u);
    assert.match(
      reasoningEffortSource,
      /simulated Effort/iu,
    );
    assert.ok(
      (pageSource.match(/Deep LOCAL simulated thinking \(experimental\)/gu) ?? [])
        .length >= 2,
      "expected both Settings presentations to describe deep simulated thinking",
    );
    assert.match(pageSource, /heavier private workshop/u);
    assert.match(pageSource, /onSimulatedEffortEducate/u);
    assert.match(pageSource, /simulated thinking/u);
    assert.match(pageSource, /configured Ollama provider/u);
  });

  it("keeps None for simulated models and shifts Ollama thinking to Default", () => {
    assert.match(
      pageSource,
      /modelEffortValueForCapability\(capability, stored\)/u,
    );
    assert.match(
      pageSource,
      /capability\.mode === "simulated"[\s\S]{0,80}\? "none"[\s\S]{0,120}capability\.mode === "native-thinking"[\s\S]{0,80}\? "default"/u,
    );
    assert.match(
      pageSource,
      /capability\.mode === "native-thinking"[\s\S]{0,180}"Native thinking · None available"[\s\S]{0,100}"Native thinking · required by model"/u,
    );
    assert.match(
      tutorialSource,
      /Models without a built-in thinking dial always get Prism/u,
    );
    assert.match(
      tutorialSource,
      /Models that can disable native thinking also show None with the hollow circle; required-thinking families such as GPT-OSS, Kimi K2\.7 Code, and Nemotron 3 Super omit None/u,
    );
  });

  it("passes Ollama Cloud catalog thinking metadata into the shared effort capability", () => {
    assert.match(
      pageSource,
      /provider: args\.provider,[\s\S]{0,220}ollamaNativeThinking: catalogEntry\?\.thinking === true/u,
    );
    assert.match(
      pageSource,
      /provider: model\.provider,[\s\S]{0,220}ollamaNativeThinking: model\.thinking === true/u,
    );
    assert.match(
      reasoningEffortSource,
      /args\.provider === "local" \|\| args\.provider === "ollama_cloud"/u,
    );
  });

  it("uses the supplied effort symbols in a wheel, pointer, and keyboard slider", () => {
    assert.match(pageSource, /MODEL_EFFORT_ICON_PATHS/u);
    assert.match(
      pageSource,
      /<ModelEffortIcon[\s\S]{0,100}level=\{effortControl\.value\}/u,
    );
    assert.match(pageSource, /onWheel=\{handleEffortWheel\}/u);
    assert.match(
      pageSource,
      /type="range"[\s\S]{0,400}aria-valuetext=\{displayedEffortLabel\}/u,
    );
    assert.match(cssSource, /mask: var\(--model-effort-icon\)/u);
    assert.match(cssSource, /data-reasoning-mode="simulated"/u);
    assert.match(cssSource, /-webkit-mask-composite: xor/u);
    assert.match(
      cssSource,
      /data-effort-level="xhigh"[\s\S]{0,180}linear-gradient/u,
    );
    assert.match(cssSource, /writing-mode: vertical-lr/u);
    assert.doesNotMatch(pageSource, /composeModelEffortHint/u);
  });

  it("opens Effort for every fixed model and reserves click-to-Turbo for Auto", () => {
    assert.doesNotMatch(pageSource, /fixedOnlineTurboToggleAvailable/u);
    assert.match(
      pageSource,
      /const onlineTurboToggleAvailable = autoOnlineTurboToggleAvailable/u,
    );
    assert.match(
      pageSource,
      /effortControl\.capability\.mode === "simulated"/u,
    );
  });

  it("steps navbar Model choices while leaving full picker lists scrollable", () => {
    assert.match(pageSource, /const handleModelWheel =/u);
    assert.match(
      pageSource,
      /const handleModelWheel =[^]*?if \(\s*!navbarPicker \|\|/u,
    );
    assert.match(pageSource, /modelPickerWheelDirection\(event\.deltaX, event\.deltaY\)/u);
    assert.match(pageSource, /modelPickerStepValue\([\s\S]{0,120}selectableModelValues/u);
    assert.match(
      pageSource,
      /const currentValue = activeHighlightedModelValue;[\s\S]{0,400}setHighlightedModelValue\(nextValue\)/u,
    );
    assert.match(
      pageSource,
      /const handleModelWheel =[\s\S]{0,1400}setHighlightedModelValue\(nextValue\)[\s\S]{0,240}onChange\(nextValue\)/u,
    );
    assert.match(pageSource, /onWheel=\{handleModelWheel\}/u);
    assert.match(
      pageSource,
      /if \(navbarPicker\) \{\s*document\.addEventListener\("wheel", handleQuickWheel/u,
    );
  });

  it("gives navbar picker wheels tactile feedback only when selection changes", () => {
    assert.doesNotMatch(pageSource, /playNavbarPickerBoundarySfx|picker-boundary/u);
    assert.match(
      pageSource,
      /const handleModelWheel =[\s\S]{0,1500}if \(!nextValue \|\| nextValue === currentValue\) return;[\s\S]{0,500}playSpatialUiSfx\("bot-hover"/u,
    );
    assert.match(
      pageSource,
      /const handleEffortWheel =[\s\S]{0,1300}if \(nextValue === effortControl\.value\) return;[\s\S]{0,300}setEffortValue\(nextValue\)/u,
    );
    assert.match(
      pageSource,
      /pickerOpenState\.interactionMode === "keyboard"[\s\S]{0,240}playSpatialUiSfx\("effort-tick"[\s\S]{0,180}setHighlightedEffortValue\(nextValue\)/u,
    );
    assert.match(
      pageSource,
      /commitHotkeyEffortSelection[\s\S]{0,280}setEffortValue\(activeHighlightedEffortValue, \{ playTick: false \}\)/u,
    );
    assert.match(
      pageSource,
      /const setEffortValue =[\s\S]{0,800}nextValue !== effortControl\.value[\s\S]{0,260}playSpatialUiSfx\("effort-tick"/u,
    );
    assert.match(
      pageSource,
      /type="range"[\s\S]{0,700}setEffortValue\(nextValue\)/u,
    );
    assert.match(
      pageSource,
      /const handleSpeechTypeWheel =[\s\S]{0,1600}if \(!nextChoice \|\| nextChoice === currentChoice\) return;[\s\S]{0,700}playSpatialUiSfx\("bot-hover"/u,
    );
  });

  it("spins the selected Zen and Chat effort glyphs only during active generation", () => {
    assert.match(pageSource, /generating\?: boolean/u);
    assert.match(
      pageSource,
      /data-generating=\{generating \? "true" : undefined\}/u,
    );
    assert.ok(
      (pageSource.match(
        /generating=\{pendingReplyVisible \|\| sandboxSummaryBusy\}/gu,
      ) ?? []).length >= 1,
    );
    assert.match(
      pageSource,
      /generating=\{coffeeTurnRhythmState === "botThinking"\}/u,
    );
    assert.match(pageSource, /isPendingReplyVisible\(/u);
    assert.match(
      pageSource,
      /setPendingReplyConversationId\(\s*\(current\) => current \?\? event\.conversationId/u,
    );
    assert.match(
      cssSource,
      /composeModelEffortTrigger\[data-generating="true"\][\s\S]{0,200}animation: modelEffortThinkingSpin 1\.2s linear infinite/u,
    );
    assert.match(cssSource, /@keyframes modelEffortThinkingSpin/u);
    assert.match(
      cssSource,
      /@keyframes modelEffortThinkingSpin[\s\S]{0,120}transform: rotate\(360deg\)/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]{0,180}composeModelEffortTrigger\[data-generating="true"\][\s\S]{0,100}animation: none/u,
    );
  });

  it("uses Tab to close navbar pickers and return to the composer", () => {
    assert.match(
      pageSource,
      /if \(event\.key === "Tab" && !event\.shiftKey\)[\s\S]{0,360}commitHotkeyModelSelectionToComposer\(\)[\s\S]{0,500}document\.addEventListener\("keydown", handler, true\)/u,
    );
    assert.match(
      pageSource,
      /if \(event\.key === "Tab" && !event\.shiftKey\)[\s\S]{0,360}commitHotkeyEffortSelection\(\)[\s\S]{0,500}document\.addEventListener\("keydown", handler, true\)/u,
    );
    assert.match(
      pageSource,
      /const handleVoicePickerTab[\s\S]{0,420}commitHotkeyVoiceSelectionToComposer\(\)[\s\S]{0,500}document\.addEventListener\("keydown", handleVoicePickerTab, true\)/u,
    );
    assert.match(pageSource, /event\.key !== "Tab" \|\| event\.shiftKey/u);
    assert.match(
      pageSource,
      /const closeVoicePickerToComposer[\s\S]{0,240}window\.requestAnimationFrame\(focusVisibleComposer\)/u,
    );
    assert.match(
      tutorialSource,
      /Tab then closes the picker and places the cursor in the nearest visible composer/u,
    );
  });

  it("keeps pointer-opened pickers focusable until Tab returns to composing", () => {
    assert.match(
      pageSource,
      /className=\{styles\.composeModelTrigger\}[\s\S]{0,220}onClick=\{\(event\) => \{[\s\S]{0,100}event\.currentTarget\.focus\(\)/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.composeModelEffortTrigger\}[\s\S]{0,1200}onClick=\{\(event\) => \{[\s\S]{0,100}event\.currentTarget\.focus\(\)/u,
    );
    assert.doesNotMatch(pageSource, /commitHighlightedModelToEffort/u);
    assert.match(
      tutorialSource,
      /Tab then closes the picker and places the cursor in the nearest visible composer/u,
    );
  });

  it("moves pending model and effort choices with Up and Down only", () => {
    const arrowHandler =
      pageSource.match(
        /const handleQuickArrows = \(event: KeyboardEvent\): void => \{[\s\S]*?\n    \};/u,
      )?.[0] ?? "";
    assert.match(
      arrowHandler,
      /event\.key !== "ArrowDown" && event\.key !== "ArrowUp"/u,
    );
    assert.doesNotMatch(arrowHandler, /ArrowLeft|ArrowRight/u);
    assert.match(
      arrowHandler,
      /interactionMode !== "keyboard"[\s\S]*interactionMode: "keyboard"/u,
    );
    assert.match(
      arrowHandler,
      /const direction = event\.key === "ArrowDown" \? 1 : -1/u,
    );
    assert.match(arrowHandler, /moveModelHighlight\(direction\)/u);
    assert.match(arrowHandler, /moveEffortHighlight\(direction\)/u);
    assert.doesNotMatch(arrowHandler, /setEffortValue/u);
    assert.match(
      pageSource,
      /document\.addEventListener\("keydown", handleQuickArrows, true\)/u,
    );
    assert.doesNotMatch(
      pageSource,
      /if \(!navbarPicker\) \{\s*document\.addEventListener\("keydown", handleQuickArrows/u,
    );
  });

  it("adds exactly one spectrum color at each effort increase", () => {
    assert.deepEqual(effortGlyphColors("auto"), effortGlyphColors("none"));
    assert.equal(effortGlyphColors("minimal").length, 1);
    assert.notDeepEqual(
      effortGlyphColors("minimal"),
      effortGlyphColors("auto"),
    );
    assert.equal(effortGlyphColors("low").length, 2);
    assert.equal(effortGlyphColors("medium").length, 3);
    assert.equal(effortGlyphColors("high").length, 4);
    assert.equal(effortGlyphColors("xhigh").length, 5);
  });

  it("uses a darker light-mode palette without changing the spectrum counts", () => {
    assert.deepEqual(
      lightEffortGlyphColors("auto"),
      lightEffortGlyphColors("none"),
    );
    assert.deepEqual(lightEffortGlyphColors("minimal"), ["#2874b2"]);
    assert.equal(lightEffortGlyphColors("low").length, 2);
    assert.equal(lightEffortGlyphColors("medium").length, 3);
    assert.equal(lightEffortGlyphColors("high").length, 4);
    assert.deepEqual(lightEffortGlyphColors("xhigh"), [
      "#168461",
      "#2874b2",
      "#6650c7",
      "#ad3c84",
      "#c35432",
    ]);
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,140}composeModelEffortSliderFill/u,
    );
  });

  it("matches the slider line spectrum to the selected effort glyph", () => {
    assert.match(
      pageSource,
      /composeModelEffortSliderFill[\s\S]{0,120}data-effort-level=\{displayedEffortValue/u,
    );
    for (const level of [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]) {
      assert.deepEqual(effortSliderColors(level), effortGlyphColors(level));
      assert.deepEqual(
        lightEffortSliderColors(level),
        lightEffortGlyphColors(level),
      );
    }
  });

  it("uses a thinner effort rail with saturation tied to the selected level", () => {
    const railRule = cssRuleBlock(".composeModelEffortSliderRail {");
    assert.match(railRule, /width:\s*2px/u);
    assert.match(
      railRule,
      /filter:\s*saturate\(var\(--model-effort-saturation\)\)/u,
    );

    const fillRule = cssRuleBlock(".composeModelEffortSliderFill {");
    assert.match(
      fillRule,
      /filter:\s*saturate\(var\(--model-effort-saturation\)\)/u,
    );

    const tickRule = cssRuleBlock(".composeModelEffortSliderTick {");
    assert.match(
      tickRule,
      /filter:\s*saturate\(var\(--model-effort-saturation\)\)/u,
    );

    const thumbRule = cssRuleBlock(".composeModelEffortSliderThumb {");
    assert.match(
      thumbRule,
      /filter:\s*saturate\(var\(--model-effort-saturation\)\)/u,
    );

    const hudRailRule = cssRuleBlock(".modelEffortHudRail {");
    assert.match(
      hudRailRule,
      /filter:\s*saturate\(var\(--model-effort-saturation\)\)/u,
    );
    assert.match(
      pageSource,
      /"--model-effort-saturation":\s*`\$\{displayedEffortSliderProgress\}%`/u,
    );
    assert.match(
      pageSource,
      /"--model-effort-saturation":\s*`\$\{hudEffortSaturation\}%`/u,
    );
  });

  it("shows each saved effort glyph while reserving color for the selected model", () => {
    assert.match(pageSource, /rowValueForModel: \(model\) =>/u);
    assert.match(
      pageSource,
      /const rowEffort = effortControl\?\.rowValueForModel\(model\)/u,
    );
    assert.match(
      pageSource,
      /<ModelEffortIcon[\s\S]{0,120}level=\{rowEffort\}/u,
    );
    assert.doesNotMatch(
      pageSource,
      /<ModelEffortIcon[\s\S]{0,180}level=\{rowEffort\}[\s\S]{0,180}autoGlyph=/u,
    );
    assert.match(
      pageSource,
      /isSelected[\s\S]{0,120}composeModelRowEffortIconMonochrome/u,
    );
    assert.match(
      pageSource,
      /composeModelOptionMain[\s\S]{0,700}composeModelOptionStatus[\s\S]{0,500}composeModelRowEffort/u,
    );
    assert.doesNotMatch(pageSource, /composeModelDefaultBadge/u);
    assert.doesNotMatch(cssSource, /\.composeModelDefaultBadge\b/u);
    assert.match(
      cssSource,
      /\.composeModelOptionStatus\s*\{[^}]*display:\s*inline-flex;[^}]*flex:\s*0 0 auto;[^}]*align-items:\s*center/u,
    );
    assert.match(
      cssSource,
      /\.modelEffortIcon\.composeModelRowEffortIconMonochrome\s*\{[^}]*background:\s*#ffffff;[^}]*filter:\s*none/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,160}\.modelEffortIcon\.composeModelRowEffortIconMonochrome\s*\{[^}]*background:\s*#000000;[^}]*filter:\s*none/u,
    );
  });

  it("offers the global effort HUD and its capability-aware baseline shortcut", () => {
    assert.match(pageSource, /modelEffortHudTarget/u);
    assert.match(
      pageSource,
      /keyboardShortcutMatchesEvent\(keyboardShortcuts\.effortHud, event\)/u,
    );
    assert.match(
      pageSource,
      /key === "d"[\s\S]{0,300}modelEffortBaseline\(modelEffortHudTarget\.capability\)/u,
    );
    assert.match(cssSource, /\.modelEffortHud\b/u);
  });

  it("teaches the global profile without adding a first-run choice", () => {
    assert.match(tutorialSource, /saves Effort per concrete model/u);
    assert.match(
      tutorialSource,
      /model row shows its saved effort glyph on the right/u,
    );
    assert.match(tutorialSource, /selected model receives the spectrum color/u);
    assert.match(tutorialSource, /vertical slider/u);
    assert.match(tutorialSource, /selected effort glyph rotates in place/u);
    assert.match(tutorialSource, /one through five PRISM colors/u);
    assert.match(tutorialSource, /Deep simulated thinking/u);
    assert.match(tutorialSource, /short toast/u);
    assert.match(tutorialSource, /additional request to the selected provider/u);
    assert.match(tutorialSource, /Cmd\/Ctrl\+Shift\+E/u);
    assert.match(tutorialSource, /Control\+Left opens Model/u);
    assert.match(tutorialSource, /Shift\+Tab flips LOCAL\/ONLINE/u);
    assert.match(
      tutorialSource,
      /Up\/Down moves the pending option whether it was opened by hotkey or click/u,
    );
    assert.match(tutorialSource, /Left\/Right remain available/u);
    assert.match(
      tutorialSource,
      /Tab then closes the picker and places the cursor in the nearest visible composer/u,
    );
    assert.match(tutorialSource, /Settings → Shortcuts/u);
    assert.match(tutorialSource, /prepared work is discarded/u);
  });
});
