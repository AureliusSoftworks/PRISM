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

test("legacy hide requests cannot hide the permanent applet navbar", () => {
  resetChrome();
  hideAppNavbarForImmersion();
  armAppNavbarAutoHide();
  scheduleAppNavbarAutoHide();
  revealAppNavbarFromPointerClientY(APP_NAVBAR_REVEAL_EDGE_PX + 1);
  setAppNavbarSessionHidden(true);

  assert.deepEqual(getAppNavbarChromeSnapshot(), {
    hidden: false,
    pinned: false,
    autoHideEnabled: false,
    companionOpen: false,
    wielding: false,
    dropdownHeld: false,
    controlHeld: false,
    sessionHidden: false,
  });
});

test("navbar interaction annotations remain observable without affecting visibility", () => {
  resetChrome();
  setAppNavbarCompanionOpen(true);
  setAppNavbarWielding(true);
  pinAppNavbar(true);
  const releaseDropdown = holdAppNavbarForDropdown();
  const releaseControl = holdAppNavbarForControlShortcuts();

  assert.deepEqual(getAppNavbarChromeSnapshot(), {
    hidden: false,
    pinned: true,
    autoHideEnabled: false,
    companionOpen: true,
    wielding: true,
    dropdownHeld: true,
    controlHeld: true,
    sessionHidden: false,
  });

  hideAppNavbarForImmersion();
  revealAppNavbarForShortcutAction();
  assert.equal(getAppNavbarChromeSnapshot().hidden, false);

  releaseDropdown();
  releaseControl();
  setAppNavbarCompanionOpen(false);
  setAppNavbarWielding(false);
  pinAppNavbar(false);
});
