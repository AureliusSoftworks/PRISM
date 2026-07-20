import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CONTINUITY_FRAMEWORK,
  continuityFrameworkVersionLabel,
} from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const slateHemisphereSettingsSource = readFileSync(
  new URL("./SlateHemisphereSettingsPanel.tsx", import.meta.url),
  "utf8",
);
const firstRunSource = readFileSync(
  new URL("./firstRunOnboarding.ts", import.meta.url),
  "utf8",
);
const tutorialsSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("Slate is a first-class Settings mode with visible Continuity version", () => {
  assert.match(settingsPanelSource, /\| "slate"/u);
  assert.match(
    settingsPanelSource,
    /scope: "slate", title: "Slate", icon: <BookOpen/u,
  );
  assert.match(pageSource, /activeSettingsScope === "slate"/u);
  assert.match(pageSource, /data-settings-section="slate"/u);
  assert.match(pageSource, /CONTINUITY_FRAMEWORK\.name/u);
  assert.match(pageSource, /continuityFrameworkVersionLabel\(\)/u);
  assert.match(pageSource, /activeSettingsScope !== "slate"/u);
  assert.equal(CONTINUITY_FRAMEWORK.status, "planned");
  assert.equal(continuityFrameworkVersionLabel(), "v0.0");
});

test("Slate navbar opens its contextual settings scope", () => {
  assert.match(
    pageSource,
    /view === "slate"[\s\S]{0,80}\? "slate"/u,
  );
  assert.match(
    pageSource,
    /openSettingsPanel\(contextualSettingsScope\)/u,
  );
});

test("Slate settings preserve the existing tutorial contract", () => {
  assert.match(pageSource, /resetSingleModeTutorial\("slate"\)/u);
  assert.match(tutorialsSource, /slate:\s*\{/u);
  assert.doesNotMatch(firstRunSource, /Continuity v0\.0/u);
});

test("Slate settings configure the active project's Lux and Umbra profiles", () => {
  assert.match(pageSource, /<SlateHemisphereSettingsPanel/u);
  assert.match(pageSource, /deliberationConfig: config/u);
  assert.match(pageSource, /hemisphereSettingsUpdate=/u);
  assert.match(slateHemisphereSettingsSource, /Lux &amp; Umbra/u);
  assert.match(slateHemisphereSettingsSource, /Thinking model/u);
  assert.match(slateHemisphereSettingsSource, /Creative lens/u);
  assert.match(slateHemisphereSettingsSource, /Inherit project prose route/u);
  assert.match(slateHemisphereSettingsSource, /Save hemispheres/u);
  assert.match(slateHemisphereSettingsSource, /snapshot\.proseMode\.toUpperCase/u);
});
