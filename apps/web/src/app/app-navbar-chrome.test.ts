import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_NAVBAR_REVEAL_EDGE_PX,
  getAppNavbarChromeSnapshot,
  hideAppNavbarForImmersion,
  pinAppNavbar,
  revealAppNavbarForFreshSurface,
  revealAppNavbarFromPointerClientY,
  setAppNavbarAutoHideEnabled,
  setAppNavbarCompanionOpen,
  setAppNavbarWielding,
} from "./appNavbarChrome.ts";

function resetChrome(): void {
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
