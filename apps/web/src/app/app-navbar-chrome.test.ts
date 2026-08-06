import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_NAVBAR_REVEAL_EDGE_PX,
  armAppNavbarAutoHide,
  clearAppNavbarDropdownHoldsForTests,
  getAppNavbarChromeSnapshot,
  hideAppNavbarForImmersion,
  holdAppNavbarForDropdown,
  pinAppNavbar,
  revealAppNavbarForFreshSurface,
  revealAppNavbarFromPointerClientY,
  scheduleAppNavbarAutoHide,
  setAppNavbarAutoHideEnabled,
  setAppNavbarCompanionOpen,
  setAppNavbarWielding,
} from "./appNavbarChrome.ts";

function resetChrome(): void {
  clearAppNavbarDropdownHoldsForTests();
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
