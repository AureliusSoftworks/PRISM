import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_NAVBAR_REVEAL_EDGE_PX,
  armAppNavbarAutoHide,
  clearAppNavbarDropdownHoldsForTests,
  clearAppNavbarSessionHiddenForTests,
  getAppNavbarChromeSnapshot,
  hideAppNavbarForImmersion,
  holdAppNavbarForControlShortcuts,
  holdAppNavbarForDropdown,
  pinAppNavbar,
  revealAppNavbarForFreshSurface,
  revealAppNavbarForShortcutAction,
  revealAppNavbarFromPointerClientY,
  scheduleAppNavbarAutoHide,
  setAppNavbarAutoHideEnabled,
  setAppNavbarCompanionOpen,
  setAppNavbarSessionHidden,
  setAppNavbarWielding,
} from "./appNavbarChrome.ts";

function resetChrome(): void {
  clearAppNavbarDropdownHoldsForTests();
  clearAppNavbarSessionHiddenForTests();
  setAppNavbarCompanionOpen(false);
  setAppNavbarWielding(false);
  pinAppNavbar(false);
  setAppNavbarAutoHideEnabled(true);
  revealAppNavbarForFreshSurface();
}

test("companion open pins the navbar visible over immersion hide", () => {
  resetChrome();
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  setAppNavbarCompanionOpen(true);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  assert.equal(getAppNavbarChromeSnapshot().companionOpen, true);
  setAppNavbarCompanionOpen(false);
});

test("wielding hides the navbar even after a fresh reveal", () => {
  resetChrome();
  setAppNavbarAutoHideEnabled(true);
  revealAppNavbarForFreshSurface();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  setAppNavbarWielding(true);
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  setAppNavbarWielding(false);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
});

test("top-edge pointer reveals a hidden navbar", () => {
  resetChrome();
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  revealAppNavbarFromPointerClientY(APP_NAVBAR_REVEAL_EDGE_PX + 1);
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  revealAppNavbarFromPointerClientY(APP_NAVBAR_REVEAL_EDGE_PX);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
});

test("pinned chrome stays visible during immersion hide requests", () => {
  resetChrome();
  pinAppNavbar(true);
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  pinAppNavbar(false);
});

test("non-Zen surfaces skip idle auto-hide and Wield tuck", () => {
  resetChrome();
  setAppNavbarAutoHideEnabled(false);
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  assert.equal(getAppNavbarChromeSnapshot().autoHideEnabled, false);
  setAppNavbarWielding(true);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  setAppNavbarWielding(false);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  setAppNavbarAutoHideEnabled(true);
});

test("open navbar dropdown holds the bar against idle tuck", () => {
  resetChrome();
  armAppNavbarAutoHide();
  const release = holdAppNavbarForDropdown();
  assert.equal(getAppNavbarChromeSnapshot().dropdownHeld, true);
  scheduleAppNavbarAutoHide();
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  release();
  assert.equal(getAppNavbarChromeSnapshot().dropdownHeld, false);
});

test("dropdown and Control holds win over Zen Wield tuck", () => {
  resetChrome();
  setAppNavbarWielding(true);
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  const releaseDropdown = holdAppNavbarForDropdown();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  releaseDropdown();
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  const releaseControl = holdAppNavbarForControlShortcuts();
  assert.equal(getAppNavbarChromeSnapshot().controlHeld, true);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  releaseControl();
  assert.equal(getAppNavbarChromeSnapshot().controlHeld, false);
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  setAppNavbarWielding(false);
});

test("shortcut actions can force a tucked navbar back into view", () => {
  resetChrome();
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  revealAppNavbarForShortcutAction();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
});

test("overlapping dropdown holds release independently", () => {
  resetChrome();
  const releaseA = holdAppNavbarForDropdown();
  const releaseB = holdAppNavbarForDropdown();
  assert.equal(getAppNavbarChromeSnapshot().dropdownHeld, true);
  releaseA();
  assert.equal(getAppNavbarChromeSnapshot().dropdownHeld, true);
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  releaseB();
  assert.equal(getAppNavbarChromeSnapshot().dropdownHeld, false);
});

test("side-panel holds reveal a tucked navbar and block immersion hide", () => {
  resetChrome();
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  const release = holdAppNavbarForDropdown();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  hideAppNavbarForImmersion();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
  release();
});

test("session hide collapses live applet chrome independently of Zen tuck", () => {
  resetChrome();
  setAppNavbarAutoHideEnabled(false);
  assert.equal(getAppNavbarChromeSnapshot().sessionHidden, false);
  setAppNavbarSessionHidden(true);
  assert.equal(getAppNavbarChromeSnapshot().sessionHidden, true);
  assert.equal(getAppNavbarChromeSnapshot().hidden, true);
  setAppNavbarSessionHidden(false);
  assert.equal(getAppNavbarChromeSnapshot().sessionHidden, false);
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);
});
