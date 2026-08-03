import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("./KeyboardShortcutSettings.tsx", import.meta.url),
  "utf8",
);
const companionSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const firstRunSource = readFileSync(
  new URL("./firstRunOnboarding.ts", import.meta.url),
  "utf8",
);

test("exposes account-scoped device shortcuts in Settings", () => {
  assert.match(settingsPanelSource, /\| "shortcuts"/u);
  assert.match(settingsPanelSource, /scope: "shortcuts", title: "Shortcuts"/u);
  assert.match(pageSource, /readPrismKeyboardShortcuts\(window\.localStorage/u);
  assert.match(pageSource, /writePrismKeyboardShortcuts\(window\.localStorage/u);
  assert.match(pageSource, /activeSettingsScope === "shortcuts"/u);
  assert.match(settingsSource, /data-keyboard-shortcut-recorder="true"/u);
  assert.match(settingsSource, /Already used by/u);
  assert.match(settingsSource, /Restore defaults/u);
});

test("uses the configurable Prism and model-picker shortcuts globally", () => {
  assert.match(
    companionSource,
    /keyboardShortcutMatchesEvent\(keyboardShortcut, event\)/u,
  );
  assert.match(pageSource, /keyboardShortcuts\.modelPicker, event/u);
  assert.match(pageSource, /data-prism-model-picker-trigger="true"/u);
  assert.match(pageSource, /MODEL_PICKER_QUICK_OPEN_EVENT/u);
  assert.match(pageSource, /keyboardShortcuts\.effortHud, event/u);
});

test("separates pointer browsing from cursor-independent keyboard quick selection", () => {
  assert.match(pageSource, /surface: ComposerModelPickerSurface \| null/u);
  assert.match(pageSource, /const open = pickerOpenState\.surface === "model"/u);
  assert.match(
    pageSource,
    /const effortOpen = pickerOpenState\.surface === "effort"/u,
  );
  assert.doesNotMatch(pageSource, /onWheel=\{handleModelWheel\}/u);
  assert.match(
    pageSource,
    /document\.addEventListener\("wheel", handleQuickWheel, \{[\s\S]{0,100}passive: false/u,
  );
  assert.match(
    pageSource,
    /document\.addEventListener\("keydown", handleQuickArrows/u,
  );
  assert.match(
    pageSource,
    /window\.addEventListener\("mousemove", returnToPointerBrowsing/u,
  );
  assert.match(pageSource, /data-highlighted=\{/u);
  assert.doesNotMatch(
    pageSource,
    /onMouseEnter[\s\S]{0,100}setHighlightedModelValue\(autoOptionValue\)/u,
  );
  assert.match(pageSource, /moveModelHighlight\(/u);
  assert.match(pageSource, /event\.key === "Tab"/u);
  assert.match(pageSource, /commitHighlightedModelToEffort\(\)/u);
  assert.match(
    pageSource,
    /commitHighlightedModelToEffort[\s\S]{0,700}surface: "effort"[\s\S]{0,80}interactionMode: "keyboard"/u,
  );
  assert.match(
    pageSource,
    /handleEffortKeyDown[\s\S]{0,1000}surface: "model"[\s\S]{0,80}interactionMode: "keyboard"/u,
  );
  assert.match(pageSource, /event\.code === "Space"/u);
  assert.match(
    pageSource,
    /role="dialog"[\s\S]{0,120}onKeyDown=\{handleEffortKeyDown\}/u,
  );
  assert.match(pageSource, /dismissPickersToComposer\(\)/u);
  assert.match(pageSource, /window\.requestAnimationFrame\(focusVisibleComposer\)/u);
});

test("updates contextual guidance without adding first-run setup", () => {
  assert.match(tutorialSource, /Shift\+Tab opens Model/u);
  assert.match(tutorialSource, /wheel scrolls the available model list/u);
  assert.match(tutorialSource, /regardless of pointer location/u);
  assert.match(tutorialSource, /moving the mouse returns/u);
  assert.match(tutorialSource, /Model and Effort never remain open together/u);
  assert.match(tutorialSource, /Space or Escape closes either picker/u);
  assert.match(tutorialSource, /Settings → Shortcuts/u);
  assert.doesNotMatch(firstRunSource, /keyboard shortcuts|Shift\+Tab/u);
});
