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

test("uses the configurable Prism and navbar Control-root shortcuts globally", () => {
  assert.match(
    companionSource,
    /keyboardShortcutMatchesEvent\(keyboardShortcut, event\)/u,
  );
  assert.match(pageSource, /keyboardShortcuts\.providerMode, event/u);
  assert.match(pageSource, /keyboardShortcuts\.modelPicker, event/u);
  assert.match(pageSource, /keyboardShortcuts\.effortPicker, event/u);
  assert.match(pageSource, /keyboardShortcuts\.speechType, event/u);
  assert.match(pageSource, /keyboardShortcuts\.turbo, event/u);
  assert.match(pageSource, /data-prism-model-picker-trigger="true"/u);
  assert.match(pageSource, /data-prism-effort-picker-trigger="true"/u);
  assert.match(pageSource, /data-prism-speech-type-trigger="true"/u);
  assert.match(pageSource, /MODEL_PICKER_QUICK_OPEN_EVENT/u);
  assert.match(pageSource, /EFFORT_PICKER_QUICK_OPEN_EVENT/u);
  assert.match(pageSource, /closeOpenPrismShortcutPicker\(\)/u);
  assert.match(pageSource, /playSpatialUiSfx\("turbo-denied"/u);
  assert.match(pageSource, /pickerOpenState\.surface === "model"/u);
  assert.match(pageSource, /pickerOpenState\.surface === "effort"/u);
  assert.match(pageSource, /keyboardShortcuts\.effortHud, event/u);
  assert.match(pageSource, /playPrismHotkeyInaccessibleSfx\(\)/u);
  assert.match(companionSource, /companionSuppressed[\s\S]{0,300}playPrismHotkeyInaccessibleSfx\(\)/u);
  assert.match(
    pageSource,
    /if \(modelEffortHudTarget\) \{[\s\S]{0,160}setModelEffortHudTarget\(null\)/u,
  );
});

test("lets Model, Effort, and Speech Type select values from the wheel", () => {
  assert.match(pageSource, /surface: ComposerModelPickerSurface \| null/u);
  assert.match(pageSource, /const open = pickerOpenState\.surface === "model"/u);
  assert.match(
    pageSource,
    /const effortOpen = pickerOpenState\.surface === "effort"/u,
  );
  assert.match(pageSource, /onWheel=\{handleModelWheel\}/u);
  assert.match(pageSource, /modelWheelLockedRef/u);
  assert.match(
    pageSource,
    /document\.addEventListener\("wheel", handleQuickWheel, \{[\s\S]{0,100}passive: false/u,
  );
  assert.match(
    pageSource,
    /handleQuickWheel[\s\S]{0,1200}modelPickerWheelDirection\(\s*event\.deltaX,\s*event\.deltaY,?\s*\)[\s\S]{0,1800}modelEffortWheelDirection\(event\.deltaX, event\.deltaY\)/u,
  );
  assert.doesNotMatch(
    pageSource,
    /const handleQuickWheel[\s\S]{0,500}if \(menuOpen\) return;/u,
  );
  assert.match(
    pageSource,
    /if \(!navbarPicker\) \{\s*document\.addEventListener\("keydown", handleQuickArrows/u,
  );
  assert.match(pageSource, /if \(navbarPicker\) return;/u);
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
  assert.match(
    pageSource,
    /isPrimaryPointerDismissal\(event\)[\s\S]{0,800}window\.addEventListener\("pointerdown", handler, true\)/u,
  );
  assert.match(
    pageSource,
    /triggerRef\.current\?\.contains\(target\)[\s\S]{0,240}effortMenuRef\.current\?\.contains\(target\)/u,
  );
  assert.doesNotMatch(pageSource, /commitHighlightedModelToEffort/u);
  assert.doesNotMatch(
    pageSource,
    /handleModelKeyDown[\s\S]{0,900}event\.key === "Tab"/u,
  );
  assert.doesNotMatch(
    pageSource,
    /handleEffortKeyDown[\s\S]{0,900}event\.key !== "Tab"/u,
  );
  assert.match(pageSource, /event\.code === "Space"/u);
  assert.match(
    pageSource,
    /role="dialog"[\s\S]{0,120}onKeyDown=\{handleEffortKeyDown\}/u,
  );
  assert.match(pageSource, /dismissPickersToComposer\(\)/u);
  assert.match(pageSource, /window\.requestAnimationFrame\(focusVisibleComposer\)/u);
  assert.match(pageSource, /speechTypeWheelLockedRef/u);
  assert.match(pageSource, /if \(!voiceModeSelectorOpen \|\| !settings\) return;/u);
  assert.match(
    pageSource,
    /document\.addEventListener\("wheel", handleSpeechTypeWheel, \{[\s\S]{0,100}passive: false/u,
  );
  assert.match(
    pageSource,
    /void selectGlobalVoiceChoice\(nextChoice\)/u,
  );
});

test("turns Turbo into a compatible ONLINE route when the current model cannot use Fast", () => {
  assert.match(pageSource, /turboModelShortcutCandidate\(/u);
  assert.match(
    pageSource,
    /modelOptionsForResponseMode\([\s\S]{0,100}"online"[\s\S]{0,180}\.filter\(\(option\) => option\.provider !== "local"\)/u,
  );
  assert.match(pageSource, /persistGlobalModelSelection\([\s\S]{0,300}turboCandidate\.provider/u);
  assert.match(pageSource, /persistModelTurboPreference\(turboTarget, true\)/u);
});

test("mounts a Control-hold shortcut guide beside Prism", () => {
  assert.match(pageSource, /ControlShortcutGuide/u);
  assert.match(
    pageSource,
    /<ControlShortcutGuide[\s\S]{0,120}platform=\{keyboardShortcutPlatform\}/u,
  );
  const guideSource = readFileSync(
    new URL("./ControlShortcutOverlay.tsx", import.meta.url),
    "utf8",
  );
  assert.match(guideSource, /data-prism-control-shortcut-guide="true"/u);
  assert.match(guideSource, /holdAppNavbarForControlShortcuts\(\)/u);
  assert.match(guideSource, /readPrismCompanionOrbAnchor/u);
  assert.doesNotMatch(guideSource, />Ctrl</u);
  assert.doesNotMatch(guideSource, /styles\.eyebrow/u);
  const guideCss = readFileSync(
    new URL("./ControlShortcutGuide.module.css", import.meta.url),
    "utf8",
  );
  assert.match(guideCss, /padding: 0;/u);
  assert.match(guideCss, /without turning\s+the shortcut hint into a modal surface/u);
  assert.doesNotMatch(guideCss, /backdrop-filter/u);
  assert.match(
    readFileSync(new URL("./controlShortcutGuide.ts", import.meta.url), "utf8"),
    /return args\.controlHeld;/u,
  );
  assert.match(
    companionSource,
    /data-prism-companion-anchor="true"/u,
  );
  assert.match(pageSource, /revealAppNavbarForShortcutAction\(\)/u);
});

test("updates contextual guidance without adding first-run setup", () => {
  assert.match(tutorialSource, /Control\+Left opens Model/u);
  assert.match(tutorialSource, /arrow keys do not roam their lists/u);
  assert.match(tutorialSource, /Shift\+Tab flips LOCAL\/ONLINE directly/u);
  assert.match(tutorialSource, /Control\+Right opens Speech Type/u);
  assert.match(tutorialSource, /Tab keeps its normal focus behavior and never advances or commits a picker/u);
  assert.match(tutorialSource, /Control\+Up toggles Turbo/u);
  assert.match(
    tutorialSource,
    /Hold Control for a moment to reveal a live shortcut compass[\s\S]*Wield Prism stays legend-free/u,
  );
  assert.match(tutorialSource, /With Model open, scroll anywhere to select the next available model/u);
  assert.match(tutorialSource, /with Effort open, scroll anywhere to select its next level/u);
  assert.match(
    tutorialSource,
    /Wheel-based value selection in both Model and Effort adjusts the active picker regardless of pointer location/u,
  );
  assert.match(tutorialSource, /moving the mouse returns/u);
  assert.match(tutorialSource, /Model and Effort never remain open together/u);
  assert.match(tutorialSource, /Clicking anywhere outside closes the open picker/u);
  assert.match(tutorialSource, /Space or Escape also closes it/u);
  assert.match(tutorialSource, /Settings → Shortcuts/u);
  assert.doesNotMatch(firstRunSource, /keyboard shortcuts|Shift\+Tab/u);
});
