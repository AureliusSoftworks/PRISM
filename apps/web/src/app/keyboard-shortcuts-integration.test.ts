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
const browserGuardSource = readFileSync(
  new URL("./BlockBrowserInspection.tsx", import.meta.url),
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
  assert.match(settingsSource, /enlarges the live avatar/u);
  assert.match(settingsSource, /shrinks it/u);
});

test("uses the configurable Prism and navbar shortcuts globally", () => {
  assert.match(
    companionSource,
    /keyboardShortcutMatchesEvent\(keyboardShortcut, event\)/u,
  );
  assert.match(pageSource, /keyboardShortcuts\.providerMode, event/u);
  assert.match(pageSource, /keyboardShortcuts\.modelPicker, event/u);
  assert.match(pageSource, /keyboardShortcuts\.effortPicker, event/u);
  assert.match(pageSource, /keyboardShortcuts\.speechType, event/u);
  assert.match(pageSource, /keyboardShortcuts\.turbo, event/u);
  assert.match(pageSource, /data-prism-provider-mode-trigger/u);
  assert.ok(
    (pageSource.match(/data-prism-provider-mode-trigger/gu) ?? []).length >= 5,
    "every response-mode navbar variant should expose its enabled hotkey target",
  );
  assert.match(pageSource, /data-prism-model-picker-trigger="true"/u);
  assert.match(pageSource, /data-prism-effort-picker-trigger="true"/u);
  assert.match(pageSource, /data-prism-speech-type-trigger="true"/u);
  assert.match(pageSource, /MODEL_PICKER_QUICK_OPEN_EVENT/u);
  assert.match(pageSource, /EFFORT_PICKER_QUICK_OPEN_EVENT/u);
  assert.match(pageSource, /SPEECH_TYPE_QUICK_OPEN_EVENT/u);
  assert.match(pageSource, /closeOpenPrismShortcutPicker\(\)/u);
  assert.match(pageSource, /playSpatialUiSfx\("turbo-denied"/u);
  assert.match(pageSource, /pickerOpenState\.surface === "model"/u);
  assert.match(pageSource, /pickerOpenState\.surface === "effort"/u);
  assert.match(pageSource, /keyboardShortcuts\.effortHud, event/u);
  assert.match(pageSource, /playPrismHotkeyInaccessibleSfx\(\)/u);
  assert.match(
    pageSource,
    /keyboardShortcuts\.providerMode, event[\s\S]{0,700}findVisiblePrismShortcutTrigger\(\s*'\[data-prism-provider-mode-trigger="true"\]'[\s\S]{0,500}active\.click\(\)/u,
  );
  assert.match(companionSource, /companionSuppressed[\s\S]{0,300}playPrismHotkeyInaccessibleSfx\(\)/u);
  assert.match(
    browserGuardSource,
    /PRISM_BROWSER_GUARD_SHORTCUT_ACTIONS[\s\S]*"modelPicker"[\s\S]*"speechType"/u,
  );
  assert.match(
    browserGuardSource,
    /keyboardShortcutMatchesEvent\(activePrismKeyboardShortcut\(action\), e\)[\s\S]{0,80}return;/u,
  );
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
    /if \(navbarPicker\) \{\s*document\.addEventListener\("wheel", handleQuickWheel, \{[\s\S]{0,100}passive: false/u,
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
    /document\.addEventListener\("keydown", handleQuickArrows, true\)/u,
  );
  assert.match(
    pageSource,
    /const handleModelWheel =[^]*?if \(\s*!navbarPicker \|\|/u,
  );
  assert.doesNotMatch(pageSource, /returnToPointerBrowsing/u);
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
  assert.match(pageSource, /event\.key === "Enter"/u);
  assert.match(pageSource, /event\.key === "Backspace"/u);
  assert.match(pageSource, /event\.key === "Delete"/u);
  assert.match(pageSource, /commitHotkeyModelSelection\(\)/u);
  assert.match(pageSource, /commitHotkeyEffortSelection\(\)/u);
  assert.match(pageSource, /commitHotkeyVoiceSelection\(\)/u);
  assert.match(pageSource, /commitPendingPickerRef\.current\(\)/u);
  assert.match(pageSource, /commitPendingVoicePickerRef\.current\(\)/u);
  assert.match(
    pageSource,
    /type PrismNavbarShortcutPickerSurface = "model" \| "effort" \| "speech"/u,
  );
  assert.match(pageSource, /flushSync\(\(\) => trigger\.click\(\)\)/u);
  assert.match(
    pageSource,
    /const closedPicker = closeOpenPrismShortcutPicker\(\);\s*if \(closedPicker === "model"\)[\s\S]{0,700}dispatchEvent\(new Event\(MODEL_PICKER_QUICK_OPEN_EVENT\)\)/u,
  );
  assert.match(
    pageSource,
    /const closedPicker = closeOpenPrismShortcutPicker\(\);\s*if \(closedPicker === "effort"\)[\s\S]{0,700}dispatchEvent\(new Event\(EFFORT_PICKER_QUICK_OPEN_EVENT\)\)/u,
  );
  assert.match(
    pageSource,
    /const closedPicker = closeOpenPrismShortcutPicker\(\);\s*if \(closedPicker === "speech"\)[\s\S]{0,800}dispatchEvent\([\s\S]{0,80}new Event\(SPEECH_TYPE_QUICK_OPEN_EVENT, \{ bubbles: true \}\)/u,
  );
  assert.match(
    pageSource,
    /document\.addEventListener\(\s*SPEECH_TYPE_QUICK_OPEN_EVENT,[\s\S]{0,80}openQuickVoicePicker/u,
  );
  assert.match(pageSource, /voiceModeSelectorButtonRef\.current = trigger/u);
  assert.match(
    pageSource,
    /Opening another navbar picker is an explicit "keep this" gesture/u,
  );
  assert.match(pageSource, /cursorAgnostic=\{voiceModeSelectorInteractionMode === "keyboard"\}/u);
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

test("mounts a stationary modifier-hold shortcut toast", () => {
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
  assert.match(guideSource, /CONTROL_ROOT_ACTIONS/u);
  assert.match(guideSource, /const optionHeldRef = useRef\(false\)/u);
  assert.match(
    guideSource,
    /hasAttribute\("data-prism-wielding"\)[\s\S]*setPrismWielding\(true\)/u,
  );
  assert.match(
    guideSource,
    /let releaseNavbar = controlHeld[\s\S]*window\.setTimeout\([\s\S]*holdAppNavbarForControlShortcuts\(\)[\s\S]*setVisible\(true\)/u,
  );
  assert.doesNotMatch(guideSource, />Ctrl</u);
  assert.match(guideSource, /styles\.title/u);
  const guideCss = readFileSync(
    new URL("./ControlShortcutGuide.module.css", import.meta.url),
    "utf8",
  );
  assert.match(guideCss, /border-radius: 999px;/u);
  assert.match(guideCss, /top: max\(48px/u);
  assert.doesNotMatch(guideCss, /backdrop-filter/u);
  assert.doesNotMatch(guideCss, /\.compass\s*\{/u);
  assert.match(
    readFileSync(new URL("./controlShortcutGuide.ts", import.meta.url), "utf8"),
    /args\.controlHeld \|\| \(args\.optionHeld && !args\.prismWielding\)/u,
  );
  assert.match(
    companionSource,
    /data-prism-companion-anchor="true"/u,
  );
  assert.match(pageSource, /revealAppNavbarForShortcutAction\(\)/u);
});

test("updates contextual guidance without adding first-run setup", () => {
  assert.match(tutorialSource, /\.replaceAll\("Control\+Left", "Option\+Left"\)/u);
  assert.match(tutorialSource, /arrow keys do not roam their lists/u);
  assert.match(tutorialSource, /Shift\+Tab flips LOCAL\/ONLINE directly/u);
  assert.match(tutorialSource, /\.replaceAll\("Control\+Right", "Option\+Right"\)/u);
  assert.match(
    tutorialSource,
    /Tab then closes the picker and places the cursor in the nearest visible composer/u,
  );
  assert.match(tutorialSource, /\.replaceAll\("Control\+Up", "Option\+Up"\)/u);
  assert.match(tutorialSource, /Option-arrow commands remain available while typing/u);
  assert.match(tutorialSource, /Option\+Command summons Prism/u);
  assert.match(
    tutorialSource,
    /Hold Option still for a moment to reveal a small shortcut toast[\s\S]*moving the pointer Wields Prism instead/u,
  );
  assert.match(tutorialSource, /scroll anywhere to move its pending value without moving the cursor/u);
  assert.match(
    tutorialSource,
    /Enter, Space, clicking outside, or Tab commits that pending value/u,
  );
  assert.match(
    tutorialSource,
    /Using another picker hotkey commits the current pending value and opens that requested picker immediately/u,
  );
  assert.match(tutorialSource, /Escape, Backspace, or Delete exits without changing it/u);
  assert.match(tutorialSource, /Model and Effort never remain open together/u);
  assert.match(tutorialSource, /Settings → Shortcuts/u);
  assert.doesNotMatch(firstRunSource, /keyboard shortcuts|Shift\+Tab/u);
  assert.match(tutorialSource, /Cmd\/Ctrl \+ enlarges it/u);
  assert.match(tutorialSource, /Grow, Shrink, and Reset size/u);
});
