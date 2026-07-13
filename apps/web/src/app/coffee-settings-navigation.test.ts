import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");

test("Coffee remains a first-class Settings mode after player controls move", () => {
  assert.match(settingsPanelSource, /\| "coffee"/u);
  assert.match(
    settingsPanelSource,
    /scope: "coffee", title: "Coffee", icon: <Coffee/u
  );
  assert.match(pageSource, /activeSettingsScope === "coffee"/u);
  assert.match(pageSource, /data-settings-section="coffee"/u);
  assert.match(pageSource, /Open Coffee Groups/u);
  assert.match(pageSource, /Customize Default Prism/u);
  assert.match(pageSource, /activeSettingsScope !== "coffee"/u);
});

test("Coffee settings navigation does not bypass the active-session lock", () => {
  assert.match(
    pageSource,
    /function openDefaultBotCustomizer\(\): void \{\s*if \(blockCoffeeConfigurationMutation\(\)\) return;/u
  );
  assert.match(
    pageSource,
    /if \(coffeeConfigurationLockedRef\.current\)[\s\S]*setPanelNotice\(COFFEE_CONFIGURATION_LOCK_MESSAGE\)/u
  );
});
